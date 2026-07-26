// lib/impact.ts
// "O que as decisões fizeram?" — a leitura que falta ao lado das Últimas
// edições: quanto entrou, quanto saiu, e o que mudou em volta de cada decisão.
//
// Duas comparações, porque respondem perguntas diferentes:
//
//  1. Período contra período anterior de mesma duração. Serve para a pergunta
//     "julho está melhor ou pior que junho?".
//  2. Janela antes/depois de cada decisão de peso (orçamento, pausa, retomada).
//     Serve para "o que aconteceu depois que eu mexi nisso?".
//
// Tudo é normalizado POR DIA. Comparar 25 dias de julho com 30 de junho pelo
// total é o erro mais fácil de cometer aqui: junho parece maior só por ser
// mais longo.
//
// Isto é correlação, não prova de causa — sazonalidade, concorrência, oferta e
// aprendizado da plataforma mudam ao mesmo tempo. A interface diz isso; este
// módulo só entrega os números.

import type { AdChangeEvent, ChangeCategory } from "./changes";
import type { DailyMetric } from "./meta";

// Janela padrão de cada lado da decisão. Sete dias cobre um ciclo semanal
// inteiro (fim de semana pesa) sem alcançar a decisão anterior.
export const DEFAULT_WINDOW_DAYS = 7;

// Só decisões que mudam entrega. Criação de público, cobrança e aprovação de
// criativo não são escolhas de operação — poluiriam a lista.
const DECISIVE: ChangeCategory[] = ["budget", "status", "bid"];

// Estados do fluxo de revisão da Meta. Um anúncio que vai de "Ativo" para
// "Processo pendente" e volta não teve decisão nenhuma: é a plataforma
// analisando o criativo. Sem este filtro, publicar um anúncio gera quatro
// "decisões" no mesmo dia, todas com o mesmo antes/depois.
const REVIEW_STATE = /pendente|an[áa]lise|revis[ãa]o|processo|review|adaptando/i;

function isReviewNoise(event: AdChangeEvent): boolean {
  if (event.category !== "status") return false;
  return REVIEW_STATE.test(`${event.from ?? ""} ${event.to ?? ""} ${event.label}`);
}

export interface ImpactWindow {
  since: string;
  until: string;
  days: number;
  spend: number;
  spendPerDay: number;
  results: Record<string, number>;
  resultsPerDay: Record<string, number>;
  costPer: Record<string, number | null>;
}

export interface DecisionChange {
  label: string;
  objectType: string | null;
  objectName: string | null;
  from: string | null;
  to: string | null;
  impact: AdChangeEvent["impact"];
}

// As decisões vêm agrupadas por DIA, não uma por evento: a janela antes/depois
// de duas decisões do mesmo dia é idêntica, e listar cada uma com os mesmos
// números repetidos dá a impressão de que houve vários efeitos diferentes.
export interface DecisionImpact {
  date: string;
  changes: DecisionChange[];
  windowDays: number;
  before: ImpactWindow;
  after: ImpactWindow;
}

export interface ImpactSummary {
  current: ImpactWindow;
  previous: ImpactWindow;
  families: string[];
  decisions: DecisionImpact[];
  note: string | null;
}

const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (date: string) => new Date(`${date}T00:00:00Z`);

export function shiftDate(date: string, days: number): string {
  return iso(new Date(parse(date).getTime() + days * DAY));
}

export function daysBetween(since: string, until: string): number {
  return Math.max(1, Math.round((parse(until).getTime() - parse(since).getTime()) / DAY) + 1);
}

// Período anterior de mesma duração, encostado no início do atual.
export function previousWindow(since: string, until: string): { since: string; until: string } {
  const days = daysBetween(since, until);
  return { since: shiftDate(since, -days), until: shiftDate(since, -1) };
}

// Agrega os dias que caem no intervalo. Dia sem entrega simplesmente não vem
// da API; o denominador é o intervalo pedido, não o número de dias com dados,
// senão uma conta que ficou parada metade do mês parece ter gasto o dobro.
export function aggregate(daily: DailyMetric[], since: string, until: string): ImpactWindow {
  const days = daysBetween(since, until);
  const results: Record<string, number> = {};
  let spend = 0;

  for (const day of daily) {
    if (day.date < since || day.date > until) continue;
    spend += day.spend || 0;
    for (const [family, value] of Object.entries(day.results || {})) {
      if (!value) continue;
      results[family] = (results[family] || 0) + value;
    }
  }

  const resultsPerDay: Record<string, number> = {};
  const costPer: Record<string, number | null> = {};
  for (const [family, total] of Object.entries(results)) {
    resultsPerDay[family] = total / days;
    costPer[family] = total > 0 ? spend / total : null;
  }

  return { since, until, days, spend, spendPerDay: spend / days, results, resultsPerDay, costPer };
}

