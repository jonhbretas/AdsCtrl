// app/api/account/detail/route.ts
// Detalhe de uma conta buscado AO VIVO na Meta API (on-demand ao expandir a linha).
// Ex: /api/account/detail?account_id=act_123&since=2026-07-13&until=2026-07-20

import { NextResponse } from "next/server";
import { getAccountDetail } from "@/lib/meta";

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
    // aceita tanto "act_123" quanto "123"
    if (!actId.startsWith("act_")) actId = `act_${actId}`;

    const def = defaultRange();
    const since = searchParams.get("since") || def.since;
    const until = searchParams.get("until") || def.until;

    const detail = await getAccountDetail(actId, since, until);
    return NextResponse.json(detail);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao buscar detalhe." }, { status: 500 });
  }
}
