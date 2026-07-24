// Laboratório de Criativos Meta.
//
// Este módulo é deliberadamente isolado do detalhe geral da conta. Ele consulta
// Insights no nível de anúncio, normaliza os arrays de actions da Meta e mantém
// métricas sem denominador como `null` (não como zero), para a UI distinguir
// desempenho ruim de ausência de amostra.

import { CONVERSION_FAMILIES } from "./meta";

const GRAPH = "https://graph.facebook.com/v25.0";

type MetaAction = {
  action_type?: string;
  value?: string | number;
};

type MetaInsightRow = {
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  objective?: string;
  creative_media_type?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  cpm?: string;
  clicks?: string;
  ctr?: string;
  inline_link_clicks?: string;
  inline_link_click_ctr?: string;
  inline_post_engagement?: string;
  outbound_clicks?: MetaAction[];
  outbound_clicks_ctr?: MetaAction[];
  actions?: MetaAction[];
  action_values?: MetaAction[];
  video_play_actions?: MetaAction[];
  video_thruplay_watched_actions?: MetaAction[];
  video_p25_watched_actions?: MetaAction[];
  video_p50_watched_actions?: MetaAction[];
  video_p75_watched_actions?: MetaAction[];
  video_p95_watched_actions?: MetaAction[];
  video_p100_watched_actions?: MetaAction[];
  video_avg_time_watched_actions?: MetaAction[];
};

type MetaEdge<T> = {
  data?: T[];
  paging?: { next?: string };
  error?: { message?: string };
};

export type MetaCreativeSampleStatus =
  | "no_delivery"
  | "insufficient"
  | "learning"
  | "reliable";

export type MetaCreativeDiagnosticTone =
  | "positive"
  | "warning"
  | "critical"
  | "neutral";

export type MetaCreativeGoal =
  | "messages"
  | "sales"
  | "leads"
  | "traffic"
  | "engagement"
  | "awareness"
  | "app"
  | "other";

export interface MetaCreativeDiagnostic {
  code: string;
  tone: MetaCreativeDiagnosticTone;
  title: string;
  detail: string;
  evidence: string[];
}

export interface MetaCreativeVideoMetrics {
  isVideo: boolean;
  plays: number;
  threeSecondViews: number;
  thruPlays: number;
  watched25: number;
  watched50: number;
  watched75: number;
  watched95: number;
  watched100: number;
  avgWatchTimeSeconds: number | null;
  playRate: number | null;
  hookRate: number | null;
  holdRate: number | null;
  retention25: number | null;
  retention50: number | null;
  retention75: number | null;
  retention95: number | null;
  completionRate: number | null;
  costPerThruPlay: number | null;
  threeSecondViewSource: "actions.video_view" | "unavailable";
}

export interface MetaCreativeMetrics {
  spend: number;
  impressions: number;
  reach: number;
  frequency: number | null;
  cpm: number | null;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  linkClicks: number;
  linkCtr: number | null;
  costPerLinkClick: number | null;
  outboundClicks: number;
  outboundCtr: number | null;
  costPerOutboundClick: number | null;
  landingPageViews: number;
  landingPageViewRate: number | null;
  costPerLandingPageView: number | null;
  engagements: number;
  engagementRate: number | null;
  conversions: number;
  messageConversations: number;
  messageRate: number | null;
  costPerMessage: number | null;
  conversionValue: number;
  conversionRate: number | null;
  costPerConversion: number | null;
  roas: number | null;
  actions: Record<string, number>;
  actionValues: Record<string, number>;
  video: MetaCreativeVideoMetrics;
}

export interface MetaCreativeAsset {
  creativeId: string | null;
  thumbnail: string | null;
}

export interface MetaCreativeSample {
  status: MetaCreativeSampleStatus;
  label: string;
  reason: string;
}

export interface MetaCreative {
  adId: string;
  adName: string;
  adsetId: string | null;
  adsetName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  objective: string | null;
  goal: MetaCreativeGoal;
  goalLabel: string;
  mediaType: string;
  asset: MetaCreativeAsset;
  metrics: MetaCreativeMetrics;
  sampleStatus: MetaCreativeSampleStatus;
  sample: MetaCreativeSample;
  diagnostics: MetaCreativeDiagnostic[];
  primaryDiagnosis: MetaCreativeDiagnostic | null;
}

export interface MetaCreativeBenchmarks {
  frequency: number | null;
  linkCtr: number | null;
  outboundCtr: number | null;
  landingPageViewRate: number | null;
  conversionRate: number | null;
  costPerConversion: number | null;
  messageRate: number | null;
  costPerMessage: number | null;
  roas: number | null;
  hookRate: number | null;
  holdRate: number | null;
  spend: number | null;
}

export interface MetaCreativeAccountSummary {
  source: "account_insights" | "ad_rollup";
  reachIsDeduplicated: boolean;
  creatives: number;
  creativesWithDelivery: number;
  videoCreatives: number;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number | null;
  cpm: number | null;
  clicks: number;
  ctr: number | null;
  linkClicks: number;
  linkCtr: number | null;
  outboundClicks: number;
  outboundCtr: number | null;
  landingPageViews: number;
  landingPageViewRate: number | null;
  engagements: number;
  engagementRate: number | null;
  conversions: number;
  messageConversations: number;
  messageRate: number | null;
  costPerMessage: number | null;
  conversionValue: number;
  costPerConversion: number | null;
  roas: number | null;
  video: {
    plays: number;
    threeSecondViews: number;
    thruPlays: number;
    watched25: number;
    watched50: number;
    watched75: number;
    watched95: number;
    watched100: number;
    avgWatchTimeSeconds: number | null;
    hookRate: number | null;
    holdRate: number | null;
    completionRate: number | null;
  };
  benchmarks: MetaCreativeBenchmarks;
  leaders: {
    spend: string | null;
    hookRate: string | null;
    outboundCtr: string | null;
    costPerConversion: string | null;
    roas: string | null;
  };
  diagnosisCounts: Record<string, number>;
}

