// app/api/collect/route.ts
// Rota de coleta. Chamada pelo Vercel Cron a cada 15-30 min.
// Percorre todas as contas do token, puxa insights, gera alertas e grava tudo.

import { NextResponse } from "next/server";
import {
  listAdAccounts,
  getRejectedAds,
  getDailyMetrics,
  DailyMetric,
  AccountInsight,
  mapAccountStatus,
  centsToUnit,
  availableBalance,
} from "@/lib/meta";
import { buildAlertsForAccount, Alert } from "@/lib/alerts";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // segundos (Vercel)

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

// Retorna a data (yyyy-mm-dd) "n" dias atrás em relação a hoje (UTC).
function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return fmtDate(d);
}

// Janelas SEMPRE terminam ONTEM (dia atual não conta, pois ainda é parcial).
// last_7d = [ontem-6 .. ontem], prev_7d = [ontem-13 .. ontem-7], e assim por diante.
// O nome do período deve casar com o que o front consome (last_7d/prev_7d/...).
const PERIODS: { period: string; startAgo: number; endAgo: number }[] = [
  { period: "last_7d", startAgo: 7, endAgo: 1 },
  { period: "prev_7d", startAgo: 14, endAgo: 8 },
  { period: "last_14d", startAgo: 14, endAgo: 1 },
  { period: "prev_14d", startAgo: 28, endAgo: 15 },
  { period: "last_30d", startAgo: 30, endAgo: 1 },
  { period: "prev_30d", startAgo: 60, endAgo: 31 },
];

// Agrega uma fatia da série diária dentro de [since, until] (inclusive).
function aggregate(daily: DailyMetric[], since: string, until: string) {
  let spend = 0, impressions = 0, clicks = 0, conversions = 0;
  for (const d of daily) {
    if (d.date >= since && d.date <= until) {
      spend += d.spend; impressions += d.impressions; clicks += d.clicks; conversions += d.conversions;
    }
  }
  return {
    spend, impressions, clicks, conversions,
    ctr: impressions ? (clicks / impressions) * 100 : 0,
    cpc: clicks ? spend / clicks : 0,
  };
}

export async function GET(req: Request) {
  // Proteção simples por secret (Vercel Cron manda esse header).
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  const started = Date.now();

  // Janela de coleta: 60 dias terminando ONTEM (cobre todos os períodos + os "anteriores").
  const windowSince = daysAgo(60);
  const windowUntil = daysAgo(1);

  try {
    const accounts = await listAdAccounts();
    const allAlerts: Alert[] = [];
    let processed = 0;

    for (const acc of accounts) {
      const status = mapAccountStatus(acc.account_status);
      // Pré-pago: saldo disponível vem do display_string; senão, campo balance.
      const balance = availableBalance(acc);
      const spendCap = centsToUnit(acc.spend_cap);

      // Upsert da conta (preserva group_id/hidden existentes via onConflict)
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

      // UMA chamada de série diária (60d) + reprovados. Os agregados por
      // período saem de fatias dessa série — bem menos chamadas à Meta.
      const [daily, rejected] = await Promise.all([
        getDailyMetrics(acc.id, windowSince, windowUntil).catch(() => [] as DailyMetric[]),
        getRejectedAds(acc.id).catch(() => []),
      ]);

      // Insere um snapshot por período (last_7d/prev_7d/last_14d/...).
      // "daily" (para o sparkline) vai no last_30d e no last_7d, best-effort.
      const aggByPeriod: Record<string, ReturnType<typeof aggregate>> = {};
      for (const p of PERIODS) {
        const since = daysAgo(p.startAgo);
        const until = daysAgo(p.endAgo);
        const a = aggregate(daily, since, until);
        aggByPeriod[p.period] = a;

        const { data: snap } = await supabase
          .from("metric_snapshots")
          .insert({
            account_id: acc.account_id,
            period: p.period,
            spend: a.spend,
            impressions: a.impressions,
            clicks: a.clicks,
            ctr: a.ctr,
            cpc: a.cpc,
            conversions: a.conversions,
          })
          .select("id")
          .single();

        // Guarda a série diária (só spend) nas janelas "atuais" p/ o sparkline.
        if (snap?.id && (p.period === "last_7d" || p.period === "last_14d" || p.period === "last_30d")) {
          const series = daily
            .filter((d) => d.date >= since && d.date <= until)
            .map((d) => ({ date: d.date, spend: d.spend }));
          if (series.length > 0) {
            await supabase.from("metric_snapshots").update({ daily: series }).eq("id", snap.id);
          }
        }
      }

      // Alertas usam o agregado de 7d vs os 7 dias anteriores.
      const a7 = aggByPeriod["last_7d"];
      const aPrev7 = aggByPeriod["prev_7d"];
      const toInsight = (a: typeof a7): AccountInsight => ({
        account_id: acc.account_id,
        spend: a.spend, impressions: a.impressions, clicks: a.clicks,
        ctr: a.ctr, cpc: a.cpc, conversions: a.conversions,
      });

      const accAlerts = buildAlertsForAccount({
        account: acc,
        insight7d: a7 ? toInsight(a7) : null,
        insightPrev7d: aPrev7 ? toInsight(aPrev7) : null,
        rejected,
      });
      allAlerts.push(...accAlerts);
      processed++;
    }

    // ----- Persistência de alertas: preserva "ciente" e mantém histórico -----
    const now = new Date().toISOString();
    const current = allAlerts.map((a) => ({
      fingerprint: `${a.account_id}:${a.type}`,
      account_id: a.account_id,
      account_name: a.account_name,
      level: a.level,
      type: a.type,
      title: a.title,
      detail: a.detail,
      resolved: false,
      resolved_at: null as string | null,
      last_seen_at: now,
    }));
    const fps = current.map((c) => c.fingerprint);

    // 1) Alertas que estavam resolvidos e voltaram a ocorrer: limpa o "ciente".
    if (fps.length > 0) {
      await supabase
        .from("alerts")
        .update({ acknowledged: false, acknowledged_at: null })
        .eq("resolved", true)
        .in("fingerprint", fps);
    }

    // 2) Upsert do estado atual. Não enviamos acknowledged/first_seen_at,
    //    então o Postgres preserva esses valores nas linhas já existentes.
    if (current.length > 0) {
      await supabase.from("alerts").upsert(current, { onConflict: "fingerprint" });
    }

    // 3) Alertas ativos que não estão mais presentes -> resolvidos (histórico).
    let resolveQuery = supabase
      .from("alerts")
      .update({ resolved: true, resolved_at: now })
      .eq("resolved", false);
    if (fps.length > 0) {
      resolveQuery = resolveQuery.not("fingerprint", "in", `(${fps.map((f) => `"${f}"`).join(",")})`);
    }
    await resolveQuery;

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
