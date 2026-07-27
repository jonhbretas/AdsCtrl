// Coleta unificada Meta + Google. Somente contas com hidden=false são chamadas.

import { NextResponse } from "next/server";
import {
  listAdAccountsAll, getRejectedAds, getDailyMetrics, DailyMetric,
  AccountInsight, mapAccountStatus, centsToUnit, availableBalance, tokenByIndex,
  isPrepaidAccount, unbilledAmount,
} from "@/lib/meta";
import {
  getGoogleDailyMetrics, googleAdsConfigured, googleCustomerId, GoogleDailyMetric,
} from "@/lib/google-ads";
import { buildAlertsForAccount, Alert } from "@/lib/alerts";
import { sendTaskDigest } from "@/lib/task-digest";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return fmtDate(d);
}

const PERIODS = [
  { period: "last_7d", startAgo: 7, endAgo: 1 },
  { period: "prev_7d", startAgo: 14, endAgo: 8 },
  { period: "last_14d", startAgo: 14, endAgo: 1 },
  { period: "prev_14d", startAgo: 28, endAgo: 15 },
  { period: "last_30d", startAgo: 30, endAgo: 1 },
  { period: "prev_30d", startAgo: 60, endAgo: 31 },
];

type UnifiedDaily = {
  date: string; spend: number; impressions: number; clicks: number;
  conversions: number; purchaseValue: number; results: Record<string, number>;
};

function aggregate(daily: UnifiedDaily[], since: string, until: string) {
  let spend = 0, impressions = 0, clicks = 0, conversions = 0, purchaseValue = 0;
  const results: Record<string, number> = {};
  for (const d of daily) {
    if (d.date < since || d.date > until) continue;
    spend += d.spend; impressions += d.impressions; clicks += d.clicks;
    conversions += d.conversions; purchaseValue += d.purchaseValue;
    for (const [slug, value] of Object.entries(d.results)) results[slug] = (results[slug] || 0) + value;
  }
  return {
    spend, impressions, clicks, conversions, purchaseValue, results,
    purchases: results.vendas || 0,
    ctr: impressions ? (clicks / impressions) * 100 : 0,
    cpc: clicks ? spend / clicks : 0,
  };
}

async function processInBatches<T>(
  items: T[],
  size: number,
  task: (item: T) => Promise<void>
) {
  for (let index = 0; index < items.length; index += size) {
    await Promise.all(items.slice(index, index + size).map(task));
  }
}

async function saveSnapshots(accountId: string, platform: "meta" | "google", daily: UnifiedDaily[]) {
  const sb = getServiceClient();
  // Histórico diário idempotente. Uma falha aqui invalida a coleta da conta:
  // o cockpit nunca deve confundir erro de persistência com ausência de gasto.
  if (daily.length) {
    const { error } = await sb.from("daily_account_metrics").upsert(
      daily.map((d) => ({
        account_id: accountId,
        metric_date: d.date,
        platform,
        spend: d.spend,
        impressions: d.impressions,
        clicks: d.clicks,
        conversions: d.conversions,
        conversion_value: d.purchaseValue,
        results: d.results,
        collected_at: new Date().toISOString(),
      })),
      { onConflict: "account_id,metric_date" }
    );
    if (error) throw new Error(`Falha ao persistir fatos diários de ${accountId}: ${error.message}`);
  }
  const aggByPeriod: Record<string, ReturnType<typeof aggregate>> = {};
  const snapshotRows: Record<string, any>[] = [];
  for (const period of PERIODS) {
    const since = daysAgo(period.startAgo);
    const until = daysAgo(period.endAgo);
    const value = aggregate(daily, since, until);
    aggByPeriod[period.period] = value;
    snapshotRows.push({
      account_id: accountId,
      period: period.period,
      spend: value.spend,
      impressions: value.impressions,
      clicks: value.clicks,
      ctr: value.ctr,
      cpc: value.cpc,
      conversions: value.conversions,
      purchases: value.purchases,
      purchase_value: value.purchaseValue,
      results: value.results,
      daily: ["last_7d", "last_14d", "last_30d"].includes(period.period)
        ? daily.filter((d) => d.date >= since && d.date <= until).map((d) => ({ date: d.date, spend: d.spend }))
        : null,
    });
  }
  const { error: snapshotsError } = await sb.from("metric_snapshots").insert(snapshotRows);
  if (snapshotsError) throw snapshotsError;
  return aggByPeriod;
}