export interface MetaCreativeLabResult {
  account_id: string;
  account_name: string;
  currency: string;
  range: { since: string; until: string };
  summary: MetaCreativeAccountSummary;
  creatives: MetaCreative[];
}

export const META_CREATIVE_METRIC_DEFINITIONS = {
  ctr: "Cliques (todos) ÷ impressões",
  linkCtr: "Cliques no link ÷ impressões",
  outboundCtr: "Cliques de saída ÷ impressões",
  landingPageViewRate: "Visualizações da página de destino ÷ cliques no link",
  engagementRate: "Engajamentos com a publicação ÷ impressões",
  conversionRate: "Conversões deduplicadas por família ÷ visualizações da página de destino (ou cliques de saída quando LPV não está disponível)",
  playRate: "Reproduções iniciadas ÷ impressões",
  hookRate: "Visualizações de vídeo de 3 segundos ÷ impressões",
  holdRate: "ThruPlays ÷ visualizações de vídeo de 3 segundos",
  retention: "Visualizações em cada quartil ÷ visualizações de vídeo de 3 segundos",
  completionRate: "Visualizações de 100% ÷ visualizações de vídeo de 3 segundos",
  roas: "Valor de conversão reportado pela Meta ÷ investimento",
} as const;

const INSIGHT_FIELDS = [
  "ad_id",
  "ad_name",
  "adset_id",
  "adset_name",
  "campaign_id",
  "campaign_name",
  "objective",
  "creative_media_type",
  "spend",
  "impressions",
  "reach",
  "frequency",
  "cpm",
  "clicks",
  "ctr",
  "inline_link_clicks",
  "inline_link_click_ctr",
  "inline_post_engagement",
  "outbound_clicks",
  "outbound_clicks_ctr",
  "actions",
  "action_values",
  "video_play_actions",
  "video_thruplay_watched_actions",
  "video_p25_watched_actions",
  "video_p50_watched_actions",
  "video_p75_watched_actions",
  "video_p95_watched_actions",
  "video_p100_watched_actions",
  "video_avg_time_watched_actions",
].join(",");

const ACCOUNT_INSIGHT_FIELDS = [
  "spend",
  "impressions",
  "reach",
  "frequency",
  "cpm",
  "clicks",
  "ctr",
  "inline_link_clicks",
  "inline_link_click_ctr",
  "inline_post_engagement",
  "outbound_clicks",
  "outbound_clicks_ctr",
  "actions",
  "action_values",
  "video_play_actions",
  "video_thruplay_watched_actions",
  "video_p25_watched_actions",
  "video_p50_watched_actions",
  "video_p75_watched_actions",
  "video_p95_watched_actions",
  "video_p100_watched_actions",
  "video_avg_time_watched_actions",
].join(",");

function finiteNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function divide(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : null;
}

function percent(numerator: number, denominator: number): number | null {
  const result = divide(numerator, denominator);
  return result == null ? null : result * 100;
}

function actionMap(items?: MetaAction[]): Record<string, number> {
  const output: Record<string, number> = {};
  for (const item of items || []) {
    if (!item.action_type) continue;
    output[item.action_type] =
      (output[item.action_type] || 0) + finiteNumber(item.value);
  }
  return output;
}

function actionArrayTotal(items?: MetaAction[]): number {
  return (items || []).reduce((total, item) => total + finiteNumber(item.value), 0);
}

function actionArrayMax(items?: MetaAction[]): number | null {
  const values = (items || [])
    .map((item) => nullableNumber(item.value))
    .filter((value): value is number => value != null);
  return values.length ? Math.max(...values) : null;
}

function familyTotal(
  values: Record<string, number>,
  families: readonly (readonly string[])[]
): number {
  let total = 0;
  for (const family of families) {
    let best = 0;
    for (const key of family) best = Math.max(best, values[key] || 0);
    total += best;
  }
  return total;
}

async function metaGetAll<T>(url: string): Promise<T[]> {
  const output: T[] = [];
  let next: string | undefined = url;
  while (next) {
    const response = await fetch(next, { cache: "no-store" });
    const body = await response.text();
    if (!response.ok) {
      let message = body;
      try {
        const parsed = JSON.parse(body) as MetaEdge<never>;
        message = parsed.error?.message || body;
      } catch {
        // Mantém o corpo textual, sem nunca incluir a URL/token no erro.
      }
      throw new Error(`Meta API ${response.status}: ${message}`);
    }
    const json = JSON.parse(body) as MetaEdge<T>;
    output.push(...(json.data || []));
    next = json.paging?.next;
  }
  return output;
}

async function metaGetObject<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.text();
  if (!response.ok) {
    let message = body;
    try {
      const parsed = JSON.parse(body) as {
        error?: { message?: string };
      };
      message = parsed.error?.message || body;
    } catch {
      // Mantém o corpo textual, sem nunca incluir a URL/token no erro.
    }
    throw new Error(`Meta API ${response.status}: ${message}`);
  }
  return JSON.parse(body) as T;
}

function insightsUrl(
  actId: string,
  since: string,
  until: string,
  token: string,
  level?: "ad"
): string {
  const params = new URLSearchParams({
    fields: level ? INSIGHT_FIELDS : ACCOUNT_INSIGHT_FIELDS,
    time_range: JSON.stringify({ since, until }),
    access_token: token,
  });
  if (level) {
    params.set("level", level);
    params.set("limit", "200");
  }
  return `${GRAPH}/${actId}/insights?${params.toString()}`;
}

async function fetchInsightRows(
  actId: string,
  since: string,
  until: string,
  token: string
): Promise<MetaInsightRow[]> {
  return metaGetAll<MetaInsightRow>(
    insightsUrl(actId, since, until, token, "ad")
  );
}

