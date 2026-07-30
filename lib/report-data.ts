// lib/report-data.ts
// Montagem do relatório (Meta + contas Google vinculadas) num payload só.
// Usado pela página logada, pelo link público assinado e pelo e-mail semanal —
// os três precisam mostrar exatamente os mesmos números.

import { getAccountDetail, tokenByIndex } from "@/lib/meta";
import {
  getGoogleAccountDetail,
  getGoogleReportExtras,
  googleAdsConfigured,
  googleCustomerId,
} from "@/lib/google-ads";
import { fetchSocialReport, SocialReport } from "@/lib/meta-social";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export class ReportError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "ReportError";
    this.status = status;
  }
}

// Qual resultado importa para este cliente (clients.result_family).
// A Meta devolve dezenas de action_types e vários aparecem de carona — um lead
// avulso do pixel numa conta que vive de conversa no WhatsApp. Sem essa âncora
// o relatório destaca o que tem mais volume, não o que o negócio persegue.
// Resolvido FORA do cache de propósito: trocar o foco no admin tem que valer no
// próximo carregamento, e não daqui a 24h.
export async function resultFamilyForAccount(accountId: string): Promise<string | null> {
  return (await clientReportSettings(accountId)).result_family;
}

export interface ClientReportSettings {
  result_family: string | null;
  /** Marca que assina o que o cliente vê. Nulo = usa APP_BRAND_NAME. */
  brand: string | null;
  /** Orgânico (Facebook/Instagram). Nulo até a migration + cadastro em /clientes. */
  facebook_page_id: string | null;
  instagram_business_id: string | null;
}

// Resolve o cliente de uma conta e devolve o que o relatório precisa saber
// sobre ele. Uma consulta serve todas essas leituras.
export async function clientReportSettings(accountId: string): Promise<ClientReportSettings> {
  const empty: ClientReportSettings = {
    result_family: null, brand: null, facebook_page_id: null, instagram_business_id: null,
  };
  if (supabaseEnvMissing()) return empty;

  // brand_name e as colunas de orgânico podem não existir ainda (migrações
  // próprias). Tenta com tudo e vai reduzindo: nenhuma delas pode derrubar o
  // relatório por não terem sido rodadas.
  const COLUMN_SETS = [
    "result_family,brand_name,facebook_page_id,instagram_business_id",
    "result_family,brand_name",
    "result_family",
  ];
  const read = async (columns: string) => {
    const supabase = getServiceClient();
    const bare = accountId.replace(/^act_/, "").replace(/^google:/, "");

    const direct = await supabase
      .from("clients")
      .select(columns)
      .eq("source_meta_account_id", bare)
      .limit(1);
    if (direct.error) throw direct.error;
    if (direct.data?.[0]) return direct.data[0] as any;

    const links = await supabase
      .from("client_ad_accounts")
      .select("client_id")
      .eq("account_id", bare)
      .limit(1);
    const clientId = links.data?.[0]?.client_id;
    if (!clientId) return null;

    const client = await supabase.from("clients").select(columns).eq("id", clientId).limit(1);
    if (client.error) throw client.error;
    return (client.data?.[0] as any) ?? null;
  };

  try {
    let row: any = null;
    for (const columns of COLUMN_SETS) {
      try {
        row = await read(columns);
        break;
      } catch (error: any) {
        if (columns === COLUMN_SETS[COLUMN_SETS.length - 1]) throw error;
        if (!/brand_name|facebook_page_id|instagram_business_id/.test(error?.message || "")) throw error;
      }
    }
    if (!row) return empty;
    return {
      result_family: row.result_family ?? null,
      brand: (row.brand_name ?? null) || null,
      facebook_page_id: row.facebook_page_id ?? null,
      instagram_business_id: row.instagram_business_id ?? null,
    };
  } catch {
    // Foco, marca e orgânico são refinamentos de leitura; nunca derrubam o relatório.
    return empty;
  }
}

