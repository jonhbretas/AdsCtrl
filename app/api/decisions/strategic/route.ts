import { NextResponse } from "next/server";
import { getMetaCreativeLab } from "@/lib/meta-creatives";
import { tokenByIndex } from "@/lib/meta";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SIGNALS: Record<string, { title: (name: string) => string; impact: string }> = {
  possible_fatigue: { title: (name) => `Expandir público ou trocar o criativo ${name}`, impact: "Recuperar atenção" },
  click_to_landing_loss: { title: () => "Investigar discrepância entre clique e página de destino", impact: "Validar site e rastreamento" },
  landing_without_conversion: { title: () => "Revisar oferta, página ou checkout", impact: "Recuperar conversões" },
  clicks_without_messages: { title: () => "Revisar destino e fluxo de mensagens", impact: "Aumentar conversas qualificadas" },
  high_spend_no_conversion: { title: (name) => `Reduzir verba ou trocar o criativo ${name}`, impact: "Proteger investimento" },
  weak_hook: { title: (name) => `Criar nova abertura para o criativo ${name}`, impact: "Aumentar retenção inicial" },
  weak_retention: { title: (name) => `Testar nova narrativa no criativo ${name}`, impact: "Aumentar retenção" },
};

function isStrategic(code: string) { return Boolean(SIGNALS[code]); }

function totalResult(rows: any[], keys: string[]) {
  return rows.reduce((total, row) => total + keys.reduce((sum, key) => sum + Number(row.results?.[key] || 0), 0), 0);
}

function trendTotals(rows: any[]) {
  const impressions = rows.reduce((sum, row) => sum + Number(row.impressions || 0), 0);
  const clicks = rows.reduce((sum, row) => sum + Number(row.clicks || 0), 0);
  const conversions = rows.reduce((sum, row) => sum + Number(row.conversions || 0), 0);
  return { impressions, clicks, conversions, ctr: impressions ? clicks / impressions : 0, lpv: totalResult(rows, ["lpv", "landing_page_view"]), linkClicks: totalResult(rows, ["link_clicks", "link_click", "outbound_clicks", "outbound_click"]), checkout: totalResult(rows, ["checkout", "initiate_checkout", "add_to_cart", "add_payment_info"]) };
}

