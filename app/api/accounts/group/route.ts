// app/api/accounts/group/route.ts
// Atribui (ou remove) uma conta a um grupo. group_id = null desassocia.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const account_id = String(body?.account_id ?? "").trim();
    // group_id pode vir string (uuid) ou null/"" para desassociar
    const rawGroup = body?.group_id;
    const group_id = rawGroup ? String(rawGroup) : null;
    if (!account_id) return NextResponse.json({ error: "account_id é obrigatório." }, { status: 400 });

    const sb = getSupabase();
    const { data, error } = await sb
      .from("ad_accounts")
      .update({ group_id, updated_at: new Date().toISOString() })
      .eq("account_id", account_id)
      .select("account_id, group_id")
      .single();
    if (error) throw error;
    return NextResponse.json({ account: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao atribuir grupo." }, { status: 500 });
  }
}
