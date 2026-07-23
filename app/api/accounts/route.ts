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
    const [{ data: accounts }, { data: groups }, { data: alerts }, { data: snaps }, { data: prevSnaps }] =
      await Promise.all([
        supabase.from("ad_accounts").select("*").order("name"),
        supabase.from("client_groups").select("*").order("name"),
        // Filtra "acknowledged" em JS (não em SQL) para funcionar mesmo antes
        // da migração que adiciona a coluna.
        supabase.from("alerts").select("*").eq("resolved", false),
        // select("*") para não quebrar caso a coluna "daily" ainda não exista.
        supabase
          .from("metric_snapshots")
          .select("*")
          .eq("period", "last_7d")
          .order("captured_at", { ascending: false }),
        supabase
          .from("metric_snapshots")
          .select("account_id, spend, conversions, captured_at, period")
          .eq("period", "prev_7d")
          .order("captured_at", { ascending: false }),
      ]);

    // Pega o snapshot mais recente por conta (atual e anterior)
    const latestByAccount: Record<string, any> = {};
    for (const s of snaps || []) {
      if (!latestByAccount[s.account_id]) latestByAccount[s.account_id] = s;
    }
    const prevByAccount: Record<string, any> = {};
    for (const s of prevSnaps || []) {
      if (!prevByAccount[s.account_id]) prevByAccount[s.account_id] = s;
    }

    // Ativos = não resolvidos e não marcados como "ciente".
    const activeAlerts = (alerts || []).filter((a: any) => !a.acknowledged);

    const enriched = (accounts || []).map((a) => ({
      ...a,
      metrics: latestByAccount[a.account_id] || null,
      prevMetrics: prevByAccount[a.account_id] || null,
      alerts: activeAlerts.filter((al) => al.account_id === a.account_id),
    }));

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
