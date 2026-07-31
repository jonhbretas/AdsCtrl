"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, RefreshCw, TestTube2 } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Step = { id: string; client_name: string; account_id?: string; title: string; detail: string; href: string; source: string; level: "critical" | "warning" | "info"; };

export default function ProximosPassosPage() {
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    setLoading(true); setError(null);
    try { const response = await fetch("/api/next-steps", { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Falha ao carregar próximos passos."); setSteps(data.steps || []); }
    catch (e: any) { setError(e?.message || "Falha ao carregar próximos passos."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  if (loading) return <div className="p-4 md:p-6 md:ml-56 space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" /></div>;
  return <div className="p-4 md:p-6 md:ml-56 pb-20 md:pb-6 space-y-4 animate-fade-in">
    <PageHeader title="Próximos passos" subtitle="Transforme sinais do monitoramento em uma ação clara para cada cliente." actions={<Button variant="secondary" size="sm" onClick={load} disabled={loading}><RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />{loading ? "Atualizando…" : "Atualizar"}</Button>} />
    {error && <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-500"><AlertTriangle className="mr-1.5 inline h-4 w-4" />{error}</div>}
    <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-border/50 bg-card p-4"><div className="text-xs text-muted-foreground">Ações sugeridas</div><div className="mt-1 text-2xl font-bold">{steps.length}</div></div><div className="rounded-xl border border-border/50 bg-card p-4"><div className="text-xs text-muted-foreground">Prioridade alta</div><div className="mt-1 text-2xl font-bold text-red-500">{steps.filter((step) => step.level === "critical").length}</div></div><div className="rounded-xl border border-border/50 bg-card p-4"><div className="text-xs text-muted-foreground">Testes criativos</div><div className="mt-1 text-2xl font-bold text-primary">{steps.filter((step) => step.source === "rotina").length}</div></div></div>
    <div className="space-y-3">{steps.map((step) => <article key={step.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-border/50 bg-card p-4 shadow-sm"><div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", step.source === "monitoramento" ? "bg-amber-500/10 text-amber-600" : "bg-primary/10 text-primary")}>{step.source === "monitoramento" ? <AlertTriangle className="h-4 w-4" /> : <TestTube2 className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">{step.title}</h2><span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{step.client_name}</span></div><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.detail}</p>{step.account_id && <div className="mt-2 text-[11px] text-muted-foreground">Conta: {step.account_id}</div>}</div><Link href={step.href} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted">Abrir ação <ArrowRight className="h-3.5 w-3.5" /></Link></article>)}{!steps.length && <div className="rounded-xl border border-dashed border-border p-12 text-center"><CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-emerald-500" /><p className="text-sm font-semibold">Operação sem pendências</p><p className="mt-1 text-xs text-muted-foreground">Quando a coleta identificar um sinal ou chegar a hora de um novo teste, ele aparecerá aqui.</p></div>}</div>
  </div>;
}
