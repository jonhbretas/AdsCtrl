// lib/meta-social.ts
// Página do Facebook e conta comercial do Instagram — o lado orgânico que o
// relatório ainda não tem.
//
// Testado ao vivo contra Página real (Prime Gourmet Cuiabá): os campos do nó
// (fan_count, followers_count, media_count, username) funcionam com o token
// de sistema direto. A edge /insights, de Página e de Instagram, recusa esse
// token com "(#190) This method must be called with a Page Access Token" — a
// Meta exige o token DA PÁGINA para insights, não o do usuário de sistema que
// a administra. resolvePageAccessToken busca esse token, uma vez por Página,
// e ele nunca sai do servidor: /api/meta/pages (o dropdown) não devolve token
// nenhum ao navegador.
//
// Nomes de métrica de /insights mudam com frequência entre versões da Graph
// API; por isso cada métrica é buscada e falha isoladamente (ver runMetric),
// do jeito que getGoogleReportExtras já faz para o Google — uma métrica
// descontinuada não derruba as demais.
//
// BLOQUEIO REAL RESTANTE: reach/profile_views/website_clicks do Instagram
// voltam "(#10) Application does not have permission for this action" —
// isso é permissão do APP (instagram_manage_insights), concedida por Revisão
// do App na Meta, não algo que se resolve atribuindo Página na BM. Enquanto
// isso não for aprovado, o Instagram só traz o que os campos do nó já dão
// (seguidores, publicações, username) — que já são reais e conferidos.

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
  // impressions_unique: sempre 0 por ora — ver bloqueio de nome de métrica no
  // topo do arquivo. Mantido no tipo para o dia em que a métrica for achada.
  impressions_unique: number;
  post_engagements: number;
  page_views: number;
  notes: string[];
}

// A Página tem o próprio token, distinto do token de sistema que a
// administra — /insights só aceita o dela. Nunca devolvido ao navegador:
// só circula servidor a servidor, dentro desta chamada.
export async function resolvePageAccessToken(pageId: string, systemToken: string): Promise<string> {
  const data = await fbGet<{ access_token?: string }>(pageId, { fields: "access_token" }, systemToken);
  const token = (data.access_token || "").trim();
  if (!token) throw new Error("Token da Página indisponível — confira se o usuário de sistema tem função de administrador nela.");
  return token;
}