function performanceAlerts(
  account: { account_id: string; name: string; currency: string; status: string },
  current: ReturnType<typeof aggregate>,
  previous: ReturnType<typeof aggregate>
): Alert[] {
  const alerts: Alert[] = [];
  if (account.status !== "ACTIVE") {
    alerts.push({
      account_id: account.account_id, account_name: account.name, level: "critical",
      type: "account_disabled", title: "Conta com problema de status",
      detail: `Status atual: ${account.status}.`,
    });
  }
  if (previous.spend > 0) {
    const drop = 1 - current.spend / previous.spend;
    if (drop >= 0.4) alerts.push({
      account_id: account.account_id, account_name: account.name, level: "warning",
      type: "spend_drop", title: `Queda de gasto de ${Math.round(drop * 100)}%`,
      detail: `De ${previous.spend.toFixed(2)} para ${current.spend.toFixed(2)} (${account.currency}).`,
    });
  }
  if (account.status === "ACTIVE" && current.spend === 0) alerts.push({
    account_id: account.account_id, account_name: account.name, level: "info",
    type: "no_spend", title: "Sem gasto nos últimos 7 dias",
    detail: "Conta ativa mas sem investimento no período.",
  });
  return alerts;
}

async function persistAlerts(allAlerts: Alert[], processedAccountIds: string[]) {
  const sb = getServiceClient();
  const now = new Date().toISOString();
  const current = allAlerts.map((alert) => ({
    fingerprint: `${alert.account_id}:${alert.type}`,
    account_id: alert.account_id, account_name: alert.account_name,
    level: alert.level, type: alert.type, title: alert.title, detail: alert.detail,
    resolved: false, resolved_at: null, last_seen_at: now,
  }));
  const fingerprints = current.map((item) => item.fingerprint);
  if (fingerprints.length) {
    await sb.from("alerts").update({ acknowledged: false, acknowledged_at: null })
      .eq("resolved", true).in("fingerprint", fingerprints);
    await sb.from("alerts").upsert(current, { onConflict: "fingerprint" });
  }
  if (!processedAccountIds.length) return;
  let query = sb.from("alerts").update({ resolved: true, resolved_at: now })
    .eq("resolved", false).in("account_id", processedAccountIds);
  if (fingerprints.length) {
    query = query.not("fingerprint", "in", `(${fingerprints.map((f) => `"${f}"`).join(",")})`);
  }
  await query;
}

// Alertas que exigem uma ação minha, não só ciência. Queda de gasto e "sem
// gasto" ficam de fora de propósito: viram tarefa todo dia numa conta pausada
// e o quadro deixa de ser lido. creative_issue (erro de veiculação) também
// fica de fora: não é infração de política e quase sempre se resolve sozinho
// — tarefa diária sobre ele seria choro de alerta falso.
const ACTIONABLE_ALERTS: Alert["type"][] = [
  "low_balance",
  "payment_issue",
  "account_disabled",
  "rejected_creative",
];

