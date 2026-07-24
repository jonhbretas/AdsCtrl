// app/api/account/detail/route.ts
// Detalhe ao vivo. A plataforma é resolvida pelo banco (fonte autoritativa).
// Ex: /api/account/detail?account_id=act_123&since=2026-07-13&until=2026-07-20

import { NextResponse } from "next/server";
import { getAccountDetail, tokenByIndex } from "@/lib/meta";
import { getGoogleAccountDetail } from "@/lib/google-ads";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function defaultRange() {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const until = new Date();
  const since = new Date();
  since.setDate(until.getDate() - 7);
  return { since: fmt(since), until: fmt(until) };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    let actId = (searchParams.get("account_id") || "").trim();
    if (!actId) return NextResponse.json({ error: "account_id é obrigatório." }, { status: 400 });
    const def = defaultRange();
    const since = searchParams.get("since") || def.since;
    const until = searchParams.get("until") || def.until;

    if (supabaseEnvMissing()) {
      return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    }
    const lookupId = actId.replace(/^act_/, "");
    const { data: account, error } = await getServiceClient()
      .from("ad_accounts")
      .select("platform,hidden,token_ref")
      .eq("account_id", lookupId)
      .maybeSingle();
    if (error) throw error;
    if (!account) {
      return NextResponse.json({ error: "Conta não encontrada no catálogo." }, { status: 404 });
    }
    if (account.hidden) {
      return NextResponse.json({ error: "Conta oculta. Reative-a antes de consultar dados." }, { status: 403 });
    }
    if (account.platform === "google") {
      return NextResponse.json(await getGoogleAccountDetail(actId, since, until));
    }
    // Meta aceita tanto "act_123" quanto "123".
    if (!actId.startsWith("act_")) actId = `act_${actId}`;
    const token = tokenByIndex(typeof account.token_ref === "number" ? account.token_ref : 0);
    const detail = await getAccountDetail(actId, since, until, token);
    return NextResponse.json(detail);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao buscar detalhe." }, { status: 500 });
  }
}
