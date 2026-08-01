// lib/account-alerts.ts
// Alertas por CONTA DE ANÚNCIOS: regras configuradas na Central de Alertas
// (painel "Alertas personalizados") e avaliadas na coleta (e sob demanda pelo
// botão "Testar"). Cada regra vira NO MÁXIMO uma linha em account_alerts
// (unique rule_id): ativa enquanto a condição valer, resolvida quando passa.
//
// Tipos de regra:
//  - cpl:          custo por lead acima do teto nos últimos N dias
//  - region:       região obrigatória sem anúncio rodando (ex.: Búzios/Cabo
//                  Frio) — tráfego parado para aquele público; com
//                  warn_outside, também avisa tráfego fora das aprovadas
//  - creative_age: nenhum criativo novo há mais de N dias
//
// As regras de segmentação/criativo só fazem sentido na Meta (o Google não
// expõe targeting por esta via); a UI marca isso.

import type { SupabaseClient } from "@supabase/supabase-js";
import { tokenByIndex, GRAPH } from "./meta";
import { pickVal } from "./format";

export type AccountAlertKind = "cpl" | "region" | "creative_age" | "strategy_review";

export interface AccountAlertRule {
  id: string;
  account_id: string;
  kind: AccountAlertKind;
  name: string;
  config: Record<string, any>;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AccountAlertEvaluation {
  rule: AccountAlertRule;
  ok: boolean;
  alert: { level: "warning" | "critical"; title: string; detail: string } | null;
}

const LEAD_KEYS = ["lead", "offsite_conversion.fb_pixel_lead", "onsite_web_lead", "onsite_conversion.lead_grouped", "leadgen_grouped"];

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchAll(url: string): Promise<any[]> {
  const out: any[] = [];
  let next: string | undefined = url;
  while (next) {
    const res: Response = await fetch(next);
    if (!res.ok) throw new Error(`Meta API ${res.status}`);
    const json: any = await res.json();
    out.push(...(json.data || []));
    next = json.paging?.next;
  }
  return out;
}

// Meta: conjuntos com segmentação + anúncios com data de criação, da conta.
async function fetchDeliveryFacts(
  actId: string,
  token: string
): Promise<{ regions: Set<string>; cities: Set<string>; newestAd: string | null }> {
  const facts = { regions: new Set<string>(), cities: new Set<string>(), newestAd: null as string | null };

  const collectNames = (targeting: any) => {
    const geo = targeting?.geo_locations || {};
    for (const region of geo.regions || []) if (region?.name) facts.regions.add(String(region.name).trim());
    for (const city of geo.cities || []) if (city?.name) facts.cities.add(String(city.name).trim());
  };

  try {
    const adsetsUrl = `${GRAPH}/${actId}/adsets?fields=id,targeting&limit=200&access_token=${token}`;
    const adsets = await fetchAll(adsetsUrl);
    for (const adset of adsets) collectNames(adset.targeting);
  } catch {
    // Falha de listagem não derruba a avaliação das outras regras.
  }

  try {
    const adsUrl = `${GRAPH}/${actId}/ads?fields=id,created_time&limit=200&access_token=${token}`;
    const ads = await fetchAll(adsUrl);
    let newest = 0;
    for (const ad of ads) {
      const time = Date.parse(ad.created_time);
      if (!Number.isNaN(time) && time > newest) newest = time;
    }
    facts.newestAd = newest ? new Date(newest).toISOString() : null;
  } catch {
    // idem
  }

  return facts;
}

// Métricas dos últimos N dias da conta (tabela local, alimentada pela coleta).
async function accountMetrics(sb: SupabaseClient, accountId: string, since: string): Promise<{ spend: number; results: Record<string, number> }> {
  const { data } = await sb
    .from("daily_account_metrics")
    .select("spend, results")
    .eq("account_id", accountId)
    .gte("metric_date", since);
  const totals = { spend: 0, results: {} as Record<string, number> };
  for (const row of data || []) {
    totals.spend += Number(row.spend || 0);
    const results = row.results || {};
    for (const [key, value] of Object.entries(results)) {
      totals.results[key] = (totals.results[key] || 0) + Number(value);
    }
  }
  return totals;
}

function evaluateCpl(rule: AccountAlertRule, metrics: { spend: number; results: Record<string, number> }): AccountAlertEvaluation["alert"] {
  const maxCpl = Number(rule.config.max_cpl);
  if (!Number.isFinite(maxCpl) || maxCpl <= 0) return { level: "warning", title: "Regra de CPL sem teto configurado", detail: "Defina o custo máximo por lead para esta regra." };
  const periodDays = Number(rule.config.period_days) || 7;
  const leads = pickVal(metrics.results, LEAD_KEYS);
  if (leads === 0) {
    return metrics.spend > 0
      ? { level: "critical", title: "Investindo sem leads", detail: `Foram R$ ${Math.round(metrics.spend).toLocaleString("pt-BR")} nos últimos ${periodDays} dias e nenhum lead registrado (teto: ${maxCpl.toLocaleString("pt-BR")}).` }
      : { level: "warning", title: "Sem dados de leads no período", detail: "Nenhum investimento nem lead nos últimos dias — confira a coleta e a configuração do pixel." };
  }
  const cpl = metrics.spend / leads;
  if (cpl > maxCpl) {
    return {
      level: "critical",
      title: `CPL acima do teto: ${cpl.toFixed(2).replace(".", ",")}`,
      detail: `Custo por lead de ${cpl.toFixed(2).replace(".", ",")} nos últimos ${periodDays} dias — teto configurado é ${maxCpl.toLocaleString("pt-BR")} (${leads} leads, R$ ${Math.round(metrics.spend).toLocaleString("pt-BR")} investidos).`,
    };
  }
  return null;
}

// A lista funciona como whitelist: com warn_outside, qualquer estado/cidade
// segmentado fora dela vira alerta (o país — Brasil — é ignorado de propósito).
// O casamento ignora acentos/caixa e aceita nome que contenha o aprovado ou
// vice-versa ("São Paulo" casa com "São Paulo" e com "São Paulo - Capital").
function evaluateRegions(rule: AccountAlertRule, facts: { regions: Set<string>; cities: Set<string> }): AccountAlertEvaluation["alert"] {
  const required: string[] = (rule.config.regions || []).map((region: unknown) => String(region || "").trim()).filter(Boolean);
  if (!required.length) return { level: "warning", title: "Regra de região sem lista", detail: "Informe ao menos uma região que precisa receber anúncio." };

  const approvedRaw = [...new Set(required)];
  const approved = approvedRaw.map(normalize).filter(Boolean);
  const targetedRaw = [...new Set([...facts.regions, ...facts.cities])];
  const targeted = targetedRaw.map(normalize).filter(Boolean);

  const matchesApproved = (name: string) => approved.some((a) => a && (a.includes(name) || name.includes(a)));

  const missing = approvedRaw.filter((region) => {
    const name = normalize(region);
    return name && !targeted.some((t) => t && (t.includes(name) || name.includes(t)));
  });

  const unexpected = rule.config.warn_outside
    ? targetedRaw.filter((raw) => {
        const name = normalize(raw);
        if (!name || name === "brasil" || name === "brazil") return false;
        return !matchesApproved(name);
      })
    : [];

  if (!missing.length && !unexpected.length) return null;

  const parts: string[] = [];
  if (missing.length) parts.push(`Sem tráfego em: ${missing.join(", ")}.`);
  if (unexpected.length) parts.push(`Tráfego fora das aprovadas: ${unexpected.map((name) => name.charAt(0).toUpperCase() + name.slice(1)).join(", ")}.`);
  return {
    level: "warning",
    title: missing.length ? `Sem tráfego em: ${missing.join(", ")}` : "Tráfego fora das regiões aprovadas",
    detail: `${parts.join(" ")} Confira a segmentação dos conjuntos ativos.`,
  };
}

function evaluateCreativeAge(rule: AccountAlertRule, newestAd: string | null): AccountAlertEvaluation["alert"] {
  const maxAgeDays = Number(rule.config.max_age_days);
  if (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0) return { level: "warning", title: "Regra de criativos sem limite", detail: "Defina há quantos dias sem criativo novo você quer ser avisado." };
  if (!newestAd) {
    return { level: "warning", title: "Nenhum anúncio encontrado", detail: "Não há anúncios nesta conta. Verifique se a veiculação está de pé." };
  }
  const ageDays = (Date.now() - Date.parse(newestAd)) / 86400000;
  if (ageDays > maxAgeDays) {
    const rounded = Math.round(ageDays);
    return {
      level: "warning",
      title: `Sem criativo novo há ${rounded} dias`,
      detail: `O anúncio mais recente foi criado em ${new Date(newestAd).toLocaleDateString("pt-BR")} — já passou do limite de ${maxAgeDays} dias. Vale subir variações novas de criativo.`,
    };
  }
  return null;
}

// Revisão mensal da estratégia: o resumo estratégico da conta precisa ser
// atualizado dentro do prazo (default 30 dias), senão o alerta lembra.
function evaluateStrategyReview(rule: AccountAlertRule, updatedAt: string | null): AccountAlertEvaluation["alert"] {
  const maxAgeDays = Number(rule.config.max_age_days) || 30;
  if (!updatedAt) {
    return { level: "warning", title: "Resumo estratégico não preenchido", detail: "Preencha o resumo estratégico da conta (público alvo, regiões, cidades, melhores ofertas) na tela de campanhas para ter o norte do mês." };
  }
  const ageDays = (Date.now() - Date.parse(updatedAt)) / 86400000;
  if (ageDays > maxAgeDays) {
    const rounded = Math.round(ageDays);
    return {
      level: "warning",
      title: `Resumo estratégico desatualizado há ${rounded} dias`,
      detail: `A última atualização foi em ${new Date(updatedAt).toLocaleDateString("pt-BR")}. Confira se o plano do mês segue alinhado (público, regiões, ofertas) e atualize o resumo.`,
    };
  }
  return null;
}

// Avalia as regras habilitadas de UMA conta e persiste o resultado em
// account_alerts (uma linha por regra). Devolve o resumo por regra.
export async function evaluateAccountRules(sb: SupabaseClient, accountId: string): Promise<AccountAlertEvaluation[]> {
  const { data: rules } = await sb
    .from("account_alert_rules")
    .select("*")
    .eq("account_id", accountId)
    .eq("enabled", true);
  if (!rules?.length) return [];

  const { data: account } = await sb
    .from("ad_accounts")
    .select("platform, token_ref")
    .eq("account_id", accountId.replace(/^act_/, ""))
    .maybeSingle();
  const isMeta = account?.platform === "meta";
  const token = tokenByIndex(typeof account?.token_ref === "number" ? account.token_ref : 0);
  const actId = accountId.replace(/^act_/, "");
  const fullActId = actId.startsWith("act_") ? actId : `act_${actId}`;

  const needsDelivery = rules.some((rule: any) => rule.kind === "region" || rule.kind === "creative_age");
  const deliveryFacts = needsDelivery && isMeta
    ? await fetchDeliveryFacts(fullActId, token).catch(() => ({ regions: new Set<string>(), cities: new Set<string>(), newestAd: null }))
    : { regions: new Set<string>(), cities: new Set<string>(), newestAd: null };

  const cplRules = rules.filter((rule: any) => rule.kind === "cpl");
  const metricsByPeriod = new Map<number, { spend: number; results: Record<string, number> }>();
  for (const rule of cplRules) {
    const period = Number(rule.config.period_days) || 7;
    if (!metricsByPeriod.has(period)) {
      metricsByPeriod.set(period, await accountMetrics(sb, accountId.replace(/^act_/, ""), daysAgoIso(period)));
    }
  }

  const now = new Date().toISOString();
  const evaluations: AccountAlertEvaluation[] = [];

  // Data da última atualização do resumo estratégico (uma consulta só).
  let strategyUpdatedAt: string | null = null;
  if (rules.some((rule: any) => rule.kind === "strategy_review")) {
    const { data: strategy } = await sb
      .from("account_strategies")
      .select("updated_at")
      .eq("account_id", accountId.replace(/^act_/, ""))
      .maybeSingle();
    strategyUpdatedAt = strategy?.updated_at || null;
  }

  for (const rule of (rules as AccountAlertRule[])) {
    let alert: AccountAlertEvaluation["alert"] = null;
    if (rule.kind === "cpl") {
      alert = evaluateCpl(rule, metricsByPeriod.get(Number(rule.config.period_days) || 7) || { spend: 0, results: {} });
    } else if (rule.kind === "region") {
      alert = isMeta ? evaluateRegions(rule, deliveryFacts) : { level: "warning", title: "Regra de região só funciona na Meta", detail: "O Google Ads não expõe a segmentação por esta via. Use o painel do Google para conferir as localizações." };
    } else if (rule.kind === "creative_age") {
      alert = isMeta ? evaluateCreativeAge(rule, deliveryFacts.newestAd) : { level: "warning", title: "Regra de criativo só funciona na Meta", detail: "O Google Ads não expõe a data de criação dos anúncios por esta via." };
    } else if (rule.kind === "strategy_review") {
      alert = evaluateStrategyReview(rule, strategyUpdatedAt);
    }
    evaluations.push({ rule, ok: !alert, alert });

    if (alert) {
      await sb.from("account_alerts").upsert(
        {
          rule_id: rule.id,
          account_id: accountId.replace(/^act_/, ""),
          kind: rule.kind,
          level: alert.level,
          title: alert.title,
          detail: alert.detail,
          last_seen_at: now,
          resolved: false,
          resolved_at: null,
        },
        { onConflict: "rule_id" }
      );
    } else {
      await sb
        .from("account_alerts")
        .update({ resolved: true, resolved_at: now })
        .eq("rule_id", rule.id)
        .eq("resolved", false);
    }
  }

  return evaluations;
}

// Avalia as regras de todas as contas com regras ativas (chamado pela coleta).
export async function evaluateAllAccountRules(sb: SupabaseClient): Promise<number> {
  const { data: rules } = await sb.from("account_alert_rules").select("account_id").eq("enabled", true);
  if (!rules?.length) return 0;
  const accountIds = [...new Set(rules.map((rule: any) => rule.account_id))];
  let evaluated = 0;
  for (const accountId of accountIds) {
    try {
      evaluated += (await evaluateAccountRules(sb, accountId)).length;
    } catch {
      // Regra de uma conta não pode derrubar a avaliação das demais.
    }
  }
  return evaluated;
}