export async function POST() {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const sb = getServiceClient();
    const [{ data: accounts, error: accountsError }, { data: links, error: linksError }, { data: clients, error: clientsError }, { data: metrics, error: metricsError }] = await Promise.all([
      sb.from("ad_accounts").select("account_id,name,currency,token_ref").eq("platform", "meta").eq("hidden", false).eq("status", "ACTIVE").order("name"),
      sb.from("client_ad_accounts").select("client_id,account_id"),
      sb.from("clients").select("id,name,objective,result_family").eq("status", "active"),
      sb.from("daily_account_metrics").select("account_id,metric_date,impressions,clicks,conversions,results").gte("metric_date", new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)),
    ]);
    if (accountsError || linksError || clientsError || metricsError) throw accountsError || linksError || clientsError || metricsError;
    const clientByAccount = new Map((links || []).map((link: any) => [link.account_id, link.client_id]));
    const clientById = new Map((clients || []).map((client: any) => [client.id, client]));
    const metricsByAccount = new Map<string, any[]>();
    for (const row of metrics || []) metricsByAccount.set(row.account_id, [...(metricsByAccount.get(row.account_id) || []), row]);
    const rows: any[] = [];
    const errors: { account_id: string; account_name: string; error: string }[] = [];

    for (const account of accounts || []) {
      try {
        const clientId = clientByAccount.get(account.account_id) || null;
        const client = clientId ? clientById.get(clientId) : null;
        const accountMetrics = metricsByAccount.get(account.account_id) || [];
        const currentSince = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
        const previousSince = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
        const current = trendTotals(accountMetrics.filter((row) => row.metric_date >= currentSince));
        const previous = trendTotals(accountMetrics.filter((row) => row.metric_date < currentSince && row.metric_date >= previousSince));
        const basePayload = { source: "daily_trend", account_name: account.name, client_name: client?.name || null, current, previous };
        if (previous.impressions > 0 && current.impressions > 0 && current.ctr <= previous.ctr * 0.7) rows.push({ source_key: `strategic:${account.account_id}:ctr_drop`, client_id: clientId, account_id: account.account_id, action_type: "strategic_ctr_drop", title: "Queda brusca de CTR — verificar fadiga de criação", rationale: `O CTR caiu de ${(previous.ctr * 100).toFixed(2)}% para ${(current.ctr * 100).toFixed(2)}% nos últimos 7 dias. Verifique fadiga, mudança de público e atratividade da abertura.`, impact_label: "Recuperar atratividade", payload: basePayload, updated_at: new Date().toISOString() });
        if (previous.conversions > 0 && current.conversions <= previous.conversions * 0.65) rows.push({ source_key: `strategic:${account.account_id}:conversion_drop`, client_id: clientId, account_id: account.account_id, action_type: "strategic_conversion_drop", title: "Queda nas conversões — revisar oferta, página e tracking", rationale: `As conversões caíram de ${previous.conversions} para ${current.conversions}. Compare a entrega, a página de destino e o rastreamento antes de reduzir ou ampliar verba.`, impact_label: "Recuperar conversões", payload: basePayload, updated_at: new Date().toISOString() });
        if (previous.checkout > 0 && current.checkout <= previous.checkout * 0.65) rows.push({ source_key: `strategic:${account.account_id}:checkout_drop`, client_id: clientId, account_id: account.account_id, action_type: "strategic_checkout_drop", title: "Queda nas adições ao carrinho — revisar produto e checkout", rationale: `A etapa de checkout caiu de ${previous.checkout} para ${current.checkout}. Investigue preço, disponibilidade, carregamento e intenção do público.`, impact_label: "Recuperar intenção de compra", payload: basePayload, updated_at: new Date().toISOString() });
        if (current.linkClicks >= 10 && current.lpv / current.linkClicks < 0.6) rows.push({ source_key: `strategic:${account.account_id}:click_lpv_gap`, client_id: clientId, account_id: account.account_id, action_type: "strategic_click_lpv_gap", title: "Discrepância entre cliques e visualizações da página", rationale: `${current.linkClicks} cliques no link geraram apenas ${current.lpv} visualizações de página (${(current.lpv / current.linkClicks * 100).toFixed(1)}%). Pode haver problema no site, carregamento, redirecionamento ou pixel.`, impact_label: "Validar site e rastreamento", payload: basePayload, updated_at: new Date().toISOString() });
        const lab = await getMetaCreativeLab({
          accountId: account.account_id,
          accountName: account.name || account.account_id,
          currency: account.currency || "BRL",
          since: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
          until: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
          token: tokenByIndex(typeof account.token_ref === "number" ? account.token_ref : 0),
          configuredObjective: client?.objective,
          configuredResultFamily: client?.result_family,
        });
        const grouped = new Map<string, { code: string; creativeIds: string[]; creativeNames: string[]; details: string[]; evidence: string[] }>();
        for (const creative of lab.creatives) {
          const diagnoses = (creative.diagnostics || []).filter((diagnosis: any) => isStrategic(diagnosis.code) && ["critical", "warning"].includes(diagnosis.tone));
          for (const diagnosis of diagnoses) {
            const accountLevel = ["click_to_landing_loss", "landing_without_conversion", "clicks_without_messages"].includes(diagnosis.code);
            const key = accountLevel ? `${account.account_id}:${diagnosis.code}` : `${account.account_id}:${creative.adId}:${diagnosis.code}`;
            const current = grouped.get(key) || { code: diagnosis.code, creativeIds: [], creativeNames: [], details: [], evidence: [] };
            if (creative.adId) current.creativeIds.push(creative.adId);
            if (creative.adName) current.creativeNames.push(creative.adName);
            if (diagnosis.detail) current.details.push(diagnosis.detail);
            current.evidence.push(...(diagnosis.evidence || []));
            grouped.set(key, current);
          }
        }
        for (const signal of grouped.values()) {
          const preset = SIGNALS[signal.code];
          const creativeName = signal.creativeNames[0] || `da conta ${account.name || account.account_id}`;
          const uniqueDetails = [...new Set(signal.details)].slice(0, 2);
          const uniqueEvidence = [...new Set(signal.evidence)].slice(0, 4);
          rows.push({
            source_key: `strategic:${account.account_id}:${signal.code}:${signal.creativeIds[0] || "account"}`,
            client_id: clientId,
            account_id: account.account_id,
            action_type: `strategic_${signal.code}`,
            title: preset.title(creativeName),
            rationale: [...uniqueDetails, uniqueEvidence.length ? `Evidências: ${uniqueEvidence.join(" · ")}` : ""].filter(Boolean).join(" "),
            impact_label: preset.impact,
            payload: { source: "creative_lab", code: signal.code, creative_ids: [...new Set(signal.creativeIds)], creative_names: [...new Set(signal.creativeNames)], account_name: account.name, client_name: client?.name || null, summary: { frequency: lab.summary.frequency, ctr: lab.summary.ctr, link_ctr: lab.summary.linkCtr, landing_page_views: lab.summary.landingPageViews, conversions: lab.summary.conversions } },
            updated_at: new Date().toISOString(),
          });
        }
      } catch (error: any) {
        errors.push({ account_id: account.account_id, account_name: account.name || account.account_id, error: error?.message || "Falha ao analisar criativos." });
      }
    }
    if (rows.length) {
      const { error } = await sb.from("optimization_decisions").upsert(rows, { onConflict: "source_key", ignoreDuplicates: true });
      if (error) throw error;
    }
    return NextResponse.json({ created: rows.length, errors });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Falha ao gerar recomendações estratégicas." }, { status: 500 });
  }
}
