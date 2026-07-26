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
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export class ReportError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "ReportError";
    this.status = status;
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
    organic_note:
      "Dados orgânicos de Instagram/Facebook não entram: o token atual não tem as Páginas atribuídas na BM.",
  };
}

export type ReportPayloadData = Awaited<ReturnType<typeof buildReport>>;
