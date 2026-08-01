// lib/client-alerts.ts
// Alertas por CLIENTE: regras configuradas na tela de Metas do cliente e
// avaliadas na coleta (e sob demanda pelo botão "Testar"). Cada regra vira
// NO MÁXIMO uma linha em client_alerts (unique rule_id): ativa enquanto a
// condição valer, resolvida quando passar.
//
// Tipos de regra:
//  - cpl:          custo por lead acima do teto nos últimos N dias
//  - region:       região obrigatória sem anúncio rodando (ex.: Búzios/Cabo
//                  Frio) — significa tráfego parado para aquele público
//  - creative_age: nenhum criativo novo há mais de N dias

import type { SupabaseClient } from "@supabase/supabase-js";
import { tokenByIndex, GRAPH } from "./meta";
import { pickVal } from "./format";

export type ClientAlertKind = "cpl" | "region" | "creative_age";

export interface ClientAlertRule {
  id: string;
  client_id: string;
  kind: ClientAlertKind;
  name: string;
  config: Record<string, any>;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ClientAlertOutcome {
  id: string;
  rule_id: string;
  client_id: string;
  kind: ClientAlertKind;
  level: "warning" | "critical";
  title: string;
  detail: string;
  first_seen_at: string;
  last_seen_at: string;
  resolved: boolean;
  resolved_at: string | null;
}

export interface ClientAlertEvaluation {
  rule: ClientAlertRule;
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

// Meta: conjuntos com segmentação + anúncios com data de criação, por conta.
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
    // Falha de listagem não derruba a avaliação das outras contas/regras.
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

async function clientMetaAccounts(sb: SupabaseClient, clientId: string): Promise<{ account_id: string; name: string; token_ref: number }[]> {
  const { data: links } = await sb.from("client_ad_accounts").select("account_id").eq("client_id", clientId);
  if (!links?.length) return [];
  const ids = links.map((link: any) => link.account_id);
  const { data: accounts } = await sb
    .from("ad_accounts")
    .select("account_id,name,token_ref")
    .eq("platform", "meta")
    .eq("hidden", false)
    .in("account_id", ids);
  return (accounts || []).map((account: any) => ({
    account_id: account.account_id,
    name: account.name || account.account_id,
    token_ref: typeof account.token_ref === "number" ? account.token_ref : 0,
  }));
}

// Métricas dos últimos N dias somadas das contas do cliente (tabela local,
// alimentada pela coleta — não faz chamada à Meta).
async function clientMetrics(sb: SupabaseClient, accountIds: string[], since: string): Promise<{ spend: number; results: Record<string, number> }> {
  const { data } = await sb
    .from("daily_account_metrics")
    .select("account_id, metric_date, spend, results")
    .in("account_id", accountIds)
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

function evaluateCpl(rule: ClientAlertRule, metrics: { spend: number; results: Record<string, number> }): ClientAlertEvaluation["alert"] {
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
function evaluateRegions(rule: ClientAlertRule, facts: { regions: Set<string>; cities: Set<string> }): ClientAlertEvaluation["alert"] {
  const required: string[] = (rule.config.regions || []).map((region: unknown) => String(region || "").trim()).filter(Boolean);
  if (!required.length) return { level: "warning", title: "Regra de região sem lista", detail: "Informe ao menos uma região que precisa receber anúncio." };

  const approvedRaw = [...new Set(required)];
  const approved = approvedRaw.map(normalize).filter(Boolean);
  const targetedRaw = [...new Set([...facts.regions, ...facts.cities])];
  const targeted = targetedRaw.map(normalize).filter(Boolean);

  const matchesApproved = (name: string) => approved.some((a) => a && (a.includes(name) || name.includes(a)));

  // Regiões obrigatórias que não estão sendo segmentadas.
  const missing = approvedRaw.filter((region) => {
    const name = normalize(region);
    return name && !targeted.some((t) => t && (t.includes(name) || name.includes(t)));
  });

  // Tráfego fora das aprovadas (opcional): estado/cidade segmentado que não
  // casa com nenhuma aprovada. O país de origem não é flagrado.
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

function evaluateCreativeAge(rule: ClientAlertRule, newestAd: string | null): ClientAlertEvaluation["alert"] {
  const maxAgeDays = Number(rule.config.max_age_days);
  if (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0) return { level: "warning", title: "Regra de criativos sem limite", detail: "Defina há quantos dias sem criativo novo você quer ser avisado." };
  if (!newestAd) {
    return { level: "warning", title: "Nenhum anúncio encontrado", detail: "Não há anúncios nas contas do cliente. Verifique se a veiculação está de pé." };
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

// Avalia as regras habilitadas de um cliente e persiste o resultado em
// client_alerts (uma linha por regra). Devolve o resumo por regra.
export async function evaluateClientRules(sb: SupabaseClient, clientId: string): Promise<ClientAlertEvaluation[]> {
  const { data: rules } = await sb
    .from("client_alert_rules")
    .select("*")
    .eq("client_id", clientId)
    .eq("enabled", true);
  if (!rules?.length) return [];

  const evaluations: ClientAlertEvaluation[] = [];
  const metaAccounts = await clientMetaAccounts(sb, clientId);
  const accountIds = metaAccounts.map((account) => account.account_id);
  const today = new Date().toISOString();

  // Fatos da Meta (só quando há regra que precisa deles).
  const needsDelivery = rules.some((rule: any) => rule.kind === "region" || rule.kind === "creative_age");
  const deliveryFacts = new Map<string, Awaited<ReturnType<typeof fetchDeliveryFacts>>>();
  if (needsDelivery) {
    await Promise.all(
      metaAccounts.map(async (account) => {
        const actId = account.account_id.replace(/^act_/, "");
        const facts = await fetchDeliveryFacts(actId.startsWith("act_") ? actId : `act_${actId}`, tokenByIndex(account.token_ref)).catch(() => null);
        deliveryFacts.set(account.account_id, facts || { regions: new Set(), cities: new Set(), newestAd: null });
      })
    );
  }

  // Fatos de métricas (regra de CPL).
  const cplRules = rules.filter((rule: any) => rule.kind === "cpl");
  const metricsByPeriod = new Map<number, { spend: number; results: Record<string, number> }>();
  for (const rule of cplRules) {
    const period = Number(rule.config.period_days) || 7;
    if (!metricsByPeriod.has(period)) {
      metricsByPeriod.set(period, await clientMetrics(sb, accountIds, daysAgoIso(period)));
    }
  }

  const now = new Date().toISOString();

  for (const rule of (rules as ClientAlertRule[])) {
    let alert: ClientAlertEvaluation["alert"] = null;
    if (rule.kind === "cpl") {
      alert = evaluateCpl(rule, metricsByPeriod.get(Number(rule.config.period_days) || 7) || { spend: 0, results: {} });
    } else if (rule.kind === "region") {
      const regions = new Set<string>();
      const cities = new Set<string>();
      for (const facts of deliveryFacts.values()) {
        for (const region of facts.regions) regions.add(region);
        for (const city of facts.cities) cities.add(city);
      }
      alert = evaluateRegions(rule, { regions, cities });
    } else if (rule.kind === "creative_age") {
      const newest = [...deliveryFacts.values()].map((facts) => facts.newestAd).filter(Boolean).sort().pop() || null;
      alert = evaluateCreativeAge(rule, newest);
    }
    evaluations.push({ rule, ok: !alert, alert });

    if (alert) {
      await sb.from("client_alerts").upsert(
        {
          rule_id: rule.id,
          client_id: clientId,
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
        .from("client_alerts")
        .update({ resolved: true, resolved_at: now })
        .eq("rule_id", rule.id)
        .eq("resolved", false);
    }
  }

  return evaluations;
}

// Avalia todas as regras de todos os clientes (chamado pela coleta).
export async function evaluateAllClientRules(sb: SupabaseClient): Promise<number> {
  const { data: rules } = await sb.from("client_alert_rules").select("client_id").eq("enabled", true);
  if (!rules?.length) return 0;
  const clientIds = [...new Set(rules.map((rule: any) => rule.client_id))];
  let evaluated = 0;
  for (const clientId of clientIds) {
    try {
      evaluated += (await evaluateClientRules(sb, clientId)).length;
    } catch {
      // Regra de um cliente não pode derrubar a avaliação dos demais.
    }
  }
  return evaluated;
}