async function fetchAccountInsight(
  actId: string,
  since: string,
  until: string,
  token: string
): Promise<MetaInsightRow | null> {
  const rows = await metaGetAll<MetaInsightRow>(
    insightsUrl(actId, since, until, token)
  );
  return rows[0] || null;
}

async function fetchCreativeAssets(
  adIds: string[],
  token: string
): Promise<Record<string, MetaCreativeAsset>> {
  const output: Record<string, MetaCreativeAsset> = {};
  const unique = Array.from(new Set(adIds.filter(Boolean)));

  // O endpoint de múltiplos IDs evita baixar todo o catálogo de anúncios da
  // conta e também recupera criativos históricos que tiveram entrega no período.
  for (let index = 0; index < unique.length; index += 50) {
    const chunk = unique.slice(index, index + 50);
    const params = new URLSearchParams({
      ids: chunk.join(","),
      fields: "id,creative{id,thumbnail_url,image_url}",
      access_token: token,
    });
    const rows = await metaGetObject<
      Record<
        string,
        {
          id?: string;
          creative?: {
            id?: string;
            thumbnail_url?: string;
            image_url?: string;
          };
          error?: unknown;
        }
      >
    >(`${GRAPH}/?${params.toString()}`);

    for (const adId of chunk) {
      const creative = rows[adId]?.creative;
      output[adId] = {
        creativeId: creative?.id || null,
        thumbnail: creative?.thumbnail_url || creative?.image_url || null,
      };
    }
  }
  return output;
}

function sampleFor(metrics: MetaCreativeMetrics): MetaCreativeSample {
  if (metrics.impressions <= 0) {
    return {
      status: "no_delivery",
      label: "Sem entrega",
      reason: "O anúncio não registrou impressões no período.",
    };
  }
  if (
    metrics.impressions < 1_000 ||
    (metrics.video.isVideo && metrics.video.threeSecondViews < 100)
  ) {
    return {
      status: "insufficient",
      label: "Amostra insuficiente",
      reason: metrics.video.isVideo
        ? "Aguarde ao menos 1.000 impressões e 100 visualizações de 3 segundos antes de comparar retenção."
        : "Aguarde ao menos 1.000 impressões antes de classificar o criativo.",
    };
  }
  if (
    metrics.impressions < 5_000 ||
    (metrics.outboundClicks > 0 && metrics.outboundClicks < 20)
  ) {
    return {
      status: "learning",
      label: "Ganhando amostra",
      reason: "Os sinais já são úteis, mas ainda podem oscilar com facilidade.",
    };
  }
  return {
    status: "reliable",
    label: "Amostra consistente",
    reason: "O volume permite comparações direcionais mais confiáveis dentro desta conta.",
  };
}

function normalizeCreative(
  row: MetaInsightRow,
  asset: MetaCreativeAsset
): MetaCreative {
  const actions = actionMap(row.actions);
  const actionValues = actionMap(row.action_values);
  const spend = finiteNumber(row.spend);
  const impressions = finiteNumber(row.impressions);
  const reach = finiteNumber(row.reach);
  const clicks = finiteNumber(row.clicks);
  const linkClicks = Math.max(
    finiteNumber(row.inline_link_clicks),
    actions.link_click || 0
  );
  const outboundClicks = Math.max(
    actionArrayTotal(row.outbound_clicks),
    actions.outbound_click || 0
  );
  const landingPageViews = actions.landing_page_view || 0;
  const engagements = Math.max(
    finiteNumber(row.inline_post_engagement),
    actions.post_engagement || 0,
    actions.page_engagement || 0
  );
  const conversions = familyTotal(actions, CONVERSION_FAMILIES);
  const conversionValue = familyTotal(actionValues, CONVERSION_FAMILIES);
  const messageConversations =
    actions["onsite_conversion.messaging_conversation_started_7d"] ??
    actions["onsite_conversion.total_messaging_connection"] ??
    actions["onsite_conversion.messaging_first_reply"] ??
    0;

  const plays = actionArrayTotal(row.video_play_actions);
  const threeSecondViews = actions.video_view || 0;
  const thruPlays = actionArrayTotal(row.video_thruplay_watched_actions);
  const watched25 = actionArrayTotal(row.video_p25_watched_actions);
  const watched50 = actionArrayTotal(row.video_p50_watched_actions);
  const watched75 = actionArrayTotal(row.video_p75_watched_actions);
  const watched95 = actionArrayTotal(row.video_p95_watched_actions);
  const watched100 = actionArrayTotal(row.video_p100_watched_actions);
  const mediaType = String(row.creative_media_type || "UNKNOWN").toUpperCase();
  const isVideo =
    mediaType.includes("VIDEO") ||
    plays > 0 ||
    threeSecondViews > 0 ||
    watched25 > 0;
  const conversionDenominator =
    landingPageViews > 0 ? landingPageViews : outboundClicks;

  const video: MetaCreativeVideoMetrics = {
    isVideo,
    plays,
    threeSecondViews,
    thruPlays,
    watched25,
    watched50,
    watched75,
    watched95,
    watched100,
    avgWatchTimeSeconds: actionArrayMax(row.video_avg_time_watched_actions),
    playRate: isVideo ? percent(plays, impressions) : null,
    hookRate: isVideo ? percent(threeSecondViews, impressions) : null,
    holdRate: isVideo ? percent(thruPlays, threeSecondViews) : null,
    retention25: isVideo ? percent(watched25, threeSecondViews) : null,
    retention50: isVideo ? percent(watched50, threeSecondViews) : null,
    retention75: isVideo ? percent(watched75, threeSecondViews) : null,
    retention95: isVideo ? percent(watched95, threeSecondViews) : null,
    completionRate: isVideo ? percent(watched100, threeSecondViews) : null,
    costPerThruPlay: isVideo ? divide(spend, thruPlays) : null,
    threeSecondViewSource:
      row.actions?.some((action) => action.action_type === "video_view")
        ? "actions.video_view"
        : "unavailable",
  };

  const metrics: MetaCreativeMetrics = {
    spend,
    impressions,
    reach,
    frequency:
      nullableNumber(row.frequency) ?? divide(impressions, reach),
    cpm: impressions > 0 ? divide(spend * 1_000, impressions) : null,
    clicks,
    ctr: percent(clicks, impressions),
    cpc: divide(spend, clicks),
    linkClicks,
    linkCtr: percent(linkClicks, impressions),
    costPerLinkClick: divide(spend, linkClicks),
    outboundClicks,
    outboundCtr: percent(outboundClicks, impressions),
    costPerOutboundClick: divide(spend, outboundClicks),
    landingPageViews,
    landingPageViewRate: percent(landingPageViews, linkClicks),
    costPerLandingPageView: divide(spend, landingPageViews),
    engagements,
    engagementRate: percent(engagements, impressions),
    conversions,
    messageConversations,
    messageRate: percent(messageConversations, linkClicks || outboundClicks),
    costPerMessage: divide(spend, messageConversations),
    conversionValue,
    conversionRate: percent(conversions, conversionDenominator),
    costPerConversion: divide(spend, conversions),
    roas: divide(conversionValue, spend),
    actions,
    actionValues,
    video,
  };
  const sample = sampleFor(metrics);

  return {
    adId: row.ad_id || "",
    adName: row.ad_name || "(sem nome)",
    adsetId: row.adset_id || null,
    adsetName: row.adset_name || null,
    campaignId: row.campaign_id || null,
    campaignName: row.campaign_name || null,
    objective: row.objective || null,
    goal: inferGoal(row, actions),
    goalLabel: "",
    mediaType: isVideo ? "VIDEO" : mediaType,
    asset,
    metrics,
    sampleStatus: sample.status,
    sample,
    diagnostics: [],
    primaryDiagnosis: null,
  };
}

