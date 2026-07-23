// app/api/accounts/overview/route.ts
// Overview AO VIVO para períodos que não estão no cache (HOJE e intervalos
// personalizados). Busca spend + conversões de cada conta direto na Meta.
// Ex: /api/accounts/overview?since=2026-07-23&until=2026-07-23

import { NextResponse } from "next/server";
import { getAccountInsights, getDailySpend, tokenByIndex } from "@/lib/meta";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const fmt = (d: Date) => d.toISOString().slice(0, 10);

// Período imediatamente anterior, de mesma duração (para os deltas).
function previousRange(since: string, until: string) {
  const s = new Date(since + "T00:00:00Z");
  const u = new Date(until + "T00:00:00Z");
  const days = Math.max(1, Math.round((u.getTime() - s.getTime()) / 86400000) + 1);
  const prevUntil = new Date(s.getTime() - 86400000);
  const prevSince = new Date(prevUntil.getTime() - (days - 1) * 86400000);
  return { since: fmt(prevSince), until: fmt(prevUntil) };
}

// Executa "tasks" em lotes para não estourar rate limit da Meta.
async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    out.push(...(await Promise.all(batch.map(fn))));
  }
  return out;
}

export async function GET(req: Request) {
  try {
    if (supabaseEnvMissing()) {
      return NextResponse.json({ metrics: {}, prev: {}, error: "Supabase não configurado." }, { status: 200 });
    }
    const { searchParams } = new URL(req.url);
    const today = fmt(new Date());
    const since = searchParams.get("since") || today;
    const until = searchParams.get("until") || today;
    const prev = previousRange(since, until);

    const supabase = getServiceClient();
    const { data: accounts } = await supabase.from("ad_accounts").select("account_id, hidden, token_ref");
    // Não desperdiça chamada com contas ocultas.
    const rows = (accounts || []).filter((a: any) => !a.hidden);

    const metrics: Record<string, { spend: number; conversions: number; purchases: number; value: number; results: Record<string, number>; daily: { date: string; spend: number }[] }> = {};
    const prevMetrics: Record<string, { spend: number; conversions: number; purchases: number; value: number; results: Record<string, number> }> = {};

    await inBatches(rows, 8, async (row: any) => {
      const id = row.account_id as string;
      const token = tokenByIndex(typeof row.token_ref === "number" ? row.token_ref : 0);
      const actId = id.startsWith("act_") ? id : `act_${id}`;
      const [cur, before, daily] = await Promise.all([
        getAccountInsights(actId, { since, until }, token).catch(() => null),
        getAccountInsights(actId, { since: prev.since, until: prev.until }, token).catch(() => null),
        getDailySpend(actId, since, until, token).catch(() => []),
      ]);
      metrics[id] = {
        spend: cur?.spend || 0, conversions: cur?.conversions || 0,
        purchases: cur?.purchases || 0, value: cur?.purchaseValue || 0,
        results: cur?.results || {}, daily,
      };
      prevMetrics[id] = {
        spend: before?.spend || 0, conversions: before?.conversions || 0,
        purchases: before?.purchases || 0, value: before?.purchaseValue || 0,
        results: before?.results || {},
      };
    });

    return NextResponse.json({ range: { since, until }, prevRange: prev, metrics, prev: prevMetrics });
  } catch (e: any) {
    return NextResponse.json({ metrics: {}, prev: {}, error: e?.message ?? "Erro no overview ao vivo." }, { status: 500 });
  }
}
