import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function monthRange(value: string | null) {
  const month = value && /^\d{4}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 7);
  const [year, monthNumber] = month.split("-").map(Number);
  const start = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, monthNumber, 0));
  const end = `${year}-${String(monthNumber).padStart(2, "0")}-${String(endDate.getUTCDate()).padStart(2, "0")}`;
  return { month, start, end };
}

export async function GET(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const range = monthRange(new URL(req.url).searchParams.get("month"));
    const sb = getServiceClient();
    const [{ data: entries, error: entriesError }, { data: categories, error: categoriesError }, { data: clients, error: clientsError }] = await Promise.all([
      sb.from("financial_entries").select("*, clients(id,name), financial_categories(id,name,kind)").gte("due_date", range.start).lte("due_date", range.end).order("due_date", { ascending: false }),
      sb.from("financial_categories").select("*").eq("active", true).order("kind").order("name"),
      sb.from("clients").select("id,name").eq("status", "active").order("name"),
    ]);
    if (entriesError || categoriesError || clientsError) throw entriesError || categoriesError || clientsError;
    const unique = new Map<string, any>();
    for (const row of entries || []) {
      const key = [row.client_id || "agency", row.kind, row.description.trim().toLowerCase(), row.amount, row.due_date].join("|");
      const previous = unique.get(key);
      if (!previous || (row.source === "recurring" && previous.source !== "recurring")) unique.set(key, row);
    }
    const rows = [...unique.values()];
    const sum = (predicate: (row: any) => boolean) => rows.filter(predicate).reduce((total, row) => total + Number(row.amount || 0), 0);
    const revenue = sum((row) => row.kind === "revenue");
    const expenses = sum((row) => row.kind === "expense");
    const received = sum((row) => row.kind === "revenue" && row.status === "confirmed");
    const paid = sum((row) => row.kind === "expense" && row.status === "confirmed");
    const receivable = sum((row) => row.kind === "revenue" && row.status === "planned");
    const payable = sum((row) => row.kind === "expense" && row.status === "planned");
    const dre = [...new Set(rows.map((row) => row.financial_categories?.name || "Sem categoria"))].map((name) => ({
      name,
      revenue: sum((row) => row.kind === "revenue" && (row.financial_categories?.name || "Sem categoria") === name),
      received: sum((row) => row.kind === "revenue" && row.status === "confirmed" && (row.financial_categories?.name || "Sem categoria") === name),
      expenses: sum((row) => row.kind === "expense" && (row.financial_categories?.name || "Sem categoria") === name),
      paid: sum((row) => row.kind === "expense" && row.status === "confirmed" && (row.financial_categories?.name || "Sem categoria") === name),
    }));
    return NextResponse.json({ month: range.month, entries: rows, categories: categories || [], clients: clients || [], summary: { revenue, expenses, result: received - paid, projected_result: revenue - expenses, received, paid, receivable, payable, margin: received ? ((received - paid) / received) * 100 : 0, projected_margin: revenue ? ((revenue - expenses) / revenue) * 100 : 0 }, dre });
  } catch (error: any) { return NextResponse.json({ error: error?.message || "Falha ao carregar financeiro." }, { status: 500 }); }
}

export async function POST(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const body = await req.json().catch(() => null);
    if (!body || !body.description || !body.amount || !body.due_date) return NextResponse.json({ error: "Informe descrição, valor e vencimento." }, { status: 400 });
    if (body.kind !== "revenue" && body.kind !== "expense") return NextResponse.json({ error: "kind deve ser revenue ou expense." }, { status: 400 });
    const amount = Number(body.amount); if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "O valor deve ser maior que zero." }, { status: 400 });
    const row = { client_id: body.client_id || null, category_id: body.category_id || null, kind: body.kind, status: body.status === "confirmed" ? "confirmed" : "planned", description: String(body.description).trim().slice(0, 180), amount, due_date: String(body.due_date), paid_at: body.status === "confirmed" ? new Date().toISOString() : null, source: "manual", recurrence: body.recurrence || null, notes: body.notes || null, updated_at: new Date().toISOString() };
    const { data, error } = await getServiceClient().from("financial_entries").insert(row).select("*").single();
    if (error) throw error; return NextResponse.json({ entry: data }, { status: 201 });
  } catch (error: any) { return NextResponse.json({ error: error?.message || "Falha ao criar lançamento." }, { status: 500 }); }
}

export async function PATCH(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const body = await req.json().catch(() => null); if (!body?.id) return NextResponse.json({ error: "Lançamento não informado." }, { status: 400 });
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (body.description !== undefined) { if (!String(body.description).trim()) return NextResponse.json({ error: "Informe uma descrição." }, { status: 400 }); patch.description = String(body.description).trim().slice(0, 180); }
    if (body.amount !== undefined) { const amount = Number(body.amount); if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "O valor deve ser maior que zero." }, { status: 400 }); patch.amount = amount; }
    if (body.due_date !== undefined) { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.due_date))) return NextResponse.json({ error: "Data inválida." }, { status: 400 }); patch.due_date = String(body.due_date); }
    if (body.client_id !== undefined) patch.client_id = body.client_id || null;
    if (body.category_id !== undefined) patch.category_id = body.category_id || null;
    if (body.status) patch.status = body.status;
    if (body.status === "confirmed") patch.paid_at = new Date().toISOString();
    if (body.status === "planned") patch.paid_at = null;
    const { data, error } = await getServiceClient().from("financial_entries").update(patch).eq("id", body.id).select("*").single();
    if (error) throw error; return NextResponse.json({ entry: data });
  } catch (error: any) { return NextResponse.json({ error: error?.message || "Falha ao atualizar lançamento." }, { status: 500 }); }
}

export async function DELETE(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Lançamento não informado." }, { status: 400 });
    const { error } = await getServiceClient().from("financial_entries").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error: any) { return NextResponse.json({ error: error?.message || "Falha ao excluir lançamento." }, { status: 500 }); }
}
