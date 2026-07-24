// lib/meta.ts
// Cliente da Meta Marketing API.
// Suporta VÁRIOS tokens (um System User por BM). Cada conta é consultada com o
// token que a enxerga; contas duplicadas entre tokens são deduplicadas.

import { RESULT_FAMILIES } from "./format";

const GRAPH = "https://graph.facebook.com/v25.0";

// Tokens: primário em META_ACCESS_TOKEN; extras em META_ACCESS_TOKENS
// (separados por vírgula). Ex.: META_ACCESS_TOKENS="EAA...b,EAA...c".
function getTokens(): string[] {
  const list: string[] = [];
  const primary = (process.env.META_ACCESS_TOKEN || "").trim();
  if (primary) list.push(primary);
  for (const t of (process.env.META_ACCESS_TOKENS || "").split(",")) {
    const s = t.trim();
    if (s) list.push(s);
  }
  return Array.from(new Set(list));
}

export const META_TOKENS = getTokens();
export function tokenCount(): number {
  return META_TOKENS.length;
}
// Token pelo índice (com fallback para o primário).
export function tokenByIndex(i: number): string {
  return META_TOKENS[i] ?? META_TOKENS[0] ?? "";
}

const TOKEN = META_TOKENS[0] || "";

if (!TOKEN) {
  // Não derruba o build, mas avisa em runtime.
  console.warn("META_ACCESS_TOKEN não definido nas variáveis de ambiente.");
}

type FbEdge<T> = { data: T[]; paging?: { next?: string } };

// Helper genérico que segue paginação automaticamente.
async function fbGetAll<T>(url: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | undefined = url;
  while (next) {
    const res = await fetch(next);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Meta API ${res.status}: ${body}`);
    }
    const json = (await res.json()) as FbEdge<T>;
    out.push(...json.data);
    next = json.paging?.next;
  }
  return out;
}

// ---------- Tipos do nosso domínio ----------

export type AccountStatus =
  | "ACTIVE"
  | "DISABLED"
  | "UNSETTLED"
  | "PENDING_RISK_REVIEW"
  | "PENDING_SETTLEMENT"
  | "IN_GRACE_PERIOD"
  | "PENDING_CLOSURE"
  | "CLOSED"
  | "ANY_ACTIVE"
  | "ANY_CLOSED"
  | "UNKNOWN";

export interface AdAccountRaw {
  id: string; // act_XXXX
  account_id: string;
  name: string;
  account_status: number; // código numérico da Meta
  disable_reason?: number;
  currency: string;
  balance?: string; // em centavos, string
  amount_spent?: string; // gasto acumulado do ciclo, centavos
  spend_cap?: string; // limite de gasto, centavos
  business?: { id?: string; name?: string };
  owner_business?: { id?: string; name?: string };
  business_name?: string;
  is_prepay_account?: boolean;
  min_daily_budget?: number | string;
  timezone_name?: string;
  timezone_offset_hours_utc?: number;
  user_tasks?: string[];
  funding_source_details?: {
    type?: number;
    display_string?: string;
  };
}

export interface AccountInsight {
  account_id: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions: number;
  purchases: number;
  purchaseValue: number; // receita das compras (R$)
  results: Record<string, number>; // por família (vendas/mensagens/leads/...)
}

export interface RejectedAd {
  account_id: string;
  ad_id: string;
  ad_name: string;
  campaign_name?: string;
  reasons: string[];
}

// Mapa do código numérico da Meta -> status legível.
// (account_status): 1=ACTIVE, 2=DISABLED, 3=UNSETTLED, 7=PENDING_RISK_REVIEW,
// 8=PENDING_SETTLEMENT, 9=IN_GRACE_PERIOD, 100=PENDING_CLOSURE, 101=CLOSED, ...
export function mapAccountStatus(code: number): AccountStatus {
  switch (code) {
    case 1:
      return "ACTIVE";
    case 2:
      return "DISABLED";
    case 3:
      return "UNSETTLED";
    case 7:
      return "PENDING_RISK_REVIEW";
    case 8:
      return "PENDING_SETTLEMENT";
    case 9:
      return "IN_GRACE_PERIOD";
    case 100:
      return "PENDING_CLOSURE";
    case 101:
      return "CLOSED";
    default:
      return "UNKNOWN";
  }
}

// ---------- Chamadas ----------

// Campos oficiais usados tanto no catálogo quanto no Raio-X de uma conta.
export const META_AD_ACCOUNT_FIELDS = [
  "account_id",
  "name",
  "account_status",
  "disable_reason",
  "currency",
  "balance",
  "amount_spent",
  "spend_cap",
  "business",
  "business_name",
  "is_prepay_account",
  "min_daily_budget",
  "timezone_name",
  "timezone_offset_hours_utc",
  "user_tasks",
  "funding_source_details",
];

// Lista as contas que UM token enxerga, já com os campos de saldo/status.
export async function listAdAccountsForToken(token: string): Promise<AdAccountRaw[]> {
  const fields = META_AD_ACCOUNT_FIELDS.join(",");
  const url = `${GRAPH}/me/adaccounts?fields=${fields}&limit=200&access_token=${token}`;
  return fbGetAll<AdAccountRaw>(url);
}

export interface AccountWithToken {
  acc: AdAccountRaw;
  tokenIndex: number; // índice em META_TOKENS do token que enxerga a conta
}

// Percorre TODOS os tokens e deduplica as contas (primeiro token que vê, vence).
export async function listAdAccountsAll(): Promise<AccountWithToken[]> {
  const seen = new Set<string>();
  const out: AccountWithToken[] = [];
  for (let i = 0; i < META_TOKENS.length; i++) {
    let accs: AdAccountRaw[] = [];
    try {
      accs = await listAdAccountsForToken(META_TOKENS[i]);
    } catch (e: any) {
      // Um token ruim não derruba os demais.
      console.warn(`Token #${i} falhou ao listar contas: ${e?.message}`);
      continue;
    }
    for (const a of accs)
      if (!seen.has(a.account_id)) {
        seen.add(a.account_id);
        out.push({ acc: a, tokenIndex: i });
      }
  }
  return out;
}

