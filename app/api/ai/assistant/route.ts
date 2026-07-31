import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";
import { AI_NEEDS, AI_NEED_LABELS, askAiProvider, routeNeed, type AiNeed } from "@/lib/ai-router";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ChatMessage = { role: "user" | "assistant"; content: string };
type Totals = { spend: number; impressions: number; clicks: number; conversions: number; value: number };

const zero = (): Totals => ({ spend: 0, impressions: 0, clicks: 0, conversions: 0, value: 0 });
const iso = (date: Date) => date.toISOString().slice(0, 10);
const n = (value: unknown) => Number(value || 0);
const pct = (current: number, previous: number) => previous > 0 ? ((current - previous) / previous) * 100 : null;
const money = (value: number, currency = "BRL") => new Intl.NumberFormat("pt-BR", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);

function add(total: Totals, row: any) {
  total.spend += n(row.spend);
  total.impressions += n(row.impressions);
  total.clicks += n(row.clicks);
  total.conversions += n(row.conversions);
  total.value += n(row.conversion_value ?? row.purchase_value);
}

function metricSnapshot(total: Totals) {
  return {
    ...total,
    ctr: total.impressions ? (total.clicks / total.impressions) * 100 : 0,
    cpc: total.clicks ? total.spend / total.clicks : 0,
    cpa: total.conversions ? total.spend / total.conversions : null,
    roas: total.spend ? total.value / total.spend : null,
  };
}

