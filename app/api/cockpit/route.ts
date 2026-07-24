import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const RESULT_BY_OBJECTIVE: Record<string, string> = {
  sales: "vendas",
  leads: "leads",
  traffic: "cliques",
  engagement: "engajamento",
};
const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return iso(d);
};

function reportingDate(now: Date, timezone: string): Date {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const localToday = new Date(Date.UTC(value("year"), value("month") - 1, value("day")));
    localToday.setUTCDate(localToday.getUTCDate() - 1);
    return localToday;
  } catch {
    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    return yesterday;
  }
}

function offsetDate(date: Date, days: number): string {
  const shifted = new Date(date);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return iso(shifted);
}

function budgetCycle(through: Date, requestedStartDay: number) {
  const startDay = Math.min(28, Math.max(1, Number(requestedStartDay) || 1));
  let year = through.getUTCFullYear();
  let month = through.getUTCMonth();
  if (through.getUTCDate() < startDay) {
    month--;
    if (month < 0) { month = 11; year--; }
  }
  const start = new Date(Date.UTC(year, month, startDay));
  const nextStart = new Date(Date.UTC(year, month + 1, startDay));
  const end = new Date(nextStart);
  end.setUTCDate(end.getUTCDate() - 1);
  const totalDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const elapsedDays = Math.round((through.getTime() - start.getTime()) / 86_400_000) + 1;
  return { start: iso(start), end: iso(end), totalDays, elapsedDays };
}