const GOAL_LABELS: Record<MetaCreativeGoal, string> = {
  messages: "Mensagens",
  sales: "Vendas",
  leads: "Leads",
  traffic: "Tráfego",
  engagement: "Engajamento",
  awareness: "Reconhecimento",
  app: "App",
  other: "Outro",
};

function configuredGoal(
  resultFamily?: string | null,
  objective?: string | null
): MetaCreativeGoal | null {
  const family = String(resultFamily || "").toLowerCase();
  if (family === "mensagens") return "messages";
  if (family === "vendas") return "sales";
  if (family === "leads" || family === "cadastros") return "leads";
  if (family === "lpv" || family === "cliques") return "traffic";
  if (family === "engajamento") return "engagement";
  const value = String(objective || "").toLowerCase();
  return (["sales", "leads", "traffic", "engagement", "awareness", "app"] as MetaCreativeGoal[])
    .includes(value as MetaCreativeGoal)
    ? (value as MetaCreativeGoal)
    : null;
}

function inferGoal(
  row: Pick<MetaInsightRow, "objective" | "campaign_name" | "adset_name">,
  actions: Record<string, number>
): MetaCreativeGoal {
  const objective = String(row.objective || "").toUpperCase();
  const names = `${row.campaign_name || ""} ${row.adset_name || ""}`;
  const hasMessageSignal =
    Object.entries(actions).some(
      ([key, value]) => value > 0 && /messaging|conversation|whatsapp/i.test(key)
    ) || /mensag|whats\s?app|conversa|direct/i.test(names);
  if (hasMessageSignal || /MESSAG|CONVERSATION/.test(objective)) return "messages";
  if (/SALE|PURCHASE/.test(objective)) return "sales";
  if (/LEAD/.test(objective)) return "leads";
  if (/TRAFFIC/.test(objective)) return "traffic";
  if (/ENGAGEMENT/.test(objective)) return "engagement";
  if (/AWARENESS|REACH|BRAND/.test(objective)) return "awareness";
  if (/APP/.test(objective)) return "app";
  return "other";
}

function valuesFor(
  creatives: MetaCreative[],
  picker: (creative: MetaCreative) => number | null,
  predicate: (creative: MetaCreative) => boolean = () => true
): number[] {
  return creatives
    .filter(
      (creative) =>
        (creative.sampleStatus === "learning" ||
          creative.sampleStatus === "reliable") &&
        predicate(creative)
    )
    .map(picker)
    .filter((value): value is number => value != null && Number.isFinite(value));
}

function median(values: number[], minimumItems = 2): number | null {
  if (values.length < minimumItems) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

function benchmarksFor(creatives: MetaCreative[]): MetaCreativeBenchmarks {
  return {
    frequency: median(valuesFor(creatives, (c) => c.metrics.frequency)),
    linkCtr: median(valuesFor(creatives, (c) => c.metrics.linkCtr)),
    outboundCtr: median(valuesFor(creatives, (c) => c.metrics.outboundCtr)),
    landingPageViewRate: median(
      valuesFor(creatives, (c) => c.metrics.landingPageViewRate)
    ),
    conversionRate: median(
      valuesFor(creatives, (c) => c.metrics.conversionRate)
    ),
    costPerConversion: median(
      valuesFor(
        creatives,
        (c) => c.metrics.costPerConversion,
        (c) => c.metrics.conversions >= 3
      )
    ),
    messageRate: median(
      valuesFor(creatives, (c) => c.metrics.messageRate, (c) => c.goal === "messages")
    ),
    costPerMessage: median(
      valuesFor(
        creatives,
        (c) => c.metrics.costPerMessage,
        (c) =>
          c.goal === "messages" &&
          c.metrics.messageConversations >= 3
      )
    ),
    roas: median(
      valuesFor(
        creatives,
        (c) => c.metrics.roas,
        (c) =>
          c.metrics.conversionValue > 0 &&
          c.metrics.conversions >= 3
      )
    ),
    hookRate: median(
      valuesFor(
        creatives,
        (c) => c.metrics.video.hookRate,
        (c) => c.metrics.video.isVideo
      )
    ),
    holdRate: median(
      valuesFor(
        creatives,
        (c) => c.metrics.video.holdRate,
        (c) => c.metrics.video.isVideo
      )
    ),
    spend: median(valuesFor(creatives, (c) => c.metrics.spend)),
  };
}

function formatPercent(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(2)}%`;
}

function multiple(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(2)}x`;
}

