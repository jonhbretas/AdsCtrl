"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Stage = { key: string; label: string; value: number };
type ClientFunnel = { client_id: string; name: string; objective: string; objective_label: string; account_count: number; accounts: { account_id: string; name: string; platform: string }[]; stages: Stage[] };
type ObjectiveOption = { value: string; label: string };

function money(value: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value || 0); }
function displayValue(stage: Stage) { return stage.key === "value" ? money(stage.value) : Number(stage.value || 0).toLocaleString("pt-BR"); }

export default function FunilPage() {
  const [clients, setClients] = useState<ClientFunnel[]>([]);
  const [objectives, setObjectives] = useState<ObjectiveOption[]>([]);
  const [period, setPeriod] = useState("7");
  const [objective, setObjective] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/funnel?period=${period}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao carregar funil.");
      setClients(data.clients || []); setObjectives(data.objective_options || []);
    } catch (e: any) { setError(e?.message || "Falha ao carregar funil."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [period]);

  const visibleClients = useMemo(() => objective === "all" ? clients : clients.filter((client) => client.objective === objective), [clients, objective]);

  if (loading && !clients.length) return <div className="p-4 md:p-6 md:ml-56 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-48 rounded-lg" /></div>;
  return <div className="p-4 md:p-6 md:ml-56 pb-20 md:pb-6 space-y-4 animate-fade-in">
    <PageHeader title="Funil 360" subtitle="Cada cliente é analisado conforme o objetivo real da operação." actions={<div className="flex flex-wrap items-center justify-end gap-2"><select value={objective} onChange={(e) => setObjective(e.target.value)} className="h-9 rounded-lg border border-border bg-transparent px-3 text-sm"><option value="all">Todos os modelos</option>{objectives.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><select value={period} onChange={(e) => setPeriod(e.target.value)} className="h-9 rounded-lg border border-border bg-transparent px-3 text-sm"><option value="7">Últimos 7 dias</option><option value="14">Últimos 14 dias</option><option value="30">Últimos 30 dias</option></select><Button variant="secondary" size="sm" onClick={load} disabled={loading}><RefreshCw className={cn("mr-1 h-3.5 w-3.5", loading && "animate-spin")} />{loading ? "Atualizando…" : "Atualizar"}</Button></div>} />
    {error && <div className="rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-500"><AlertTriangle className="mr-1 inline h-4 w-4" />{error}</div>}
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 bg-card px-4 py-3 text-xs text-muted-foreground"><BarChart3 className="h-4 w-4 text-primary" /><span><strong className="text-foreground">{visibleClients.length}</strong> cliente(s) no filtro</span><span>·</span><span>O filtro muda as etapas exibidas para respeitar o modelo de negócio.</span></div>
    <div className="space-y-3">{visibleClients.map((client) => {
      const max = Math.max(...client.stages.map((stage) => Number(stage.value || 0)), 1);
      const values = client.stages.map((stage) => Number(stage.value || 0));
      const bottleneck = values.findIndex((value, index) => index > 0 && values[index - 1] > 0 && value / values[index - 1] < 0.2);
      return <section key={client.client_id} className="rounded-xl border border-border/50 bg-card p-4">
        <div className="mb-3 flex flex-wrap items-start gap-2"><BarChart3 className="mt-0.5 h-4 w-4 text-primary" /><div className="min-w-[180px] flex-1"><h2 className="text-sm font-semibold">{client.name}</h2><div className="mt-0.5 text-[11px] text-muted-foreground">{client.objective_label} · {client.account_count} conta(s)</div></div>{bottleneck >= 0 && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600">Gargalo: {client.stages[bottleneck].label}</span>}</div>
        <div className="mb-3 flex flex-wrap gap-1.5">{client.accounts.map((account) => <span key={account.account_id} title={account.account_id} className="rounded-full border border-border/60 bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground">{account.platform} · {account.name}</span>)}{!client.accounts.length && <span className="text-[10px] text-muted-foreground">Nenhuma conta vinculada</span>}</div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">{client.stages.map((stage, index) => <div key={stage.key} className="rounded-lg border border-border/40 p-3"><div className="text-[11px] text-muted-foreground">{stage.label}</div><div className="mt-1 text-lg font-bold">{displayValue(stage)}</div><div className="mt-2 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, Number(stage.value || 0) / max * 100)}%` }} /></div>{index > 0 && Number(client.stages[index - 1].value || 0) > 0 && <div className="mt-1 text-[10px] text-muted-foreground">{(Number(stage.value || 0) / Number(client.stages[index - 1].value || 1) * 100).toFixed(1)}% da etapa anterior</div>}</div>)}</div>
      </section>;
    })}{!visibleClients.length && <div className="rounded border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Nenhum cliente encontrado para este modelo no período.</div>}</div>
  </div>;
}
