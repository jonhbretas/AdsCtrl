// lib/changes.ts
// "Últimas edições" de uma conta: normaliza o log de alterações das
// plataformas num formato único e legível em pt-BR.
// A pergunta que isso responde: "o resultado mudou — o que a gente mexeu?"
//
// Meta: edge /act_X/activities (log de atividades da conta).
// Google: recurso change_event (ver lib/google-ads.ts, últimos 30 dias).

import { money } from "./format";

const GRAPH = "https://graph.facebook.com/v25.0";
const MAX_PAGES = 6; // ~600 eventos por consulta: suficiente para o período do painel
const PAGE_SIZE = 100;

export type ChangeCategory =
  | "status"
  | "budget"
  | "bid"
  | "creation"
  | "deletion"
  | "targeting"
  | "creative"
  | "billing"
  | "other";

export interface AdChangeEvent {
  id: string;
  time: string; // ISO
  category: ChangeCategory;
  label: string; // "Orçamento do conjunto"
  objectType: string | null; // "Campanha" | "Conjunto" | "Anúncio" | ...
  objectName: string | null;
  objectId: string | null;
  from: string | null; // valor anterior formatado
  to: string | null; // valor novo formatado
  detail: string | null; // texto complementar (campos alterados, etc.)
  actor: string | null; // quem fez
  impact: "up" | "down" | "pause" | "resume" | null;
  system: boolean; // evento automático da plataforma (cobrança, aprovação...)
  count: number; // eventos idênticos agrupados (a Meta repete alguns)
  raw: string | null; // payload cru, só quando não conseguimos interpretar
}

export interface ChangeLog {
  events: AdChangeEvent[];
  truncated: boolean;
  note: string | null;
}

// ---------- helpers compartilhados ----------
// (os rótulos/cores das categorias vivem em components/AccountChanges.tsx,
//  para não arrastar este módulo de servidor para o bundle do cliente)

