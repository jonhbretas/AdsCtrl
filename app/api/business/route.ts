import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function monthValue(value: string | null) { return value && /^\d{4}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 7); }
function monthStart(month: string) { return `${month}-01`; }
function monthEnd(month: string) { const [year, number] = month.split("-").map(Number); return `${year}-${String(number).padStart(2, "0")}-${String(new Date(Date.UTC(year, number, 0)).getUTCDate()).padStart(2, "0")}`; }
function previousMonth(month: string) { const [year, number] = month.split("-").map(Number); const date = new Date(Date.UTC(year, number - 2, 1)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`; }
function subtractMonths(month: string, amount: number) { let current = month; for (let index = 0; index < amount; index++) current = previousMonth(current); return current; }
function monthsBetween(start: string | null, end: string | null, fallback: string) { const from = start ? new Date(`${start}T00:00:00Z`) : new Date(`${fallback}-01T00:00:00Z`); const to = end ? new Date(`${end}T00:00:00Z`) : new Date(); return Math.max(0, (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth()); }

async function calculate(month: string) {
  const sb = getServiceClient();
  const start12 = `${subtractMonths(month, 11)}-01`;
  const end = monthEnd(month);
  const [{ data: clients, error: clientsError }, { data: entries, error: entriesError }, { data: charges, error: chargesError }, { data: contracts, error: contractsError }, { data: rules, error: rulesError }, { data: snapshots, error: snapshotsError }] = await Promise.all([
    sb.from("clients").select("id,name,status,monthly_budget,created_at,updated_at,contract_start_date,contract_end_date,contract_notice_days").order("created_at"),
    sb.from("financial_entries").select("kind,amount,status,due_date,source,recurrence,category_id,financial_categories(name)").gte("due_date", start12).lte("due_date", end),
    sb.from("client_billing_charges").select("client_id,status,value,due_date").in("status", ["OVERDUE", "PENDING", "RECEIVED"]),
    sb.from("client_contracts").select("client_id,status,start_date,end_date,monthly_fee"),
    sb.from("financial_recurring_rules").select("client_id,amount,active,kind").eq("active", true),
    sb.from("business_metric_snapshots").select("*").order("month", { ascending: false }).limit(12),
  ]);
  const error = clientsError || entriesError || chargesError || contractsError || rulesError || snapshotsError;
  if (error) throw error;
  const allClients = clients || []; const active = allClients.filter((client: any) => client.status === "active");
  const inMonth = (date: string | null | undefined) => Boolean(date && date.slice(0, 7) === month);
  const newClients = allClients.filter((client: any) => inMonth(client.created_at));
  const value = (rows: any[]) => rows.reduce((sum, row) => sum + Number(row.amount || row.value || 0), 0);
  const currentEntries = (entries || []).filter((entry: any) => entry.due_date?.slice(0, 7) === month && entry.status !== "cancelled");
  const revenue = value(currentEntries.filter((entry: any) => entry.kind === "revenue"));
  const expenses = value(currentEntries.filter((entry: any) => entry.kind === "expense"));
  const investment = value(currentEntries.filter((entry: any) => entry.kind === "expense" && /marketing|mídia|publicidade|venda|anúncio|ads/i.test(entry.financial_categories?.name || "")));
  const mrr = active.reduce((sum: number, client: any) => sum + Number(client.monthly_budget || 0), 0);
  const newMrr = newClients.filter((client: any) => client.status === "active").reduce((sum: number, client: any) => sum + Number(client.monthly_budget || 0), 0);
  const variableRevenue = value(currentEntries.filter((entry: any) => entry.kind === "revenue" && entry.recurrence !== "monthly" && entry.source !== "recurring"));
  const overdue = value((charges || []).filter((charge: any) => charge.status === "OVERDUE"));
  const warningClients = active.filter((client: any) => client.contract_end_date && Math.ceil((Date.parse(`${client.contract_end_date}T23:59:59`) - Date.now()) / 86400000) <= (client.contract_notice_days || 30)).length;
  const contractRows = (contracts || []).filter((contract: any) => contract.status === "active" || contract.status === "draft");
  const dueForRenewal = contractRows.filter((contract: any) => inMonth(contract.end_date));
  const renewalRate = dueForRenewal.length ? (dueForRenewal.filter((contract: any) => contract.status === "active").length / dueForRenewal.length) * 100 : 0;
  const retentionMonths = active.map((client: any) => monthsBetween(client.contract_start_date || client.created_at, null, month)).filter((item) => item > 0);
  const avgRetention = retentionMonths.length ? retentionMonths.reduce((sum, item) => sum + item, 0) / retentionMonths.length : 0;
  const ltv = mrr * avgRetention;
  const current = { month, active_clients: active.length, new_clients: newClients.length, mrr, new_mrr: newMrr, investment, cac: newClients.length ? investment / newClients.length : 0, revenue, expenses, net_profit: revenue - expenses, renewal_rate: renewalRate, variable_revenue: variableRevenue, churned_clients: allClients.filter((client: any) => client.status === "archived" && inMonth(client.updated_at)).length, lost_mrr: 0, delinquency_amount: overdue, warning_clients: warningClients, ltv, avg_retention_months: avgRetention, avg_time_to_churn_months: 0 };
  return { current, trends: [current, ...(snapshots || []).filter((snapshot: any) => snapshot.month !== month).reverse()].slice(-12), clients: active.map((client: any) => ({ id: client.id, name: client.name, monthly_budget: Number(client.monthly_budget || 0) })), recurring_rules: rules || [] };
}

export async function GET(req: Request) {
  try { if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 }); const url = new URL(req.url); return NextResponse.json(await calculate(monthValue(url.searchParams.get("month")))); }
  catch (error: any) { return NextResponse.json({ error: error?.message || "Falha ao calcular visão do negócio. Execute a migration de métricas." }, { status: 500 }); }
}

export async function POST(req: Request) {
  try { if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 }); const body = await req.json().catch(() => ({})); const result = await calculate(monthValue(body.month)); const { error } = await getServiceClient().from("business_metric_snapshots").upsert({ ...result.current, month: monthStart(result.current.month), updated_at: new Date().toISOString() }, { onConflict: "month" }); if (error) throw error; return NextResponse.json({ saved: true, current: result.current }); }
  catch (error: any) { return NextResponse.json({ error: error?.message || "Falha ao registrar snapshot." }, { status: 500 }); }
}
