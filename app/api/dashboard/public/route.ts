// app/api/dashboard/public/route.ts
// Painel do cliente, aberto por link assinado. O token prende o acesso a UM
// cliente; período vem por parâmetro, dentro de uma lista fechada — nada de
// intervalo livre, que viraria consulta ilimitada de API pelo lado de fora.
//
// A resposta traz as métricas (do cache quando fresco) e a lista dos últimos
// relatórios semanais enviados, cada um com seu próprio link assinado.

import { NextResponse } from "next/server";
import { buildReportCached, ReportError } from "@/lib/report-data";
import { createReportToken, verifyDashboardToken } from "@/lib/report-token";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Períodos que o cliente pode pedir. Lista fechada = teto de consultas.
const PERIODS: Record<string, number> = { "7d": 7, "14d": 14, "30d": 30 };

function rangeFor(period: string): { since: string; until: string; label: string } {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const until = new Date();
  until.setUTCDate(until.getUTCDate() - 1); // ontem: hoje ainda está incompleto
  if (period === "mtd") {
    const since = new Date(Date.UTC(until.getUTCFullYear(), until.getUTCMonth(), 1));
    return { since: fmt(since), until: fmt(until), label: "Mês atual" };
  }
  const days = PERIODS[period] ?? 7;
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - (days - 1));
  return { since: fmt(since), until: fmt(until), label: `Últimos ${days} dias` };
}

function primaryAccountId(client: any, links: any[]): string | null {
  if (client.source_meta_account_id) return client.source_meta_account_id;
  const own = links.filter((link) => link.client_id === client.id);
  return own.find((l) => l.is_primary)?.account_id ?? own[0]?.account_id ?? null;
}

export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const payload = await verifyDashboardToken(params.get("token") || "");
    if (!payload) {
      return NextResponse.json(
        { error: "Este link é inválido ou expirou. Peça um novo à agência." },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (supabaseEnvMissing()) {
      return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    }

    const supabase = getServiceClient();
    const [{ data: client }, { data: links }] = await Promise.all([
      supabase
        .from("clients")
        .select("id,name,status,source_meta_account_id,result_family")
        .eq("id", payload.clientId)
        .maybeSingle(),
      supabase.from("client_ad_accounts").select("client_id,account_id,is_primary"),
    ]);
    if (!client) {
      return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    }

    const accountId = primaryAccountId(client, links || []);
    if (!accountId) {
      return NextResponse.json({ error: "Cliente sem conta de anúncios vinculada." }, { status: 404 });
    }

    const requested = params.get("period") || "7d";
    const period = requested in PERIODS || requested === "mtd" ? requested : "7d";
    const range = rangeFor(period);

    const [{ report, cached, fetched_at }, { data: history }] = await Promise.all([
      buildReportCached(accountId, range.since, range.until),
      supabase
        .from("report_sends")
        .select("range_since,range_until,created_at")
        .eq("client_id", client.id)
        .eq("status", "sent")
        .eq("dry_run", false)
        .order("range_since", { ascending: false })
        .limit(8),
    ]);

    // Cada relatório passado ganha um link assinado na hora — o histórico
    // guarda só o período, nunca um token.
    const reports = await Promise.all(
      (history || []).map(async (row: any) => ({
        since: row.range_since,
        until: row.range_until,
        sent_at: row.created_at,
        url: `/r/${await createReportToken(accountId, row.range_since, row.range_until)}`,
      }))
    );

    return NextResponse.json(
      {
        client: { name: client.name },
        period,
        period_label: range.label,
        range,
        cached,
        fetched_at,
        // O foco fica fora do payload cacheado: trocar no admin vale na hora.
        report: { ...report, result_family: client.result_family ?? null },
        reports,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    const status = e instanceof ReportError ? e.status : 500;
    return NextResponse.json({ error: e?.message ?? "Erro ao abrir o painel." }, { status });
  }
}