function addDiagnosis(
  diagnostics: MetaCreativeDiagnostic[],
  diagnosis: MetaCreativeDiagnostic
) {
  if (!diagnostics.some((item) => item.code === diagnosis.code)) {
    diagnostics.push(diagnosis);
  }
}

function diagnose(
  creative: MetaCreative,
  benchmarks: MetaCreativeBenchmarks
): MetaCreative {
  const metrics = creative.metrics;
  const video = metrics.video;
  const diagnostics: MetaCreativeDiagnostic[] = [];
  const usesLandingPage =
    creative.goal === "traffic" ||
    creative.goal === "leads" ||
    creative.goal === "sales";
  const actionCtr =
    creative.goal === "messages" ? metrics.linkCtr : metrics.outboundCtr;
  const actionCtrBenchmark =
    creative.goal === "messages" ? benchmarks.linkCtr : benchmarks.outboundCtr;
  const actionCtrLabel =
    creative.goal === "messages" ? "CTR no link" : "CTR de saída";

  if (creative.sampleStatus === "no_delivery") {
    diagnostics.push({
      code: "no_delivery",
      tone: "neutral",
      title: "Sem entrega no período",
      detail: "Não há volume suficiente para analisar este criativo.",
      evidence: ["0 impressões"],
    });
  } else if (creative.sampleStatus === "insufficient") {
    diagnostics.push({
      code: "insufficient_sample",
      tone: "neutral",
      title: "Aguarde mais dados",
      detail:
        "O AdsCtrl preservou as métricas, mas não recomenda uma decisão com esta amostra.",
      evidence: [
        `${metrics.impressions.toLocaleString("pt-BR")} impressões`,
        video.isVideo
          ? `${video.threeSecondViews.toLocaleString("pt-BR")} views de 3s`
          : "criativo estático",
      ],
    });
  }

  const canCompare =
    creative.sampleStatus === "learning" ||
    creative.sampleStatus === "reliable";
  const hookHigh =
    canCompare &&
    video.hookRate != null &&
    benchmarks.hookRate != null &&
    video.hookRate >= benchmarks.hookRate * 1.15;
  const hookLow =
    canCompare &&
    video.hookRate != null &&
    benchmarks.hookRate != null &&
    video.hookRate <= benchmarks.hookRate * 0.8;
  const holdHigh =
    canCompare &&
    video.holdRate != null &&
    benchmarks.holdRate != null &&
    video.holdRate >= benchmarks.holdRate * 1.15;
  const holdLow =
    canCompare &&
    video.holdRate != null &&
    benchmarks.holdRate != null &&
    video.holdRate <= benchmarks.holdRate * 0.8;
  const outboundHigh =
    canCompare &&
    actionCtr != null &&
    actionCtrBenchmark != null &&
    actionCtr >= actionCtrBenchmark * 1.15;
  const outboundLow =
    canCompare &&
    actionCtr != null &&
    actionCtrBenchmark != null &&
    actionCtr <= actionCtrBenchmark * 0.8;

  if (video.isVideo && hookHigh && holdLow) {
    addDiagnosis(diagnostics, {
      code: "hook_without_retention",
      tone: "warning",
      title: "Hook forte, retenção fraca",
      detail:
        "A abertura ganha atenção, mas o desenvolvimento não sustenta o interesse. Teste uma entrega mais rápida da promessa.",
      evidence: [
        `Hook ${formatPercent(video.hookRate)} vs. mediana ${formatPercent(
          benchmarks.hookRate
        )}`,
        `Hold ${formatPercent(video.holdRate)} vs. mediana ${formatPercent(
          benchmarks.holdRate
        )}`,
      ],
    });
  } else if (video.isVideo && hookLow) {
    addDiagnosis(diagnostics, {
      code: "weak_hook",
      tone: "warning",
      title: "Hook abaixo dos pares",
      detail:
        "Poucas pessoas avançam além dos primeiros segundos. Teste outra primeira cena, promessa ou texto inicial.",
      evidence: [
        `Hook ${formatPercent(video.hookRate)} vs. mediana ${formatPercent(
          benchmarks.hookRate
        )}`,
      ],
    });
  } else if (video.isVideo && hookHigh && holdHigh) {
    addDiagnosis(diagnostics, {
      code: "strong_video_attention",
      tone: "positive",
      title: "Atenção e retenção fortes",
      detail:
        "O vídeo supera os pares tanto na abertura quanto na continuidade. É um bom candidato para novas variações.",
      evidence: [
        `Hook ${formatPercent(video.hookRate)}`,
        `Hold ${formatPercent(video.holdRate)}`,
      ],
    });
  } else if (video.isVideo && holdLow) {
    addDiagnosis(diagnostics, {
      code: "weak_retention",
      tone: "warning",
      title: "Retenção abaixo dos pares",
      detail:
        "A promessa inicial não está sendo sustentada. Encurte o vídeo ou antecipe prova, oferta e benefício.",
      evidence: [
        `Hold ${formatPercent(video.holdRate)} vs. mediana ${formatPercent(
          benchmarks.holdRate
        )}`,
      ],
    });
  }

  if (hookHigh && outboundLow) {
    addDiagnosis(diagnostics, {
      code: "attention_without_action",
      tone: "warning",
      title: "Atenção sem ação",
      detail:
        "O hook funciona, mas não se transforma em clique de saída. Reforce oferta, mecanismo, prova e CTA.",
      evidence: [
        `Hook ${formatPercent(video.hookRate)}`,
        `${actionCtrLabel} ${formatPercent(actionCtr)} vs. mediana ${formatPercent(
          actionCtrBenchmark
        )}`,
      ],
    });
  }

  if (
    usesLandingPage &&
    outboundHigh &&
    metrics.linkClicks >= 20 &&
    metrics.landingPageViewRate != null &&
    benchmarks.landingPageViewRate != null &&
    metrics.landingPageViewRate <= benchmarks.landingPageViewRate * 0.75
  ) {
    addDiagnosis(diagnostics, {
      code: "click_to_landing_loss",
      tone: "critical",
      title: "Perda entre clique e página",
      detail:
        "O criativo gera saída, mas uma parcela anormal não vira visualização de página. Verifique velocidade, URL, redirecionamentos e tracking.",
      evidence: [
        `${actionCtrLabel} ${formatPercent(actionCtr)}`,
        `LPV/clique ${formatPercent(
          metrics.landingPageViewRate
        )} vs. mediana ${formatPercent(benchmarks.landingPageViewRate)}`,
      ],
    });
  }

  if (
    usesLandingPage &&
    metrics.landingPageViews >= 20 &&
    metrics.landingPageViewRate != null &&
    benchmarks.landingPageViewRate != null &&
    metrics.landingPageViewRate >= benchmarks.landingPageViewRate * 1.1 &&
    metrics.conversionRate != null &&
    benchmarks.conversionRate != null &&
    metrics.conversionRate <= benchmarks.conversionRate * 0.7
  ) {
    addDiagnosis(diagnostics, {
      code: "landing_without_conversion",
      tone: "warning",
      title: "Página recebe tráfego, mas converte pouco",
      detail:
        "A transição até a página está saudável. Investigue aderência entre promessa, oferta, prova, formulário e preço.",
      evidence: [
        `${metrics.landingPageViews.toLocaleString("pt-BR")} LPVs`,
        `Conversão ${formatPercent(
          metrics.conversionRate
        )} vs. mediana ${formatPercent(benchmarks.conversionRate)}`,
      ],
    });
  }

  if (
    creative.goal === "messages" &&
    canCompare &&
    metrics.linkClicks >= 20 &&
    metrics.messageConversations === 0
  ) {
    addDiagnosis(diagnostics, {
      code: "clicks_without_messages",
      tone: "critical",
      title: "Cliques sem conversa iniciada",
      detail:
        "Há intenção, mas nenhuma conversa registrada. Revise o destino (WhatsApp, Direct ou Messenger), a mensagem inicial, o CTA e o tracking.",
      evidence: [`${metrics.linkClicks.toLocaleString("pt-BR")} cliques no link`, "0 conversas"],
    });
  } else if (
    creative.goal === "messages" &&
    canCompare &&
    metrics.messageConversations >= 3
  ) {
    addDiagnosis(diagnostics, {
      code: "messages_generated",
      tone: "positive",
      title: "Gerando conversas",
      detail:
        "O criativo transforma cliques em conversas. Compare o custo por conversa e, fora da mídia, a qualidade e o fechamento desses contatos.",
      evidence: [
        `${metrics.messageConversations.toLocaleString("pt-BR")} conversas`,
        `Taxa de conversa ${formatPercent(metrics.messageRate)}`,
        metrics.costPerMessage == null
          ? "Custo/conversa —"
          : `Custo/conversa ${metrics.costPerMessage.toFixed(2)}`,
      ],
    });
  }

  if (
    canCompare &&
    metrics.conversions === 0 &&
    metrics.impressions >= 5_000 &&
    benchmarks.spend != null &&
    metrics.spend >= benchmarks.spend * 1.25
  ) {
    addDiagnosis(diagnostics, {
      code: "high_spend_no_conversion",
      tone: "critical",
      title: "Gasto relevante sem conversão",
      detail:
        "Este anúncio consome mais que os pares sem registrar resultado. Revise intenção, público, oferta e tracking antes de ampliar verba.",
      evidence: [
        `${metrics.spend.toFixed(2)} investidos`,
        "0 conversões",
      ],
    });
  }

  const cpaWinner =
    canCompare &&
    metrics.conversions >= 3 &&
    metrics.costPerConversion != null &&
    benchmarks.costPerConversion != null &&
    metrics.costPerConversion <= benchmarks.costPerConversion * 0.8;
  const roasWinner =
    canCompare &&
    metrics.conversions >= 3 &&
    metrics.roas != null &&
    benchmarks.roas != null &&
    metrics.roas >= benchmarks.roas * 1.2;
  if (cpaWinner || roasWinner) {
    addDiagnosis(diagnostics, {
      code: "efficiency_winner",
      tone: "positive",
      title: "Vencedor de eficiência",
      detail:
        "O resultado supera os pares com volume mínimo. Considere escalar gradualmente e criar variações do mesmo conceito.",
      evidence: [
        `${metrics.conversions.toFixed(1)} conversões`,
        metrics.costPerConversion == null
          ? "CPA —"
          : `CPA ${metrics.costPerConversion.toFixed(2)}`,
        `ROAS ${multiple(metrics.roas)}`,
      ],
    });
  }

  if (
    canCompare &&
    metrics.frequency != null &&
    benchmarks.frequency != null &&
    metrics.frequency >= benchmarks.frequency * 1.25 &&
    outboundLow
  ) {
    addDiagnosis(diagnostics, {
      code: "possible_fatigue",
      tone: "warning",
      title: "Sinal de possível fadiga",
      detail:
        "Frequência acima dos pares junto de CTR de saída abaixo da mediana sugere saturação. Confirme pela tendência diária antes de pausar.",
      evidence: [
        `Frequência ${metrics.frequency.toFixed(
          2
        )} vs. mediana ${benchmarks.frequency.toFixed(2)}`,
        `CTR de saída ${formatPercent(metrics.outboundCtr)}`,
      ],
    });
  }

  if (
    diagnostics.length === 0 &&
    creative.sampleStatus === "reliable"
  ) {
    diagnostics.push({
      code: "stable",
      tone: "neutral",
      title: "Desempenho dentro do padrão",
      detail:
        "Nenhum desvio relevante foi encontrado em relação aos criativos comparáveis desta conta.",
      evidence: ["Amostra consistente"],
    });
  }

  const priority: Record<MetaCreativeDiagnosticTone, number> = {
    critical: 0,
    warning: 1,
    positive: 2,
    neutral: 3,
  };
  diagnostics.sort(
    (left, right) => priority[left.tone] - priority[right.tone]
  );

  return {
    ...creative,
    diagnostics,
    primaryDiagnosis: diagnostics[0] || null,
  };
}

