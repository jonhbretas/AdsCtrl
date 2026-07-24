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
    const { data, error } = await sb.rpc("set_adsctrl_account_hidden", {
      p_account_id: account_id,
      p_hidden: hidden,
    });
    if (error) throw error;
    return NextResponse.json({ account: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao ocultar conta." }, { status: 500 });
  }
}
