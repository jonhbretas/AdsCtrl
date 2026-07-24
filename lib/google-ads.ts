// Cliente REST da Google Ads API para um dashboard pessoal (OAuth single-user).

const API_VERSION = "v25";
const API_ROOT = `https://googleads.googleapis.com/${API_VERSION}`;
const GOOGLE_PREFIX = "google:";

export interface GoogleAdsAccount {
  customerId: string;
  name: string;
  currency: string;
  status: string;
  manager: boolean;
  level: number;
}

export interface GoogleDailyMetric {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  results: Record<string, number>;
}

let tokenCache: { value: string; expiresAt: number } | null = null;

function required(name: string): string {
  const value = (process.env[name] || "").trim();
  if (!value) throw new Error(`${name} não configurado.`);
  return value;
}

export function googleAdsConfigured(): boolean {
  return [
    "GOOGLE_ADS_CLIENT_ID",
    "GOOGLE_ADS_CLIENT_SECRET",
    "GOOGLE_ADS_REFRESH_TOKEN",
    "GOOGLE_ADS_DEVELOPER_TOKEN",
    "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
  ].every((name) => Boolean((process.env[name] || "").trim()));
}

export function googleStorageId(customerId: string): string {
  return `${GOOGLE_PREFIX}${customerId.replace(/\D/g, "")}`;
}

export function googleCustomerId(storageOrCustomerId: string): string {
  return storageOrCustomerId.replace(/^google:/, "").replace(/\D/g, "");
}

async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 5 * 60_000) return tokenCache.value;
  const body = new URLSearchParams({
    client_id: required("GOOGLE_ADS_CLIENT_ID"),
    client_secret: required("GOOGLE_ADS_CLIENT_SECRET"),
    refresh_token: required("GOOGLE_ADS_REFRESH_TOKEN"),
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`Google OAuth ${res.status}: ${json.error_description || json.error || "falha ao renovar token"}`);
  }
  tokenCache = {
    value: json.access_token,
    expiresAt: Date.now() + Number(json.expires_in || 3600) * 1000,
  };
  return tokenCache.value;
}

async function googleRequest(path: string, init: RequestInit = {}, includeLoginCustomer = true): Promise<any> {
  const token = await accessToken();
  const loginCustomerId = required("GOOGLE_ADS_LOGIN_CUSTOMER_ID").replace(/\D/g, "");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": required("GOOGLE_ADS_DEVELOPER_TOKEN"),
    "Content-Type": "application/json",
    ...((init.headers || {}) as Record<string, string>),
  };
  if (includeLoginCustomer) headers["login-customer-id"] = loginCustomerId;
  const res = await fetch(`${API_ROOT}${path}`, {
    ...init,
    cache: "no-store",
    headers,
  });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) {
    const message = json?.error?.message || json?.error_description || text || `HTTP ${res.status}`;
    throw new Error(`Google Ads API ${res.status}: ${message}`);
  }
  return json;
}

async function search(customerId: string, query: string, includeLoginCustomer = true): Promise<any[]> {
  let json: any;
  try {
    json = await googleRequest(`/customers/${googleCustomerId(customerId)}/googleAds:searchStream`, {
      method: "POST",
      body: JSON.stringify({ query }),
    }, includeLoginCustomer);
  } catch (error) {
    // Contas acessíveis diretamente pelo usuário podem não estar sob o MCC;
    // nesse caso o header login-customer-id deve ser omitido.
    if (!includeLoginCustomer) throw error;
    json = await googleRequest(`/customers/${googleCustomerId(customerId)}/googleAds:searchStream`, {
      method: "POST",
      body: JSON.stringify({ query }),
    }, false);
  }
  const batches = Array.isArray(json) ? json : [json];
  return batches.flatMap((batch: any) => batch?.results || []);
}