// Compat: lista só as contas (sem o índice do token).
export async function listAdAccounts(): Promise<AdAccountRaw[]> {
  return (await listAdAccountsAll()).map((x) => x.acc);
}

// "Conversões" do overview (agregado do topo). Agrupadas por FAMÍLIA: a Meta
// costuma reportar o mesmo resultado sob vários action_types (ex.: uma compra
// aparece como "purchase" e "offsite_conversion.fb_pixel_purchase"). Somamos
// UM valor por família (o maior) para não contar em dobro, e somamos entre
// famílias distintas (compras + leads + conversas + agendamentos + cadastros).
export const CONVERSION_FAMILIES: string[][] = [
  ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"],
  ["lead", "offsite_conversion.fb_pixel_lead", "onsite_web_lead", "onsite_conversion.lead_grouped"],
  ["complete_registration"],
  ["onsite_conversion.messaging_conversation_started_7d", "onsite_conversion.messaging_first_reply"],
  ["schedule", "offsite_conversion.fb_pixel_schedule"],
  ["submit_application"],
  ["subscribe", "start_trial"],
];

function sumConversions(actions?: { action_type: string; value?: string }[]): number {
  const map: Record<string, number> = {};
  for (const a of actions || []) map[a.action_type] = (map[a.action_type] || 0) + Number(a.value || 0);
  let total = 0;
  for (const family of CONVERSION_FAMILIES) {
    let best = 0;
    for (const k of family) if (map[k] != null) best = Math.max(best, map[k]);
    total += best;
  }
  return total;
}

// Compras: a Meta reporta a mesma compra em várias chaves; pegamos o maior
// (dedupe). Serve tanto para "actions" (quantidade) quanto "action_values" (R$).
const PURCHASE_KEYS = ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"];
function sumPurchaseFamily(items?: { action_type: string; value?: string }[]): number {
  const map: Record<string, number> = {};
  for (const a of items || []) map[a.action_type] = (map[a.action_type] || 0) + Number(a.value || 0);
  let best = 0;
  for (const k of PURCHASE_KEYS) if (map[k] != null) best = Math.max(best, map[k]);
  return best;
}

// Conta cada FAMÍLIA de resultado (vendas/mensagens/leads/...) fazendo dedupe
// (maior valor entre as chaves da família). Retorna um mapa slug -> quantidade.
function familyCounts(actions?: { action_type: string; value?: string }[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const a of actions || []) map[a.action_type] = (map[a.action_type] || 0) + Number(a.value || 0);
  const out: Record<string, number> = {};
  for (const f of RESULT_FAMILIES) {
    let best = 0;
    for (const k of f.keys) if (map[k] != null) best = Math.max(best, map[k]);
    out[f.slug] = best;
  }
  out.conversoes = sumConversions(actions);
  return out;
}

