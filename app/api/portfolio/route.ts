import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ clients: [], error: "Supabase não configurado." }, { status: 503 });
    const sb = getServiceClient(); const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const [{ data: clients, error: clientsError }, { data: links, error: linksError }, { data: metrics, error: metricsError }, { data: alerts, error: alertsError }] = await Promise.all([
      sb.from("clients").select("id,name,status,target_roas,max_cpa,max_daily_spend,automation_mode").eq("status", "active").order("name"),
      sb.from("client_ad_accounts").select("client_id,account_id,is_primary"),
      sb.from("daily_account_metrics").select("account_id,spend,impressions,clicks,conversions,conversion_value,results").gte("metric_date", since),
      sb.from("alerts").select("account_id,level,resolved,acknowledged").eq("resolved", false),
    ]);
    if (clientsError || linksError || metricsError || alertsError) throw clientsError || linksError || metricsError || alertsError;
    const linksByClient = new Map<string, string[]>(); for (const link of links || []) linksByClient.set(link.client_id, [...(linksByClient.get(link.client_id) || []), link.account_id]);
    const metricByAccount = new Map<string, any>(); for (const row of metrics || []) { const item = metricByAccount.get(row.account_id) || { spend: 0, impressions: 0, clicks: 0, conversions: 0, value: 0 }; item.spend += Number(row.spend || 0); item.impressions += Number(row.impressions || 0); item.clicks += Number(row.clicks || 0); item.conversions += Number(row.conversions || 0); item.value += Number(row.conversion_value || 0); metricByAccount.set(row.account_id, item); }
    const alertByAccount = new Map<string, number>(); for (const alert of alerts || []) alertByAccount.set(alert.account_id, (alertByAccount.get(alert.account_id) || 0) + 1);
    const result = (clients || []).map((client: any) => { const ids = linksByClient.get(client.id) || []; const total = ids.reduce((sum, id) => { const m = metricByAccount.get(id); return { spend: sum.spend + (m?.spend || 0), impressions: sum.impressions + (m?.impressions || 0), clicks: sum.clicks + (m?.clicks || 0), conversions: sum.conversions + (m?.conversions || 0), value: sum.value + (m?.value || 0) }; }, { spend: 0, impressions: 0, clicks: 0, conversions: 0, value: 0 }); return { ...client, account_count: ids.length, spend: total.spend, impressions: total.impressions, clicks: total.clicks, conversions: total.conversions, value: total.value, roas: total.spend ? total.value / total.spend : null, alerts: ids.reduce((sum, id) => sum + (alertByAccount.get(id) || 0), 0) }; });
    return NextResponse.json({ since, clients: result });
  } catch (e: any) { return NextResponse.json({ clients: [], error: e?.message || "Falha ao consolidar portfólio." }, { status: 500 }); }
}