export async function listGoogleAdsAccounts(): Promise<GoogleAdsAccount[]> {
  const managerId = required("GOOGLE_ADS_LOGIN_CUSTOMER_ID").replace(/\D/g, "");
  const rows = await search(managerId, `
    SELECT
      customer_client.id,
      customer_client.descriptive_name,
      customer_client.currency_code,
      customer_client.status,
      customer_client.manager,
      customer_client.level,
      customer_client.hidden
    FROM customer_client
    WHERE customer_client.level > 0
      AND customer_client.hidden = FALSE
    ORDER BY customer_client.descriptive_name
  `);
  const accounts: GoogleAdsAccount[] = rows
    .map((row: any) => {
      const c = row.customerClient || {};
      return {
        customerId: String(c.id || ""),
        name: c.descriptiveName || `Google Ads ${c.id || ""}`,
        currency: c.currencyCode || "BRL",
        status: c.status || "UNKNOWN",
        manager: Boolean(c.manager),
        level: Number(c.level || 0),
      };
    })
    .filter((account: GoogleAdsAccount) => account.customerId && !account.manager);

  // O perfil pessoal pode ter acesso direto a contas que ainda não foram
  // vinculadas ao MCC. listAccessibleCustomers cobre também esse cenário.
  const accessible = await googleRequest("/customers:listAccessibleCustomers", {}, false);
  const ids: string[] = (accessible.resourceNames || [])
    .map((name: string) => googleCustomerId(name))
    .filter((id: string) => id && id !== managerId);
  const known = new Set(accounts.map((account) => account.customerId));
  for (const id of ids) {
    if (known.has(id)) continue;
    try {
      const directRows = await search(id, `
        SELECT customer.id, customer.descriptive_name, customer.currency_code,
          customer.status, customer.manager
        FROM customer
        LIMIT 1
      `, false);
      const customer = directRows[0]?.customer;
      if (!customer || customer.manager) continue;
      accounts.push({
        customerId: String(customer.id || id),
        name: customer.descriptiveName || `Google Ads ${id}`,
        currency: customer.currencyCode || "BRL",
        status: customer.status || "UNKNOWN",
        manager: false,
        level: 0,
      });
      known.add(id);
    } catch (error) {
      console.warn(`Conta Google ${id} acessível, mas não consultável: ${error instanceof Error ? error.message : error}`);
    }
  }
  return accounts.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getGoogleDailyMetrics(
  customerId: string,
  since: string,
  until: string
): Promise<GoogleDailyMetric[]> {
  const rows = await search(customerId, `
    SELECT
      segments.date,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value
    FROM customer
    WHERE segments.date BETWEEN '${since}' AND '${until}'
    ORDER BY segments.date
  `);
  return rows.map((row: any) => {
    const m = row.metrics || {};
    const conversions = Number(m.conversions || 0);
    return {
      date: row.segments?.date,
      spend: Number(m.costMicros || 0) / 1_000_000,
      impressions: Number(m.impressions || 0),
      clicks: Number(m.clicks || 0),
      conversions,
      conversionValue: Number(m.conversionsValue || 0),
      // Sem classificar a ação como venda/lead: a definição é configurada
      // por cliente e uma conversão genérica nunca é rotulada como venda.
      results: { conversoes: conversions },
    };
  });
}

type DetailRow = {
  id: string; name: string; spend: number; impressions: number; clicks: number;
  ctr: number; cpm: number; results: Record<string, number>; values: Record<string, number>;
  objective?: string;
};

function mapMetrics(row: any): Omit<DetailRow, "id" | "name"> {
  const m = row.metrics || {};
  const spend = Number(m.costMicros || 0) / 1_000_000;
  const impressions = Number(m.impressions || 0);
  const clicks = Number(m.clicks || 0);
  const conversions = Number(m.conversions || 0);
  return {
    spend, impressions, clicks,
    ctr: impressions ? (clicks / impressions) * 100 : 0,
    cpm: impressions ? (spend / impressions) * 1000 : 0,
    results: { conversions },
    values: { conversions: Number(m.conversionsValue || 0) },
  };
}

async function detailLevel(customerId: string, level: "campaign" | "ad_group" | "ad_group_ad", since: string, until: string): Promise<DetailRow[]> {
  const fields =
    level === "campaign"
      ? "campaign.id, campaign.name, campaign.advertising_channel_type"
      : level === "ad_group"
        ? "ad_group.id, ad_group.name"
        : "ad_group_ad.ad.id, ad_group_ad.ad.name";
  const rows = await search(customerId, `
    SELECT ${fields},
      metrics.cost_micros, metrics.impressions, metrics.clicks,
      metrics.conversions, metrics.conversions_value
    FROM ${level}
    WHERE segments.date BETWEEN '${since}' AND '${until}'
      AND metrics.impressions > 0
    ORDER BY metrics.cost_micros DESC
    LIMIT 200
  `);
  return rows.map((row: any) => {
    const resource = level === "campaign" ? row.campaign : level === "ad_group" ? row.adGroup : row.adGroupAd?.ad;
    return {
      id: String(resource?.id || ""),
      name: resource?.name || "(sem nome)",
      ...mapMetrics(row),
      objective: row.campaign?.advertisingChannelType,
    };
  });
}

function previousRange(since: string, until: string) {
  const start = new Date(`${since}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const prevUntil = new Date(start.getTime() - 86400000);
  const prevSince = new Date(prevUntil.getTime() - (days - 1) * 86400000);
  return { since: prevSince.toISOString().slice(0, 10), until: prevUntil.toISOString().slice(0, 10) };
}

export async function getGoogleAccountDetail(customerId: string, since: string, until: string): Promise<any> {
  const id = googleCustomerId(customerId);
  const prev = previousRange(since, until);
  const [daily, prevDaily, campaigns, adsets, ads] = await Promise.all([
    getGoogleDailyMetrics(id, since, until),
    getGoogleDailyMetrics(id, prev.since, prev.until),
    detailLevel(id, "campaign", since, until),
    detailLevel(id, "ad_group", since, until),
    detailLevel(id, "ad_group_ad", since, until),
  ]);
  const aggregate = (items: GoogleDailyMetric[]) => {
    const spend = items.reduce((n, d) => n + d.spend, 0);
    const impressions = items.reduce((n, d) => n + d.impressions, 0);
    const clicks = items.reduce((n, d) => n + d.clicks, 0);
    const conversions = items.reduce((n, d) => n + d.conversions, 0);
    const value = items.reduce((n, d) => n + d.conversionValue, 0);
    return {
      spend, reach: 0, impressions, clicks,
      ctr: impressions ? (clicks / impressions) * 100 : 0,
      cpm: impressions ? (spend / impressions) * 1000 : 0,
      results: { conversions }, values: { conversions: value },
    };
  };
  return {
    account_id: googleStorageId(id),
    range: { since, until }, prevRange: prev,
    kpis: aggregate(daily), prevKpis: aggregate(prevDaily),
    daily: daily.map((d) => ({
      ...d,
      ctr: d.impressions ? (d.clicks / d.impressions) * 100 : 0,
      cpm: d.impressions ? (d.spend / d.impressions) * 1000 : 0,
      reach: 0,
      results: { conversions: d.conversions },
      values: { conversions: d.conversionValue },
    })),
    campaigns, adsets, ads,
    breakdowns: { age_gender: [], region: [], platform: [], position: [], device: [], hour: [] },
    availableResults: ["conversions"],
  };
}
