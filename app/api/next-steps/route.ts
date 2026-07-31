import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const alertAction: Record<string, { title: string; detail: string; href: string }> = {
  account_disabled: { title: "Regularizar conta de anúncios", detail: "A conta pode estar impedindo a entrega.", href: "/alerts" },
  payment_issue: { title: "Resolver cobrança", detail: "Verifique a forma de pagamento antes de perder veiculação.", href: "/alerts" },
  low_balance: { title: "Repor saldo", detail: "O saldo projetado pode interromper a entrega.", href: "/alerts" },
  rejected_creative: { title: "Revisar criativo reprovado", detail: "Ajuste a peça ou envie uma contestação.", href: "/creatives" },
  broad_location: { title: "Conferir segmentação geográfica", detail: "Valide se a campanha está alcançando apenas a região combinada.", href: "/meta-assets" },
  spend_drop: { title: "Investigar queda de investimento", detail: "Confira orçamento, aprovação e entrega das campanhas.", href: "/today" },
  spend_spike: { title: "Investigar pico de gasto", detail: "Compare o ritmo atual com o limite do cliente.", href: "/financeiro" },
  cpa_spike: { title: "Revisar eficiência da conversão", detail: "Procure anúncios, públicos ou etapas que elevaram o custo.", href: "/creatives" },
  roas_drop: { title: "Revisar retorno da campanha", detail: "Compare o valor gerado e priorize o próximo teste.", href: "/funil" },
  no_spend: { title: "Investigar conta sem gasto", detail: "Confirme se a ausência de investimento é intencional.", href: "/today" },
};

export async function GET() {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ steps: [], error: "Supabase não configurado." }, { status: 503 });
    const sb = getServiceClient();
    const [{ data: clients, error: clientsError }, { data: links, error: linksError }, { data: alerts, error: alertsError }] = await Promise.all([
      sb.from("clients").select("id,name").eq("status", "active").order("name"),
      sb.from("client_ad_accounts").select("client_id,account_id"),
      sb.from("alerts").select("id,account_id,type,title,detail,level,last_seen_at").eq("resolved", false).eq("acknowledged", false).order("level"),
    ]);
    if (clientsError) throw clientsError;
    if (linksError) throw linksError;
    if (alertsError) throw alertsError;
    const clientByAccount = new Map((links || []).map((link: any) => [link.account_id, link.client_id]));
    const accountCountByClient = new Map<string, number>();
    for (const link of links || []) accountCountByClient.set(link.client_id, (accountCountByClient.get(link.client_id) || 0) + 1);
    const clientById = new Map((clients || []).map((client: any) => [client.id, client]));
    const steps: any[] = [];
    for (const alert of alerts || []) {
      const clientId = clientByAccount.get(alert.account_id);
      const client = clientId ? clientById.get(clientId) : null;
      const preset = alertAction[alert.type] || { title: alert.title, detail: alert.detail || "Revise este sinal operacional.", href: "/alerts" };
      steps.push({ id: `alert:${alert.id}`, priority: alert.level === "critical" ? 0 : alert.level === "warning" ? 1 : 2, client_id: clientId || null, client_name: client?.name || "Conta sem cliente", account_id: alert.account_id, title: preset.title, detail: preset.detail, href: preset.href, source: "monitoramento", level: alert.level });
    }
    for (const client of clients || []) {
      if (!(accountCountByClient.get(client.id) || 0)) continue;
      if (steps.some((step) => step.client_id === client.id)) continue;
      steps.push({ id: `creative:${client.id}`, priority: 3, client_id: client.id, client_name: client.name, title: "Definir o próximo teste criativo", detail: "Escolha uma hipótese, uma peça e uma métrica de sucesso para a próxima rodada.", href: "/creatives", source: "rotina", level: "info" });
    }
    return NextResponse.json({ steps: steps.sort((a, b) => a.priority - b.priority || String(a.client_name).localeCompare(String(b.client_name))).slice(0, 80) });
  } catch (e: any) {
    return NextResponse.json({ steps: [], error: e?.message || "Falha ao montar próximos passos." }, { status: 500 });
  }
}