function sumCreatives(creatives: MetaCreative[]): MetaCreativeMetrics {
  const totalActions: Record<string, number> = {};
  const totalValues: Record<string, number> = {};
  let spend = 0;
  let impressions = 0;
  let reach = 0;
  let clicks = 0;
  let linkClicks = 0;
  let outboundClicks = 0;
  let landingPageViews = 0;
  let engagements = 0;
  let conversions = 0;
  let messageConversations = 0;
  let conversionValue = 0;
  let plays = 0;
  let threeSecondViews = 0;
  let thruPlays = 0;
  let watched25 = 0;
  let watched50 = 0;
  let watched75 = 0;
  let watched95 = 0;
  let watched100 = 0;
  let weightedWatchTime = 0;
  let watchTimeWeight = 0;

  for (const creative of creatives) {
    const metrics = creative.metrics;
    spend += metrics.spend;
    impressions += metrics.impressions;
    reach += metrics.reach;
    clicks += metrics.clicks;
    linkClicks += metrics.linkClicks;
    outboundClicks += metrics.outboundClicks;
    landingPageViews += metrics.landingPageViews;
    engagements += metrics.engagements;
    conversions += metrics.conversions;
    messageConversations += metrics.messageConversations;
    conversionValue += metrics.conversionValue;
    plays += metrics.video.plays;
    threeSecondViews += metrics.video.threeSecondViews;
    thruPlays += metrics.video.thruPlays;
    watched25 += metrics.video.watched25;
    watched50 += metrics.video.watched50;
    watched75 += metrics.video.watched75;
    watched95 += metrics.video.watched95;
    watched100 += metrics.video.watched100;
    if (
      metrics.video.avgWatchTimeSeconds != null &&
      metrics.video.plays > 0
    ) {
      weightedWatchTime +=
        metrics.video.avgWatchTimeSeconds * metrics.video.plays;
      watchTimeWeight += metrics.video.plays;
    }
    for (const [key, value] of Object.entries(metrics.actions)) {
      totalActions[key] = (totalActions[key] || 0) + value;
    }
    for (const [key, value] of Object.entries(metrics.actionValues)) {
      totalValues[key] = (totalValues[key] || 0) + value;
    }
  }

  const hasVideo = creatives.some((creative) => creative.metrics.video.isVideo);
  const conversionDenominator =
    landingPageViews > 0 ? landingPageViews : outboundClicks;
  return {
    spend,
    impressions,
    reach,
    frequency: divide(impressions, reach),
    cpm: divide(spend * 1_000, impressions),
    clicks,
    ctr: percent(clicks, impressions),
    cpc: divide(spend, clicks),
    linkClicks,
    linkCtr: percent(linkClicks, impressions),
    costPerLinkClick: divide(spend, linkClicks),
    outboundClicks,
    outboundCtr: percent(outboundClicks, impressions),
    costPerOutboundClick: divide(spend, outboundClicks),
    landingPageViews,
    landingPageViewRate: percent(landingPageViews, linkClicks),
    costPerLandingPageView: divide(spend, landingPageViews),
    engagements,
    engagementRate: percent(engagements, impressions),
    conversions,
    messageConversations,
    messageRate: percent(messageConversations, linkClicks || outboundClicks),
    costPerMessage: divide(spend, messageConversations),
    conversionValue,
    conversionRate: percent(conversions, conversionDenominator),
    costPerConversion: divide(spend, conversions),
    roas: divide(conversionValue, spend),
    actions: totalActions,
    actionValues: totalValues,
    video: {
      isVideo: hasVideo,
      plays,
      threeSecondViews,
      thruPlays,
      watched25,
      watched50,
      watched75,
      watched95,
      watched100,
      avgWatchTimeSeconds: divide(weightedWatchTime, watchTimeWeight),
      playRate: hasVideo ? percent(plays, impressions) : null,
      hookRate: hasVideo ? percent(threeSecondViews, impressions) : null,
      holdRate: hasVideo ? percent(thruPlays, threeSecondViews) : null,
      retention25: hasVideo ? percent(watched25, threeSecondViews) : null,
      retention50: hasVideo ? percent(watched50, threeSecondViews) : null,
      retention75: hasVideo ? percent(watched75, threeSecondViews) : null,
      retention95: hasVideo ? percent(watched95, threeSecondViews) : null,
      completionRate: hasVideo
        ? percent(watched100, threeSecondViews)
        : null,
      costPerThruPlay: hasVideo ? divide(spend, thruPlays) : null,
      threeSecondViewSource: threeSecondViews > 0
        ? "actions.video_view"
        : "unavailable",
    },
  };
}