function truncate(value: string, max = 90): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function parseMaybeJson(value: any): any {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  const looksJson =
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"));
  if (!looksJson) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function isPlainObject(value: any): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Converte "amount_micros" -> "amountMicros" (a resposta REST do Google vem
// em camelCase, mas o field mask das mudanças vem em snake_case).
function camel(path: string): string {
  return path.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

// ==========================================================================
// META
// ==========================================================================

const META_FIELDS = [
  "event_type",
  "event_time",
  "extra_data",
  "object_id",
  "object_name",
  "object_type",
  "actor_id",
  "actor_name",
  "translated_event_type",
  "application_name",
].join(",");

// Rótulos dos eventos que mais importam no dia a dia. O que não estiver aqui
// cai no translated_event_type da própria Meta (pedimos em pt_BR).
const META_EVENT_LABELS: Record<string, string> = {
  update_campaign_run_status: "Status da campanha",
  update_ad_set_run_status: "Status do conjunto",
  update_ad_run_status: "Status do anúncio",
  update_adgroup_stop_delivery: "Veiculação interrompida",
  update_campaign_budget: "Orçamento da campanha",
  update_ad_set_budget: "Orçamento do conjunto",
  update_campaign_group_spend_cap: "Limite de gasto da campanha",
  update_ad_set_spend_cap: "Limite de gasto do conjunto",
  update_ad_set_min_spend_target: "Gasto mínimo do conjunto",
  update_campaign_budget_optimization_toggling_status: "Otimização de orçamento (CBO)",
  update_ad_set_bid_info: "Lance do conjunto",
  update_ad_set_bid_amount: "Valor do lance",
  update_ad_set_bid_strategy: "Estratégia de lance",
  update_ad_set_bid_adjustments: "Ajustes de lance",
  update_ad_bid_info: "Lance do anúncio",
  update_ad_set_target_spec: "Segmentação do conjunto",
  update_ad_targets_spec: "Segmentação do anúncio",
  update_ad_set_optimization_goal: "Meta de otimização",
  update_ad_set_duration: "Duração do conjunto",
  update_campaign_duration: "Duração da campanha",
  update_campaign_schedule: "Programação da campanha",
  update_campaign_ad_scheduling: "Programação de veiculação",
  update_campaign_group_delivery_type: "Tipo de entrega",
  update_delivery_type: "Tipo de entrega",
  update_campaign_name: "Nome da campanha",
  update_ad_set_name: "Nome do conjunto",
  update_ad_friendly_name: "Nome do anúncio",
  update_ad_creative: "Criativo do anúncio",
  edit_and_update_ad_creative: "Criativo editado",
  update_ad_labels: "Etiquetas do anúncio",
  add_images: "Imagens adicionadas",
  create_campaign_group: "Campanha criada",
  create_campaign_legacy: "Conjunto criado",
  create_ad_set: "Conjunto criado",
  create_ad: "Anúncio criado",
  delete_campaign_group: "Campanha excluída",
  delete_campaign: "Campanha excluída",
  delete_ad_set: "Conjunto excluído",
  delete_ad: "Anúncio excluído",
  create_audience: "Público criado",
  update_audience: "Público atualizado",
  share_audience: "Público compartilhado",
  unshare_audience: "Público descompartilhado",
  ad_account_update_status: "Status da conta",
  ad_account_add_user_to_role: "Usuário adicionado",
  ad_account_remove_user_from_role: "Usuário removido",
  ad_account_update_spend_limit: "Limite de gasto da conta",
  ad_account_reset_spend_limit: "Limite de gasto zerado",
  ad_account_remove_spend_limit: "Limite de gasto removido",
  ad_account_billing_charge: "Cobrança",
  ad_account_billing_charge_failed: "Cobrança recusada",
  funding_event_initiated: "Adição de saldo iniciada",
  funding_event_successful: "Saldo adicionado",
  campaign_ended: "Campanha encerrada",
  campaign_spending_limit_reached: "Limite de gasto atingido",
  lifetime_budget_spent: "Orçamento total consumido",
  ad_review_approved: "Anúncio aprovado",
  ad_review_declined: "Anúncio reprovado",
  first_delivery_event: "Primeira veiculação",
};

// ATENÇÃO: o object_type do log usa a nomenclatura ANTIGA da Meta —
// CAMPAIGN_GROUP é a campanha, CAMPAIGN é o conjunto e ADGROUP é o anúncio.
// Além disso ele erra em alguns eventos (público vem como CAMPAIGN), por isso
// o tipo do evento tem prioridade sobre esse mapa.
const META_OBJECT_LABELS: Record<string, string> = {
  CAMPAIGN_GROUP: "Campanha",
  CAMPAIGN: "Conjunto",
  ADSET: "Conjunto",
  AD_SET: "Conjunto",
  ADGROUP: "Anúncio",
  AD: "Anúncio",
  ACCOUNT: "Conta",
  AD_ACCOUNT: "Conta",
  AUDIENCE: "Público",
  IMAGE: "Imagem",
  AD_IMAGE: "Imagem",
  VIDEO: "Vídeo",
  PAGE: "Página",
  USER: "Usuário",
  PIXEL: "Pixel",
};

// Entidade deduzida do tipo do evento (mais confiável que o object_type).
function metaObjectLabel(eventType: string, objectType: string): string | null {
  const t = eventType.toLowerCase();
  // Casos em que o object_type mente (público vem como CAMPAIGN, etc.).
  if (/audience/.test(t)) return "Público";
  if (/^ad_account_|funding|billing|payment_method|funding_source/.test(t)) return "Conta";
  if (/ad_set|adset/.test(t)) return "Conjunto";
  // No resto o object_type (na nomenclatura antiga) é mais confiável que o
  // nome do evento — "campaign" no evento tanto pode ser campanha quanto
  // conjunto, dependendo da época em que a Meta nomeou aquele evento.
  if (META_OBJECT_LABELS[objectType]) return META_OBJECT_LABELS[objectType];
  if (/campaign/.test(t)) return "Campanha";
  if (/(^|_)ad(_|$)|adgroup|creative|delivery_event|images/.test(t)) return "Anúncio";
  return objectType ? prettifySlug(objectType.toLowerCase()) : null;
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  PAUSED: "Pausado",
  DELETED: "Excluído",
  ARCHIVED: "Arquivado",
  CAMPAIGN_PAUSED: "Campanha pausada",
  ADSET_PAUSED: "Conjunto pausado",
  DISABLED: "Desativado",
  ENABLED: "Ativo",
  REMOVED: "Removido",
  PENDING_REVIEW: "Em análise",
  DISAPPROVED: "Reprovado",
  PREAPPROVED: "Pré-aprovado",
  PENDING_BILLING_INFO: "Aguardando pagamento",
  IN_PROCESS: "Em processamento",
  WITH_ISSUES: "Com problemas",
  TRUE: "Sim",
  FALSE: "Não",
  // Estratégias de lance (aparecem cruas no log).
  LOWEST_COST_BID_STRATEGY: "Menor custo",
  LOWEST_COST_WITHOUT_CAP: "Menor custo",
  LOWEST_COST_WITH_BID_CAP: "Menor custo com limite de lance",
  LOWEST_COST_WITH_MIN_ROAS: "Menor custo com ROAS mínimo",
  COST_CAP: "Limite de custo",
  TARGET_COST: "Custo desejado",
  TARGET_SPEND: "Maximizar cliques",
  MAXIMIZE_CONVERSIONS: "Maximizar conversões",
  MAXIMIZE_CONVERSION_VALUE: "Maximizar valor de conversão",
  TARGET_CPA: "CPA alvo",
  TARGET_ROAS: "ROAS alvo",
  MANUAL_CPC: "CPC manual",
};

// Com locale=pt_BR a Meta já entrega os valores traduzidos ("Ativo"/"Inativa"),
// então reconhecemos os dois idiomas.
const PAUSE_VALUES = /^(paused|deleted|archived|disabled|removed|inativ|pausad|desativ|exclu|arquivad|encerrad)/i;
const RESUME_VALUES = /^(active|enabled|ativ|em veicula|veiculando)/i;

function metaCategory(eventType: string): ChangeCategory {
  const t = eventType.toLowerCase();
  if (/^create_|^add_|^receive_/.test(t)) return "creation";
  if (/^delete_|^remove_|_delete$/.test(t)) return "deletion";
  if (/billing|funding|charge|payment|invoice/.test(t)) return "billing";
  if (/budget|spend_cap|spend_limit|min_spend|spending_limit/.test(t)) return "budget";
  if (/bid/.test(t)) return "bid";
  if (/run_status|stop_delivery|update_status|_status/.test(t)) return "status";
  if (/target|audience|geo|placement/.test(t)) return "targeting";
  if (/creative|image|video|friendly_name|labels/.test(t)) return "creative";
  return "other";
}

// Chaves internas que aparecem no extra_data e não dizem nada ao operador.
const NOISE_KEYS = new Set([
  "type",
  "action",
  "transaction_id",
  "network_id",
  "provider_amount",
  "campaign_id",
  "adgroup_id",
  "user_id",
  "run_status",
  "fee",
  "name",
  "currency", // o valor já sai formatado na moeda da conta
]);

const KEY_LABELS: Record<string, string> = {
  time_start: "Início",
  time_stop: "Término",
  daily_budget: "Orçamento diário",
  lifetime_budget: "Orçamento total",
  budget: "Orçamento",
  bid_amount: "Valor do lance",
  spend_cap: "Limite de gasto",
  amount: "Valor",
  currency: "Moeda",
  user_name: "Usuário",
  payment_method: "Forma de pagamento",
  optimization_goal: "Meta de otimização",
  billing_event: "Evento de cobrança",
  targeting: "Segmentação",
  inclusions: "Inclusões",
  exclusions: "Exclusões",
};

function prettifySlug(slug: string): string {
  if (KEY_LABELS[slug]) return KEY_LABELS[slug];
  const clean = slug.replace(/_/g, " ").trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

// Alguns valores vêm embrulhados em {"__html": "Cartão de crédito", ...}.
function unwrapHtml(value: any): any {
  if (isPlainObject(value) && typeof value.__html === "string") return value.__html;
  return value;
}

// Orçamentos e lances chegam num envelope, com o número em centavos DENTRO
// dele e repetindo o nome da chave:
//   "old_value": {"type":"payment_amount","currency":"BRL","old_value":1500}
//   "new_value": {"type":"payment_amount","currency":"BRL","new_value":2000}
function unwrapEnvelope(
  value: any,
  side: "old" | "new"
): { value: any; currency?: string; money: boolean; unwrapped: boolean } {
  if (!isPlainObject(value)) return { value, money: false, unwrapped: false };
  const currency = typeof value.currency === "string" ? value.currency : undefined;
  const inner = side === "old" ? value.old_value ?? value.new_value : value.new_value ?? value.old_value;
  if (inner === undefined) return { value, money: false, unwrapped: false };
  return {
    value: inner,
    currency,
    money: value.type === "payment_amount" || currency != null,
    unwrapped: true,
  };
}

// Formata um valor escalar do log. `isMoney` vem do tipo do evento: a Meta
// entrega orçamentos/lances em centavos da moeda da conta.
function formatScalar(
  value: any,
  opts: { money?: boolean; date?: boolean; currency: string; max?: number }
): string {
  const max = opts.max ?? 90;
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (Array.isArray(value)) return truncate(JSON.stringify(value), max);
  if (isPlainObject(value)) return truncate(JSON.stringify(value), max);

  const s = String(value).trim();
  const upper = s.toUpperCase();
  if (STATUS_LABELS[upper]) return STATUS_LABELS[upper];

  const n = Number(s);
  if (s !== "" && Number.isFinite(n)) {
    // Datas de início/fim vêm como epoch em segundos.
    if (opts.date && n > 1_000_000_000 && n < 20_000_000_000) {
      return new Date(n * 1000).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    }
    if (opts.money) return money(n / 100, opts.currency);
    return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }
  return truncate(s, max);
}

// URLs, JSON e blocos de segmentação não cabem numa linha de timeline: nesses
// casos mostramos só o que mudou, sem o "de → para".
function isUnreadable(value: string | null): boolean {
  if (!value) return false;
  if (value.length > 60) return true;
  if (/^https?:\/\//.test(value)) return true;
  // JSON de verdade (não confundir com nomes tipo "[TRF] Seguidores").
  return /^[[{].*[\]}]$/.test(value);
}

interface DescribedChange {
  from: string | null;
  to: string | null;
  detail: string | null;
  impact: AdChangeEvent["impact"];
  raw: string | null;
}

function describeMetaChange(eventType: string, extraRaw: any, currency: string): DescribedChange {
  const empty: DescribedChange = { from: null, to: null, detail: null, impact: null, raw: null };
  const extra = parseMaybeJson(extraRaw);
  if (!isPlainObject(extra)) {
    const text = extra == null ? "" : String(extra);
    return { ...empty, detail: text ? truncate(text, 140) : null };
  }

  let isMoney = /budget|bid|spend_cap|spend_limit|min_spend|amount|charge|funding|payment/i.test(eventType);
  const isDate = /duration|schedule|scheduling|time/i.test(eventType);
  let effCurrency = currency;

  let oldValue = unwrapHtml(parseMaybeJson(extra.old_value));
  let newValue = unwrapHtml(parseMaybeJson(extra.new_value));

  // Orçamento/lance: tira o número de dentro do envelope antes de comparar.
  const oldEnv = unwrapEnvelope(oldValue, "old");
  const newEnv = unwrapEnvelope(newValue, "new");
  if (oldEnv.unwrapped || newEnv.unwrapped) {
    oldValue = oldEnv.unwrapped ? oldEnv.value : oldValue;
    newValue = newEnv.unwrapped ? newEnv.value : newValue;
    effCurrency = oldEnv.currency || newEnv.currency || currency;
    isMoney = isMoney || oldEnv.money || newEnv.money;
  }

  const fmt = (v: any) => formatScalar(v, { money: isMoney, date: isDate, currency: effCurrency });
  const hasOld = oldValue != null && oldValue !== "";
  const hasNew = newValue != null && newValue !== "";
  const hasPair = hasOld || hasNew;

  // Caso 1: o par velho/novo é um objeto (ex.: orçamento com vários campos).
  if (isPlainObject(oldValue) || isPlainObject(newValue)) {
    const before = isPlainObject(oldValue) ? oldValue : {};
    const after = isPlainObject(newValue) ? newValue : {};
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
    const changed = keys.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    if (changed.length === 0) return { ...empty, raw: truncate(JSON.stringify(extra), 400) };
    if (changed.length === 1) {
      const key = changed[0];
      const keyIsMoney = isMoney || /budget|bid|amount|cap|spend/i.test(key);
      const keyIsDate = isDate || /time|date/i.test(key);
      const fmtKey = (v: any) => formatScalar(v, { money: keyIsMoney, date: keyIsDate, currency: effCurrency });
      const from = fmtKey(before[key]);
      const to = fmtKey(after[key]);
      const readable = !isUnreadable(from) && !isUnreadable(to);
      return {
        from: readable ? from : null,
        to: readable ? to : null,
        detail: readable ? prettifySlug(key) : `${prettifySlug(key)} alterado(a)`,
        impact: numericImpact(before[key], after[key]),
        raw: null,
      };
    }
    return {
      ...empty,
      detail: `Campos alterados: ${changed.slice(0, 6).map(prettifySlug).join(", ")}${
        changed.length > 6 ? ` +${changed.length - 6}` : ""
      }`,
      raw: truncate(JSON.stringify(extra), 400),
    };
  }

  // Caso 2: par velho/novo escalar (o mais comum: status, orçamento, nome).
  // Quando só existe o novo valor (cobrança, saldo, primeira veiculação) não
  // inventamos um "de —": mostramos apenas o valor.
  if (hasPair) {
    const from = hasOld ? fmt(oldValue) : null;
    const to = hasNew ? fmt(newValue) : null;
    const readable = !isUnreadable(from) && !isUnreadable(to);
    const statusImpact = statusChangeImpact(oldValue, newValue);
    return {
      from: readable ? from : null,
      to: readable ? to : null,
      detail: readable ? null : "conteúdo alterado",
      impact: statusImpact ?? (hasOld && hasNew ? numericImpact(oldValue, newValue) : null),
      raw: !from && !to ? truncate(JSON.stringify(extra), 400) : null,
    };
  }

  // Caso 3: evento informativo (cobrança, saldo, forma de pagamento...).
  const parts = Object.entries(extra)
    .map(([k, v]) => [k, unwrapHtml(v)] as const)
    .filter(
      ([k, v]) =>
        !NOISE_KEYS.has(k) &&
        v != null &&
        v !== "" &&
        !isPlainObject(v) &&
        !/^https?:\/\//.test(String(v)) // URLs de criativo não dizem nada aqui
    )
    .slice(0, 4)
    .map(([k, v]) => {
      const keyIsMoney = isMoney || /amount|budget|bid|cap|spend|charge|value/i.test(k);
      const text = formatScalar(v, { money: keyIsMoney, date: isDate, currency: effCurrency, max: 44 });
      return `${prettifySlug(k)}: ${text}`;
    });
  return {
    ...empty,
    detail: parts.length ? truncate(parts.join(" · "), 160) : null,
    raw: parts.length ? null : truncate(JSON.stringify(extra), 400),
  };
}

function statusChangeImpact(oldValue: any, newValue: any): AdChangeEvent["impact"] {
  const a = String(oldValue ?? "").trim();
  const b = String(newValue ?? "").trim();
  if (!b) return null;
  if (PAUSE_VALUES.test(b) && !PAUSE_VALUES.test(a)) return "pause";
  if (RESUME_VALUES.test(b) && !RESUME_VALUES.test(a)) return "resume";
  return null;
}

function numericImpact(oldValue: any, newValue: any): AdChangeEvent["impact"] {
  const a = Number(oldValue);
  const b = Number(newValue);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return null;
  return b > a ? "up" : "down";
}

// A Meta devolve "2026-07-24T09:12:33+0000" — o offset sem dois-pontos não é
// ISO válido em todos os runtimes. Normalizamos antes de virar Date.
function metaTimeToIso(value: string | undefined): string {
  if (!value) return new Date(0).toISOString();
  const normalized = value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}

function dayBounds(since: string, until: string): { since: number; until: number } {
  const start = Math.floor(new Date(`${since}T00:00:00Z`).getTime() / 1000);
  const end = Math.floor(new Date(`${until}T23:59:59Z`).getTime() / 1000);
  return { since: start, until: end };
}

export async function getMetaChangeLog(
  actId: string,
  since: string,
  until: string,
  token: string,
  currency = "BRL"
): Promise<ChangeLog> {
  if (!actId.startsWith("act_")) actId = `act_${actId}`;
  const bounds = dayBounds(since, until);
  const first = new URL(`${GRAPH}/${actId}/activities`);
  first.searchParams.set("fields", META_FIELDS);
  first.searchParams.set("since", String(bounds.since));
  first.searchParams.set("until", String(bounds.until));
  first.searchParams.set("limit", String(PAGE_SIZE));
  first.searchParams.set("locale", "pt_BR");
  first.searchParams.set("access_token", token);

  const rows: any[] = [];
  let next: string | undefined = first.toString();
  let pages = 0;
  let truncated = false;
  while (next) {
    if (pages >= MAX_PAGES) {
      truncated = true;
      break;
    }
    const res: Response = await fetch(next, { cache: "no-store" });
    const body: string = await res.text();
    if (!res.ok) throw new Error(`Meta API ${res.status}: ${truncate(body, 300)}`);
    const json: any = body ? JSON.parse(body) : {};
    rows.push(...(json.data || []));
    next = json.paging?.next;
    pages += 1;
  }

  const events = rows.map((row, i) => {
    const eventType = String(row.event_type || "desconhecido");
    const described = describeMetaChange(eventType, row.extra_data, currency);
    const actor = row.actor_name || row.application_name || null;
    return {
      id: `${row.event_time || ""}:${eventType}:${row.object_id || ""}:${i}`,
      time: metaTimeToIso(row.event_time),
      category: metaCategory(eventType),
      label: META_EVENT_LABELS[eventType] || row.translated_event_type || prettifySlug(eventType),
      objectType: metaObjectLabel(eventType, String(row.object_type || "").toUpperCase()),
      objectName: row.object_name || null,
      objectId: row.object_id ? String(row.object_id) : null,
      actor,
      // "Meta" como autor = evento automático (cobrança, aprovação, entrega).
      system: !actor || actor === "Meta",
      count: 1,
      ...described,
    } satisfies AdChangeEvent;
  });

  return {
    events: dedupe(events),
    truncated,
    note: truncated ? "Mostrando as edições mais recentes do período (log muito longo)." : null,
  };
}

// A Meta repete o mesmo evento várias vezes (públicos automáticos, por
// exemplo). Agrupa idênticos do mesmo minuto num item com contador.
export function dedupe(events: AdChangeEvent[]): AdChangeEvent[] {
  const byKey = new Map<string, AdChangeEvent>();
  for (const event of events) {
    const key = [
      event.time.slice(0, 16),
      event.label,
      event.objectId,
      event.objectName,
      event.from,
      event.to,
      event.detail,
    ].join("|");
    const existing = byKey.get(key);
    if (existing) existing.count += 1;
    else byKey.set(key, event);
  }
  return Array.from(byKey.values()).sort((a, b) => b.time.localeCompare(a.time));
}

// ==========================================================================
// GOOGLE — mapeamento do change_event (a consulta vive em lib/google-ads.ts)
// ==========================================================================

const GOOGLE_RESOURCE_LABELS: Record<string, string> = {
  CAMPAIGN: "Campanha",
  CAMPAIGN_BUDGET: "Orçamento",
  CAMPAIGN_CRITERION: "Segmentação da campanha",
  CAMPAIGN_ASSET: "Recurso da campanha",
  AD_GROUP: "Grupo de anúncios",
  AD_GROUP_AD: "Anúncio",
  AD_GROUP_ASSET: "Recurso do anúncio",
  AD_GROUP_CRITERION: "Palavra-chave / segmentação",
  AD_GROUP_BID_MODIFIER: "Ajuste de lance",
  AD_GROUP_FEED: "Feed do grupo",
  ASSET: "Recurso",
  FEED: "Feed",
  FEED_ITEM: "Item de feed",
  CUSTOMER_ASSET: "Recurso da conta",
};

const GOOGLE_FIELD_LABELS: Record<string, string> = {
  status: "Status",
  primary_status: "Status",
  serving_status: "Veiculação",
  name: "Nome",
  amount_micros: "Orçamento diário",
  total_amount_micros: "Orçamento total",
  cpc_bid_micros: "Lance de CPC",
  cpm_bid_micros: "Lance de CPM",
  target_cpa_micros: "CPA alvo",
  target_roas: "ROAS alvo",
  target_spend_micros: "Gasto alvo",
  bidding_strategy_type: "Estratégia de lance",
  campaign_budget: "Orçamento",
  start_date: "Início",
  end_date: "Término",
  final_urls: "URL final",
  keyword_text: "Palavra-chave",
  match_type: "Tipo de correspondência",
  negative: "Negativação",
  bid_modifier: "Ajuste de lance",
  ad_rotation_mode: "Rotação de anúncios",
  delivery_method: "Entrega",
  explorer_auto_optimizer_setting: "Otimizador",
  advertising_channel_type: "Tipo de campanha",
  optimization_score: "Índice de otimização",
};

function googleCategory(operation: string, fields: string[], resourceType: string): ChangeCategory {
  if (operation === "CREATE") return "creation";
  if (operation === "REMOVE") return "deletion";
  const joined = `${fields.join(",")} ${resourceType}`.toLowerCase();
  if (/budget|amount_micros/.test(joined)) return "budget";
  if (/bid|cpa|roas|cpc|cpm/.test(joined)) return "bid";
  if (/status/.test(joined)) return "status";
  if (/criterion|keyword|geo|audience|placement|match_type/.test(joined)) return "targeting";
  if (/ad_group_ad|asset|final_urls|headline|description|image|video/.test(joined)) return "creative";
  return "other";
}

function readPath(resource: any, path: string): any {
  if (!resource) return undefined;
  let node: any = resource;
  for (const part of path.split(".")) {
    if (node == null) return undefined;
    node = node[camel(part)];
  }
  return node;
}

function formatGoogleValue(field: string, value: any, currency: string): string {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return truncate(value.map((v) => String(v)).join(", "));
  if (isPlainObject(value)) return truncate(JSON.stringify(value));
  const s = String(value);
  const upper = s.toUpperCase();
  if (STATUS_LABELS[upper]) return STATUS_LABELS[upper];
  const n = Number(s);
  if (Number.isFinite(n) && s.trim() !== "") {
    if (/_micros$/.test(field)) return money(n / 1_000_000, currency);
    return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }
  return truncate(s);
}

// Extrai o id final de um resource name ("customers/1/campaigns/22" -> "22").
function lastSegment(resourceName?: string): string | null {
  if (!resourceName) return null;
  const parts = String(resourceName).split("/");
  return parts[parts.length - 1] || null;
}

export function mapGoogleChangeEvent(row: any, index: number, currency: string): AdChangeEvent {
  const ev = row.changeEvent || {};
  const operation = String(ev.resourceChangeOperation || "UPDATE").toUpperCase();
  const resourceType = String(ev.changeResourceType || "").toUpperCase();
  // O field mask chega como string separada por vírgula no JSON REST.
  const fields: string[] = String(ev.changedFields || "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  const relevant = fields.filter((f) => !/^(resource_name|id)$/.test(f.split(".").pop() || ""));
  const primary = relevant[0];
  const leaf = primary ? primary.split(".").pop() || primary : null;

  let from: string | null = null;
  let to: string | null = null;
  let impact: AdChangeEvent["impact"] = null;
  if (primary && operation === "UPDATE") {
    const before = readPath(ev.oldResource, primary);
    const after = readPath(ev.newResource, primary);
    from = formatGoogleValue(leaf || "", before, currency);
    to = formatGoogleValue(leaf || "", after, currency);
    impact = statusChangeImpact(before, after) ?? numericImpact(before, after);
  }

  const objectName =
    ev.campaign && row.campaign?.name
      ? row.campaign.name
      : row.adGroup?.name || row.campaign?.name || null;
  const resourceLabel = GOOGLE_RESOURCE_LABELS[resourceType] || prettifySlug(resourceType.toLowerCase());
  const feminine = /^(campanha|segmenta|palavra)/i.test(resourceLabel);
  const label =
    operation === "CREATE"
      ? `${resourceLabel} ${feminine ? "criada" : "criado"}`
      : operation === "REMOVE"
        ? `${resourceLabel} ${feminine ? "removida" : "removido"}`
        : leaf
          ? GOOGLE_FIELD_LABELS[leaf] || prettifySlug(leaf)
          : "Alteração";

  const extraFields = relevant.slice(1, 5).map((f) => {
    const l = f.split(".").pop() || f;
    return GOOGLE_FIELD_LABELS[l] || prettifySlug(l);
  });

  const changeTime = String(ev.changeDateTime || "").replace(" ", "T");
  return {
    id: `${changeTime}:${ev.changeResourceName || resourceType}:${index}`,
    time: changeTime || new Date(0).toISOString(),
    category: googleCategory(operation, relevant, resourceType),
    label,
    objectType: GOOGLE_RESOURCE_LABELS[resourceType] || (resourceType ? prettifySlug(resourceType.toLowerCase()) : null),
    objectName,
    objectId: lastSegment(ev.changeResourceName),
    from,
    to,
    detail: extraFields.length ? `Também mudou: ${extraFields.join(", ")}` : null,
    actor: ev.userEmail || (ev.clientType ? prettifySlug(String(ev.clientType).toLowerCase()) : null),
    impact,
    // Sem e-mail de usuário = regra automática / recomendação do Google.
    system: !ev.userEmail,
    count: 1,
    raw: null,
  };
}
