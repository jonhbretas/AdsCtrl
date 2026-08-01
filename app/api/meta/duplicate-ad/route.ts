// app/api/meta/duplicate-ad/route.ts
// Duplica um ANÚNCIO dentro da mesma conta e do mesmo conjunto (cópia nasce
// PAUSADA, com sufixo no nome). Usada pela tela de campanhas.
// Guardas: sessão (middleware), conta no catálogo, Meta, não oculta, e o
// anúncio tem de pertencer à conta informada (o conjunto é o próprio do
// anúncio — o servidor o descobre, nunca confia no cliente).

import { NextResponse } from "next/server";
import { duplicateAdInAccount, tokenByIndex } from "@/lib/meta";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const body = await req.json().catch(() => ({}));
    const accountId = String(body.account_id || "").trim();
    const adId = String(body.ad_id || "").trim();
    const nameSuffix = typeof body.name_suffix === "string" ? body.name_suffix.trim().slice(0, 80) : "";

    if (!accountId || !adId) {
      return NextResponse.json({ error: "account_id e ad_id são obrigatórios." }, { status: 400 });
    }
    if (!/^\d+$/.test(adId)) {
      return NextResponse.json({ error: "Identificador inválido." }, { status: 400 });
    }

    const lookupId = accountId.replace(/^act_/, "");
    const { data: account, error } = await getServiceClient()
      .from("ad_accounts")
      .select("platform,hidden,token_ref,name")
      .eq("account_id", lookupId)
      .maybeSingle();
    if (error) throw error;
    if (!account) return NextResponse.json({ error: "Conta não encontrada no catálogo." }, { status: 404 });
    if (account.hidden) return NextResponse.json({ error: "Conta oculta. Reative-a antes." }, { status: 403 });
    if (account.platform === "google") return NextResponse.json({ error: "Duplicar anúncio só existe na Meta." }, { status: 501 });

    const token = tokenByIndex(typeof account.token_ref === "number" ? account.token_ref : 0);
    const actId = lookupId.startsWith("act_") ? lookupId : `act_${lookupId}`;
    const result = await duplicateAdInAccount({ accountId: actId, adId, nameSuffix }, token);
    return NextResponse.json({ ok: true, account: account.name || lookupId, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Falha ao duplicar o anúncio." }, { status: 500 });
  }
}