export function defaultRange() {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const until = new Date();
  const since = new Date();
  since.setDate(until.getDate() - 7);
  return { since: fmt(since), until: fmt(until) };
}

// Período imediatamente anterior, de mesma duração (o comparativo do relatório).
export function previousRange(since: string, until: string) {
  const start = new Date(`${since}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const prevUntil = new Date(start.getTime() - 86400000);
  const prevSince = new Date(prevUntil.getTime() - (days - 1) * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { since: fmt(prevSince), until: fmt(prevUntil) };
}

// Semana cheia anterior (segunda a domingo) no fuso do cliente — é o período
// que o envio de segunda-feira deve cobrir.
export function lastFullWeek(timezone = "America/Sao_Paulo"): { since: string; until: string } {
  let today: Date;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    today = new Date(Date.UTC(value("year"), value("month") - 1, value("day")));
  } catch {
    today = new Date();
  }
  // getUTCDay: 0=domingo. Recuar até a segunda desta semana e voltar sete dias.
  const weekday = today.getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const monday = new Date(today.getTime() - daysSinceMonday * 86400000);
  const previousMonday = new Date(monday.getTime() - 7 * 86400000);
  const previousSunday = new Date(monday.getTime() - 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { since: fmt(previousMonday), until: fmt(previousSunday) };
}

export async function buildReport(requestedAccountId: string, since: string, until: string) {
  if (supabaseEnvMissing()) throw new ReportError("Supabase não configurado.", 503);

  const supabase = getServiceClient();
  const lookupId = requestedAccountId.trim().replace(/^act_/, "");
  const { data: account, error } = await supabase
    .from("ad_accounts")
    .select("account_id,name,platform,currency,status,hidden,token_ref")
    .eq("account_id", lookupId)
    .maybeSingle();
  if (error) throw error;
  if (!account) throw new ReportError("Conta não encontrada no catálogo.", 404);

  const { data: linkedRows } = account.platform === "meta"
    ? await supabase
        .from("ad_accounts")
        .select("account_id,name,currency")
        .eq("platform", "google")
        .eq("linked_meta_account_id", account.account_id)
        .eq("hidden", false)
    : { data: [] as any[] };

  const meta =
    account.platform === "meta"
      ? await getAccountDetail(
          `act_${lookupId}`,
          since,
          until,
          tokenByIndex(typeof account.token_ref === "number" ? account.token_ref : 0),
          { extended: true }
        ).then(
          (detail) => ({ ...detail, name: account.name, currency: account.currency || "BRL", error: null }),
          (e: any) => ({ error: e?.message || "Falha ao buscar dados da Meta." })
        )
      : null;

  const googleTargets =
    account.platform === "google"
      ? [{ account_id: account.account_id, name: account.name, currency: account.currency || "BRL" }]
      : (linkedRows || []).map((row: any) => ({
          account_id: row.account_id,
          name: row.name,
          currency: row.currency || "BRL",
        }));

  const google = googleAdsConfigured()
    ? await Promise.all(
        googleTargets.map(async (target) => {
          const customerId = googleCustomerId(target.account_id);
          const [detail, extras] = await Promise.all([
            getGoogleAccountDetail(customerId, since, until).catch((e: any) => ({
              error: e?.message || "Falha ao buscar dados do Google Ads.",
            })),
            getGoogleReportExtras(customerId, since, until).catch(() => null),
          ]);
          return { ...target, detail, extras };
        })
      )
    : [];

  // Orgânico (Facebook/Instagram): só tenta quando o cliente tem os IDs
  // cadastrados em /clientes. Sem Página atribuída ao usuário de sistema na
  // BM, a chamada falha e cai no aviso de sempre — não derruba o relatório.
  const settings = await clientReportSettings(account.account_id);
  const socialToken = tokenByIndex(account.platform === "meta" && typeof account.token_ref === "number" ? account.token_ref : 0);
  let social: SocialReport | null = null;
  if (settings.facebook_page_id || settings.instagram_business_id) {
    social = await fetchSocialReport(
      { facebookPageId: settings.facebook_page_id, instagramBusinessId: settings.instagram_business_id },
      socialToken,
      since,
      until
    ).catch(() => null);
  }

  return {
    generated_at: new Date().toISOString(),
    account: {
      account_id: account.account_id,
      name: account.name,
      platform: account.platform,
      currency: account.currency || "BRL",
      status: account.status,
    },
    range: { since, until },
    prevRange: previousRange(since, until),
    meta,
    google,
    social,
    organic_note: social
      ? undefined
      : "Dados orgânicos de Instagram/Facebook não entram: o token atual não tem as Páginas atribuídas na BM.",
  };
}

export type ReportPayloadData = Awaited<ReturnType<typeof buildReport>>;

// ---------- cache ----------
// Período fechado (terminou ontem ou antes) não muda mais: vale por um dia.
// Período que inclui hoje ainda recebe dados: vale por poucos minutos.
const FRESH_CLOSED_MS = 24 * 60 * 60 * 1000;
const FRESH_OPEN_MS = 15 * 60 * 1000;

function cacheWindow(until: string): number {
  const today = new Date().toISOString().slice(0, 10);
  return until < today ? FRESH_CLOSED_MS : FRESH_OPEN_MS;
}

// A chave do cache inclui o período, e os períodos do painel são rolantes:
// "últimos 7 dias" vira um intervalo novo todo dia. Sem limpeza a tabela só
// cresce — cada linha guarda o relatório inteiro (~35 KB), e o plano gratuito
// do Supabase para em 500 MB. Linha mais velha que a janela máxima (24h) nunca
// mais vai ser servida; guardamos alguns dias só para poder inspecionar.
const CACHE_RETENTION_DAYS = 7;

async function purgeStaleCache(supabase: ReturnType<typeof getServiceClient>): Promise<void> {
  const cutoff = new Date(Date.now() - CACHE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await supabase
    .from("report_cache")
    .delete()
    .lt("fetched_at", cutoff)
    .then(() => undefined, () => undefined);
}

export interface CachedReport {
  report: ReportPayloadData;
  cached: boolean;
  fetched_at: string;
}

// Mesma montagem do relatório, servida do banco quando ainda está fresca.
// Protege as APIs de anúncio de recargas repetidas no link do cliente.
export async function buildReportCached(
  accountId: string,
  since: string,
  until: string,
  opts: { force?: boolean } = {}
): Promise<CachedReport> {
  if (supabaseEnvMissing()) throw new ReportError("Supabase não configurado.", 503);
  const supabase = getServiceClient();
  const key = { account_id: accountId.replace(/^act_/, ""), range_since: since, range_until: until };

  if (!opts.force) {
    const { data: cached } = await supabase
      .from("report_cache")
      .select("payload,fetched_at,hits")
      .match(key)
      .maybeSingle();
    if (cached?.payload) {
      const age = Date.now() - new Date(cached.fetched_at).getTime();
      if (age < cacheWindow(until)) {
        // Contador só para enxergar uso; falha aqui não pode derrubar a leitura.
        supabase
          .from("report_cache")
          .update({ hits: (cached.hits || 0) + 1 })
          .match(key)
          .then(() => undefined, () => undefined);
        return { report: cached.payload as ReportPayloadData, cached: true, fetched_at: cached.fetched_at };
      }
    }
  }

  const report = await buildReport(accountId, since, until);
  const fetched_at = new Date().toISOString();
  await supabase
    .from("report_cache")
    .upsert({ ...key, payload: report, fetched_at, hits: 0 })
    .then(() => undefined, () => undefined);
  // Só na escrita: a leitura quente não paga por isso, e escrita é rara.
  await purgeStaleCache(supabase);
  return { report, cached: false, fetched_at };
}
