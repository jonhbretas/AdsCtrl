"use client";

import { useEffect, useMemo, useState } from "react";
import { compareSortValues, SortButton, SortState, usePersistentSort } from "@/components/SortableHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Search, RefreshCw, AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";

type AlertLevel = "critical" | "warning" | "info";
type AlertItem = { id: number; account_id: string; account_name: string; level: AlertLevel; type: string; title: string; detail: string; group?: { name: string; color: string } | null; acknowledged: boolean; acknowledged_at: string | null; resolved: boolean; resolved_at: string | null; first_seen_at: string | null; last_seen_at: string | null; };
type AlertSortKey = "level" | "account" | "alert" | "updated";
const ALERT_SORT_KEYS: readonly AlertSortKey[] = ["level", "account", "alert", "updated"];
const LEVEL: Record<AlertLevel, { label: string; variant: "destructive" | "warning" | "info" }> = { critical: { label: "Crítico", variant: "destructive" }, warning: { label: "Atenção", variant: "warning" }, info: { label: "Informativo", variant: "info" } };
const TYPE_LABEL: Record<string, string> = { account_disabled: "status", payment_issue: "pagamento", low_balance: "saldo baixo", spend_drop: "queda de gasto", spend_spike: "pico de gasto", rejected_creative: "criativo reprovado", creative_issue: "erro de veiculação", no_spend: "sem gasto", broad_location: "localização ampla" };

export default function AlertsPage() {
  const [active, setActive] = useState<AlertItem[]>([]);
  const [history, setHistory] = useState<AlertItem[]>([]);
  const [tab, setTab] = useState<"active" | "history">("active");
  const [level, setLevel] = useState<"all" | AlertLevel>("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = usePersistentSort<AlertSortKey>("adsctrl:sort:alerts", { key: "level", direction: "asc" }, ALERT_SORT_KEYS);

  async function load() { setLoading(true); setError(null); try { const [ar, hr] = await Promise.all([fetch("/api/alerts?scope=active", { cache: "no-store" }), fetch("/api/alerts?scope=history", { cache: "no-store" })]); const [ap, hp] = await Promise.all([ar.json(), hr.json()]); if (!ar.ok) throw new Error(ap.error || "Falha."); if (!hr.ok) throw new Error(hp.error || "Falha."); setActive(ap.alerts || []); setHistory(hp.alerts || []); } catch (e: any) { setError(e?.message || "Falha ao carregar."); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);

  async function setAck(id: number, acknowledged: boolean) { setBusy(id); try { const r = await fetch("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, acknowledged }) }); if (!r.ok) return; if (acknowledged) setActive((p) => p.filter((a) => a.id !== id)); else { setHistory((p) => p.filter((a) => a.id !== id)); await load(); } } finally { setBusy(null); } }

  const allGroups = useMemo(() => {
    const seen = new Map<string, { name: string; color: string }>();
    for (const a of [...active, ...history]) { if (a.group) seen.set(a.group.name, a.group); }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [active, history]);

  const filtered = useMemo(() => {
    const list = tab === "active" ? active : history;
    return list.filter((a) => (level === "all" || a.level === level) && (groupFilter === "all" || a.group?.name === groupFilter) && (!search.trim() || a.account_name.toLowerCase().includes(search.toLowerCase()) || a.title.toLowerCase().includes(search.toLowerCase()))).sort((a, b) => { const lv = (va: AlertItem) => { switch (sort.key) { case "level": return { critical: 0, warning: 1, info: 2 }[va.level]; case "account": return va.account_name; case "alert": return va.title; case "updated": return va.last_seen_at || va.first_seen_at || ""; } }; return compareSortValues(lv(a), lv(b), sort.direction); });
  }, [active, history, tab, level, groupFilter, search, sort]);

  return (
    <div className="p-4 md:p-6 md:ml-56 pb-20 md:pb-6 space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Central de Alertas</h1><p className="text-sm text-muted-foreground mt-0.5">Saldo, pagamento, criativos reprovados e quedas de gasto.</p></div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}><RefreshCw className={cn("h-3.5 w-3.5 mr-1", loading && "animate-spin")} /> Atualizar</Button>
      </div>

      {error && <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-red-500/20 bg-red-500/10 text-sm text-red-500"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/50 border border-border/50">
          {(["active", "history"] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-colors border-none cursor-pointer", tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent")}>{t === "active" ? "Ativos" : "Histórico"}</button>)}
        </div>
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/50 border border-border/50">
            {(["all", "critical", "warning", "info"] as const).map((l) => <button key={l} onClick={() => setLevel(l)} className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-colors border-none cursor-pointer", level === l ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent")}>{l === "all" ? "Todos" : LEVEL[l]?.label || l}</button>)}
          </div>
          {allGroups.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setGroupFilter("all")}
                className={cn("px-3 py-1.5 text-xs font-medium rounded-full border transition-colors", groupFilter === "all" ? "bg-primary/10 border-primary/30 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground hover:bg-accent/50")}>Todos</button>
              {allGroups.map((g) => <button key={g.name} onClick={() => setGroupFilter(g.name)}
                className={cn("px-3 py-1.5 text-xs font-medium rounded-full border transition-colors", groupFilter === g.name ? "border-primary/30" : "border-border/50 text-muted-foreground hover:text-foreground hover:bg-accent/50")}
                style={groupFilter === g.name ? { backgroundColor: g.color + "18", borderColor: g.color + "40", color: g.color } : undefined}>
                <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: g.color }} />
                {g.name}
              </button>)}
            </div>
          )}
        <div className="relative flex-1 min-w-[140px] max-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input value={search} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)} placeholder="Buscar…" className="w-full h-8 pl-8 pr-3 text-xs rounded-lg border border-border/50 bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring/30" />
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{tab === "active" ? "Nenhum alerta ativo." : "Nenhum histórico."}</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => {
            const colors = { critical: "border-l-red-500 bg-red-500/5", warning: "border-l-amber-500 bg-amber-500/5", info: "border-l-sky-500 bg-sky-500/5" };
            return (
              <div key={a.id} className={cn("border-l-2 rounded-lg p-4", colors[a.level])}>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={LEVEL[a.level].variant} className="text-[10px]">{LEVEL[a.level].label}</Badge>
                  {a.type && TYPE_LABEL[a.type] && <Badge variant="outline" className="text-[10px]">{TYPE_LABEL[a.type]}</Badge>}
                  {a.resolved && <Badge variant="success" className="text-[10px] ml-auto"><CheckCircle2 className="h-3 w-3 mr-0.5" />Resolvido</Badge>}
                </div>
                <div className="text-sm font-semibold">{a.account_name}{a.group && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: a.group.color + "20", color: a.group.color }}>{a.group.name}</span>}</div>
                <div className="text-xs font-medium text-foreground/80 mt-0.5">{a.title}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{a.detail}</div>
                <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                  <span>{new Date(a.last_seen_at || a.first_seen_at || "").toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                  {tab === "active" && !a.acknowledged && <button onClick={() => setAck(a.id, true)} disabled={busy === a.id} className="text-primary hover:underline bg-transparent border-none cursor-pointer font-semibold"><CheckCircle2 className="h-3 w-3 inline mr-0.5" />Ciente</button>}
                  {tab === "history" && a.acknowledged && !a.resolved && <button onClick={() => setAck(a.id, false)} disabled={busy === a.id} className="text-primary hover:underline bg-transparent border-none cursor-pointer font-semibold"><RotateCcw className="h-3 w-3 inline mr-0.5" />Reabrir</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
