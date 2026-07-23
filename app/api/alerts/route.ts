// app/api/alerts/route.ts
// GET  ?scope=active|history  -> lista alertas
// POST { id, acknowledged }   -> marca/desmarca "ciente"

import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get("scope") || "active";
    const sb = getServiceClient();

    if (scope === "history") {
      // Histórico = já resolvidos OU marcados como ciente.
      const { data, error } = await sb
        .from("alerts")
        .select("*")
        .or("resolved.eq.true,acknowledged.eq.true")
        .order("last_seen_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return NextResponse.json({ alerts: data || [] });
    }

    // Filtra "acknowledged" em JS para funcionar mesmo antes da migração.
    const { data, error } = await sb.from("alerts").select("*").eq("resolved", false);
    if (error) throw error;
    return NextResponse.json({ alerts: (data || []).filter((a: any) => !a.acknowledged) });
  } catch (e: any) {
    return NextResponse.json({ alerts: [], error: e?.message ?? "Erro ao listar alertas." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = body?.id;
    const acknowledged = Boolean(body?.acknowledged);
    if (id == null) return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });

    const sb = getServiceClient();
    const { data, error } = await sb
      .from("alerts")
      .update({ acknowledged, acknowledged_at: acknowledged ? new Date().toISOString() : null })
      .eq("id", id)
      .select("id, acknowledged, acknowledged_at")
      .single();
    if (error) throw error;
    return NextResponse.json({ alert: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao atualizar alerta." }, { status: 500 });
  }
}
