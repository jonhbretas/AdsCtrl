// lib/meta.ts
// Cliente da Meta Marketing API.
// Um único token (System User) percorre todas as contas atribuídas.

const GRAPH = "https://graph.facebook.com/v25.0";

const TOKEN = process.env.META_ACCESS_TOKEN as string;

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

// Lista todas as contas que o token enxerga, já com os campos de saldo/status.
export async function listAdAccounts(): Promise<AdAccountRaw[]> {
  const fields = [
    "account_id",
    "name",
    "account_status",
    "disable_reason",
    "currency",
    "balance",
    "amount_spent",
    "spend_cap",
    "funding_source_details",
  ].join(",");
  const url = `${GRAPH}/me/adaccounts?fields=${fields}&limit=200&access_token=${TOKEN}`;
  return fbGetAll<AdAccountRaw>(url);
}

// Puxa insights de gasto de uma conta para um intervalo de datas.
// datePreset ex: "last_7d", ou passe since/until.
export async function getAccountInsights(
  accountId: string,
  opts: { datePreset?: string; since?: string; until?: string } = {}
): Promise<AccountInsight | null> {
  const fields = "spend,impressions,clicks,ctr,cpc,actions";
  let range = "date_preset=last_7d";
  if (opts.since && opts.until) {
    range = `time_range={'since':'${opts.since}','until':'${opts.until}'}`;
  } else if (opts.datePreset) {
    range = `date_preset=${opts.datePreset}`;
  }
  const url = `${GRAPH}/${accountId}/insights?fields=${fields}&${range}&access_token=${TOKEN}`;
  const rows = await fbGetAll<any>(url);
  if (rows.length === 0) return null;
  const r = rows[0];
  // "actions" traz um array; somamos as conversões relevantes.
  const conversions =
    (r.actions || [])
      .filter((a: any) =>
        ["purchase", "lead", "complete_registration", "offsite_conversion.fb_pixel_purchase"].includes(
          a.action_type
        )
      )
      .reduce((sum: number, a: any) => sum + Number(a.value || 0), 0) || 0;
  return {
    account_id: accountId,
    spend: Number(r.spend || 0),
    impressions: Number(r.impressions || 0),
    clicks: Number(r.clicks || 0),
    ctr: Number(r.ctr || 0),
    cpc: Number(r.cpc || 0),
    conversions,
  };
}

// Busca anúncios com criativo rejeitado numa conta.
export async function getRejectedAds(accountId: string): Promise<RejectedAd[]> {
  // effective_status DISAPPROVED / WITH_ISSUES sinaliza reprovação.
  const filtering = encodeURIComponent(
    JSON.stringify([
      { field: "effective_status", operator: "IN", value: ["DISAPPROVED", "WITH_ISSUES"] },
    ])
  );
  const fields = "id,name,campaign{name},ad_review_feedback";
  const url = `${GRAPH}/${accountId}/ads?fields=${fields}&filtering=${filtering}&limit=100&access_token=${TOKEN}`;
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
async function fetchDaily(actId: string, since: string, until: string): Promise<DailyPoint[]> {
  const fields = "spend,impressions,clicks,ctr,cpm,reach,actions,action_values";
  const url = `${GRAPH}/${actId}/insights?fields=${fields}&time_increment=1&${timeRange(
    since,
    until
  )}&access_token=${TOKEN}`;
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
  until: string
): Promise<RowInsight[]> {
  const nameField = level === "campaign" ? "campaign_name" : level === "adset" ? "adset_name" : "ad_name";
  const idField = level === "campaign" ? "campaign_id" : level === "adset" ? "adset_id" : "ad_id";
  const fields = `${nameField},${idField},spend,impressions,clicks,ctr,cpm,actions,action_values,objective`;
  const url = `${GRAPH}/${actId}/insights?level=${level}&fields=${fields}&limit=200&${timeRange(
    since,
    until
  )}&access_token=${TOKEN}`;
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
  until: string
): Promise<BreakdownRow[]> {
  const fields = "spend,impressions,clicks,ctr,cpm,actions,action_values";
  const url = `${GRAPH}/${actId}/insights?fields=${fields}&breakdowns=${breakdowns}&limit=500&${timeRange(
    since,
    until
  )}&access_token=${TOKEN}`;
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
async function fetchAdThumbnails(actId: string): Promise<Record<string, string>> {
  try {
    const url = `${GRAPH}/${actId}/ads?fields=id,creative{thumbnail_url,image_url}&limit=200&access_token=${TOKEN}`;
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
async function fetchAccountKpis(actId: string, since: string, until: string): Promise<Kpis> {
  const fields = "spend,impressions,clicks,ctr,cpm,reach,actions,action_values";
  const url = `${GRAPH}/${actId}/insights?fields=${fields}&${timeRange(since, until)}&access_token=${TOKEN}`;
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
  until: string
): Promise<{ date: string; spend: number }[]> {
  if (!actId.startsWith("act_")) actId = `act_${actId}`;
  const url = `${GRAPH}/${actId}/insights?fields=spend&time_increment=1&${timeRange(
    since,
    until
  )}&access_token=${TOKEN}`;
  const rows = await fbGetAll<any>(url);
  return rows.map((r) => ({ date: r.date_start, spend: Number(r.spend || 0) }));
}

// Compõe todo o detalhe de uma conta em paralelo.
export async function getAccountDetail(
  actId: string,
  since: string,
  until: string
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
    fetchAccountKpis(actId, since, until),
    fetchAccountKpis(actId, prev.since, prev.until).catch(() => EMPTY_KPIS),
    fetchDaily(actId, since, until).catch(() => []),
    fetchLevel(actId, "campaign", since, until).catch(() => []),
    fetchLevel(actId, "adset", since, until).catch(() => []),
    fetchLevel(actId, "ad", since, until).catch(() => []),
    fetchBreakdown(actId, "age,gender", (r) => `${r.age} · ${r.gender}`, since, until).catch(() => []),
    fetchBreakdown(actId, "region", (r) => r.region || "—", since, until).catch(() => []),
    fetchBreakdown(actId, "publisher_platform", (r) => r.publisher_platform || "—", since, until).catch(
      () => []
    ),
    fetchBreakdown(
      actId,
      "publisher_platform,platform_position",
      (r) => `${r.publisher_platform} · ${r.platform_position}`,
      since,
      until
    ).catch(() => []),
    fetchBreakdown(actId, "device_platform", (r) => r.device_platform || "—", since, until).catch(() => []),
    fetchBreakdown(
      actId,
      "hourly_stats_aggregated_by_advertiser_time_zone",
      (r) => (r.hourly_stats_aggregated_by_advertiser_time_zone || "").slice(0, 5),
      since,
      until
    ).catch(() => []),
    fetchAdThumbnails(actId).catch(() => ({} as Record<string, string>)),
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