async function buildContext(accountId?: string | null) {
  const sb = getServiceClient();
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const currentStart = new Date(yesterday);
  currentStart.setUTCDate(currentStart.getUTCDate() - 13);
  const previousEnd = new Date(currentStart);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - 13);

  const [{ data: accounts }, { data: links }, { data: clients }, { data: alerts }, factsResult, { data: collection }] = await Promise.all([
    sb.from("ad_accounts").select("*").order("name"),
    sb.from("client_ad_accounts").select("client_id,account_id,is_primary"),
    sb.from("clients").select("id,name,objective,result_family,primary_kpi,target_value,monthly_budget,currency,status").eq("status", "active"),
    sb.from("alerts").select("id,account_id,account_name,level,type,title,detail,last_seen_at").eq("resolved", false).eq("acknowledged", false).order("last_seen_at", { ascending: false }).limit(80),
    sb.from("daily_account_metrics").select("account_id,metric_date,spend,impressions,clicks,conversions,conversion_value").gte("metric_date", iso(previousStart)).lte("metric_date", iso(yesterday)),
    sb.from("collection_runs").select("status,finished_at,processed_accounts,failed_accounts").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const normalized = String(accountId || "").replace(/^act_/, "");
  const visibleAccounts = (accounts || []).filter((account: any) => !account.hidden);
  const accountById = new Map(visibleAccounts.map((account: any) => [account.account_id, account]));
  const selectedAccount = normalized ? visibleAccounts.find((account: any) => account.account_id === normalized || account.account_id === accountId) : null;
  const selectedIds = new Set<string>(selectedAccount ? [selectedAccount.account_id] : visibleAccounts.map((account: any) => account.account_id));
  const current = zero();
  const previous = zero();
  const currentByCurrency: Record<string, Totals> = {};
  const previousByCurrency: Record<string, Totals> = {};
  for (const row of factsResult.data || []) {
    if (!selectedIds.has(row.account_id)) continue;
    const rowCurrency = String((accountById.get(row.account_id) as any)?.currency || "BRL");
    if (row.metric_date >= iso(currentStart)) {
      add(current, row);
      add((currentByCurrency[rowCurrency] ||= zero()), row);
    } else {
      add(previous, row);
      add((previousByCurrency[rowCurrency] ||= zero()), row);
    }
  }

  const selectedLinks = (links || []).filter((link: any) => selectedIds.has(link.account_id));
  const clientIds = new Set(selectedLinks.map((link: any) => link.client_id));
  const scopedClients = (clients || []).filter((client: any) => clientIds.has(client.id));
  const scopedAlerts = (alerts || []).filter((alert: any) => selectedIds.has(alert.account_id));
  const levelOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  scopedAlerts.sort((a: any, b: any) => (levelOrder[a.level] ?? 9) - (levelOrder[b.level] ?? 9));
  const currency = selectedAccount?.currency || scopedClients[0]?.currency || "BRL";
  const currencies = [...new Set([...Object.keys(currentByCurrency), ...Object.keys(previousByCurrency)])];

  return {
    generated_at: new Date().toISOString(),
    period: { current: `${iso(currentStart)} a ${iso(yesterday)}`, previous: `${iso(previousStart)} a ${iso(previousEnd)}` },
    scope: selectedAccount
      ? { type: "account", account_id: selectedAccount.account_id, name: selectedAccount.name, platform: selectedAccount.platform, currency }
      : { type: "business", name: "Toda a operação", accounts: visibleAccounts.length, clients: (clients || []).length, currency, currencies, mixed_currencies: currencies.length > 1 },
    clients: scopedClients.map((client: any) => ({ name: client.name, objective: client.objective, result_family: client.result_family, primary_kpi: client.primary_kpi, target_value: client.target_value, monthly_budget: client.monthly_budget })),
    metrics: {
      current: metricSnapshot(current),
      previous: metricSnapshot(previous),
      by_currency: Object.fromEntries(currencies.map((code) => [code, { current: metricSnapshot(currentByCurrency[code] || zero()), previous: metricSnapshot(previousByCurrency[code] || zero()) }])),
    },
    changes: { spend: pct(current.spend, previous.spend), clicks: pct(current.clicks, previous.clicks), conversions: pct(current.conversions, previous.conversions), value: pct(current.value, previous.value) },
    alerts: scopedAlerts.slice(0, 12).map((alert: any) => ({ level: alert.level, type: alert.type, title: alert.title, detail: alert.detail, account: alert.account_name })),
    collection: collection || null,
    data_error: factsResult.error?.message || null,
  };
}

function internalAnalysis(context: any, question: string) {
  const current = context.metrics.current;
  const previous = context.metrics.previous;
  const changes = context.changes;
  const currency = context.scope.currency || "BRL";
  const scope = context.scope.name;
  const lines = [`Diagnóstico de ${scope} — últimos 14 dias:`];
  if (context.scope.mixed_currencies) {
    lines.push("• A operação possui moedas diferentes; valores monetários não foram somados entre si.");
    for (const [code, metrics] of Object.entries(context.metrics.by_currency) as [string, any][]) lines.push(`• ${code}: investimento ${money(metrics.current.spend, code)} · conversões ${metrics.current.conversions.toFixed(0)}${metrics.current.roas != null ? ` · ROAS ${metrics.current.roas.toFixed(2)}x` : ""}.`);
    lines.push(`• Indicadores não monetários consolidados: CTR ${current.ctr.toFixed(2)}% · ${current.conversions.toFixed(0)} conversões.`);
  } else {
    lines.push(`• Investimento: ${money(current.spend, currency)}${changes.spend == null ? "" : ` (${changes.spend >= 0 ? "+" : ""}${changes.spend.toFixed(1)}% vs. período anterior)`}.`);
    lines.push(`• CTR: ${current.ctr.toFixed(2)}% · CPC: ${money(current.cpc, currency)} · conversões: ${current.conversions.toFixed(0)}.`);
    if (current.cpa != null) lines.push(`• CPA: ${money(current.cpa, currency)}${previous.cpa ? ` · antes ${money(previous.cpa, currency)}` : ""}.`);
    if (current.roas != null) lines.push(`• ROAS observado: ${current.roas.toFixed(2)}x.`);
  }
  if (context.alerts.length) {
    lines.push(`\nPrioridade: ${context.alerts[0].title}. ${context.alerts[0].detail || ""}`.trim());
    if (context.alerts.length > 1) lines.push(`Há mais ${context.alerts.length - 1} alerta(s) ativo(s) neste contexto.`);
  } else if (!current.spend) {
    lines.push("\nNão há investimento coletado no período. Primeiro confirme a coleta e o vínculo da conta.");
  } else if (changes.conversions != null && changes.conversions < -20) {
    lines.push("\nA queda de conversões é o principal sinal. Revise a sequência anúncio → página → conversão antes de aumentar verba.");
  } else if (!context.scope.mixed_currencies && changes.spend != null && changes.spend > 15 && (changes.conversions == null || changes.conversions < changes.spend)) {
    lines.push("\nO investimento cresceu mais rápido que o resultado. Recomendo segurar escala e localizar campanhas ou criativos que diluíram a eficiência.");
  } else {
    lines.push("\nO quadro está estável. A melhor próxima análise é comparar campanhas e criativos para encontrar concentração de resultado e margem de escala.");
  }
  if (/criativ|fadiga|hook|copy/i.test(question)) lines.push("\nAbra o Laboratório de Criativos para validar frequência, hook, CTR de saída, retenção e conversão por anúncio.");
  lines.push("\nEsta é uma leitura automática dos dados coletados; nenhuma alteração foi aplicada nas plataformas.");
  return lines.join("\n");
}

export async function POST(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const body = await req.json().catch(() => null) as { message?: unknown; pathname?: unknown; account_id?: unknown; history?: unknown; need?: unknown } | null;
    const message = typeof body?.message === "string" ? body.message.trim().slice(0, 4000) : "";
    if (!message) return NextResponse.json({ error: "Escreva uma pergunta para a Assertivus IA." }, { status: 400 });
    const accountId = typeof body?.account_id === "string" ? body.account_id.trim().slice(0, 100) : null;
    const pathname = typeof body?.pathname === "string" ? body.pathname.slice(0, 160) : "/";
    const requestedNeed: AiNeed = AI_NEEDS.includes(body?.need as AiNeed) ? body!.need as AiNeed : "auto";
    const routed = routeNeed(requestedNeed, message, pathname);
    const history = Array.isArray(body?.history) ? (body!.history as ChatMessage[]).filter((item) => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string").slice(-6).map((item) => ({ role: item.role, content: item.content.slice(0, 2000) })) : [];
    const context = await buildContext(accountId);
    const fallback = internalAnalysis(context, message);
    const prompt = [
      "Você é a Assertivus IA, copiloto estratégico da Assertivus para gestão de tráfego pago.",
      "Responda em português do Brasil, de forma direta, com diagnóstico, evidências numéricas e próxima ação.",
      "Diferencie fato, hipótese e recomendação. Nunca afirme que executou uma mudança. Alterações exigem aprovação humana.",
      "Não invente métricas ausentes. A verba de mídia não é receita da agência.",
      `Tipo de necessidade escolhido: ${AI_NEED_LABELS[routed.need]}.`,
      `Tela atual: ${pathname}`,
      `Contexto operacional JSON: ${JSON.stringify(context)}`,
      history.length ? `Conversa recente: ${JSON.stringify(history)}` : "",
      `Pergunta: ${message}`,
    ].filter(Boolean).join("\n\n");

    const providerResult = await askAiProvider(prompt, routed.need);
    return NextResponse.json({
      answer: providerResult?.answer || fallback,
      mode: providerResult ? "ai" : "internal",
      warning: providerResult ? null : "Os provedores externos ficaram indisponíveis; usei o diagnóstico interno.",
      routing: { requested: requestedNeed, need: routed.need, label: AI_NEED_LABELS[routed.need], automatic: routed.automatic, provider: providerResult?.provider || "internal", model: providerResult?.model || "diagnóstico interno" },
      context: { scope: context.scope, generated_at: context.generated_at, alerts: context.alerts.length },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Falha ao gerar diagnóstico." }, { status: 500 });
  }
}