// Puxa insights de gasto de uma conta para um intervalo de datas.
// datePreset ex: "last_7d", ou passe since/until.
export async function getAccountInsights(
  accountId: string,
  opts: { datePreset?: string; since?: string; until?: string } = {},
  token: string = TOKEN
): Promise<AccountInsight | null> {
  const fields = "spend,impressions,clicks,ctr,cpc,actions,action_values";
  let range = "date_preset=last_7d";
  if (opts.since && opts.until) {
    range = `time_range={'since':'${opts.since}','until':'${opts.until}'}`;
  } else if (opts.datePreset) {
    range = `date_preset=${opts.datePreset}`;
  }
  const url = `${GRAPH}/${accountId}/insights?fields=${fields}&${range}&access_token=${token}`;
  const rows = await fbGetAll<any>(url);
  if (rows.length === 0) return null;
  const r = rows[0];
  // "actions" traz um array; somamos as conversões relevantes.
  const conversions = sumConversions(r.actions);
  return {
    account_id: accountId,
    spend: Number(r.spend || 0),
    impressions: Number(r.impressions || 0),
    clicks: Number(r.clicks || 0),
    ctr: Number(r.ctr || 0),
    cpc: Number(r.cpc || 0),
    conversions,
    purchases: sumPurchaseFamily(r.actions),
    purchaseValue: sumPurchaseFamily(r.action_values),
    results: familyCounts(r.actions),
  };
}

// Busca anúncios com criativo rejeitado numa conta.
export async function getRejectedAds(accountId: string, token: string = TOKEN): Promise<RejectedAd[]> {
  // effective_status DISAPPROVED / WITH_ISSUES sinaliza reprovação.
  const filtering = encodeURIComponent(
    JSON.stringify([
      { field: "effective_status", operator: "IN", value: ["DISAPPROVED", "WITH_ISSUES"] },
    ])
  );
  const fields = "id,name,campaign{name},ad_review_feedback";
  const url = `${GRAPH}/${accountId}/ads?fields=${fields}&filtering=${filtering}&limit=100&access_token=${token}`;
  const ads = await fbGetAll<any>(url);
  return ads.map((ad) => {
    const feedback = ad.ad_review_feedback?.global || {};
    const reasons = Object.values(feedback).map((v) => String(v));
    return {
      account_id: accountId,
      ad_id: ad.id,
      ad_name: ad.name,
      campaign_name: ad.campaign?.name,
      reasons: reasons.length ? reasons : ["Reprovado (motivo não detalhado)"],
    };
  });
}

// Converte centavos (string da Meta) em número na moeda.
export function centsToUnit(v?: string): number {
  if (!v) return 0;
  return Number(v) / 100;
}