// Abre tarefa para o que precisa de mão. Enquanto o problema durar, a coleta
// reencontra o mesmo alerta todos os dias e isso continua sendo UMA tarefa.
//
// A primeira versão usava upsert com onConflict: "alert_fingerprint" e falhava
// sempre — o índice é parcial (where alert_fingerprint is not null) e o
// Postgres não consegue inferi-lo num ON CONFLICT (erro 42P10). O erro era
// engolido, então nenhuma tarefa automática nascia e nada denunciava.
//
// Agora: consulta o que já existe, insere só o que falta, uma por vez. São
// poucas linhas por coleta, e inserir individualmente impede que um conflito de
// corrida derrube o lote inteiro e leve as tarefas novas com ele.
async function openTasksForAlerts(allAlerts: Alert[]) {
  const actionable = allAlerts.filter((alert) => ACTIONABLE_ALERTS.includes(alert.type));
  if (!actionable.length) return;
  const sb = getServiceClient();
  const fingerprintOf = (alert: Alert) => `${alert.account_id}:${alert.type}`;

  try {
    // Tarefa concluída conta como existente: alerta que persiste não reabre o
    // que já foi resolvido por mim.
    const { data: existing, error } = await sb
      .from("tasks")
      .select("alert_fingerprint")
      .in("alert_fingerprint", actionable.map(fingerprintOf));
    if (error) return; // tabela ausente (migração não rodada) ou indisponível
    const known = new Set((existing || []).map((row: any) => row.alert_fingerprint));

    const today = new Date().toISOString().slice(0, 10);
    for (const alert of actionable) {
      const fingerprint = fingerprintOf(alert);
      if (known.has(fingerprint)) continue;
      const base = {
        title: `${alert.account_name}: ${alert.title}`,
        notes: alert.detail,
        status: "todo",
        priority: alert.level === "critical" ? "high" : "normal",
        // Prazo de hoje: um alerta que exige ação já está atrasado por
        // definição, e é o prazo que faz a tarefa entrar no lembrete diário.
        due_date: today,
        account_id: alert.account_id,
        source: "auto",
        alert_fingerprint: fingerprint,
      };
      // O tipo e os IDs são o que permite ao cartão abrir a tela do problema.
      const withContext = {
        ...base,
        alert_type: alert.type,
        context: alert.entities
          ? { ad_ids: alert.entities.adIds, ad_names: alert.entities.adNames }
          : null,
      };
      // Corrida com outra coleta: o índice único barra e está tudo bem. Se as
      // colunas novas ainda não existem (migração de projetos não rodada), a
      // tarefa nasce sem contexto em vez de não nascer.
      const insert = (row: Record<string, any>) =>
        sb.from("tasks").insert(row).then((result) => result.error?.message || "", () => "");
      const failure = await insert(withContext);
      if (failure && /alert_type|context/i.test(failure)) await insert(base);
    }
  } catch {
    // Tarefa é consequência da coleta, nunca condição dela.
  }
}

// Coletar uma plataforma só é seguro porque persistAlerts fecha alerta apenas
// das contas processadas nesta rodada: rodar só o Meta não resolve por engano
// nada do Google. O cron continua rodando as duas.
type CollectScope = "all" | "meta" | "google";

