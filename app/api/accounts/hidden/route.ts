// app/api/accounts/hidden/route.ts
// Oculta/reexibe uma conta no dashboard (seleção manual). Persistido no Supabase.

import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const account_id = String(body?.account_id ?? "").trim();
    const hidden = Boolean(body?.hidden);
    if (!account_id) return NextResponse.json({ error: "account_id é obrigatório." }, { status: 400 });

    const sb = getServiceClient();
    const { data, error } = await sb
      .from("ad_accounts")
      .update({ hidden, updated_at: new Date().toISOString() })
      .eq("account_id", account_id)
      .select("account_id, hidden")
      .single();
    if (error) throw error;
    return NextResponse.json({ account: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao ocultar conta." }, { status: 500 });
  }
}
