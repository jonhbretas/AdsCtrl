// app/api/collect/route.ts
// Rota de coleta. Chamada pelo Vercel Cron a cada 15-30 min.
// Percorre todas as contas do token, puxa insights, gera alertas e grava tudo.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  listAdAccounts,
  getAccountInsights,
  getRejectedAds,
  mapAccountStatus,
  centsToUnit,
} from "@/lib/meta";
import { buildAlertsForAccount, Alert } from "@/lib/alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // segundos (Vercel)

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // service role: só no servidor
  );
}

// Datas: últimos 7 dias e os 7 anteriores (para comparar quedas)
function dateRanges() {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date();
  const d7 = new Date(today);
  d7.setDate(today.getDate() - 7);
  const d14 = new Date(today);
  d14.setDate(today.getDate() - 14);
  return {
    last7: { since: fmt(d7), until: fmt(today) },
    prev7: { since: fmt(d14), until: fmt(d7) },
  };
}

export async function GET(req: Request) {
  // Proteção simples por secret (Vercel Cron manda esse header).
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const { last7, prev7 } = dateRanges();
  const started = Date.now();

  try {
    const accounts = await listAdAccounts();
    const allAlerts: Alert[] = [];
    let processed = 0;

    // Limpa alertas antigos (regeramos a cada coleta)
    await supabase.from("alerts").delete().neq("id", 0);

    for (const acc of accounts) {
      const status = mapAccountStatus(acc.account_status);
      const balance = centsToUnit(acc.balance);
      const spendCap = centsToUnit(acc.spend_cap);

      // Upsert da conta (preserva group_id existente via onConflict)
      await supabase.from("ad_accounts").upsert(
        {
          account_id: acc.account_id,
          name: acc.name,
          platform: "meta",
          currency: acc.currency,
          status,
          balance,
          spend_cap: spendCap,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "account_id", ignoreDuplicates: false }
      );

      // Insights dos dois períodos + reprovados (em paralelo)
      const [ins7, insPrev, rejected] = await Promise.all([
        getAccountInsights(acc.id, last7).catch(() => null),
        getAccountInsights(acc.id, prev7).catch(() => null),
        getRejectedAds(acc.id).catch(() => []),
      ]);

      if (ins7) {
        await supabase.from("metric_snapshots").insert({
          account_id: acc.account_id,
          period: "last_7d",
          spend: ins7.spend,
          impressions: ins7.impressions,
          clicks: ins7.clicks,
          ctr: ins7.ctr,
          cpc: ins7.cpc,
          conversions: ins7.conversions,
        });
      }

      const accAlerts = buildAlertsForAccount({
        account: acc,
        insight7d: ins7,
        insightPrev7d: insPrev,
        rejected,
      });
      allAlerts.push(...accAlerts);
      processed++;
    }

    if (allAlerts.length > 0) {
      await supabase.from("alerts").insert(
        allAlerts.map((a) => ({
          account_id: a.account_id,
          account_name: a.account_name,
          level: a.level,
          type: a.type,
          title: a.title,
          detail: a.detail,
        }))
      );
    }

    return NextResponse.json({
      ok: true,
      accounts: processed,
      alerts: allAlerts.length,
      took_ms: Date.now() - started,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
