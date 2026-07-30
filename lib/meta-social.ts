// lib/meta-social.ts
// Página do Facebook e conta comercial do Instagram — o lado orgânico que o
// relatório ainda não tem.
//
// BLOQUEIO CONHECIDO: a Meta só devolve dado de Página/Instagram para quem a
// Página foi atribuída, na Business Manager, ao mesmo usuário de sistema que
// gera META_ACCESS_TOKEN. Hoje ela não está — é o mesmo bloqueio já registrado
// para criar criativo (ver memória do projeto: "Token de sistema sem
// Páginas"). Enquanto isso não for resolvido na BM, toda chamada aqui volta
// erro de permissão, e é exatamente esse erro que report-data.ts espera.
//
// Este arquivo não foi testado contra dado real — não há Página atribuída
// para testar com. Os campos de nó (fan_count, followers_count, media_count)
// são estáveis há anos na Graph API; a edge /insights muda de nome de métrica
// com frequência, por isso cada métrica é buscada e falha isoladamente (ver
// runMetric), do jeito que getGoogleReportExtras já faz para o Google.

const GRAPH = "https://graph.facebook.com/v25.0";

function required(name: string, value: string | undefined): string {
  const v = (value || "").trim();
  if (!v) throw new Error(`${name} não configurado para este cliente.`);
  return v;
}

async function fbGet<T>(path: string, params: Record<string, string>, token: string): Promise<T> {
  const qs = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`${GRAPH}/${path}?${qs}`, { cache: "no-store" });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  if (!res.ok || json?.error) {
    const msg = json?.error?.error_user_msg || json?.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json as T;
}

// Uma métrica de /insights por vez, isolada: se a Meta descontinuar um nome de
// métrica, as demais continuam valendo em vez do bloco inteiro cair.
async function runMetric(
  path: string,
  metric: string,
  since: string,
  until: string,
  token: string,
  notes: string[]
): Promise<{ name: string; values: { end_time: string; value: number }[] } | null> {
  try {
    const data = await fbGet<{ data: any[] }>(path, {
      metric,
      period: "day",
      since,
      until,
    }, token);
    const row = data.data?.[0];
    if (!row) return null;
    return {
      name: metric,
      values: (row.values || []).map((v: any) => ({
        end_time: String(v.end_time || "").slice(0, 10),
        value: typeof v.value === "number" ? v.value : Number(v.value) || 0,
      })),
    };
  } catch (e: any) {
    notes.push(`${metric}: ${e?.message || "falhou"}`);
    return null;
  }
}

function sumSeries(series: { values: { value: number }[] } | null): number {
  if (!series) return 0;
  return series.values.reduce((n, v) => n + v.value, 0);
}

export interface PageReport {
  page_id: string;
  name: string | null;
  fan_count: number | null;
  followers_count: number | null;
  // Somados no período pedido (since/until), não snapshot.
  impressions_unique: number;
  post_engagements: number;
  page_views: number;
  notes: string[];
}

export async function fetchPageReport(
  pageId: string,
  token: string,
  since: string,
  until: string
): Promise<PageReport> {
  const id = required("facebook_page_id", pageId);
  const notes: string[] = [];

  // Campos do nó: estáveis, quase nunca mudam de nome.
  const summary = await fbGet<{ name?: string; fan_count?: number; followers_count?: number }>(
    id,
    { fields: "name,fan_count,followers_count" },
    token
  ).catch((e: any) => {
    notes.push(`dados da Página: ${e?.message || "falhou"}`);
    return {} as { name?: string; fan_count?: number; followers_count?: number };
  });

  const [impressions, engagements, views] = await Promise.all([
    runMetric(`${id}/insights`, "page_impressions_unique", since, until, token, notes),
    runMetric(`${id}/insights`, "page_post_engagements", since, until, token, notes),
    runMetric(`${id}/insights`, "page_views_total", since, until, token, notes),
  ]);

  return {
    page_id: id,
    name: summary.name ?? null,
    fan_count: summary.fan_count ?? null,
    followers_count: summary.followers_count ?? null,
    impressions_unique: sumSeries(impressions),
    post_engagements: sumSeries(engagements),
    page_views: sumSeries(views),
    notes,
  };
}

export interface InstagramReport {
  ig_user_id: string;
  username: string | null;
  followers_count: number | null;
  media_count: number | null;
  reach: number;
  profile_views: number;
  website_clicks: number;
  notes: string[];
}

export async function fetchInstagramReport(
  igUserId: string,
  token: string,
  since: string,
  until: string
): Promise<InstagramReport> {
  const id = required("instagram_business_id", igUserId);
  const notes: string[] = [];

  const summary = await fbGet<{ username?: string; followers_count?: number; media_count?: number }>(
    id,
    { fields: "username,followers_count,media_count" },
    token
  ).catch((e: any) => {
    notes.push(`dados do Instagram: ${e?.message || "falhou"}`);
    return {} as { username?: string; followers_count?: number; media_count?: number };
  });

  const [reach, profileViews, websiteClicks] = await Promise.all([
    runMetric(`${id}/insights`, "reach", since, until, token, notes),
    runMetric(`${id}/insights`, "profile_views", since, until, token, notes),
    runMetric(`${id}/insights`, "website_clicks", since, until, token, notes),
  ]);

  return {
    ig_user_id: id,
    username: summary.username ?? null,
    followers_count: summary.followers_count ?? null,
    media_count: summary.media_count ?? null,
    reach: sumSeries(reach),
    profile_views: sumSeries(profileViews),
    website_clicks: sumSeries(websiteClicks),
    notes,
  };
}

export interface SocialReport {
  facebook: PageReport | null;
  instagram: InstagramReport | null;
}

// Busca as duas plataformas, quando configuradas para o cliente. Falha de uma
// não derruba a outra; falha das duas devolve null limpo — report-data.ts usa
// isso para decidir se mantém o aviso "orgânico não entra" ou mostra a seção.
export async function fetchSocialReport(
  opts: { facebookPageId?: string | null; instagramBusinessId?: string | null },
  token: string,
  since: string,
  until: string
): Promise<SocialReport | null> {
  const facebookId = (opts.facebookPageId || "").trim();
  const instagramId = (opts.instagramBusinessId || "").trim();
  if (!facebookId && !instagramId) return null;

  const [facebook, instagram] = await Promise.all([
    facebookId ? fetchPageReport(facebookId, token, since, until).catch(() => null) : Promise.resolve(null),
    instagramId ? fetchInstagramReport(instagramId, token, since, until).catch(() => null) : Promise.resolve(null),
  ]);
  if (!facebook && !instagram) return null;
  return { facebook, instagram };
}
