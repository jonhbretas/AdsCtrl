// app/api/accounts/on-hold/route.ts
// Marca/desmarca uma conta como "em pausa combinada": parada de propósito.
// Suprime o alerta crítico de "sem rodar há 24h" (stalled) na coleta.

import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const account_id = String(body?.account_id ?? "").trim();
    const on_hold = Boolean(body?.on_hold);
    if (!account_id) return NextResponse.json({ error: "account_id é obrigatório." }, { status: 400 });

    const sb = getServiceClient();
    const { data, error } = await sb
      .from("ad_accounts")
      .update({ on_hold, updated_at: new Date().toISOString() })
      .eq("account_id", account_id)
      .select("account_id, on_hold")
      .single();
    if (error) throw error;
    return NextResponse.json({ account: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao marcar conta como em pausa." }, { status: 500 });
  }
}
