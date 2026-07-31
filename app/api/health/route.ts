import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const sb = getServiceClient();
    const [{ data: clients, error: clientsError }, { data: onboarding, error: onboardingError }, { data: charges, error: chargesError }, { data: contracts, error: contractsError }] = await Promise.all([
      sb.from("clients").select("id,name,status,contract_end_date,contract_notice_days,monthly_budget").eq("status", "active").order("name"),
      sb.from("client_onboarding_items").select("client_id,status"),
      sb.from("client_billing_charges").select("client_id,status,due_date,value").in("status", ["OVERDUE", "PENDING", "RECEIVED"]),
      sb.from("client_contracts").select("client_id,title,end_date,status").order("end_date", { ascending: false }),
    ]);
    if (clientsError || onboardingError || chargesError || contractsError) throw clientsError || onboardingError || chargesError || contractsError;
    const today = Date.now(); const onboardingMap = new Map<string, { done: number; total: number }>();
    for (const item of onboarding || []) { const current = onboardingMap.get(item.client_id) || { done: 0, total: 0 }; current.total++; if (item.status === "done") current.done++; onboardingMap.set(item.client_id, current); }
    const chargeMap = new Map<string, any[]>(); for (const charge of charges || []) chargeMap.set(charge.client_id, [...(chargeMap.get(charge.client_id) || []), charge]);
    const contractMap = new Map<string, any>(); for (const contract of contracts || []) if (!contractMap.has(contract.client_id)) contractMap.set(contract.client_id, contract);
    const rows = (clients || []).map((client: any) => {
      let score = 100; const reasons: string[] = []; const actions: string[] = []; const onboardingState = onboardingMap.get(client.id) || { done: 0, total: 0 }; const clientCharges = chargeMap.get(client.id) || []; const overdue = clientCharges.some((item) => item.status === "OVERDUE"); const contract = contractMap.get(client.id);
      if (onboardingState.total && onboardingState.done < onboardingState.total) { const pct = onboardingState.done / onboardingState.total; score -= Math.round((1 - pct) * 30); reasons.push(`Onboarding em ${Math.round(pct * 100)}%`); actions.push("Concluir onboarding"); }
      if (overdue) { score -= 30; reasons.push("Cobrança vencida"); actions.push("Regularizar financeiro"); }
      const endDate = contract?.end_date || client.contract_end_date; const days = endDate ? Math.ceil((Date.parse(`${endDate}T23:59:59`) - today) / 86400000) : null;
      if (days != null && days < 0) { score -= 25; reasons.push("Contrato vencido"); actions.push("Renovar contrato"); }
      else if (days != null && days <= (client.contract_notice_days || 30)) { score -= 15; reasons.push(`Contrato vence em ${days} dias`); actions.push("Iniciar renovação"); }
      score = Math.max(0, Math.min(100, score)); const status = score >= 80 ? "healthy" : score >= 55 ? "attention" : "risk";
      return { ...client, score, status, reasons: reasons.length ? reasons : ["Nenhum risco operacional identificado"], actions, onboarding: onboardingState, overdue, contract_end_date: endDate };
    }).sort((a: any, b: any) => a.score - b.score);
    return NextResponse.json({ clients: rows, summary: { total: rows.length, healthy: rows.filter((r: any) => r.status === "healthy").length, attention: rows.filter((r: any) => r.status === "attention").length, risk: rows.filter((r: any) => r.status === "risk").length } });
  } catch (error: any) { return NextResponse.json({ error: error?.message || "Falha ao calcular saúde da carteira." }, { status: 500 }); }
}
