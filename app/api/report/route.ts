// app/api/report/route.ts
// Monta TODO o relatório num payload só: conta Meta + contas Google vinculadas
// ao mesmo cliente. Uma chamada única para a página de impressão não sair
// pela metade quando o usuário manda imprimir.
// Ex: /api/report?account_id=act_123&since=2026-07-14&until=2026-07-20

import { NextResponse } from "next/server";
import { getAccountDetail, tokenByIndex } from "@/lib/meta";
import {
  getGoogleAccountDetail,
  getGoogleReportExtras,
  googleAdsConfigured,
  googleCustomerId,
} from "@/lib/google-ads";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function defaultRange() {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const until = new Date();
  const since = new Date();
  since.setDate(until.getDate() - 7);
  return { since: fmt(since), until: fmt(until) };
}

// Período imediatamente anterior, de mesma duração (o comparativo do relatório).
function previousRange(since: string, until: string) {
  const start = new Date(`${since}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const prevUntil = new Date(start.getTime() - 86400000);
  const prevSince = new Date(prevUntil.getTime() - (days - 1) * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { since: fmt(prevSince), until: fmt(prevUntil) };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const requested = (searchParams.get("account_id") || "").trim();
    if (!requested) {
      return NextResponse.json({ error: "account_id é obrigatório." }, { status: 400 });
    }
    const def = defaultRange();
    const since = searchParams.get("since") || def.since;
    const until = searchParams.get("until") || def.until;
    const range = { since, until };
    const prevRange = previousRange(since, until);

    if (supabaseEnvMissing()) {
      return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    }
    const supabase = getServiceClient();
    const lookupId = requested.replace(/^act_/, "");
    const { data: account, error } = await supabase
      .from("ad_accounts")
      .select("account_id,name,platform,currency,status,hidden,token_ref,linked_meta_account_id,group_id")
      .eq("account_id", lookupId)
      .maybeSingle();
    if (error) throw error;
    if (!account) {
      return NextResponse.json({ error: "Conta não encontrada no catálogo." }, { status: 404 });
    }

    // Contas Google do mesmo cliente (vinculadas à conta Meta).
    const { data: linkedRows } = account.platform === "meta"
      ? await supabase
          .from("ad_accounts")
          .select("account_id,name,currency,platform,hidden")
          .eq("platform", "google")
          .eq("linked_meta_account_id", account.account_id)
          .eq("hidden", false)
      : { data: [] as any[] };
    const linked = linkedRows || [];

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
            (e) => ({ error: e?.message || "Falha ao buscar dados da Meta." })
          )
        : null;

    // Uma conta Google pode ser o alvo direto do relatório ou vir vinculada.
    const googleTargets =
      account.platform === "google"
        ? [{ account_id: account.account_id, name: account.name, currency: account.currency || "BRL" }]
        : linked.map((row: any) => ({
            account_id: row.account_id,
            name: row.name,
            currency: row.currency || "BRL",
          }));

    const google = googleAdsConfigured()
      ? await Promise.all(
          googleTargets.map(async (target) => {
            const customerId = googleCustomerId(target.account_id);
            const [detail, extras] = await Promise.all([
              getGoogleAccountDetail(customerId, since, until).catch((e) => ({
                error: e?.message || "Falha ao buscar dados do Google Ads.",
              })),
              getGoogleReportExtras(customerId, since, until).catch(() => null),
            ]);
            return { ...target, detail, extras };
          })
        )
      : [];

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      account: {
        account_id: account.account_id,
        name: account.name,
        platform: account.platform,
        currency: account.currency || "BRL",
        status: account.status,
      },
      range,
      prevRange,
      meta,
      google,
      // O log de atividades tem endpoint próprio; o relatório não o inclui
      // para não estourar o tempo da requisição.
      organic_note:
        "Dados orgânicos de Instagram/Facebook não entram: o token atual não tem as Páginas atribuídas na BM.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao montar o relatório." }, { status: 500 });
  }
}