export async function fetchPageReport(
  pageId: string,
  systemToken: string,
  since: string,
  until: string
): Promise<PageReport> {
  const id = required("facebook_page_id", pageId);
  const notes: string[] = [];

  const pageToken = await resolvePageAccessToken(id, systemToken).catch((e: any) => {
    notes.push(`token da Página: ${e?.message || "falhou"}`);
    return systemToken; // campos do nó ainda funcionam com o token de sistema
  });

  // Campos do nó: estáveis, quase nunca mudam de nome.
  const summary = await fbGet<{ name?: string; fan_count?: number; followers_count?: number }>(
    id,
    { fields: "name,fan_count,followers_count" },
    pageToken
  ).catch((e: any) => {
    notes.push(`dados da Página: ${e?.message || "falhou"}`);
    return {} as { name?: string; fan_count?: number; followers_count?: number };
  });

  // page_impressions/page_impressions_unique: testado ao vivo contra Página
  // real (com token de Página correto) e a Meta recusa as duas com "(#100)
  // The value must be a valid insights metric" — a métrica de impressão de
  // Página parece ter sido descontinuada ou renomeada numa versão recente da
  // Graph API. Fica de fora até alguém confirmar o nome atual na documentação;
  // post_engagements e page_views já vieram certos (sem erro, valores reais).
  const [engagements, views] = await Promise.all([
    runMetric(`${id}/insights`, "page_post_engagements", since, until, pageToken, notes),
    runMetric(`${id}/insights`, "page_views_total", since, until, pageToken, notes),
  ]);

  return {
    page_id: id,
    name: summary.name ?? null,
    fan_count: summary.fan_count ?? null,
    followers_count: summary.followers_count ?? null,
    impressions_unique: 0,
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

// O Instagram Business não tem token próprio: as chamadas dele rodam com o
// token da Página do Facebook a que está vinculado (por isso pageToken, não
// um token do próprio Instagram — a Meta não emite um).
export async function fetchInstagramReport(
  igUserId: string,
  pageToken: string,
  since: string,
  until: string
): Promise<InstagramReport> {
  const id = required("instagram_business_id", igUserId);
  const notes: string[] = [];

  const summary = await fbGet<{ username?: string; followers_count?: number; media_count?: number }>(
    id,
    { fields: "username,followers_count,media_count" },
    pageToken
  ).catch((e: any) => {
    notes.push(`dados do Instagram: ${e?.message || "falhou"}`);
    return {} as { username?: string; followers_count?: number; media_count?: number };
  });

  const [reach, profileViews, websiteClicks] = await Promise.all([
    runMetric(`${id}/insights`, "reach", since, until, pageToken, notes),
    runMetric(`${id}/insights`, "profile_views", since, until, pageToken, notes),
    runMetric(`${id}/insights`, "website_clicks", since, until, pageToken, notes),
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

export interface AvailablePage {
  page_id: string;
  page_name: string;
  instagram_business_id: string | null;
  instagram_username: string | null;
  // Token que enxergou esta Página — vários System Users (uma BM cada) podem
  // estar configurados em META_ACCESS_TOKENS; sem isto não dá pra saber qual
  // deles usar depois pra buscar os insights desta Página específica.
  token_index: number;
}

// Páginas que o token de sistema já enxerga — é literalmente a lista que fica
// vazia até alguém atribuir a Página na Business Manager. Uma lista vazia não
// é erro: é o estado normal enquanto o bloqueio (ver topo do arquivo) não foi
// resolvido, e a tela usa isso para orientar o que fazer.
export async function listAvailablePages(token: string, tokenIndex: number): Promise<AvailablePage[]> {
  const pages: AvailablePage[] = [];
  let url = `${GRAPH}/me/accounts?fields=id,name,instagram_business_account{id,username}&limit=100&access_token=${token}`;
  // /me/accounts pagina por cursor, não por offset — cada página de resultado
  // já traz o link pronto da próxima em paging.next.
  while (url) {
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    let json: any = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
    if (!res.ok || json?.error) {
      throw new Error(json?.error?.error_user_msg || json?.error?.message || `HTTP ${res.status}`);
    }
    for (const row of json.data || []) {
      pages.push({
        page_id: String(row.id),
        page_name: row.name || row.id,
        instagram_business_id: row.instagram_business_account?.id ? String(row.instagram_business_account.id) : null,
        instagram_username: row.instagram_business_account?.username || null,
        token_index: tokenIndex,
      });
    }
    url = json.paging?.next || "";
  }
  return pages;
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

  // O Instagram não tem token próprio — precisa do token da Página a que está
  // vinculado. Resolvido uma vez aqui para não repetir a chamada.
  const pageToken = facebookId ? await resolvePageAccessToken(facebookId, token).catch(() => token) : token;

  const [facebook, instagram] = await Promise.all([
    facebookId ? fetchPageReport(facebookId, token, since, until).catch(() => null) : Promise.resolve(null),
    instagramId
      ? (facebookId
          ? fetchInstagramReport(instagramId, pageToken, since, until).catch(() => null)
          // Instagram cadastrado sem a Página: sem como resolver o token dela,
          // o melhor que dá é tentar com o de sistema mesmo, que provavelmente falha.
          : fetchInstagramReport(instagramId, token, since, until).catch(() => null))
      : Promise.resolve(null),
  ]);
  if (!facebook && !instagram) return null;
  return { facebook, instagram };
}
