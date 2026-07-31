import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";
function monthValue(value: string | null | undefined) { return value && /^\d{4}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 7); }
function monthEnd(month: string) { const [year, number] = month.split("-").map(Number); return `${year}-${String(number).padStart(2, "0")}-${String(new Date(Date.UTC(year, number, 0)).getUTCDate()).padStart(2, "0")}`; }
function previousMonth(month: string) { const [year, number] = month.split("-").map(Number); const date = new Date(Date.UTC(year, number - 2, 1)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`; }
function subtractMonths(month: string, amount: number) { let current = month; for (let index = 0; index < amount; index++) current = previousMonth(current); return current; }
function sum(rows: any[]) { return rows.reduce((total, row) => total + Number(row.amount || row.value || 0), 0); }
function monthRows(rows: any[], month: string) { return rows.filter((row) => row.due_date?.slice(0, 7) === month && row.status !== "cancelled"); }
function monthsSince(start: string | null | undefined, month: string) { if (!start) return null; const from = new Date(`${start.slice(0, 10)}T00:00:00Z`); const [year, number] = month.split("-").map(Number); return Math.max(0, (year - from.getUTCFullYear()) * 12 + number - 1 - from.getUTCMonth()); }

function calculateMonth(month: string, clients: any[], entries: any[], charges: any[], contracts: any[], recurring: any[]) {
  const currentEntries = monthRows(entries, month); const active = clients.filter((client) => client.status === "active"); const created = clients.filter((client) => client.created_at?.slice(0, 7) === month && client.status === "active");
  const revenueRows = currentEntries.filter((row) => row.kind === "revenue"); const expenseRows = currentEntries.filter((row) => row.kind === "expense"); const revenue = sum(revenueRows); const expenses = sum(expenseRows);
  const investment = sum(expenseRows.filter((row) => /marketing|mídia|publicidade|venda|anúncio|ads/i.test(row.financial_categories?.name || "")));
  const recurringRows = revenueRows.filter((row) => row.source === "recurring" || row.recurrence === "monthly"); const mrr = recurringRows.length ? sum(recurringRows) : sum(recurring.filter((rule) => rule.kind === "revenue").filter((rule) => rule.active));
  const variableRevenue = sum(revenueRows.filter((row) => row.source !== "recurring" && row.recurrence !== "monthly")); const overdueCharges = sum(charges.filter((charge) => charge.status === "OVERDUE")); const overdueEntries = sum(entries.filter((row) => row.kind === "revenue" && row.status === "planned" && row.due_date < new Date().toISOString().slice(0, 10)));
  const contractRows = contracts.filter((contract) => contract.end_date?.slice(0, 7) === month); const renewalRate = contractRows.length ? contractRows.filter((contract) => contract.status === "active").length / contractRows.length * 100 : null;
  const retention = active.map((client) => monthsSince(client.contract_start_date || client.created_at, month)).filter((value): value is number => value != null && value > 0); const avgRetention = retention.length ? retention.reduce((a, b) => a + b, 0) / retention.length : null;
  const churned = clients.filter((client) => client.status === "archived" && client.updated_at?.slice(0, 7) === month); const lostMrr = sum(churned.map((client) => ({ amount: client.monthly_budget })));
  const clientsView = active.map((client) => { const rows = currentEntries.filter((entry) => entry.client_id === client.id); const contract = contracts.filter((item) => item.client_id === client.id).sort((a, b) => String(b.end_date || "").localeCompare(String(a.end_date || "")))[0]; const end = contract?.end_date || client.contract_end_date; const days = end ? Math.ceil((Date.parse(`${end}T23:59:59`) - Date.now()) / 86400000) : null; const clientCharges = charges.filter((charge) => charge.client_id === client.id); return { id: client.id, name: client.name, mrr: sum(recurringRows.filter((entry) => entry.client_id === client.id)) || Number(client.monthly_budget || 0), revenue: sum(rows.filter((entry) => entry.kind === "revenue")), received: sum(rows.filter((entry) => entry.kind === "revenue" && entry.status === "confirmed")), overdue: sum(clientCharges.filter((charge) => charge.status === "OVERDUE")), contract_end_date: end, renewal: days == null ? "not_configured" : days < 0 ? "expired" : days <= (client.contract_notice_days || 30) ? "in_notice" : "active", renewal_days: days }; });
  return { month, active_clients: active.length, new_clients: created.length, mrr, new_mrr: sum(created.map((client) => ({ amount: client.monthly_budget }))), investment, cac: created.length ? investment / created.length : null, revenue, expenses, net_profit: revenue - expenses, renewal_rate: renewalRate, variable_revenue: variableRevenue, churned_clients: churned.length, lost_mrr: lostMrr, delinquency_amount: overdueCharges + overdueEntries, warning_clients: clientsView.filter((client) => client.renewal === "in_notice").length, ltv: avgRetention == null ? null : mrr * avgRetention, avg_retention_months: avgRetention, avg_time_to_churn_months: null, clients: clientsView };
}

export async function GET(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const month = monthValue(new URL(req.url).searchParams.get("month")); const sb = getServiceClient(); const from = `${subtractMonths(month, 11)}-01`;
    const [{ data: clients, error: clientsError }, { data: entries, error: entriesError }, { data: charges, error: chargesError }, { data: contracts, error: contractsError }, { data: recurring, error: recurringError }] = await Promise.all([
      sb.from("clients").select("id,name,status,monthly_budget,created_at,updated_at,contract_start_date,contract_end_date,contract_notice_days").order("name"),
      sb.from("financial_entries").select("client_id,kind,amount,status,due_date,source,recurrence,financial_categories(name)").gte("due_date", from).lte("due_date", monthEnd(month)),
      sb.from("client_billing_charges").select("client_id,status,value,due_date").in("status", ["OVERDUE", "PENDING", "RECEIVED"]),
      sb.from("client_contracts").select("client_id,status,start_date,end_date,monthly_fee"),
      sb.from("financial_recurring_rules").select("client_id,amount,active,kind").eq("active", true),
    ]); const error = clientsError || entriesError || chargesError || contractsError || recurringError; if (error) throw error;
    const sourceClients = clients || []; const sourceEntries = entries || []; const sourceCharges = charges || []; const sourceContracts = contracts || []; const sourceRecurring = recurring || [];
    const current = calculateMonth(month, sourceClients, sourceEntries, sourceCharges, sourceContracts, sourceRecurring); const trends = Array.from({ length: 12 }, (_, index) => calculateMonth(subtractMonths(month, 11 - index), sourceClients, sourceEntries, sourceCharges, sourceContracts, sourceRecurring));
    return NextResponse.json({ current, trends });
  } catch (error: any) { return NextResponse.json({ error: error?.message || "Falha ao gerar indicadores. Verifique as migrations financeiras, de contratos e recorrência." }, { status: 500 }); }
}
