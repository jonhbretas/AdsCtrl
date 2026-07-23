// app/api/account/detail/route.ts
// Detalhe de uma conta buscado AO VIVO na Meta API (on-demand ao expandir a linha).
// Ex: /api/account/detail?account_id=act_123&since=2026-07-13&until=2026-07-20

import { NextResponse } from "next/server";
import { getAccountDetail, tokenByIndex } from "@/lib/meta";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Descobre qual token (BM) enxerga a conta. Default 0 (token primário).
async function tokenRefFor(accountId: string): Promise<number> {
  if (supabaseEnvMissing()) return 0;
  try {
    const sb = getServiceClient();
    const bare = accountId.replace(/^act_/, "");
    const { data } = await sb.from("ad_accounts").select("token_ref").eq("account_id", bare).single();
    return typeof data?.token_ref === "number" ? data.token_ref : 0;
  } catch {
    return 0;
  }
}

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
    // aceita tanto "act_123" quanto "123"
    if (!actId.startsWith("act_")) actId = `act_${actId}`;

    const def = defaultRange();
    const since = searchParams.get("since") || def.since;
    const until = searchParams.get("until") || def.until;

    const token = tokenByIndex(await tokenRefFor(actId));
    const detail = await getAccountDetail(actId, since, until, token);
    return NextResponse.json(detail);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao buscar detalhe." }, { status: 500 });
  }
}
