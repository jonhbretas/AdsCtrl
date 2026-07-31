import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type StageDefinition = { key: string; label: string; resultKeys?: string[] };

const OBJECTIVE_CONFIG: Record<string, { label: string; stages: StageDefinition[] }> = {
  awareness: { label: "Brand / Reconhecimento", stages: [
    { key: "impressions", label: "Impressões" }, { key: "reach", label: "Alcance", resultKeys: ["reach"] }, { key: "video_views", label: "Visualizações", resultKeys: ["video_view", "video_views", "thruplay"] }, { key: "engagement", label: "Engajamentos", resultKeys: ["post_engagement", "engagement", "engajamento"] },
  ] },
  traffic: { label: "Tráfego", stages: [
    { key: "impressions", label: "Impressões" }, { key: "clicks", label: "Cliques" }, { key: "lpv", label: "Visitas à página", resultKeys: ["lpv", "landing_page_view"] },
  ] },
  engagement: { label: "Engajamento", stages: [
    { key: "impressions", label: "Impressões" }, { key: "engagement", label: "Engajamentos", resultKeys: ["post_engagement", "engagement", "engajamento"] }, { key: "clicks", label: "Cliques" },
  ] },
  leads: { label: "Leads", stages: [
    { key: "impressions", label: "Impressões" }, { key: "clicks", label: "Cliques" }, { key: "lpv", label: "Visitas à página", resultKeys: ["lpv", "landing_page_view"] }, { key: "leads", label: "Leads", resultKeys: ["leads", "lead"] },
  ] },
  messages: { label: "Mensagens", stages: [
    { key: "impressions", label: "Impressões" }, { key: "clicks", label: "Cliques" }, { key: "messages", label: "Conversas", resultKeys: ["messages", "messaging_conversations_started", "conversas"] }, { key: "leads", label: "Leads", resultKeys: ["leads", "lead"] },
  ] },
  profile: { label: "Crescimento de perfil", stages: [
    { key: "impressions", label: "Impressões" }, { key: "profile_visits", label: "Visitas ao perfil", resultKeys: ["profile_visit", "profile_visits", "instagram_profile_visit"] }, { key: "engagement", label: "Engajamentos", resultKeys: ["post_engagement", "engagement", "engajamento"] }, { key: "followers", label: "Novos seguidores", resultKeys: ["follows", "followers", "profile_follow"] },
  ] },
  sales: { label: "Vendas", stages: [
    { key: "impressions", label: "Impressões" }, { key: "clicks", label: "Cliques" }, { key: "lpv", label: "Visitas à página", resultKeys: ["lpv", "landing_page_view"] }, { key: "checkout", label: "Checkout", resultKeys: ["checkout", "initiate_checkout"] }, { key: "purchases", label: "Compras", resultKeys: ["vendas", "purchase"] }, { key: "value", label: "Valor vendido" },
  ] },
  app: { label: "Aplicativo", stages: [
    { key: "impressions", label: "Impressões" }, { key: "clicks", label: "Cliques" }, { key: "installs", label: "Instalações", resultKeys: ["app_install", "app_installs", "mobile_app_install", "installs"] }, { key: "registrations", label: "Cadastros", resultKeys: ["complete_registration", "registration", "cadastros"] },
  ] },
  other: { label: "Outro", stages: [
    { key: "impressions", label: "Impressões" }, { key: "clicks", label: "Cliques" }, { key: "conversions", label: "Conversões" },
  ] },
};

const RESULT_FAMILY_OBJECTIVE: Record<string, string> = { leads: "leads", mensagens: "messages", vendas: "sales", conversoes: "leads", cliques: "traffic", lpv: "traffic", engajamento: "engagement" };
const fallbackName = (value: unknown, id: string, prefix: string) => String(value || "").trim() || `${prefix} · ${id}`;