async function runCollect(triggerSource: "manual" | "cron", platform: CollectScope = "all") {
  const sb = getServiceClient();
  const started = Date.now();
  let accountQuery = sb
    .from("ad_accounts")
    .select("account_id, name, platform, currency, status, token_ref")
    .eq("hidden", false);
  if (platform !== "all") accountQuery = accountQuery.eq("platform", platform);
  const { data: selected, error } = await accountQuery;
  if (error) throw error;
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  await sb.from("collection_runs").update({
    status: "error",
    finished_at: new Date().toISOString(),
    error: "Execução interrompida ou excedeu o tempo limite.",
  }).eq("status", "running").lt("started_at", staleBefore);
  const { data: runRow } = await sb.from("collection_runs").insert({
    trigger_source: triggerSource,
    selected_accounts: (selected || []).length,
  }).select("id").maybeSingle();
  const runId = runRow?.id as number | undefined;

  try {
  const wanted = new Map((selected || []).map((row: any) => [row.account_id, row]));
  const alerts: Alert[] = [];
  const processedAccountIds: string[] = [];
  const failedAccountIds = new Set<string>();
  let failed = 0;
  let processed = 0;
  const windowSince = daysAgo(60);
  const windowUntil = daysAgo(1);

  // Meta: lista remota para obter status/dados financeiros, mas só busca
  // insights e anúncios das contas selecionadas.
  const selectedMeta = (selected || []).filter((account: any) => account.platform === "meta");
  const seenMeta = new Set<string>();
  let metaAccounts: Awaited<ReturnType<typeof listAdAccountsAll>> = [];
  let metaListError: string | null = null;
  try {
    metaAccounts = await listAdAccountsAll();
  } catch (e: any) {
    metaListError = e?.message || "Falha ao listar contas Meta.";
  }
  if (metaListError) {
    for (const local of selectedMeta) {
      failed++;
      failedAccountIds.add(local.account_id);
      if (runId) await sb.from("collection_account_runs").insert({
        run_id: runId, account_id: local.account_id, platform: "meta",
        status: "error", error: metaListError, finished_at: new Date().toISOString(),
      });
    }
  }
  await processInBatches(metaAccounts, 3, async ({ acc, tokenIndex }) => {
    const local = wanted.get(acc.account_id);
    if (!local || local.platform !== "meta") return;
    seenMeta.add(acc.account_id);
    const token = tokenByIndex(tokenIndex);
    const status = mapAccountStatus(acc.account_status);
    // Saldo só existe em conta pré-paga. Em conta de cartão/PayPal o que a
    // Meta chama de `balance` é fatura em aberto e vai em campo próprio.
    const base = {
      name: acc.name, currency: acc.currency,
      status, spend_cap: centsToUnit(acc.spend_cap),
      balance: availableBalance(acc),
      token_ref: tokenIndex, updated_at: new Date().toISOString(),
    };
    const { error: updateError } = await sb
      .from("ad_accounts")
      .update({ ...base, is_prepaid: isPrepaidAccount(acc), unbilled_amount: unbilledAmount(acc) })
      .eq("account_id", acc.account_id);
    // supabase-migration-balance.sql pode não ter sido rodada ainda: a coleta
    // diária não pode parar por causa de duas colunas novas.
    if (updateError && /is_prepaid|unbilled_amount/.test(updateError.message || "")) {
      await sb.from("ad_accounts").update(base).eq("account_id", acc.account_id);
    }
    const accountRun = runId ? await sb.from("collection_account_runs").insert({
      run_id: runId, account_id: acc.account_id, platform: "meta",
    }).select("id").maybeSingle() : { data: null as any };
    let daily: DailyMetric[];
    try {
      daily = await getDailyMetrics(acc.id, windowSince, windowUntil, token);
    } catch (e: any) {
      failed++;
      failedAccountIds.add(acc.account_id);
      if (accountRun.data?.id) await sb.from("collection_account_runs").update({
        status: "error", error: e?.message || "Falha Meta", finished_at: new Date().toISOString(),
      }).eq("id", accountRun.data.id);
      return; // erro não vira zero e não resolve alertas existentes
    }
    try {
      const rejected = await getRejectedAds(acc.id, token).catch(() => []);
      const periods = await saveSnapshots(acc.account_id, "meta", daily);
      const toInsight = (value: ReturnType<typeof aggregate>): AccountInsight => ({
        account_id: acc.account_id, spend: value.spend, impressions: value.impressions,
        clicks: value.clicks, ctr: value.ctr, cpc: value.cpc,
        conversions: value.conversions, purchases: value.purchases,
        purchaseValue: value.purchaseValue, results: value.results,
      });
      alerts.push(...buildAlertsForAccount({
        account: acc,
        insight7d: toInsight(periods.last_7d),
        insightPrev7d: toInsight(periods.prev_7d),
        rejected,
      }));
    } catch (e: any) {
      failed++;
      failedAccountIds.add(acc.account_id);
      if (accountRun.data?.id) await sb.from("collection_account_runs").update({
        status: "error", error: e?.message || "Falha ao persistir dados Meta", finished_at: new Date().toISOString(),
      }).eq("id", accountRun.data.id);
      return;
    }
    processed++;
    processedAccountIds.push(acc.account_id);
    if (accountRun.data?.id) await sb.from("collection_account_runs").update({
      status: "success", finished_at: new Date().toISOString(),
    }).eq("id", accountRun.data.id);
  });
  if (!metaListError) {
    for (const local of selectedMeta) {
      if (seenMeta.has(local.account_id)) continue;
      failed++;
      failedAccountIds.add(local.account_id);
      if (runId) await sb.from("collection_account_runs").insert({
        run_id: runId, account_id: local.account_id, platform: "meta",
        status: "error",
        error: "Conta Meta não retornada pelos tokens configurados.",
        finished_at: new Date().toISOString(),
      });
    }
  }

  // Google: as contas já estão no catálogo; não há chamada alguma para as ocultas.
  if (googleAdsConfigured()) {
    const selectedGoogle = (selected || []).filter((account: any) => account.platform === "google");
    await processInBatches(selectedGoogle, 3, async (local: any) => {
      const accountRun = runId ? await sb.from("collection_account_runs").insert({
        run_id: runId, account_id: local.account_id, platform: "google",
      }).select("id").maybeSingle() : { data: null as any };
      let raw: GoogleDailyMetric[];
      try {
        raw = await getGoogleDailyMetrics(googleCustomerId(local.account_id), windowSince, windowUntil);
      } catch (e: any) {
        failed++;
        failedAccountIds.add(local.account_id);
        if (accountRun.data?.id) await sb.from("collection_account_runs").update({
          status: "error", error: e?.message || "Falha Google", finished_at: new Date().toISOString(),
        }).eq("id", accountRun.data.id);
        return;
      }
      try {
        const daily: UnifiedDaily[] = raw.map((d) => ({
          date: d.date, spend: d.spend, impressions: d.impressions, clicks: d.clicks,
          conversions: d.conversions, purchaseValue: d.conversionValue, results: d.results,
        }));
        const periods = await saveSnapshots(local.account_id, "google", daily);
        alerts.push(...performanceAlerts(local, periods.last_7d, periods.prev_7d));
        await sb.from("ad_accounts").update({ updated_at: new Date().toISOString() }).eq("account_id", local.account_id);
      } catch (e: any) {
        failed++;
        failedAccountIds.add(local.account_id);
        if (accountRun.data?.id) await sb.from("collection_account_runs").update({
          status: "error", error: e?.message || "Falha ao persistir dados Google", finished_at: new Date().toISOString(),
        }).eq("id", accountRun.data.id);
        return;
      }
      processed++;
      processedAccountIds.push(local.account_id);
      if (accountRun.data?.id) await sb.from("collection_account_runs").update({
        status: "success", finished_at: new Date().toISOString(),
      }).eq("id", accountRun.data.id);
    });
  } else {
    for (const local of selected || []) {
      if (local.platform !== "google") continue;
      failed++;
      failedAccountIds.add(local.account_id);
      if (runId) await sb.from("collection_account_runs").insert({
        run_id: runId, account_id: local.account_id, platform: "google",
        status: "error", error: "Credenciais Google Ads não configuradas.",
        finished_at: new Date().toISOString(),
      });
    }
  }

  await persistAlerts(alerts, processedAccountIds);
  // O que exige ação minha vira tarefa no quadro, com o contexto pronto.
  await openTasksForAlerts(alerts);
  // …e o que está atrasado ou vence hoje vai atrás de mim por e-mail. Aqui e
  // não num cron próprio: o plano Hobby limita os crons, e este é o instante
  // certo — as tarefas automáticas do dia acabaram de nascer, logo acima.
  //
  // Vale também para a coleta manual, com uma trava de um envio por dia: se o
  // cron falhou de manhã, rodar a coleta na mão ainda cobra as pendências.
  const digest = await sendTaskDigest({ trigger: "auto" }).catch((error: any) => ({
    status: "error" as const,
    reason: error?.message || "falha ao enviar o lembrete",
  }));
  if (runId) await sb.from("collection_runs").update({
    finished_at: new Date().toISOString(),
    status: failed ? (processed ? "partial" : "error") : "success",
    processed_accounts: processed,
    failed_accounts: failed,
  }).eq("id", runId);
  return {
    ok: failed === 0,
    accounts: processed,
    failed,
    failed_account_ids: [...failedAccountIds],
    alerts: alerts.length,
    digest: { status: digest.status, reason: digest.reason },
    took_ms: Date.now() - started,
  };
  } catch (error: any) {
    if (runId) {
      await sb.from("collection_runs").update({
        finished_at: new Date().toISOString(),
        status: "error",
        error: error?.message || "Falha inesperada na coleta.",
      }).eq("id", runId);
    }
    throw error;
  }
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runCollect("cron"));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro na coleta." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const platform: CollectScope = ["meta", "google"].includes(body?.platform) ? body.platform : "all";
    return NextResponse.json({ ...(await runCollect("manual", platform)), platform });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro na coleta." }, { status: 500 });
  }
}
