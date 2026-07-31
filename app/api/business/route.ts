import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const FIELDS = ["active_clients", "new_clients", "mrr", "new_mrr", "investment", "cac", "revenue", "expenses", "net_profit", "renewal_rate", "variable_revenue", "churned_clients", "lost_mrr", "delinquency_amount", "warning_clients", "ltv", "avg_retention_months", "avg_time_to_churn_months"] as const;
function monthValue(value: string | null | undefined) { return value && /^\d{4}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 7); }
function monthDate(month: string) { return `${month}-01`; }

async function readSnapshots(month: string) {
  const sb = getServiceClient();
  const [{ data: current, error: currentError }, { data: trends, error: trendsError }] = await Promise.all([
    sb.from("business_metric_snapshots").select("*").eq("month", monthDate(month)).maybeSingle(),
    sb.from("business_metric_snapshots").select("*").order("month", { ascending: false }).limit(12),
  ]);
  if (currentError || trendsError) throw currentError || trendsError;
  return { current, trends: (trends || []).reverse() };
}

export async function GET(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    return NextResponse.json(await readSnapshots(monthValue(new URL(req.url).searchParams.get("month"))));
  } catch (error: any) { return NextResponse.json({ error: error?.message || "Execute a migration de métricas mensais." }, { status: 500 }); }
}

export async function POST(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const body = await req.json().catch(() => ({})); const month = monthValue(body.month); const row: Record<string, any> = { month: monthDate(month), metadata: { source: "manual" }, updated_at: new Date().toISOString() };
    for (const field of FIELDS) { const value = body[field]; if (value === "" || value === null || value === undefined) row[field] = null; else if (!Number.isFinite(Number(value)) || Number(value) < 0) return NextResponse.json({ error: `Valor inválido para ${field}.` }, { status: 400 }); else row[field] = Number(value); }
    const { data, error } = await getServiceClient().from("business_metric_snapshots").upsert(row, { onConflict: "month" }).select("*").single();
    if (error) throw error; return NextResponse.json({ saved: true, current: data });
  } catch (error: any) { return NextResponse.json({ error: error?.message || "Falha ao salvar os dados do mês." }, { status: 500 }); }
}