function accountMetrics(row: MetaInsightRow): MetaCreativeMetrics {
  return normalizeCreative(
    { ...row, ad_id: "__account__", ad_name: "Conta" },
    { creativeId: null, thumbnail: null }
  ).metrics;
}

function bestAd(
  creatives: MetaCreative[],
  picker: (creative: MetaCreative) => number | null,
  direction: "max" | "min" = "max",
  predicate: (creative: MetaCreative) => boolean = () => true
): string | null {
  const candidates = creatives.filter((creative) => {
    const value = picker(creative);
    return (
      creative.sampleStatus !== "no_delivery" &&
      predicate(creative) &&
      value != null &&
      Number.isFinite(value)
    );
  });
  candidates.sort((left, right) => {
    const a = picker(left) as number;
    const b = picker(right) as number;
    return direction === "max" ? b - a : a - b;
  });
  return candidates[0]?.adId || null;
}

function buildSummary(
  creatives: MetaCreative[],
  benchmarks: MetaCreativeBenchmarks,
  accountRow: MetaInsightRow | null
): MetaCreativeAccountSummary {
  const rollup = sumCreatives(creatives);
  const totals = accountRow ? accountMetrics(accountRow) : rollup;
  const diagnosisCounts: Record<string, number> = {};
  for (const creative of creatives) {
    for (const diagnosis of creative.diagnostics) {
      diagnosisCounts[diagnosis.code] =
        (diagnosisCounts[diagnosis.code] || 0) + 1;
    }
  }

  return {
    source: accountRow ? "account_insights" : "ad_rollup",
    reachIsDeduplicated: Boolean(accountRow),
    creatives: creatives.length,
    creativesWithDelivery: creatives.filter(
      (creative) => creative.metrics.impressions > 0
    ).length,
    videoCreatives: creatives.filter(
      (creative) => creative.metrics.video.isVideo
    ).length,
    spend: totals.spend,
    impressions: totals.impressions,
    reach: totals.reach,
    frequency: totals.frequency,
    cpm: totals.cpm,
    clicks: totals.clicks,
    ctr: totals.ctr,
    linkClicks: totals.linkClicks,
    linkCtr: totals.linkCtr,
    outboundClicks: totals.outboundClicks,
    outboundCtr: totals.outboundCtr,
    landingPageViews: totals.landingPageViews,
    landingPageViewRate: totals.landingPageViewRate,
    engagements: totals.engagements,
    engagementRate: totals.engagementRate,
    conversions: totals.conversions,
    messageConversations: totals.messageConversations,
    messageRate: totals.messageRate,
    costPerMessage: totals.costPerMessage,
    conversionValue: totals.conversionValue,
    costPerConversion: totals.costPerConversion,
    roas: totals.roas,
    video: {
      plays: totals.video.plays,
      threeSecondViews: totals.video.threeSecondViews,
      thruPlays: totals.video.thruPlays,
      watched25: totals.video.watched25,
      watched50: totals.video.watched50,
      watched75: totals.video.watched75,
      watched95: totals.video.watched95,
      watched100: totals.video.watched100,
      avgWatchTimeSeconds: totals.video.avgWatchTimeSeconds,
      hookRate: totals.video.hookRate,
      holdRate: totals.video.holdRate,
      completionRate: totals.video.completionRate,
    },
    benchmarks,
    leaders: {
      spend: bestAd(creatives, (creative) => creative.metrics.spend),
      hookRate: bestAd(
        creatives,
        (creative) => creative.metrics.video.hookRate,
        "max",
        (creative) =>
          creative.metrics.video.isVideo &&
          creative.sampleStatus !== "insufficient"
      ),
      outboundCtr: bestAd(
        creatives,
        (creative) => creative.metrics.outboundCtr,
        "max",
        (creative) => creative.metrics.outboundClicks >= 10
      ),
      costPerConversion: bestAd(
        creatives,
        (creative) => creative.metrics.costPerConversion,
        "min",
        (creative) => creative.metrics.conversions >= 3
      ),
      roas: bestAd(
        creatives,
        (creative) => creative.metrics.roas,
        "max",
        (creative) => creative.metrics.conversions >= 3
      ),
    },
    diagnosisCounts,
  };
}

