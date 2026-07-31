import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const ACTIONS: Record<string, { title: string; rationale: (alert: any) => string; impact: string }> = {
  low_balance: { title: "Revisar saldo e cobrança", rationale: (a) => a.detail || "A conta apresenta saldo baixo.", impact: "Evita interrupção da entrega" },
  payment_issue: { title: "Resolver problema de pagamento", rationale: (a) => a.detail || "A plataforma sinalizou um problema de cobrança.", impact: "Evita perda de veiculação" },
  account_disabled: { title: "Regularizar conta de anúncios", rationale: (a) => a.detail || "A conta está com status que impede a operação.", impact: "Recuperar operação" },
  rejected_creative: { title: "Revisar criativo reprovado", rationale: (a) => a.detail || "Há criativos impedidos de veicular.", impact: "Recuperar oportunidades de entrega" },
  broad_location: { title: "Revisar segmentação geográfica", rationale: (a) => a.detail || "A conta possui localização ampla.", impact: "Reduzir desperdício potencial" },
  spend_drop: { title: "Investigar queda de investimento", rationale: (a) => a.detail || "O gasto caiu em relação ao período anterior.", impact: "Identificar perda de entrega" },
  spend_spike: { title: "Investigar pico de investimento", rationale: (a) => a.detail || "O gasto subiu acima do padrão.", impact: "Controlar risco financeiro" },
  cpa_spike: { title: "Investigar aumento de CPA", rationale: (a) => a.detail || "O custo por conversão subiu em relação ao período anterior.", impact: "Proteger eficiência" },
  roas_drop: { title: "Investigar queda de ROAS", rationale: (a) => a.detail || "O retorno sobre investimento caiu em relação ao período anterior.", impact: "Proteger retorno" },
  no_spend: { title: "Investigar conta sem gasto", rationale: (a) => a.detail || "A conta está ativa, mas não teve investimento.", impact: "Evitar cliente sem entrega" },
};

async function seedFromAlerts(sb: ReturnType<typeof getServiceClient>) {
  const [{ data: alerts, error: alertsError }, { data: links, error: linksError }] = await Promise.all([
    sb.from("alerts").select("*").eq("resolved", false).eq("acknowledged", false),
    sb.from("client_ad_accounts").select("client_id,account_id"),
  ]);
  if (alertsError) throw alertsError;
  if (linksError) throw linksError;
  const clientByAccount = new Map((links || []).map((link: any) => [link.account_id, link.client_id]));
  const rows = (alerts || []).map((alert: any) => {
    const preset = ACTIONS[alert.type] || { title: alert.title, rationale: (a: any) => a.detail || "Alerta operacional detectado.", impact: "Revisar operação" };
    return { source_key: `alert:${alert.id}`, client_id: clientByAccount.get(alert.account_id) || null, account_id: alert.account_id, action_type: alert.type, title: preset.title, rationale: preset.rationale(alert), impact_label: preset.impact, payload: { alert_id: alert.id, level: alert.level, alert_title: alert.title }, updated_at: new Date().toISOString() };
  });
  if (rows.length) { const { error } = await sb.from("optimization_decisions").upsert(rows, { onConflict: "source_key", ignoreDuplicates: true }); if (error) throw error; }
}

export async function GET(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ decisions: [], error: "Supabase não configurado." }, { status: 503 });
    const sb = getServiceClient();
    await seedFromAlerts(sb);
    const status = new URL(req.url).searchParams.get("status") || "pending";
    const { data, error } = await sb.from("optimization_decisions").select("*, clients(id,name)").eq("status", status).order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ decisions: data || [] });
  } catch (e: any) { return NextResponse.json({ decisions: [], error: e?.message || "Falha ao carregar decisões. Rode supabase-migration-ai-operations.sql." }, { status: 500 }); }
}

export async function PATCH(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const body = await req.json().catch(() => ({}));
    if (!body.id || !["approved", "rejected", "scheduled", "executed"].includes(body.status)) return NextResponse.json({ error: "Decisão ou status inválido." }, { status: 400 });
    const sb = getServiceClient();
    const patch = { status: body.status, scheduled_for: body.scheduled_for || null, decision_note: body.note || null, decided_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    const { data, error } = await sb.from("optimization_decisions").update(patch).eq("id", body.id).select("*").single();
    if (error) throw error;
    if (data?.payload?.alert_id && ["approved", "rejected", "executed"].includes(body.status)) await sb.from("alerts").update({ acknowledged: true, acknowledged_at: new Date().toISOString() }).eq("id", data.payload.alert_id);
    return NextResponse.json({ decision: data });
  } catch (e: any) { return NextResponse.json({ error: e?.message || "Falha ao atualizar decisão." }, { status: 500 }); }
}