// Famílias que tiveram volume em qualquer um dos períodos, ordenadas pelo
// volume do período atual (o que importa hoje aparece primeiro).
function familiesOf(current: ImpactWindow, previous: ImpactWindow): string[] {
  const keys = new Set([...Object.keys(current.results), ...Object.keys(previous.results)]);
  return [...keys]
    .filter((key) => (current.results[key] || 0) > 0 || (previous.results[key] || 0) > 0)
    .sort((a, b) => (current.results[b] || 0) - (current.results[a] || 0));
}

// Antes/depois de uma decisão.
//
// O dia da decisão fica FORA das duas janelas: a alteração acontece no meio do
// dia, então aquele dia é metade antes e metade depois — incluí-lo em qualquer
// dos lados suja a comparação.
//
// As janelas são sempre simétricas. Se a decisão é de anteontem, comparar 7
// dias antes com 2 depois faria a queda parecer real quando é só falta de
// tempo; nesse caso os dois lados encurtam para 2.
function decisionWindows(
  daily: DailyMetric[],
  eventDate: string,
  lastDataDate: string,
  firstDataDate: string,
  desired: number
): { before: ImpactWindow; after: ImpactWindow; windowDays: number } | null {
  const afterStart = shiftDate(eventDate, 1);
  const beforeEnd = shiftDate(eventDate, -1);

  const availableAfter = Math.floor((parse(lastDataDate).getTime() - parse(afterStart).getTime()) / DAY) + 1;
  const availableBefore = Math.floor((parse(beforeEnd).getTime() - parse(firstDataDate).getTime()) / DAY) + 1;
  const windowDays = Math.min(desired, availableAfter, availableBefore);
  if (windowDays < 2) return null; // menos de dois dias de cada lado não diz nada

  return {
    before: aggregate(daily, shiftDate(beforeEnd, -(windowDays - 1)), beforeEnd),
    after: aggregate(daily, afterStart, shiftDate(afterStart, windowDays - 1)),
    windowDays,
  };
}

export function buildImpact({
  daily,
  since,
  until,
  events,
  compare,
  windowDays = DEFAULT_WINDOW_DAYS,
  maxDecisions = 5,
}: {
  daily: DailyMetric[];
  since: string;
  until: string;
  events: AdChangeEvent[];
  // Período de comparação explícito. Sem ele, o anterior de mesma duração —
  // que é o certo para "últimos 30 dias" e errado para "mês contra mês", onde
  // o mês anterior tem o tamanho que tem.
  compare?: { since: string; until: string };
  windowDays?: number;
  maxDecisions?: number;
}): ImpactSummary {
  const previousRange = compare ?? previousWindow(since, until);
  const current = aggregate(daily, since, until);
  const previous = aggregate(daily, previousRange.since, previousRange.until);

  const dates = daily.map((d) => d.date).sort();
  const firstDataDate = dates[0] || previousRange.since;
  const lastDataDate = dates[dates.length - 1] || until;

  const decisive = events.filter(
    (event) => !event.system && DECISIVE.includes(event.category) && !isReviewNoise(event)
  );

  // Agrupa por dia preservando a ordem (o log vem do mais recente ao mais antigo).
  const byDay = new Map<string, DecisionChange[]>();
  for (const event of decisive) {
    const date = event.time.slice(0, 10);
    if (date < since || date > until) continue;
    const list = byDay.get(date) || [];
    // Mesma alteração repetida no dia (a Meta duplica algumas) entra uma vez.
    const key = `${event.label}|${event.objectName}|${event.from}|${event.to}`;
    if (!list.some((c) => `${c.label}|${c.objectName}|${c.from}|${c.to}` === key)) {
      list.push({
        label: event.label,
        objectType: event.objectType,
        objectName: event.objectName,
        from: event.from,
        to: event.to,
        impact: event.impact,
      });
    }
    byDay.set(date, list);
  }

  const decisions: DecisionImpact[] = [];
  for (const [date, changes] of byDay) {
    const windows = decisionWindows(daily, date, lastDataDate, firstDataDate, windowDays);
    if (!windows) continue;
    decisions.push({ date, changes, windowDays: windows.windowDays, before: windows.before, after: windows.after });
    if (decisions.length >= maxDecisions) break;
  }

  // Sem nada para comparar, é melhor dizer do que mostrar zeros.
  let note: string | null = null;
  if (current.spend === 0 && previous.spend === 0) {
    note = "Sem investimento nos dois períodos.";
  } else if (previous.spend === 0) {
    note = "O período anterior não teve investimento, então não há comparação.";
  } else if (decisive.length > 0 && decisions.length === 0) {
    note = "As decisões do período são recentes demais para medir o depois.";
  }

  return { current, previous, families: familiesOf(current, previous), decisions, note };
}
