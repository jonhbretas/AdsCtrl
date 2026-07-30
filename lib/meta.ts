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
// Transforma o erro da Meta em frase legível. O corpo cru é um JSON aninhado
// que, jogado na tela, esconde a única linha que interessa — e o limite de
// requisições, que é o erro mais comum aqui, vira um paredão de chaves.
function metaErrorMessage(status: number, body: string): string {
  try {
    const e = JSON.parse(body)?.error;
    if (e?.code === 17 || e?.code === 4 || e?.code === 613) {
      return "A Meta limitou temporariamente as chamadas desta conta. Espere alguns minutos e tente de novo.";
    }
    const texto = e?.error_user_msg || e?.message;
    if (texto) return e?.error_user_title ? `${e.error_user_title}: ${texto}` : texto;
  } catch {
    // corpo não-JSON: usa o texto cru, cortado
  }
  return `Meta API ${status}: ${body.slice(0, 200)}`;
}

async function fbGetAll<T>(url: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | undefined = url;
  while (next) {
    const res = await fetch(next);
    if (!res.ok) {
      throw new Error(metaErrorMessage(res.status, await res.text()));
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
  // Os dois últimos servem à tela que mostra os reprovados: DISAPPROVED e
  // WITH_ISSUES pedem ações diferentes, e a miniatura é o que faz reconhecer a
  // peça sem abrir o Gerenciador.
  effective_status?: string;
  thumbnail_url?: string | null;
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
  const fields =
    "id,name,effective_status,campaign{name},ad_review_feedback," +
    "creative{thumbnail_url,image_url}";
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
      effective_status: ad.effective_status,
      thumbnail_url: ad.creative?.thumbnail_url || ad.creative?.image_url || null,
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

// Saldo disponível "de verdade", e SÓ para conta pré-paga.
//
// A Meta não expõe o saldo num campo numérico: ele vem no texto de
// funding_source_details.display_string ("Saldo disponível (R$331,60 BRL)").
// O campo `balance` é outra coisa — o gasto ainda não faturado.
//
// Antes havia um fallback para `balance` quando o texto não trazia saldo. Era
// o que fazia toda conta de cartão aparecer com "saldo": nas contas verificadas,
// `balance` de conta pós-paga é a fatura em aberto (uma delas com R$ 1.865,12
// devidos aparecia como se tivesse esse tanto disponível). Sem o fallback, a
// interface omite em vez de afirmar o contrário do que é.
export function availableBalance(acc: AdAccountRaw): number | null {
  if (!isPrepaidAccount(acc)) return null;
  const ds = acc.funding_source_details?.display_string || "";
  if (/dispon[ií]vel|available/i.test(ds)) {
    const v = parseBrlFromString(ds);
    if (v != null) return v;
  }
  // Pré-paga que expõe o saldo no campo numérico.
  const b = centsToUnit(acc.balance);
  return b > 0 ? b : null;
}

// Gasto já realizado e ainda não cobrado. Só significa algo em conta pós-paga —
// é dívida acumulada no ciclo, não dinheiro disponível.
export function unbilledAmount(acc: AdAccountRaw): number | null {
  if (isPrepaidAccount(acc)) return null;
  const value = centsToUnit(acc.balance);
  return value > 0 ? value : null;
}

// Conta pré-paga. O campo oficial da Meta manda; nas contas verificadas ele
// vem sempre acompanhado de type=20 e do texto "Saldo disponível", então a
// heurística antiga fica só como reserva para quando o campo não vier.
export function isPrepaidAccount(acc: AdAccountRaw): boolean {
  if (typeof acc.is_prepay_account === "boolean") return acc.is_prepay_account;
  const ds = acc.funding_source_details?.display_string || "";
  if (/dispon[ií]vel|available/i.test(ds)) return true;
  return acc.funding_source_details?.type === 20;
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
  reach: number;
  frequency: number;
  results: Record<string, number>;
  values: Record<string, number>;
  objective?: string;
  thumbnail?: string;
  // Estado de veiculação. Insights não trazem isso — vem de uma consulta
  // separada, porque sem ela o painel não sabe se deve oferecer pausar ou
  // reativar. status = o que está configurado no objeto; effective_status =
  // o que a Meta está de fato fazendo (pode estar pausado pelo pai, reprovado
  // ou fora do período de veiculação).
  status?: string;
  effective_status?: string;
  // Conjunto (ou campanha com um conjunto assim dentro) rodando o país
  // inteiro sem nenhum recorte de localização. Ver fetchBroadLocationAdSets.
  broad_location?: boolean;
}

export interface BreakdownRow {
  key: string; // dimensão (ex: "25-34 · female", "SP", "facebook")
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  reach: number;
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
    // Só no modo estendido (relatório): alcance por faixa isolada — não dá
    // para somar o alcance de age_gender, porque é público único.
    age?: BreakdownRow[];
    gender?: BreakdownRow[];
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
  const fields = `${nameField},${idField},spend,impressions,clicks,ctr,cpm,reach,frequency,actions,action_values,objective`;
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
    reach: Number(r.reach || 0),
    frequency: Number(r.frequency || 0),
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
  token: string,
  // A Meta não devolve alcance em toda quebra (a por hora, por exemplo, falha).
  withReach = true
): Promise<BreakdownRow[]> {
  const fields = `spend,impressions,clicks,ctr,cpm,${withReach ? "reach," : ""}actions,action_values`;
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
    reach: Number(r.reach || 0),
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

// ---------- ligar/desligar veiculação ----------

export type MetaLevel = "campaign" | "adset" | "ad";
export type MetaObjectStatus = "ACTIVE" | "PAUSED";

const LEVEL_EDGE: Record<MetaLevel, string> = {
  campaign: "campaigns",
  adset: "adsets",
  ad: "ads",
};

// Estado de veiculação por id, para um nível da conta. Só três campos: é uma
// consulta barata e serve para o painel saber o que oferecer em cada linha.
export async function fetchStatuses(
  actId: string,
  level: MetaLevel,
  token: string = TOKEN
): Promise<Record<string, { status: string; effective_status: string }>> {
  if (!actId.startsWith("act_")) actId = `act_${actId}`;
  const url = `${GRAPH}/${actId}/${LEVEL_EDGE[level]}?fields=id,status,effective_status&limit=500&access_token=${token}`;
  const rows = await fbGetAll<any>(url);
  const out: Record<string, { status: string; effective_status: string }> = {};
  for (const row of rows) {
    out[String(row.id)] = {
      status: row.status || "",
      effective_status: row.effective_status || "",
    };
  }
  return out;
}

export interface BroadLocationAdSet {
  adset_id: string;
  adset_name: string;
  campaign_id: string;
  campaign_name: string;
}

// Conjunto rodando o país inteiro, sem nenhum recorte (região, cidade, raio).
// É a marca de campanha duplicada onde ninguém trocou a localização: a cópia
// nasce com o mesmo targeting da origem, e "país inteiro" é o padrão de quem
// nunca configurou nada — não algo que se escolhe por engano de outro jeito.
// Só ENTRA nesta lista se o conjunto está de fato rodando (effective_status
// ACTIVE): duplicata parada no rascunho não é urgência de ninguém.
export async function fetchBroadLocationAdSets(
  actId: string,
  token: string = TOKEN
): Promise<BroadLocationAdSet[]> {
  if (!actId.startsWith("act_")) actId = `act_${actId}`;
  const fields = "id,name,effective_status,campaign{id,name},targeting{geo_locations}";
  const rows = await fbGetAll<any>(
    `${GRAPH}/${actId}/adsets?fields=${fields}&limit=500&access_token=${token}`
  );
  const out: BroadLocationAdSet[] = [];
  for (const row of rows) {
    if (row.effective_status !== "ACTIVE") continue;
    const geo = row.targeting?.geo_locations || {};
    const countries: string[] = geo.countries || [];
    if (!countries.length) continue;
    const narrowed = Boolean(
      geo.regions?.length || geo.cities?.length || geo.zips?.length ||
      geo.geo_markets?.length || geo.custom_locations?.length || geo.electoral_districts?.length
    );
    if (narrowed) continue;
    out.push({
      adset_id: String(row.id),
      adset_name: row.name || row.id,
      campaign_id: String(row.campaign?.id || ""),
      campaign_name: row.campaign?.name || "",
    });
  }
  return out;
}

// Pausa ou reativa UM objeto. A Meta usa o mesmo endpoint para os três níveis:
// POST no id do objeto com o novo status.
//
// Só ACTIVE e PAUSED são aceitos de propósito. DELETED e ARCHIVED passam pelo
// mesmo campo e não têm volta pelo painel — não é coisa para um clique.
export async function setObjectStatus(
  objectId: string,
  status: MetaObjectStatus,
  token: string = TOKEN
): Promise<void> {
  if (status !== "ACTIVE" && status !== "PAUSED") {
    throw new Error("Status inválido: use ACTIVE ou PAUSED.");
  }
  if (!/^\d+$/.test(objectId)) {
    throw new Error("Identificador inválido.");
  }
  const res = await fetch(`${GRAPH}/${objectId}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ status, access_token: token }),
    cache: "no-store",
  });
  const body = await res.text();
  if (!res.ok) {
    let message = body;
    try {
      message = JSON.parse(body)?.error?.message || body;
    } catch {
      // resposta não-JSON: fica o texto cru
    }
    throw new Error(`Meta API ${res.status}: ${message}`);
  }
}

/* ------------------------------------ duplicar estrutura entre contas ---
   Copia campanha e conjuntos para OUTRA conta de anúncios. Não copia anúncio
   nem criativo, e isso não é preguiça: criar criativo publica COMO a Página e
   exige permissão que o usuário de sistema não tem hoje — verificado com
   execution_options:["validate_only"], recusado até na própria conta. Já
   conjunto com a Página do DESTINO passa, e é o que esta função faz.

   O que não atravessa e por quê:
    - page_id / instagram_user_id / pixel_id: são de outro cliente. Remapeados
      com o que vem do formulário, nunca herdados da origem;
    - público personalizado: existe só dentro da conta de origem. Removido do
      targeting, e a função avisa quais saíram;
    - anúncios e criativos: bloqueio de Página (acima).

   Tudo nasce PAUSADO. Uma cópia que começa gastando é um acidente esperando. */

export interface StructureAdSet {
  id: string;
  name: string;
  optimization_goal?: string;
  billing_event?: string;
  bid_amount?: number;
  bid_strategy?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  destination_type?: string;
  start_time?: string;
  end_time?: string;
  targeting?: any;
  promoted_object?: any;
  attribution_spec?: any;
  ads: number;
}

export interface CampaignStructure {
  id: string;
  /** Conta dona da campanha. A rota compara com a conta informada. */
  accountId: string;
  name: string;
  objective: string;
  buying_type?: string;
  bid_strategy?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  special_ad_categories: string[];
  adsets: StructureAdSet[];
  /** Referências presas à conta de origem que precisam ser trocadas. */
  needsRemap: { pages: string[]; pixels: string[]; instagram: string[]; audiences: number };
}

// fbGetAll segue paginação e devolve lista; para UM objeto (uma campanha, por
// exemplo) a resposta não tem `data` e aquele helper não serve.
async function fbGetOne<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  if (!res.ok || json?.error) throw new Error(metaErrorMessage(res.status, text));
  return json as T;
}

async function fbPost(path: string, params: Record<string, string>, token: string, dryRun: boolean): Promise<any> {
  const body = new URLSearchParams({ ...params, access_token: token });
  if (dryRun) body.set("execution_options", JSON.stringify(["validate_only"]));
  const res = await fetch(`${GRAPH}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  // error_user_msg é a frase que a Meta escreveu para humano; message é a
  // técnica. metaErrorMessage prefere a primeira.
  if (!res.ok || json?.error) throw new Error(metaErrorMessage(res.status, text));
  return json;
}

/** Lê a estrutura completa de uma campanha, com o que precisa ser remapeado. */
export async function getCampaignStructure(
  campaignId: string,
  token: string = TOKEN
): Promise<CampaignStructure> {
  if (!/^\d+$/.test(campaignId)) throw new Error("Identificador de campanha inválido.");
  const campaignFields = [
    "id", "account_id", "name", "objective", "buying_type", "bid_strategy",
    "daily_budget", "lifetime_budget", "special_ad_categories",
  ].join(",");
  const campaign = await fbGetOne<any>(
    `${GRAPH}/${campaignId}?fields=${campaignFields}&access_token=${token}`
  );

  const adsetFields = [
    "id", "name", "optimization_goal", "billing_event", "bid_amount", "bid_strategy",
    "daily_budget", "lifetime_budget", "destination_type", "start_time", "end_time",
    "targeting", "promoted_object", "attribution_spec", "ads.summary(true).limit(0)",
  ].join(",");
  const raw = await fbGetAll<any>(
    `${GRAPH}/${campaignId}/adsets?fields=${adsetFields}&limit=100&access_token=${token}`
  );

  const pages = new Set<string>();
  const pixels = new Set<string>();
  const instagram = new Set<string>();
  let audiences = 0;

  const adsets: StructureAdSet[] = raw.map((s: any) => {
    const promoted = s.promoted_object || {};
    if (promoted.page_id) pages.add(String(promoted.page_id));
    if (promoted.pixel_id) pixels.add(String(promoted.pixel_id));
    if (promoted.instagram_profile_id) instagram.add(String(promoted.instagram_profile_id));
    const targeting = s.targeting || {};
    audiences += (targeting.custom_audiences || []).length + (targeting.excluded_custom_audiences || []).length;
    return {
      id: s.id,
      name: s.name,
      optimization_goal: s.optimization_goal,
      billing_event: s.billing_event,
      bid_amount: s.bid_amount != null ? Number(s.bid_amount) : undefined,
      bid_strategy: s.bid_strategy,
      daily_budget: s.daily_budget,
      lifetime_budget: s.lifetime_budget,
      destination_type: s.destination_type,
      start_time: s.start_time,
      end_time: s.end_time,
      targeting,
      promoted_object: s.promoted_object,
      attribution_spec: s.attribution_spec,
      ads: Number(s.ads?.summary?.total_count || 0),
    };
  });

  return {
    id: campaign.id,
    accountId: String(campaign.account_id || ""),
    name: campaign.name,
    objective: campaign.objective,
    buying_type: campaign.buying_type,
    bid_strategy: campaign.bid_strategy,
    daily_budget: campaign.daily_budget,
    lifetime_budget: campaign.lifetime_budget,
    special_ad_categories: campaign.special_ad_categories || [],
    adsets,
    needsRemap: {
      pages: [...pages],
      pixels: [...pixels],
      instagram: [...instagram],
      audiences,
    },
  };
}

/** Páginas e pixels que a conta DESTINO já usa — as opções do formulário.
    /promote_pages volta vazio com token de usuário de sistema, então as
    páginas são deduzidas do promoted_object dos conjuntos que já existem
    ali: se um anúncio da conta já promove aquela página, ela serve. */
export async function getTargetAssets(
  actId: string,
  token: string = TOKEN
): Promise<{ pages: string[]; pixels: { id: string; name?: string }[] }> {
  if (!actId.startsWith("act_")) actId = `act_${actId}`;
  const [adsets, pixels] = await Promise.all([
    fbGetAll<any>(`${GRAPH}/${actId}/adsets?fields=promoted_object&limit=200&access_token=${token}`)
      .catch(() => [] as any[]),
    fbGetAll<any>(`${GRAPH}/${actId}/adspixels?fields=id,name&limit=50&access_token=${token}`)
      .catch(() => [] as any[]),
  ]);
  const pages = new Set<string>();
  for (const s of adsets) {
    const p = s.promoted_object?.page_id;
    if (p) pages.add(String(p));
  }
  return {
    pages: [...pages],
    pixels: pixels.map((p: any) => ({ id: String(p.id), name: p.name })),
  };
}

export interface DuplicateInput {
  sourceCampaignId: string;
  targetActId: string;
  /** Página do DESTINO. Obrigatória quando algum conjunto promove página. */
  pageId?: string;
  /** Pixel do DESTINO. Obrigatório quando algum conjunto otimiza por pixel. */
  pixelId?: string;
  /** Sufixo no nome, para a cópia não se confundir com a original. */
  nameSuffix?: string;
  dryRun: boolean;
}

export interface DuplicateResult {
  dryRun: boolean;
  campaign: { id?: string; name: string };
  /** `approximate` marca recusa vinda da campanha emprestada na conferência:
      pode não acontecer na cópia real, onde a campanha é a nova. */
  adsets: { name: string; id?: string; error?: string; approximate?: boolean }[];
  skipped: { ads: number; audiences: number };
  warnings: string[];
}

export async function duplicateCampaignStructure(
  input: DuplicateInput,
  sourceToken: string = TOKEN,
  targetToken: string = TOKEN
): Promise<DuplicateResult> {
  const target = input.targetActId.startsWith("act_") ? input.targetActId : `act_${input.targetActId}`;
  const structure = await getCampaignStructure(input.sourceCampaignId, sourceToken);
  const warnings: string[] = [];

  if (structure.needsRemap.pages.length && !input.pageId) {
    throw new Error("Esta campanha promove uma Página. Escolha a Página da conta de destino.");
  }
  if (structure.needsRemap.pixels.length && !input.pixelId) {
    throw new Error("Esta campanha otimiza por pixel. Escolha o pixel da conta de destino.");
  }

  const sufixo = (input.nameSuffix || "").trim();
  const nomeCampanha = sufixo ? `${structure.name} ${sufixo}` : structure.name;

  // O orçamento pode estar na campanha (CBO) ou nos conjuntos (ABO). Copiar o
  // da campanha só quando ele existe: mandar daily_budget vazio dá erro.
  const campaignParams: Record<string, string> = {
    name: nomeCampanha,
    objective: structure.objective,
    status: "PAUSED",
    special_ad_categories: JSON.stringify(structure.special_ad_categories),
    buying_type: structure.buying_type || "AUCTION",
  };
  if (structure.daily_budget) campaignParams.daily_budget = String(structure.daily_budget);
  if (structure.lifetime_budget) campaignParams.lifetime_budget = String(structure.lifetime_budget);
  if (structure.daily_budget || structure.lifetime_budget) {
    if (structure.bid_strategy) campaignParams.bid_strategy = structure.bid_strategy;
  } else {
    // Sem orçamento na campanha, a Meta exige dizer explicitamente se os
    // conjuntos compartilham orçamento. Sem este campo ela recusa.
    campaignParams.is_adset_budget_sharing_enabled = "false";
  }

  const created = await fbPost(`${target}/campaigns`, campaignParams, targetToken, input.dryRun);
  const newCampaignId: string | undefined = created?.id;

  // No dry-run não nasce campanha, e conjunto precisa de um campaign_id que
  // exista NO DESTINO — apontar para a campanha de origem faz a Meta responder
  // "esta campanha pertence a uma conta diferente", que não valida nada.
  // Solução: validar contra uma campanha do destino com o MESMO objetivo. Não
  // é a campanha final, mas exercita targeting, orçamento, meta de otimização
  // e a permissão da Página, que é o que pode dar errado.
  let baseValidacao: string | undefined = newCampaignId;
  // A base emprestada pode ter estratégia de lance diferente da campanha nova.
  // Se tiver, o limite de lance não é validável: enviá-lo produz uma recusa
  // que NÃO aconteceria na cópia real. Melhor não validar do que assustar.
  let lanceValidavel = true;
  if (input.dryRun) {
    const candidatas = await fbGetAll<any>(
      `${GRAPH}/${target}/campaigns?fields=id,name,objective,bid_strategy&limit=200&access_token=${targetToken}`
    ).catch(() => [] as any[]);
    const mesmoObjetivo = candidatas.filter((c: any) => c.objective === structure.objective);
    // Prefere uma base que também case a estratégia de lance.
    const igual =
      mesmoObjetivo.find((c: any) => c.bid_strategy === structure.bid_strategy) || mesmoObjetivo[0];
    baseValidacao = igual?.id;
    if (!igual) {
      warnings.push(
        `A conta de destino não tem campanha de ${structure.objective} para servir de base, então os conjuntos não puderam ser conferidos antes. A campanha em si foi validada.`
      );
    } else {
      warnings.push(
        `Conjuntos conferidos contra "${igual.name}", do destino, que tem o mesmo objetivo. No envio real eles vão para a campanha nova.`
      );
      if (structure.bid_strategy && igual.bid_strategy !== structure.bid_strategy) {
        lanceValidavel = false;
        warnings.push(
          `O limite de lance não foi conferido: a campanha usada na conferência usa ${igual.bid_strategy} e a original usa ${structure.bid_strategy}.`
        );
      }
    }
  }

  const adsets: DuplicateResult["adsets"] = [];
  let ads = 0;

  for (const adset of structure.adsets) {
    ads += adset.ads;
    const targeting = { ...(adset.targeting || {}) };
    // Público personalizado é da conta de origem: não existe no destino e
    // faria a criação falhar. Sai, e o aviso registra que saiu.
    delete targeting.custom_audiences;
    delete targeting.excluded_custom_audiences;

    const promoted: Record<string, any> = {};
    const origem = adset.promoted_object || {};
    if (origem.page_id && input.pageId) promoted.page_id = input.pageId;
    if (origem.pixel_id && input.pixelId) promoted.pixel_id = input.pixelId;
    if (origem.custom_event_type) promoted.custom_event_type = origem.custom_event_type;
    if (origem.application_id) promoted.application_id = origem.application_id;

    const nomeConjunto = sufixo ? `${adset.name} ${sufixo}` : adset.name;
    if (!baseValidacao) {
      adsets.push({ name: nomeConjunto, error: "não validado (sem campanha de base no destino)" });
      continue;
    }
    const params: Record<string, string> = {
      name: nomeConjunto,
      campaign_id: baseValidacao,
      status: "PAUSED",
      targeting: JSON.stringify(targeting),
    };
    if (adset.optimization_goal) params.optimization_goal = adset.optimization_goal;
    if (adset.billing_event) params.billing_event = adset.billing_event;
    if (adset.destination_type) params.destination_type = adset.destination_type;
    if (adset.bid_strategy) params.bid_strategy = adset.bid_strategy;
    // O conjunto guarda um bid_amount mesmo quando a estratégia em vigor é
    // "menor custo sem limite" — e aí a Meta recusa se ele for enviado. Só vai
    // junto nas estratégias que de fato usam limite de lance.
    const estrategia = adset.bid_strategy || structure.bid_strategy;
    const usaLimite = estrategia === "LOWEST_COST_WITH_BID_CAP" || estrategia === "COST_CAP" || estrategia === "TARGET_COST";
    if (adset.bid_amount != null && usaLimite && lanceValidavel) params.bid_amount = String(adset.bid_amount);
    if (adset.daily_budget) params.daily_budget = String(adset.daily_budget);
    if (adset.lifetime_budget) params.lifetime_budget = String(adset.lifetime_budget);
    if (Object.keys(promoted).length) params.promoted_object = JSON.stringify(promoted);
    if (adset.attribution_spec) params.attribution_spec = JSON.stringify(adset.attribution_spec);
    // start_time não é copiado de propósito: data no passado é recusada, e a
    // cópia nasce pausada mesmo. O fim só vai junto se ainda estiver por vir —
    // duplicar uma campanha que já acabou mandaria um end_time vencido, que a
    // Meta também recusa, e derrubaria o conjunto por um detalhe sem valor.
    if (adset.end_time && new Date(adset.end_time).getTime() > Date.now()) {
      params.end_time = adset.end_time;
    }

    try {
      const res = await fbPost(`${target}/adsets`, params, targetToken, input.dryRun);
      adsets.push({ name: params.name, id: res?.id });
    } catch (error: any) {
      // Um conjunto que falha não derruba os outros: a campanha está pausada,
      // e é melhor entregar cinco de seis dizendo qual faltou.
      adsets.push({
        name: params.name,
        error: error?.message || "Falha ao criar o conjunto.",
        // Na conferência a campanha de base é emprestada; parte das recusas
        // vem dela, não da cópia. Só o envio real dá resposta definitiva.
        approximate: input.dryRun && !newCampaignId,
      });
    }
  }

  if (ads > 0) {
    warnings.push(
      `${ads} anúncio(s) não foram copiados: criar criativo publica como a Página e exige permissão que o token não tem. Suba os criativos no Gerenciador.`
    );
  }
  if (structure.needsRemap.audiences > 0) {
    warnings.push(
      `${structure.needsRemap.audiences} público(s) personalizado(s) foram removidos da segmentação: eles existem só na conta de origem.`
    );
  }

  return {
    dryRun: input.dryRun,
    campaign: { id: newCampaignId, name: nomeCampanha },
    adsets,
    skipped: { ads, audiences: structure.needsRemap.audiences },
    warnings,
  };
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
  token: string = TOKEN,
  // extended = quebras extras usadas só no relatório em PDF.
  opts: { extended?: boolean } = {}
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
    campaignStatus,
    adsetStatus,
    adStatus,
    broadLocation,
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
      token,
      false
    ).catch(() => []),
    fetchAdThumbnails(actId, token).catch(() => ({} as Record<string, string>)),
    // Estado de veiculação dos três níveis, no MESMO paralelo das demais: num
    // Promise.all separado somaria ~0,7s ao detalhe em vez de acompanhar.
    // Falha aqui não derruba nada — sem status o painel só não oferece o botão.
    fetchStatuses(actId, "campaign", token).catch(() => ({})),
    fetchStatuses(actId, "adset", token).catch(() => ({})),
    fetchStatuses(actId, "ad", token).catch(() => ({})),
    fetchBroadLocationAdSets(actId, token).catch(() => []),
  ]);

  // Anexa thumbnails aos anúncios.
  for (const ad of ads) ad.thumbnail = thumbs[ad.id];

  const applyStatus = (rows: RowInsight[], map: Record<string, { status: string; effective_status: string }>) => {
    for (const row of rows) {
      const found = map[row.id];
      if (!found) continue;
      row.status = found.status;
      row.effective_status = found.effective_status;
    }
  };
  applyStatus(campaigns, campaignStatus);
  applyStatus(adsets, adsetStatus);
  applyStatus(ads, adStatus);

  // Marca a linha do conjunto direto (é onde a localização mora) e sobe o
  // aviso para a campanha mãe: a aba de Campanhas é a que abre primeiro, e o
  // problema precisa aparecer ali sem trocar de aba para achar o conjunto.
  const broadAdsetIds = new Set(broadLocation.map((b) => b.adset_id));
  const broadCampaignIds = new Set(broadLocation.map((b) => b.campaign_id));
  for (const row of adsets) if (broadAdsetIds.has(row.id)) row.broad_location = true;
  for (const row of campaigns) if (broadCampaignIds.has(row.id)) row.broad_location = true;

  const [age, gender] = opts.extended
    ? await Promise.all([
        fetchBreakdown(actId, "age", (r) => r.age || "—", since, until, token).catch(() => []),
        fetchBreakdown(actId, "gender", (r) => r.gender || "—", since, until, token).catch(() => []),
      ])
    : [undefined, undefined];

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
      age: age?.sort((a, b) => a.key.localeCompare(b.key)),
      gender: gender?.sort((a, b) => b.impressions - a.impressions),
    },
    availableResults: [...resultSet],
  };
}
