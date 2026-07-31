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

// Estimativa: retenção média das etapas saudáveis aplicada ao gargalo revela quanto "deveria" ter passado.
// A diferença é projetada até compras/valor (se existirem) para dar um impacto financeiro semanal aproximado.
function estimateLeakImpact(stages: Stage[], leakIndex: number, periodDays: number): string | null {
  const values = stages.map((stage) => Number(stage.value || 0));
  const retentions: number[] = [];
  for (let i = 1; i < values.length; i++) if (i !== leakIndex && values[i - 1] > 0) retentions.push(values[i] / values[i - 1]);
  if (!retentions.length || values[leakIndex - 1] <= 0) return null;
  const avgRetention = retentions.reduce((sum, r) => sum + r, 0) / retentions.length;
  const expected = values[leakIndex - 1] * avgRetention;
  const lost = Math.max(0, expected - values[leakIndex]);
  if (!lost) return null;
  const weeklyFactor = 7 / Math.max(1, periodDays);
  const purchasesIndex = stages.findIndex((stage) => stage.key === "purchases");
  const valueIndex = stages.findIndex((stage) => stage.key === "value");
  if (purchasesIndex >= 0 && valueIndex >= 0 && values[purchasesIndex] > 0 && values[valueIndex] > 0 && values[leakIndex] > 0) {
    const purchaseRate = values[purchasesIndex] / values[leakIndex];
    const aov = values[valueIndex] / values[purchasesIndex];
    const impact = lost * purchaseRate * aov * weeklyFactor;
    return impact > 1 ? `-${money(impact)}/sem estimado` : null;
  }
  const nextLabel = stages[leakIndex]?.label || "etapa";
  return `-${Math.round(lost * weeklyFactor).toLocaleString("pt-BR")} ${nextLabel.toLowerCase()}/sem estimado`;
}

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
      const impact = bottleneck >= 0 ? estimateLeakImpact(client.stages, bottleneck, Number(period)) : null;
      return <section key={client.client_id} className="rounded-xl border border-border/50 bg-card p-4">
        <div className="mb-3 flex flex-wrap items-start gap-2">
          <BarChart3 className="mt-0.5 h-4 w-4 text-primary" />
          <div className="min-w-[180px] flex-1"><h2 className="text-sm font-semibold">{client.name}</h2><div className="mt-0.5 text-[11px] text-muted-foreground">{client.objective_label} · {client.account_count} conta(s)</div></div>
          {bottleneck >= 0 && <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-500">Vazamento</span>}
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">{client.accounts.map((account) => <span key={account.account_id} title={account.account_id} className="rounded-full border border-border/60 bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground">{account.platform} · {account.name}</span>)}{!client.accounts.length && <span className="text-[10px] text-muted-foreground">Nenhuma conta vinculada</span>}</div>
        <div className="space-y-1.5">{client.stages.map((stage, index) => {
          const value = Number(stage.value || 0);
          const prevValue = index > 0 ? Number(client.stages[index - 1].value || 0) : 0;
          const isLeak = index === bottleneck;
          const dropPct = index > 0 && prevValue > 0 ? (value / prevValue) * 100 : null;
          return <div key={stage.key} className={cn("relative overflow-hidden rounded-lg border p-2.5", isLeak ? "border-red-500/40 bg-red-500/5" : "border-border/40 bg-muted/10")}>
            <div className={cn("absolute inset-y-0 left-0 rounded-lg", isLeak ? "bg-red-500/20" : "bg-primary/10")} style={{ width: `${Math.max(6, (value / max) * 100)}%` }} />
            <div className="relative z-10 flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">{stage.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tabular-nums">{displayValue(stage)}</span>
                <span className={cn("w-12 text-right text-[10px] font-semibold tabular-nums", isLeak ? "text-red-500" : "text-muted-foreground")}>{index === 0 ? "100%" : dropPct !== null ? `${dropPct.toFixed(1)}%` : "—"}</span>
              </div>
            </div>
          </div>;
        })}</div>
        {impact && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs">
          <span className="font-semibold text-red-500">Gargalo · {client.stages[bottleneck].label}</span>
          <span className="font-bold text-red-500">{impact}</span>
        </div>}
      </section>;
    })}{!visibleClients.length && <div className="rounded border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Nenhum cliente encontrado para este modelo no período.</div>}</div>
  </div>;
}
