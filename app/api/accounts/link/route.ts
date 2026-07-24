// Vincula/desvincula uma conta Google a uma conta Meta (cliente).

import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const googleAccountId = String(body.google_account_id || "").trim();
    const metaAccountId = body.meta_account_id ? String(body.meta_account_id).trim() : null;
    if (!googleAccountId) {
      return NextResponse.json({ error: "google_account_id é obrigatório." }, { status: 400 });
    }
    const sb = getServiceClient();
    const { data, error } = await sb.rpc("link_google_account_to_client", {
      p_google_account_id: googleAccountId,
      p_meta_account_id: metaAccountId,
    });
    if (error) throw error;
    return NextResponse.json({ account: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro ao vincular contas." }, { status: 500 });
  }
}
