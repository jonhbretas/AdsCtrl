import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function monthDate(year: number, month: number, day: number) { return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`; }
async function syncRuleEntries(sb: ReturnType<typeof getServiceClient>, rule: any) {
  const start = new Date(`${rule.starts_on}T00:00:00Z`); const now = new Date(); const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); const generationStart = start > currentMonth ? start : currentMonth; const end = rule.ends_on ? new Date(`${rule.ends_on}T00:00:00Z`) : new Date(Date.UTC(generationStart.getUTCFullYear(), generationStart.getUTCMonth() + 12, 1)); const entries = [];
  for (let cursor = new Date(Date.UTC(generationStart.getUTCFullYear(), generationStart.getUTCMonth(), 1)); cursor <= end; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) { const due = monthDate(cursor.getUTCFullYear(), cursor.getUTCMonth(), rule.day_of_month); if (due < rule.starts_on || (rule.ends_on && due > rule.ends_on)) continue; entries.push({ client_id: rule.client_id, category_id: rule.category_id, kind: rule.kind, status: "planned", description: rule.description, amount: rule.amount, due_date: due, source: "recurring", external_id: `${rule.id}:${due}`, recurrence: "monthly", notes: `Gerado pela receita recorrente ${rule.id}`, updated_at: new Date().toISOString() }); }
  if (entries.length) { const { error } = await sb.from("financial_entries").upsert(entries, { onConflict: "source,external_id" }); if (error) throw error; }
  return entries.length;
}

export async function GET() {
  try { if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 }); const sb = getServiceClient(); const { data, error } = await sb.from("financial_recurring_rules").select("*, clients(id,name), financial_categories(id,name)").eq("active", true).order("description"); if (error) throw error; let generated = 0; for (const rule of data || []) generated += await syncRuleEntries(sb, rule); return NextResponse.json({ rules: data || [], generated }); }
  catch (error: any) { return NextResponse.json({ error: error?.message || "Falha ao carregar recorrências." }, { status: 500 }); }
}

export async function POST(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 }); const body = await req.json().catch(() => ({})); const amount = Number(body.amount); if (!body.description || !Number.isFinite(amount) || amount <= 0 || !body.starts_on) return NextResponse.json({ error: "Informe descrição, valor e início." }, { status: 400 });
    const sb = getServiceClient(); const rule = { client_id: body.client_id || null, category_id: body.category_id || null, kind: body.kind === "expense" ? "expense" : "revenue", description: String(body.description).trim().slice(0, 180), amount, day_of_month: Math.min(28, Math.max(1, Number(body.day_of_month) || 10)), starts_on: body.starts_on, ends_on: body.ends_on || null, notes: body.notes || null, updated_at: new Date().toISOString() };
    const { data, error } = await sb.from("financial_recurring_rules").insert(rule).select("*").single(); if (error) throw error;
    const generated = await syncRuleEntries(sb, { ...rule, id: data.id });
    return NextResponse.json({ rule: data, generated }, { status: 201 });
  } catch (error: any) { return NextResponse.json({ error: error?.message || "Falha ao criar recorrência." }, { status: 500 }); }
}
