// app/api/accounts/route.ts
// Serve para o front: contas + último snapshot + grupos + alertas.

import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  // Sempre respondemos JSON — mesmo em erro — para o front nunca quebrar no r.json().
  try {
    if (supabaseEnvMissing()) {
      return NextResponse.json(
        { accounts: [], groups: [], alerts: [], error: "Supabase não configurado (variáveis de ambiente ausentes)." },
        { status: 200 }
      );
    }

    const supabase = getServiceClient();
    // Períodos "atuais" (com sparkline) e seus "anteriores" (para os deltas).
    const CUR = ["last_7d", "last_14d", "last_30d"];
    const PREV = ["prev_7d", "prev_14d", "prev_30d"];
    const CUR_KEY: Record<string, string> = { last_7d: "7d", last_14d: "14d", last_30d: "30d" };
    const PREV_KEY: Record<string, string> = { prev_7d: "7d", prev_14d: "14d", prev_30d: "30d" };

    const [{ data: accounts }, { data: groups }, { data: alerts }, { data: snaps }] =
      await Promise.all([
        supabase.from("ad_accounts").select("*").order("name"),
        supabase.from("client_groups").select("*").order("name"),
        // Filtra "acknowledged" em JS (não em SQL) para funcionar mesmo antes
        // da migração que adiciona a coluna.
        supabase.from("alerts").select("*").eq("resolved", false),
        // select("*") para não quebrar caso a coluna "daily" ainda não exista.
        // Traz todos os períodos de uma vez; escolhemos o mais recente por conta+período.
        supabase
          .from("metric_snapshots")
          .select("*")
          .in("period", [...CUR, ...PREV])
          .order("captured_at", { ascending: false }),
      ]);

    // Mais recente por (conta, período).
    const latest: Record<string, Record<string, any>> = {}; // account_id -> period -> snap
    for (const s of snaps || []) {
      const byPeriod = (latest[s.account_id] ||= {});
      if (!byPeriod[s.period]) byPeriod[s.period] = s;
    }

    // Ativos = não resolvidos e não marcados como "ciente".
    const activeAlerts = (alerts || []).filter((a: any) => !a.acknowledged);

    const enriched = (accounts || []).map((a) => {
      const byPeriod = latest[a.account_id] || {};
      const metricsByPeriod: Record<string, any> = {};
      const prevByPeriod: Record<string, any> = {};
      for (const p of CUR) if (byPeriod[p]) metricsByPeriod[CUR_KEY[p]] = byPeriod[p];
      for (const p of PREV) if (byPeriod[p]) prevByPeriod[PREV_KEY[p]] = byPeriod[p];
      return {
        ...a,
        // compat: "metrics"/"prevMetrics" continuam sendo os 7 dias.
        metrics: metricsByPeriod["7d"] || null,
        prevMetrics: prevByPeriod["7d"] || null,
        metricsByPeriod,
        prevByPeriod,
        alerts: activeAlerts.filter((al) => al.account_id === a.account_id),
      };
    });

    return NextResponse.json({
      accounts: enriched,
      groups: groups || [],
      alerts: activeAlerts,
    });
  } catch (e: any) {
    return NextResponse.json(
      { accounts: [], groups: [], alerts: [], error: e?.message ?? "Erro ao consultar o Supabase." },
      { status: 500 }
    );
  }
}