export async function getMetaCreativeLab(input: {
  accountId: string;
  accountName: string;
  currency: string;
  since: string;
  until: string;
  token: string;
  configuredObjective?: string | null;
  configuredResultFamily?: string | null;
}): Promise<MetaCreativeLabResult> {
  if (!input.token) {
    throw new Error("Token Meta não configurado para esta conta.");
  }
  const bareId = input.accountId.replace(/^act_/, "");
  const actId = `act_${bareId}`;
  const [rows, accountRow] = await Promise.all([
    fetchInsightRows(actId, input.since, input.until, input.token),
    fetchAccountInsight(
      actId,
      input.since,
      input.until,
      input.token
    ).catch(() => null),
  ]);
  const assets = await fetchCreativeAssets(
    rows.map((row) => row.ad_id || "").filter(Boolean),
    input.token
  ).catch(() => ({} as Record<string, MetaCreativeAsset>));
  const normalized = rows
    .filter((row) => Boolean(row.ad_id))
    .map((row) =>
      normalizeCreative(
        row,
        assets[row.ad_id || ""] || {
          creativeId: null,
          thumbnail: null,
        }
      )
    );
  const accountGoal = configuredGoal(
    input.configuredResultFamily,
    input.configuredObjective
  );
  const messageCampaigns = new Set(
    normalized
      .filter((creative) => creative.goal === "messages")
      .map((creative) => creative.campaignId)
      .filter((id): id is string => Boolean(id))
  );
  const contextualized = normalized.map((creative) => {
    const goal =
      accountGoal ||
      (creative.campaignId && messageCampaigns.has(creative.campaignId)
        ? "messages"
        : creative.goal);
    return { ...creative, goal, goalLabel: GOAL_LABELS[goal] };
  });
  const benchmarks = benchmarksFor(contextualized);
  const benchmarksByGoal = new Map(
    Array.from(new Set(contextualized.map((creative) => creative.goal))).map(
      (goal) => [
        goal,
        benchmarksFor(
          contextualized.filter((creative) => creative.goal === goal)
        ),
      ] as const
    )
  );
  const creatives = contextualized
    .map((creative) =>
      diagnose(
        creative,
        benchmarksByGoal.get(creative.goal) || benchmarks
      )
    )
    .sort((left, right) => right.metrics.spend - left.metrics.spend);

  return {
    account_id: bareId,
    account_name: input.accountName,
    currency: input.currency,
    range: { since: input.since, until: input.until },
    summary: buildSummary(creatives, benchmarks, accountRow),
    creatives,
  };
}
