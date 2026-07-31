"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Clock3, RefreshCw, X } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Decision = { id: string; title: string; rationale: string | null; impact_label: string | null; action_type: string; account_id: string | null; clients?: { id: string; name: string } | null; status: string; scheduled_for?: string | null; created_at: string };
type DecisionStatus = "pending" | "approved" | "rejected" | "scheduled";

export default function DecisoesPage() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [view, setView] = useState<DecisionStatus>("pending");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [strategicBusy, setStrategicBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<Record<string, string>>({});

  async function load(status = view) {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/decisions?status=${status}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao carregar decisões.");
      setDecisions(data.decisions || []);
    } catch (e: any) { setError(e?.message || "Falha ao carregar decisões."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(view); }, [view]);

  async function generateStrategic() {
    setStrategicBusy(true); setError(null);
    try {
      const response = await fetch("/api/decisions/strategic", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao analisar a operação.");
      setFeedback(data.created ? `${data.created} recomendação(ões) estratégica(s) adicionada(s).` : "Nenhum novo desvio estratégico encontrado.");
      await load();
      window.setTimeout(() => setFeedback(null), 5000);
    } catch (e: any) { setError(e?.message || "Falha ao gerar recomendações estratégicas."); }
    finally { setStrategicBusy(false); }
  }

  async function decide(decision: Decision, status: "approved" | "rejected" | "scheduled") {
    setBusy(decision.id); setError(null);
    try {
      const scheduledFor = schedule[decision.id] ? new Date(schedule[decision.id]).toISOString() : null;
      if (status === "scheduled" && !scheduledFor) throw new Error("Escolha data e hora para programar.");
      const response = await fetch("/api/decisions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: decision.id, status, scheduled_for: scheduledFor }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao atualizar decisão.");
      setDecisions((current) => current.filter((item) => item.id !== decision.id));
      setFeedback(status === "approved" ? "Decisão aprovada e registrada." : status === "scheduled" ? "Decisão programada e registrada." : "Decisão rejeitada e registrada.");
      window.setTimeout(() => setFeedback(null), 4000);
    } catch (e: any) { setError(e?.message || "Falha ao atualizar decisão."); }
    finally { setBusy(null); }
  }

  if (loading) return <div className="p-4 md:p-6 md:ml-56 space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-28 rounded-lg" /><Skeleton className="h-28 rounded-lg" /></div>;
  return <div className="p-4 md:p-6 md:ml-56 pb-20 md:pb-6 space-y-4 animate-fade-in">
    <PageHeader title="Central de decisões" subtitle="Diagnósticos estratégicos com hipótese e próxima ação. Você aprova, rejeita ou programa." actions={<div className="flex flex-wrap gap-2"><Button size="sm" onClick={generateStrategic} disabled={strategicBusy}><TargetIcon className={cn("mr-1.5 h-3.5 w-3.5", strategicBusy && "animate-spin")} />{strategicBusy ? "Analisando criativos…" : "Gerar análise estratégica"}</Button><Button variant="secondary" size="sm" onClick={() => load()} disabled={loading}><RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />{loading ? "Atualizando…" : "Atualizar"}</Button></div>} />
    {error && <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-500"><AlertTriangle className="mr-1.5 inline h-4 w-4" />{error}</div>}
    {feedback && <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600"><Check className="mr-1.5 inline h-4 w-4" />{feedback}</div>}
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 bg-card px-4 py-3">
      <div className="mr-auto"><div className="text-sm font-semibold">{view === "pending" ? "Fila de decisões" : "Histórico de decisões"}</div><div className="text-xs text-muted-foreground">A aprovação registra a intenção; mudanças sensíveis na Meta continuam protegidas.</div></div>
      {(["pending", "approved", "scheduled", "rejected"] as DecisionStatus[]).map((status) => <button key={status} onClick={() => setView(status)} className={cn("rounded-full px-2.5 py-1 text-xs font-semibold transition-colors", view === status ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>{status === "pending" ? "Pendentes" : status === "approved" ? "Aprovadas" : status === "scheduled" ? "Programadas" : "Rejeitadas"}</button>)}
      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{decisions.length}</span>
    </div>
    <div className="space-y-3">
      {decisions.map((decision) => <article key={decision.id} className="rounded-xl border border-border/50 bg-card p-4 shadow-sm"><div className="flex flex-wrap items-start gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600"><AlertTriangle className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">{decision.title}</h2>{decision.action_type.startsWith("strategic_") && <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-600">Estratégica</span>}{decision.clients?.name && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{decision.clients.name}</span>}</div><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{decision.rationale || "Revise este sinal antes de agir."}</p><div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground"><span>Conta: {decision.account_id || "não identificada"}</span>{decision.impact_label && <span>· Impacto: {decision.impact_label}</span>}<span>· <Clock3 className="mr-0.5 inline h-3 w-3" />{new Date(decision.created_at).toLocaleString("pt-BR")}</span></div></div>{view === "pending" && <div className="flex flex-wrap items-center justify-end gap-2"><input type="datetime-local" value={schedule[decision.id] || ""} onChange={(e) => setSchedule((current) => ({ ...current, [decision.id]: e.target.value }))} className="h-9 rounded-lg border border-border bg-transparent px-2 text-xs" aria-label="Data para programar" /><Button size="sm" onClick={() => decide(decision, "approved")} disabled={busy === decision.id}><Check className="h-3.5 w-3.5" />{busy === decision.id ? "Salvando…" : "Aprovar"}</Button><Button variant="secondary" size="sm" onClick={() => decide(decision, "scheduled")} disabled={busy === decision.id}>Programar</Button><Button variant="secondary" size="sm" onClick={() => decide(decision, "rejected")} disabled={busy === decision.id}><X className="h-3.5 w-3.5" />Rejeitar</Button></div>}</div></article>)}
      {!decisions.length && <div className="rounded-xl border border-dashed border-border p-12 text-center"><Check className="mx-auto mb-2 h-7 w-7 text-emerald-500" /><p className="text-sm font-semibold">Nenhuma decisão nesta fila</p><p className="mt-1 text-xs text-muted-foreground">A coleta cria sugestões aqui quando identificar um sinal operacional.</p></div>}
    </div>
  </div>;
}

function TargetIcon({ className }: { className?: string }) { return <span className={className}>✦</span>; }
