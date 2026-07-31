"use client";

import { useEffect, useMemo, useState } from "react";
import { Field, Modal, PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { BrDateInput } from "@/components/BrDateInput";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { brDate } from "@/lib/format";
import { ArrowDownRight, ArrowUpRight, CircleDollarSign, Plus, RefreshCw } from "lucide-react";

type FinanceData = { month: string; entries: any[]; categories: any[]; clients: any[]; summary: any; dre: any[]; rules?: any[] };
const inputClass = "w-full h-9 px-3 text-sm rounded-lg border border-border bg-transparent outline-none focus:ring-1 focus:ring-ring";

function money(value: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0); }

export default function FinanceiroPage() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false); const [showRecurring, setShowRecurring] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState("expense");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(`${month}-10`);
  const [categoryId, setCategoryId] = useState("");
  const [clientId, setClientId] = useState("");
  const [status, setStatus] = useState("planned");
  const [recurringDescription, setRecurringDescription] = useState(""); const [recurringAmount, setRecurringAmount] = useState(""); const [recurringClientId, setRecurringClientId] = useState(""); const [recurringDay, setRecurringDay] = useState("10"); const [recurringStart, setRecurringStart] = useState(new Date().toISOString().slice(0, 10));

  async function load() {
    setLoading(true); setError(null);
    try { const recurringResponse = await fetch("/api/finance/recurring", { cache: "no-store" }); const recurring = await recurringResponse.json(); const financeResponse = await fetch(`/api/finance?month=${month}`, { cache: "no-store" }); const d = await financeResponse.json(); if (!financeResponse.ok) throw new Error(d.error || "Falha ao carregar financeiro."); setData({ ...d, rules: recurring.rules || [] }); }
    catch (e: any) { setError(e?.message || "Falha ao carregar financeiro."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [month]);
  const categories = useMemo(() => data?.categories.filter((item) => item.kind === kind) || [], [data, kind]);

  async function save() {
    setSaving(true); setError(null);
    try { const body = { kind, description, amount: Number(amount), due_date: dueDate, category_id: categoryId || null, client_id: clientId || null, status }; const r = await fetch("/api/finance", { method: editingEntryId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editingEntryId ? { ...body, id: editingEntryId } : body) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Falha ao salvar lançamento."); setDescription(""); setAmount(""); setEditingEntryId(null); setShowForm(false); await load(); }
    catch (e: any) { setError(e?.message || "Falha ao salvar lançamento."); }
    finally { setSaving(false); }
  }

  async function confirmEntry(id: string) {
    try { const r = await fetch("/api/finance", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: "confirmed" }) }); if (!r.ok) throw new Error("Falha ao confirmar."); await load(); }
    catch (e: any) { setError(e?.message || "Falha ao confirmar lançamento."); }
  }

  function editEntry(entry: any) { setEditingEntryId(entry.id); setKind(entry.kind); setDescription(entry.description); setAmount(String(entry.amount)); setDueDate(entry.due_date); setCategoryId(entry.category_id || ""); setClientId(entry.client_id || ""); setStatus(entry.status); setShowForm(true); setError(null); }
  function duplicateEntry(entry: any) { setEditingEntryId(null); setKind(entry.kind); setDescription(`${entry.description} (cópia)`); setAmount(String(entry.amount)); setDueDate(entry.due_date); setCategoryId(entry.category_id || ""); setClientId(entry.client_id || ""); setStatus("planned"); setShowForm(true); setError(null); }

  async function saveRecurring() { try { const r = await fetch("/api/finance/recurring", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "revenue", description: recurringDescription, amount: Number(recurringAmount), client_id: recurringClientId || null, day_of_month: Number(recurringDay), starts_on: recurringStart }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Falha ao salvar recorrência."); setRecurringDescription(""); setRecurringAmount(""); setShowRecurring(false); await load(); } catch (e: any) { setError(e?.message || "Falha ao salvar recorrência."); } }
  function duplicateRecurring(rule: any) { setRecurringDescription(`${rule.description} (cópia)`); setRecurringAmount(String(rule.amount)); setRecurringClientId(rule.client_id || ""); setRecurringDay(String(rule.day_of_month || 10)); setRecurringStart(rule.starts_on || new Date().toISOString().slice(0, 10)); setShowRecurring(true); setError(null); }

  if (loading && !data) return <div className="p-4 md:p-6 md:ml-56 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-28 rounded-lg" /><Skeleton className="h-64 rounded-lg" /></div>;
  const summary = data?.summary || {};
  return <div className="p-4 md:p-6 md:ml-56 pb-20 md:pb-6 space-y-4 animate-fade-in">
    <PageHeader title="Financeiro" subtitle="Fluxo de caixa, contas a receber e DRE operacional da agência." actions={<div className="flex items-center gap-2"><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={cn(inputClass, "w-auto")} /><Button variant="secondary" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5 mr-1" /> Atualizar</Button><Button variant="secondary" size="sm" onClick={() => setShowRecurring((v) => !v)}>Receita recorrente</Button><Button size="sm" onClick={() => setShowForm((v) => !v)}><Plus className="h-3.5 w-3.5 mr-1" /> Lançamento</Button></div>} />
    {error && <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</div>}
    <div className="grid gap-3 md:grid-cols-5">
      <Metric label="Receita prevista" value={money(summary.revenue)} icon={<ArrowUpRight className="h-4 w-4 text-emerald-600" />} />
      <Metric label="Despesas" value={money(summary.expenses)} icon={<ArrowDownRight className="h-4 w-4 text-red-500" />} />
      <Metric label="Resultado" value={money(summary.result)} icon={<CircleDollarSign className="h-4 w-4 text-primary" />} tone={summary.result >= 0 ? "text-emerald-600" : "text-red-500"} />
      <Metric label="A receber" value={money(summary.receivable)} icon={<span className="text-amber-500">●</span>} />
      <Metric label="Margem" value={`${Number(summary.margin || 0).toFixed(1)}%`} icon={<span className="text-sky-500">%</span>} />
    </div>
    {showForm && <Modal title={editingEntryId ? "Editar lançamento" : "Novo lançamento"} onClose={() => { setShowForm(false); setEditingEntryId(null); }} wide><div className="space-y-3"><p className="text-xs text-muted-foreground">Informe o que é este lançamento, seu valor, vencimento e vínculo.</p><div className="grid gap-3 md:grid-cols-3"><Field label="Tipo"><select value={kind} onChange={(e) => { setKind(e.target.value); setCategoryId(""); }} className={inputClass}><option value="expense">Despesa</option><option value="revenue">Receita</option></select></Field><Field label="O que é?"><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Mensalidade Cliente X" className={inputClass} /></Field><Field label="Valor"><input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0.01" step="0.01" placeholder="R$ 0,00" className={inputClass} /></Field><Field label="Vencimento"><BrDateInput value={dueDate} onChange={setDueDate} className={inputClass} /></Field><Field label="Categoria"><select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}><option value="">Sem categoria</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Cliente"><select value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputClass}><option value="">Agência / sem cliente</option>{data?.clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></div><div className="flex items-center gap-2"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={status === "confirmed"} onChange={(e) => setStatus(e.target.checked ? "confirmed" : "planned")} /> já foi pago/recebido</label><Button variant="secondary" className="ml-auto" size="sm" onClick={() => { setShowForm(false); setEditingEntryId(null); }}>Cancelar</Button><Button size="sm" onClick={save} disabled={saving || !description || !amount}>{saving ? "Salvando…" : editingEntryId ? "Salvar alterações" : "Salvar lançamento"}</Button></div></div></Modal>}
    {showRecurring && <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4 space-y-3"><div className="text-sm font-semibold">Nova receita recorrente manual</div><p className="text-xs text-muted-foreground">Gera os próximos 12 lançamentos previstos, mesmo que o cliente pague por transferência, Pix direto ou outra plataforma.</p><div className="grid gap-3 md:grid-cols-5"><input value={recurringDescription} onChange={(e) => setRecurringDescription(e.target.value)} placeholder="Ex.: Mensalidade Cliente X" className={inputClass} /><input value={recurringAmount} onChange={(e) => setRecurringAmount(e.target.value)} type="number" min="1" step="0.01" placeholder="Valor mensal" className={inputClass} /><select value={recurringClientId} onChange={(e) => setRecurringClientId(e.target.value)} className={inputClass}><option value="">Sem cliente</option>{data?.clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input value={recurringDay} onChange={(e) => setRecurringDay(e.target.value)} type="number" min="1" max="28" placeholder="Dia" className={inputClass} /><BrDateInput value={recurringStart} onChange={setRecurringStart} className={inputClass} /></div><Button size="sm" onClick={saveRecurring} disabled={!recurringDescription || !recurringAmount}>Cadastrar receita recorrente</Button>{data?.rules?.length ? <div className="space-y-1 border-t border-border/40 pt-2">{data.rules.map((rule: any) => <div key={rule.id} className="flex items-center gap-2 text-xs"><span className="flex-1">{rule.description} · {money(Number(rule.amount))}/mês</span><span className="text-muted-foreground">dia {rule.day_of_month}</span><button type="button" onClick={() => duplicateRecurring(rule)} className="rounded border border-input px-2 py-1 text-[10px] font-semibold hover:bg-muted">Duplicar</button></div>)}</div> : null}</div>}
    <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]"><section className="rounded-lg border border-border/50 bg-card p-4"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-semibold">Lançamentos de {month}</h2><p className="text-xs text-muted-foreground">Edite ou duplique diretamente qualquer lançamento.</p></div><span className="text-xs text-muted-foreground">{data?.entries.length || 0} registros</span></div><div className="space-y-2">{data?.entries.map((entry) => <div key={entry.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border/40 px-3 py-2"><span className={cn("h-2 w-2 rounded-full", entry.kind === "revenue" ? "bg-emerald-500" : "bg-red-500")} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{entry.description}</div><div className="text-[11px] text-muted-foreground">{entry.clients?.name || "Agência"} · {entry.financial_categories?.name || "Sem categoria"} · vence {brDate(entry.due_date)}</div></div><span className={cn("text-sm font-semibold", entry.kind === "revenue" ? "text-emerald-600" : "text-red-500")}>{entry.kind === "revenue" ? "+" : "-"}{money(Number(entry.amount))}</span><div className="flex items-center gap-1"><button onClick={() => editEntry(entry)} className="rounded border border-input px-2 py-1 text-[10px] font-semibold hover:bg-muted">Editar</button><button onClick={() => duplicateEntry(entry)} className="rounded border border-input px-2 py-1 text-[10px] font-semibold hover:bg-muted">Duplicar</button>{entry.status === "planned" ? <button onClick={() => confirmEntry(entry.id)} className="rounded border border-emerald-500/30 px-2 py-1 text-[10px] font-semibold text-emerald-600 hover:bg-emerald-500/10">Confirmar</button> : <span className="px-1 text-[10px] text-muted-foreground">confirmado</span>}</div></div>)}{!data?.entries.length && <div className="py-8 text-center text-sm text-muted-foreground">Nenhum lançamento neste mês.</div>}</div></section><section className="rounded-lg border border-border/50 bg-card p-4"><h2 className="text-sm font-semibold">DRE por categoria</h2><p className="mb-3 text-xs text-muted-foreground">Visão gerencial do mês selecionado.</p><div className="space-y-2">{data?.dre.map((item) => <div key={item.name} className="flex items-center gap-2 border-b border-border/30 pb-2 text-xs"><span className="flex-1">{item.name}</span>{item.revenue > 0 && <span className="text-emerald-600">+{money(item.revenue)}</span>}{item.expenses > 0 && <span className="text-red-500">-{money(item.expenses)}</span>}</div>)}</div></section></div>
  </div>;
}

function Metric({ label, value, icon, tone = "" }: { label: string; value: string; icon: React.ReactNode; tone?: string }) { return <div className="rounded-lg border border-border/50 bg-card p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div><div className={cn("mt-1 text-lg font-bold", tone)}>{value}</div></div>; }