export async function GET() {
  try {
    const sb = getServiceClient();
    const now = new Date();
    const since = daysAgo(40);

    const [
      { data: clients, error: clientsError },
      { data: links, error: linksError },
      { data: accounts, error: accountsError },
      { data: facts, error: factsError },
      { data: accountRuns, error: accountRunsError },
      { data: alerts },
      { data: lastRun },
    ] = await Promise.all([
      sb.from("clients").select("*").eq("status", "active").order("name"),
      sb.from("client_ad_accounts").select("*"),
      sb.from("ad_accounts").select("account_id,name,platform,status,hidden,currency,updated_at"),
      sb.from("daily_account_metrics").select("*").gte("metric_date", since).order("metric_date"),
      sb.from("collection_account_runs").select("account_id,status,finished_at").eq("status", "success").order("finished_at", { ascending: false }).limit(5000),
      sb.from("alerts").select("*").eq("resolved", false).eq("acknowledged", false),
      sb.from("collection_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (clientsError) throw clientsError;
    if (linksError) throw linksError;
    if (accountsError) throw accountsError;
    if (factsError) throw factsError;
    if (accountRunsError) throw accountRunsError;

    const accountById = new Map((accounts || []).map((a: any) => [a.account_id, a]));
    const factsByAccount = new Map<string, any[]>();
    for (const fact of facts || []) {
      const list = factsByAccount.get(fact.account_id) || [];
      list.push(fact);
      factsByAccount.set(fact.account_id, list);
    }
    const lastSuccessByAccount = new Map<string, string>();
    for (const run of accountRuns || []) {
      if (run.account_id && run.finished_at && !lastSuccessByAccount.has(run.account_id)) {
        lastSuccessByAccount.set(run.account_id, run.finished_at);
      }
    }

    const enriched = (clients || []).map((client: any) => {
      const clientLinks = (links || []).filter((link: any) => link.client_id === client.id);
      const clientAccounts = clientLinks
        .map((link: any) => ({ ...accountById.get(link.account_id), is_primary: link.is_primary }))
        .filter((a: any) => a.account_id);
      const visibleAccounts = clientAccounts.filter((account: any) => !account.hidden);
      const accountIds = new Set(visibleAccounts.map((a: any) => a.account_id));
      const clientFacts = [...accountIds].flatMap((id: string) => factsByAccount.get(id) || []);
      const currencies = [...new Set([
        client.currency || "BRL",
        ...visibleAccounts.map((account: any) => account.currency || client.currency || "BRL"),
      ])];
      const mixedCurrencies = currencies.length > 1;
      const through = reportingDate(now, client.timezone);
      const throughDate = iso(through);
      const cycle = budgetCycle(through, client.budget_start_day);
      const resultFamily = client.result_family
        || RESULT_BY_OBJECTIVE[String(client.objective || "")]
        || "conversoes";
      const sum = (rows: any[]) => rows.reduce((out, row) => ({
        spend: out.spend + Number(row.spend || 0),
        impressions: out.impressions + Number(row.impressions || 0),
        clicks: out.clicks + Number(row.clicks || 0),
        conversions: out.conversions + Number(
          resultFamily === "conversoes"
            ? row.results?.conversoes ?? row.conversions ?? 0
            : row.results?.[resultFamily] ?? 0
        ),
        value: out.value + Number(row.conversion_value || 0),
      }), { spend: 0, impressions: 0, clicks: 0, conversions: 0, value: 0 });
      const mtd = sum(clientFacts.filter((f: any) => f.metric_date >= cycle.start && f.metric_date <= throughDate));
      const last7 = sum(clientFacts.filter((f: any) => f.metric_date >= offsetDate(through, -6) && f.metric_date <= throughDate));
      const prev7 = sum(clientFacts.filter((f: any) => f.metric_date >= offsetDate(through, -13) && f.metric_date <= offsetDate(through, -7)));
      const mtdByCurrency: Record<string, { spend: number; conversions: number; value: number }> = {};
      for (const account of visibleAccounts) {
        const currency = account.currency || client.currency || "BRL";
        const accountMtd = sum((factsByAccount.get(account.account_id) || [])
          .filter((fact: any) => fact.metric_date >= cycle.start && fact.metric_date <= throughDate));
        const bucket = (mtdByCurrency[currency] ||= { spend: 0, conversions: 0, value: 0 });
        bucket.spend += accountMtd.spend;
        bucket.conversions += accountMtd.conversions;
        bucket.value += accountMtd.value;
      }
      const budget = Number(client.monthly_budget || 0);
      const expected = budget ? budget * (cycle.elapsedDays / cycle.totalDays) : 0;
      const forecast = !mixedCurrencies && mtd.spend && cycle.elapsedDays
        ? (mtd.spend / cycle.elapsedDays) * cycle.totalDays
        : 0;
      const kpiType = String(client.primary_kpi || "").toLowerCase();
      const kpiValue =
        kpiType === "roas" ? (mtd.spend ? mtd.value / mtd.spend : 0)
        : kpiType === "conversions" ? mtd.conversions
        : kpiType === "revenue" ? mtd.value
        : kpiType === "ctr" ? (mtd.impressions ? (mtd.clicks / mtd.impressions) * 100 : 0)
        : kpiType === "cpc" ? (mtd.clicks ? mtd.spend / mtd.clicks : 0)
        : kpiType === "cpm" ? (mtd.impressions ? (mtd.spend / mtd.impressions) * 1000 : 0)
        : (mtd.conversions ? mtd.spend / mtd.conversions : 0);
      const successTimes = visibleAccounts
        .map((account: any) => lastSuccessByAccount.get(account.account_id))
        .filter((value: string | undefined): value is string => Boolean(value))
        .map((value: string) => new Date(value).getTime());
      const missingCollections = Math.max(visibleAccounts.length - successTimes.length, 0);
      const lastUpdated = successTimes.length && !missingCollections
        ? new Date(Math.min(...successTimes)).toISOString()
        : null;
      const ageHours = lastUpdated ? (Date.now() - new Date(lastUpdated).getTime()) / 36e5 : null;
      const clientAlerts = (alerts || []).filter((a: any) => accountIds.has(a.account_id));
      const priorities: any[] = [];
      for (const alert of clientAlerts) {
        priorities.push({
          type: `platform:${alert.type}`,
          level: alert.level || "warning",
          title: alert.title,
          detail: alert.detail,
          impact: null,
          alert_id: alert.id,
        });
      }
      if (mixedCurrencies) priorities.push({
        type: "configuration", level: "critical", title: "Moedas incompatíveis",
        detail: `As contas visíveis usam ${currencies.join(" + ")}. Separe-as por cliente ou padronize a moeda antes de avaliar custo e ROAS.`,
        impact: null,
      });
      if (!clientFacts.length && !missingCollections) priorities.push({
        type: "delivery", level: "info", title: "Sem entrega no ciclo",
        detail: "A coleta concluiu normalmente, mas as plataformas não retornaram investimento no período.", impact: null,
      });
      if (missingCollections) priorities.push({
        type: "data", level: "warning", title: "Conta sem coleta concluída",
        detail: `${missingCollections} de ${visibleAccounts.length} conta(s) visível(is) ainda não têm uma coleta bem-sucedida.`, impact: null,
      });
      if (ageHours != null && ageHours > 36) priorities.push({
        type: "data", level: "critical", title: "Dados desatualizados",
        detail: `Última atualização há ${Math.floor(ageHours)}h.`, impact: null,
      });
      if (!mixedCurrencies && budget && forecast > budget * 1.1) priorities.push({
        type: "pacing", level: "critical", title: "Projeção acima do orçamento",
        detail: `Previsão de ${forecast.toFixed(0)} para orçamento de ${budget.toFixed(0)}.`,
        impact: forecast - budget,
      });
      if (!mixedCurrencies && budget && cycle.elapsedDays >= 5 && mtd.spend < expected * 0.85) priorities.push({
        type: "pacing", level: "warning", title: "Investimento abaixo do ritmo",
        detail: `${Math.round((mtd.spend / Math.max(expected, 1)) * 100)}% do gasto esperado até hoje.`,
        impact: expected - mtd.spend,
      });
      const target = Number(client.target_value || 0);
      const kpiUsesMoney = ["roas", "revenue", "cpc", "cpm", "cpa", "cpl", "custom"].includes(kpiType);
      if (target && mtd.spend > 0 && !(mixedCurrencies && kpiUsesMoney)) {
        const higherIsBetter = ["roas", "conversions", "revenue", "ctr"].includes(kpiType);
        const isBad = higherIsBetter ? kpiValue < target * 0.85 : kpiValue > target * 1.2;
        if (isBad && (mtd.conversions >= 3 || mtd.spend >= target * 2)) priorities.push({
          type: "performance", level: "warning",
          title: `${(client.primary_kpi || "KPI").toUpperCase()} fora da meta`,
          detail: `Atual ${kpiValue.toFixed(2)} · meta ${target.toFixed(2)}.`,
          impact: null,
        });
      }
      return {
        ...client,
        result_family: resultFamily,
        accounts: clientAccounts,
        metrics: { mtd, last7, prev7, kpiValue, mtdByCurrency },
        pacing: {
          budget, expected, forecast,
          percentOfExpected: !mixedCurrencies && expected ? (mtd.spend / expected) * 100 : null,
          percentOfBudget: !mixedCurrencies && budget ? (mtd.spend / budget) * 100 : null,
          dailyAdjustment: !mixedCurrencies && budget ? (budget - mtd.spend) / Math.max(cycle.totalDays - cycle.elapsedDays, 1) : null,
          cycleStart: cycle.start,
          cycleEnd: cycle.end,
          dataThrough: throughDate,
        },
        lastUpdated,
        dataStatus: missingCollections || ageHours == null ? "empty" : ageHours > 36 ? "stale" : "fresh",
        mixedCurrencies,
        alerts: clientAlerts,
        priorities,
      };
    });

    const priorities = enriched.flatMap((client: any) =>
      client.priorities.map((priority: any) => ({ ...priority, client_id: client.id, client_name: client.name, client_currency: client.currency }))
    ).sort((a: any, b: any) => {
      const order: Record<string, number> = { critical: 0, warning: 1, info: 2 };
      return order[a.level] - order[b.level] || Number(b.impact || 0) - Number(a.impact || 0);
    });
    const byCurrency: Record<string, { spend: number; budget: number }> = {};
    const summary = enriched.reduce((out: any, client: any) => {
      out.spend += client.metrics.mtd.spend;
      out.budget += client.pacing.budget;
      out.conversions += client.metrics.mtd.conversions;
      out.value += client.metrics.mtd.value;
      for (const [currency, values] of Object.entries(client.metrics.mtdByCurrency) as [string, { spend: number }][]) {
        const bucket = (byCurrency[currency] ||= { spend: 0, budget: 0 });
        bucket.spend += values.spend;
      }
      const budgetBucket = (byCurrency[client.currency] ||= { spend: 0, budget: 0 });
      budgetBucket.budget += client.pacing.budget;
      return out;
    }, { spend: 0, budget: 0, conversions: 0, value: 0 });
    summary.byCurrency = byCurrency;
    summary.mixedCurrencies = Object.keys(byCurrency).length > 1;
    summary.currency = Object.keys(byCurrency).length === 1 ? Object.keys(byCurrency)[0] : null;

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      data_through: daysAgo(1),
      summary,
      priorities,
      clients: enriched,
      last_collection: lastRun || null,
    });
  } catch (e: any) {
    return NextResponse.json({
      error: e?.message || "Erro ao montar o cockpit.",
      migration_required: /clients|daily_account_metrics|collection_runs|schema cache/i.test(e?.message || ""),
    }, { status: 500 });
  }
}