// Extrai um valor em R$ de um texto pt-BR: "R$1.234,56" -> 1234.56.
function parseBrlFromString(s?: string): number | null {
  if (!s) return null;
  const m = s.match(/(\d[\d.]*,\d{2})/);
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Saldo disponível "de verdade". Para contas PRÉ-PAGAS a Meta não expõe o
// valor num campo numérico — ele vem no funding_source_details.display_string
// (ex.: "Saldo disponível (R$331,60 BRL)"). O campo `balance` é o valor em
// aberto (não faturado), que NÃO é o saldo disponível.
export function availableBalance(acc: AdAccountRaw): number | null {
  const ds = acc.funding_source_details?.display_string || "";
  if (/dispon[ií]vel|available/i.test(ds)) {
    const v = parseBrlFromString(ds);
    if (v != null) return v;
  }
  // Fallback: campo balance (contas que de fato expõem saldo ali).
  const b = centsToUnit(acc.balance);
  return b > 0 ? b : null;
}

// Heurística de conta pré-paga (para alertas de saldo baixo).
export function isPrepaidAccount(acc: AdAccountRaw): boolean {
  const ds = acc.funding_source_details?.display_string || "";
  if (/dispon[ií]vel|available/i.test(ds)) return true;
  return [1, 20].includes(acc.funding_source_details?.type ?? -1);
}

// ==========================================================================
// DETALHE POR CONTA (busca ao vivo, on-demand quando a linha é expandida)
// ==========================================================================

type FbAction = { action_type: string; value?: string };

function timeRange(since: string, until: string): string {
  return `time_range=${encodeURIComponent(JSON.stringify({ since, until }))}`;
}

// Soma "actions" num mapa action_type -> total.
function actionsToMap(actions?: FbAction[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const a of actions || []) m[a.action_type] = (m[a.action_type] || 0) + Number(a.value || 0);
  return m;
}

// Rótulos amigáveis para os principais action_types da Meta.
export const ACTION_LABELS: Record<string, string> = {
  purchase: "Compras",
  "offsite_conversion.fb_pixel_purchase": "Compras (pixel)",
  lead: "Leads",
  "onsite_conversion.lead_grouped": "Leads (on-site)",
  complete_registration: "Cadastros",
  landing_page_view: "Views de LP",
  link_click: "Cliques no link",
  post_engagement: "Engajamentos",
  page_engagement: "Engajamentos na página",
  "onsite_conversion.messaging_conversation_started_7d": "Conversas iniciadas",
  video_view: "Views de vídeo",
  "onsite_conversion.post_save": "Salvamentos",
};

export interface DailyPoint {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  reach: number;
  results: Record<string, number>;
  values: Record<string, number>; // action_values (valor de conversão)
}

export interface RowInsight {
  id: string;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  results: Record<string, number>;
  values: Record<string, number>;
  objective?: string;
  thumbnail?: string;
}

export interface BreakdownRow {
  key: string; // dimensão (ex: "25-34 · female", "SP", "facebook")
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  results: Record<string, number>;
  values: Record<string, number>;
}

export interface Kpis {
  spend: number;
  reach: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  results: Record<string, number>;
  values: Record<string, number>;
}

export interface AccountDetail {
  account_id: string;
  range: { since: string; until: string };
  prevRange: { since: string; until: string };
  kpis: Kpis;
  prevKpis: Kpis;
  daily: DailyPoint[];
  campaigns: RowInsight[];
  adsets: RowInsight[];
  ads: RowInsight[];
  breakdowns: {
    age_gender: BreakdownRow[];
    region: BreakdownRow[];
    platform: BreakdownRow[];
    position: BreakdownRow[];
    device: BreakdownRow[];
    hour: BreakdownRow[];
  };
  availableResults: string[]; // action_types presentes no período
}

// Série diária de uma conta.
async function fetchDaily(actId: string, since: string, until: string, token: string): Promise<DailyPoint[]> {
  const fields = "spend,impressions,clicks,ctr,cpm,reach,actions,action_values";
  const url = `${GRAPH}/${actId}/insights?fields=${fields}&time_increment=1&${timeRange(
    since,
    until
  )}&access_token=${token}`;
  const rows = await fbGetAll<any>(url);
  return rows.map((r) => ({
    date: r.date_start,
    spend: Number(r.spend || 0),
    impressions: Number(r.impressions || 0),
    clicks: Number(r.clicks || 0),
    ctr: Number(r.ctr || 0),
    cpm: Number(r.cpm || 0),
    reach: Number(r.reach || 0),
    results: actionsToMap(r.actions),
    values: actionsToMap(r.action_values),
  }));
}

// Insights agregados no nível campaign/adset/ad.
async function fetchLevel(
  actId: string,
  level: "campaign" | "adset" | "ad",
  since: string,
  until: string,
  token: string
): Promise<RowInsight[]> {
  const nameField = level === "campaign" ? "campaign_name" : level === "adset" ? "adset_name" : "ad_name";
  const idField = level === "campaign" ? "campaign_id" : level === "adset" ? "adset_id" : "ad_id";
  const fields = `${nameField},${idField},spend,impressions,clicks,ctr,cpm,actions,action_values,objective`;
  const url = `${GRAPH}/${actId}/insights?level=${level}&fields=${fields}&limit=200&${timeRange(
    since,
    until
  )}&access_token=${token}`;
  const rows = await fbGetAll<any>(url);
  return rows.map((r) => ({
    id: r[idField],
    name: r[nameField] || "(sem nome)",
    spend: Number(r.spend || 0),
    impressions: Number(r.impressions || 0),
    clicks: Number(r.clicks || 0),
    ctr: Number(r.ctr || 0),
    cpm: Number(r.cpm || 0),
    results: actionsToMap(r.actions),
    values: actionsToMap(r.action_values),
    objective: r.objective,
  }));
}

// Insights com breakdown demográfico/plataforma.
async function fetchBreakdown(
  actId: string,
  breakdowns: string,
  keyer: (r: any) => string,
  since: string,
  until: string,
  token: string
): Promise<BreakdownRow[]> {
  const fields = "spend,impressions,clicks,ctr,cpm,actions,action_values";
  const url = `${GRAPH}/${actId}/insights?fields=${fields}&breakdowns=${breakdowns}&limit=500&${timeRange(
    since,
    until
  )}&access_token=${token}`;
  const rows = await fbGetAll<any>(url);
  return rows.map((r) => ({
    key: keyer(r),
    spend: Number(r.spend || 0),
    impressions: Number(r.impressions || 0),
    clicks: Number(r.clicks || 0),
    ctr: Number(r.ctr || 0),
    cpm: Number(r.cpm || 0),
    results: actionsToMap(r.actions),
    values: actionsToMap(r.action_values),
  }));
}

// Busca thumbnails dos anúncios (creative) e mapeia ad_id -> url.
async function fetchAdThumbnails(actId: string, token: string): Promise<Record<string, string>> {
  try {
    const url = `${GRAPH}/${actId}/ads?fields=id,creative{thumbnail_url,image_url}&limit=200&access_token=${token}`;
    const ads = await fbGetAll<any>(url);
    const map: Record<string, string> = {};
    for (const ad of ads) {
      const t = ad.creative?.thumbnail_url || ad.creative?.image_url;
      if (t) map[ad.id] = t;
    }
    return map;
  } catch {
    return {};
  }
}

// KPI agregado da conta (sem time_increment, para reach correto).
async function fetchAccountKpis(actId: string, since: string, until: string, token: string): Promise<Kpis> {
  const fields = "spend,impressions,clicks,ctr,cpm,reach,actions,action_values";
  const url = `${GRAPH}/${actId}/insights?fields=${fields}&${timeRange(since, until)}&access_token=${token}`;
  const rows = await fbGetAll<any>(url);
  const r = rows[0] || {};
  return {
    spend: Number(r.spend || 0),
    impressions: Number(r.impressions || 0),
    clicks: Number(r.clicks || 0),
    ctr: Number(r.ctr || 0),
    cpm: Number(r.cpm || 0),
    reach: Number(r.reach || 0),
    results: actionsToMap(r.actions),
    values: actionsToMap(r.action_values),
  };
}

const EMPTY_KPIS: Kpis = {
  spend: 0, reach: 0, impressions: 0, clicks: 0, ctr: 0, cpm: 0, results: {}, values: {},
};

// Calcula o período imediatamente anterior, de mesma duração.
function previousRange(since: string, until: string): { since: string; until: string } {
  const s = new Date(since + "T00:00:00Z");
  const u = new Date(until + "T00:00:00Z");
  const days = Math.max(1, Math.round((u.getTime() - s.getTime()) / 86400000) + 1);
  const prevUntil = new Date(s.getTime() - 86400000);
  const prevSince = new Date(prevUntil.getTime() - (days - 1) * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { since: fmt(prevSince), until: fmt(prevUntil) };
}

// Série diária leve (só spend) — usada no collect para os sparklines.
export async function getDailySpend(
  actId: string,
  since: string,
  until: string,
  token: string = TOKEN
): Promise<{ date: string; spend: number }[]> {
  if (!actId.startsWith("act_")) actId = `act_${actId}`;
  const url = `${GRAPH}/${actId}/insights?fields=spend&time_increment=1&${timeRange(
    since,
    until
  )}&access_token=${token}`;
  const rows = await fbGetAll<any>(url);
  return rows.map((r) => ({ date: r.date_start, spend: Number(r.spend || 0) }));
}

// Série diária rica (spend/impressões/cliques/conversões) — 1 chamada por conta
// no collect, da qual derivamos os agregados 7d/14d/30d e os anteriores.
export interface DailyMetric {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  purchaseValue: number;
  results: Record<string, number>; // por família (vendas/mensagens/leads/...)
}

export async function getDailyMetrics(
  actId: string,
  since: string,
  until: string,
  token: string = TOKEN
): Promise<DailyMetric[]> {
  if (!actId.startsWith("act_")) actId = `act_${actId}`;
  const fields = "spend,impressions,clicks,actions,action_values";
  const url = `${GRAPH}/${actId}/insights?fields=${fields}&time_increment=1&${timeRange(
    since,
    until
  )}&access_token=${token}`;
  const rows = await fbGetAll<any>(url);
  return rows.map((r) => ({
    date: r.date_start,
    spend: Number(r.spend || 0),
    impressions: Number(r.impressions || 0),
    clicks: Number(r.clicks || 0),
    conversions: sumConversions(r.actions),
    purchaseValue: sumPurchaseFamily(r.action_values),
    results: familyCounts(r.actions),
  }));
}

// Diagnóstico: devolve o payload cru de UMA conta (todos os campos financeiros
// que a Meta expõe). Usado para investigar o saldo pré-pago.
export async function getAccountRaw(actId: string, token: string = TOKEN): Promise<any> {
  if (!actId.startsWith("act_")) actId = `act_${actId}`;
  const fields = [
    "account_id",
    "name",
    "account_status",
    "currency",
    "balance",
    "amount_spent",
    "spend_cap",
    "funding_source",
    "funding_source_details",
    "min_daily_budget",
  ].join(",");
  const url = `${GRAPH}/${actId}?fields=${fields}&access_token=${token}`;
  const res = await fetch(url);
  const body = await res.text();
  if (!res.ok) throw new Error(`Meta API ${res.status}: ${body}`);
  return JSON.parse(body);
}

// Compõe todo o detalhe de uma conta em paralelo.
export async function getAccountDetail(
  actId: string,
  since: string,
  until: string,
  token: string = TOKEN
): Promise<AccountDetail> {
  const prev = previousRange(since, until);
  const [
    kpis,
    prevKpis,
    daily,
    campaigns,
    adsets,
    ads,
    ageGender,
    region,
    platform,
    position,
    device,
    hour,
    thumbs,
  ] = await Promise.all([
    fetchAccountKpis(actId, since, until, token),
    fetchAccountKpis(actId, prev.since, prev.until, token).catch(() => EMPTY_KPIS),
    fetchDaily(actId, since, until, token).catch(() => []),
    fetchLevel(actId, "campaign", since, until, token).catch(() => []),
    fetchLevel(actId, "adset", since, until, token).catch(() => []),
    fetchLevel(actId, "ad", since, until, token).catch(() => []),
    fetchBreakdown(actId, "age,gender", (r) => `${r.age} · ${r.gender}`, since, until, token).catch(() => []),
    fetchBreakdown(actId, "region", (r) => r.region || "—", since, until, token).catch(() => []),
    fetchBreakdown(actId, "publisher_platform", (r) => r.publisher_platform || "—", since, until, token).catch(
      () => []
    ),
    fetchBreakdown(
      actId,
      "publisher_platform,platform_position",
      (r) => `${r.publisher_platform} · ${r.platform_position}`,
      since,
      until,
      token
    ).catch(() => []),
    fetchBreakdown(actId, "device_platform", (r) => r.device_platform || "—", since, until, token).catch(() => []),
    fetchBreakdown(
      actId,
      "hourly_stats_aggregated_by_advertiser_time_zone",
      (r) => (r.hourly_stats_aggregated_by_advertiser_time_zone || "").slice(0, 5),
      since,
      until,
      token
    ).catch(() => []),
    fetchAdThumbnails(actId, token).catch(() => ({} as Record<string, string>)),
  ]);

  // Anexa thumbnails aos anúncios.
  for (const ad of ads) ad.thumbnail = thumbs[ad.id];

  // action_types disponíveis no período (para o seletor de "Resultado").
  const resultSet = new Set<string>();
  for (const k of Object.keys(kpis.results)) resultSet.add(k);
  for (const c of campaigns) for (const k of Object.keys(c.results)) resultSet.add(k);

  return {
    account_id: actId,
    range: { since, until },
    prevRange: prev,
    kpis,
    prevKpis,
    daily,
    campaigns: campaigns.sort((a, b) => b.spend - a.spend),
    adsets: adsets.sort((a, b) => b.spend - a.spend),
    ads: ads.sort((a, b) => b.spend - a.spend),
    breakdowns: {
      age_gender: ageGender.sort((a, b) => b.spend - a.spend),
      region: region.sort((a, b) => b.spend - a.spend),
      platform: platform.sort((a, b) => b.spend - a.spend),
      position: position.sort((a, b) => b.spend - a.spend),
      device: device.sort((a, b) => b.spend - a.spend),
      hour: hour.sort((a, b) => a.key.localeCompare(b.key)),
    },
    availableResults: [...resultSet],
  };
}