function resultSum(results: Record<string, unknown>, keys: string[]) {
  return keys.reduce((total, key) => total + Number(results?.[key] || 0), 0);
}

function valueForStage(stage: StageDefinition, item: any) {
  if (stage.key === "value") return item.value || 0;
  if (stage.key === "impressions" || stage.key === "clicks" || stage.key === "conversions") return item[stage.key] || 0;
  return resultSum(item.results || {}, stage.resultKeys || []);
}

export async function GET(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ clients: [], objective_options: [], error: "Supabase não configurado." }, { status: 503 });
    const requestedPeriod = Number(new URL(req.url).searchParams.get("period") || 7);
    const period = [7, 14, 30].includes(requestedPeriod) ? requestedPeriod : 7;
    const since = new Date(Date.now() - period * 86400000).toISOString().slice(0, 10);
    const sb = getServiceClient();
    const [{ data: clients, error: clientsError }, { data: links, error: linksError }, { data: accounts, error: accountsError }, { data: rows, error: rowsError }] = await Promise.all([
      sb.from("clients").select("id,name,objective,result_family").eq("status", "active").order("name"),
      sb.from("client_ad_accounts").select("client_id,account_id"),
      sb.from("ad_accounts").select("account_id,name,platform"),
      sb.from("daily_account_metrics").select("account_id,impressions,clicks,conversions,conversion_value,results").gte("metric_date", since),
    ]);
    if (clientsError || linksError || accountsError || rowsError) throw clientsError || linksError || accountsError || rowsError;

    const accountById = new Map((accounts || []).map((account: any) => [account.account_id, account]));
    const byAccount = new Map<string, any>();
    for (const row of rows || []) {
      const item = byAccount.get(row.account_id) || { impressions: 0, clicks: 0, conversions: 0, value: 0, results: {} };
      item.impressions += Number(row.impressions || 0); item.clicks += Number(row.clicks || 0); item.conversions += Number(row.conversions || 0); item.value += Number(row.conversion_value || 0);
      for (const [key, value] of Object.entries(row.results || {})) item.results[key] = (item.results[key] || 0) + Number(value || 0);
      byAccount.set(row.account_id, item);
    }
    const result = (clients || []).map((client: any) => {
      const clientLinks = (links || []).filter((link: any) => link.client_id === client.id);
      const objective = OBJECTIVE_CONFIG[client.objective] ? client.objective : RESULT_FAMILY_OBJECTIVE[client.result_family] || "other";
      const config = OBJECTIVE_CONFIG[objective];
      const aggregate = clientLinks.reduce((sum: any, link: any) => {
        const item = byAccount.get(link.account_id) || { impressions: 0, clicks: 0, conversions: 0, value: 0, results: {} };
        sum.impressions += item.impressions; sum.clicks += item.clicks; sum.conversions += item.conversions; sum.value += item.value;
        for (const [key, value] of Object.entries(item.results || {})) sum.results[key] = (sum.results[key] || 0) + Number(value || 0);
        return sum;
      }, { impressions: 0, clicks: 0, conversions: 0, value: 0, results: {} });
      return {
        client_id: client.id,
        name: fallbackName(client.name, client.id, "Cliente sem nome"),
        objective,
        objective_label: config.label,
        account_count: clientLinks.length,
        accounts: clientLinks.map((link: any) => { const account = accountById.get(link.account_id); return { account_id: link.account_id, name: fallbackName(account?.name, link.account_id, "Conta sem nome"), platform: account?.platform || "—" }; }),
        stages: config.stages.map((stage) => ({ ...stage, value: valueForStage(stage, aggregate) })),
      };
    });
    return NextResponse.json({ period, since, objective_options: Object.entries(OBJECTIVE_CONFIG).map(([value, config]) => ({ value, label: config.label })), clients: result });
  } catch (e: any) {
    return NextResponse.json({ clients: [], objective_options: [], error: e?.message || "Falha ao montar funil." }, { status: 500 });
  }
}
