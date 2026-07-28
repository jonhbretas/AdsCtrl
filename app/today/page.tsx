"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  compareSortValues,
  SortButton,
  SortState,
  usePersistentSort,
} from "@/components/SortableHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  RefreshCw,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Settings,
} from "lucide-react";

type Priority = {
  client_id: string; client_name: string; type: string;
  client_currency?: string;
  client_group?: { name: string; color: string } | null;
  level: "critical" | "warning" | "info"; title: string; detail: string; impact?: number | null;
};
type Client = {
  id: string; name: string; source_meta_account_id?: string | null;
  primary_kpi?: string | null; target_value?: number | null;
  currency: string; accounts: { account_id: string; platform: string; hidden: boolean }[];
  group?: { name: string; color: string } | null;
  metrics: {
    mtd: { spend: number; impressions: number; clicks: number; conversions: number; value: number };
    last7: { spend: number; impressions: number; clicks: number; conversions: number; value: number };
    prev7: { spend: number; impressions: number; clicks: number; conversions: number; value: number };
    kpiValue: number;
  };
  pacing: {
    budget: number; expected: number; forecast: number;
    percentOfExpected: number | null; percentOfBudget: number | null; dailyAdjustment: number | null;
  };
  mixedCurrencies?: boolean;
  dataStatus: "fresh" | "stale" | "empty";
  alerts: any[];
  priorities: Priority[];
};
type Cockpit = {
  generated_at: string;
  summary: { spend: number; budget: number; conversions: number; value: number; currency?: string | null; mixedCurrencies?: boolean; byCurrency?: Record<string, { spend: number; budget: number }> };
  priorities: Priority[];
  clients: Client[];
  last_collection: { status?: string; started_at?: string; processed_accounts?: number; failed_accounts?: number } | null;
  error?: string;
  migration_required?: boolean;
};
type ClientSortKey = "priority" | "client" | "pacing" | "kpiAttainment" | "trend" | "forecast" | "dataStatus";
const CLIENT_SORT_KEYS: readonly ClientSortKey[] = ["priority", "client", "pacing", "kpiAttainment", "trend", "forecast", "dataStatus"];
const TODAY_SORT_STORAGE_KEY = `adsctrl:sort:today:${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())}`;

const currencyMoney = (value: number, currency: string, digits = 0) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value || 0);
const num = (value: number, digits = 0) => (value || 0).toLocaleString("pt-BR", { maximumFractionDigits: digits });
const LOWER_IS_BETTER_KPIS = new Set(["cpc", "cpm", "cpa", "cpl", "cost_per_result", "custom"]);
const MONETARY_KPIS = new Set(["roas", "revenue", "cpc", "cpm", "cpa", "cpl", "cost_per_result", "custom"]);

type KpiAttainment = { ratio: number; lowerIsBetter: boolean; };

function kpiAttainment(client: Client): KpiAttainment | null {
  const target = Number(client.target_value || 0);
  const current = Number(client.metrics.kpiValue);
  if (!client.primary_kpi || !Number.isFinite(target) || !Number.isFinite(current) || target <= 0 || current < 0) return null;
  const kpiType = client.primary_kpi.toLowerCase();
  if (client.mixedCurrencies && MONETARY_KPIS.has(kpiType)) return null;
  const lowerIsBetter = LOWER_IS_BETTER_KPIS.has(kpiType);
  if (lowerIsBetter && current <= 0) return null;
  return { ratio: lowerIsBetter ? target / current : current / target, lowerIsBetter };
}

export default function TodayPage() {
  const [data, setData] = useState<Cockpit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = usePersistentSort<ClientSortKey>(TODAY_SORT_STORAGE_KEY, { key: "priority", direction: "asc" }, CLIENT_SORT_KEYS);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/cockpit", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha ao montar cockpit.");
      setData(json);
    } catch (e: any) { setError(e?.message || "Falha ao montar cockpit."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const critical = data?.priorities.filter((p) => p.level === "critical").length || 0;
  const warning = data?.priorities.filter((p) => p.level === "warning").length || 0;
  const configured = data?.clients.filter((c) => c.pacing.budget > 0).length || 0;
  const portfolioPacing = data?.summary.budget ? (data.summary.spend / data.summary.budget) * 100 : 0;
  const portfolioCurrency = data?.summary.currency || "BRL";

  const clients = useMemo(() => {
    const rows = [...(data?.clients || [])];
    const value = (client: Client) => {
      switch (sort.key) {
        case "priority": return client.priorities.reduce((rank, p) => Math.min(rank, { critical: 0, warning: 1, info: 2 }[p.level] ?? 3), 3);
        case "client": return client.name;
        case "pacing": return client.pacing.percentOfExpected;
        case "kpiAttainment": return kpiAttainment(client)?.ratio ?? null;
        case "trend": return client.metrics.prev7.spend > 0 ? ((client.metrics.last7.spend - client.metrics.prev7.spend) / client.metrics.prev7.spend) * 100 : null;
        case "forecast": return !client.mixedCurrencies && client.pacing.forecast > 0 ? client.pacing.forecast : null;
        case "dataStatus": return { fresh: 0, stale: 1, empty: 2 }[client.dataStatus] ?? 3;
      }
    };
    return rows.sort((left, right) => {
      const lv = value(left), rv = value(right);
      if (sort.key === "forecast") {
        const lm = lv == null || (typeof lv === "number" && Number.isNaN(lv));
        const rm = rv == null || (typeof rv === "number" && Number.isNaN(rv));
        if (lm !== rm) return lm ? 1 : -1;
        if (left.currency !== right.currency) return compareSortValues(left.currency, right.currency, "asc");
      }
      if (sort.key === "priority") {
        const li = Math.max(0, ...left.priorities.map((p) => p.impact || 0));
        const ri = Math.max(0, ...right.priorities.map((p) => p.impact || 0));
        return compareSortValues(lv, rv, "asc") || compareSortValues(!left.mixedCurrencies && left.pacing.budget > 0 ? li / left.pacing.budget : 0, !right.mixedCurrencies && right.pacing.budget > 0 ? ri / right.pacing.budget : 0, "desc") || compareSortValues(left.priorities.length, right.priorities.length, "desc") || compareSortValues(Math.abs((left.pacing.percentOfExpected ?? 100) - 100), Math.abs((right.pacing.percentOfExpected ?? 100) - 100), "desc") || compareSortValues(left.name, right.name, "asc");
      }
      return compareSortValues(lv, rv, sort.direction) || compareSortValues(left.name, right.name, "asc");
    });
  }, [data, sort]);

  if (loading) {
    return (
      <div className="p-4 md:p-6 md:ml-56 pb-20 md:pb-6 space-y-4">
        <div className="space-y-2"><Skeleton className="h-8 w-48" /><Skeleton className="h-4 w-72" /></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[1,2,3,4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-4 md:p-6 md:ml-56 pb-20 md:pb-6">
        <Card className="max-w-lg mx-auto mt-20">
          <CardContent className="p-6 text-center space-y-4">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
            <h2 className="text-lg font-semibold">Cockpit ainda não disponível</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={load}>Tentar novamente</Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="p-4 md:p-6 md:ml-56 pb-20 md:pb-6 space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{greeting}, Jonathan.</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {critical ? `${critical} situação(ões) crítica(s) exigem atenção.` : "Nenhuma situação crítica detectada."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={data.last_collection?.status === "success" ? "success" : "warning"} className="text-[11px]">
            Coleta {data.last_collection?.status === "success" ? "saudável" : data.last_collection?.status || "desconhecida"}
          </Badge>
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5 mr-1" /> Atualizar</Button>
          <Link href="/admin#clients"><Button variant="secondary" size="sm"><Settings className="h-3.5 w-3.5 mr-1" /> Metas</Button></Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <CockpitKpi label="Investimento no ciclo" value={data.summary.mixedCurrencies ? "Múltiplas moedas" : currencyMoney(data.summary.spend, portfolioCurrency)} sub={data.summary.mixedCurrencies ? "Veja os valores por cliente" : data.summary.budget ? `${portfolioPacing.toFixed(0)}% do orçamento` : "Cadastre os orçamentos"} />
        <CockpitKpi label="Orçamento do ciclo" value={data.summary.mixedCurrencies ? "Por cliente" : data.summary.budget ? currencyMoney(data.summary.budget, portfolioCurrency) : "—"} sub={`${configured}/${data.clients.length} configurados`} />
        <CockpitKpi label="Resultados reportados" value={num(data.summary.conversions, 1)} sub="Soma operacional" />
        <CockpitKpi label="Fila de decisões" value={`${critical + warning}`} sub={`${critical} críticas · ${warning} atenção`} danger={critical > 0} />
      </div>

      {/* Main layout */}
      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-4">
        {/* Priority actions */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
            <div>
              <div className="text-sm font-semibold">Ações prioritárias</div>
              <div className="text-[11px] text-muted-foreground">Ordenadas por severidade e impacto</div>
            </div>
            <Badge variant="secondary" className="text-xs">{data.priorities.length}</Badge>
          </div>
          <div className="max-h-[650px] overflow-y-auto overscroll-y-contain">
            {data.priorities.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground px-4">
                <div className="text-2xl mb-1">✓</div>
                <p className="font-semibold text-foreground">Tudo tranquilo por aqui</p>
                <p className="text-xs mt-1">Nenhuma conta com saldo acabando, pagamento travado, criativo reprovado ou meta fora do ritmo.</p>
              </div>
            ) : data.priorities.slice(0, 15).map((priority, index) => (
              <PriorityCard key={`${priority.client_id}-${priority.type}-${index}`} item={priority} />
            ))}
          </div>
        </Card>

        {/* Client table */}
        <Card className="min-w-0 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-muted/20">
            <button onClick={() => setSort({ key: "priority", direction: "asc" })}
              className={cn("px-2 py-1 rounded-md text-[10px] font-bold border-none cursor-pointer transition-colors",
                sort.key === "priority" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground bg-transparent")}>
              Prioridade operacional
            </button>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[820px]">
              <div className="grid grid-cols-[1.5fr_1fr_0.85fr_0.85fr_0.9fr_70px] gap-3 px-4 py-2.5 border-b border-border/50 bg-muted/30 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider items-center">
                <SortButton column="client" sort={sort} onSort={setSort} align="left">Cliente</SortButton>
                <SortButton column="pacing" sort={sort} onSort={setSort} align="left" initialDirection="desc">Ritmo esperado</SortButton>
                <SortButton column="kpiAttainment" sort={sort} onSort={setSort} initialDirection="desc">KPI / meta</SortButton>
                <SortButton column="trend" sort={sort} onSort={setSort} initialDirection="desc">7d vs ant.</SortButton>
                <SortButton column="forecast" sort={sort} onSort={setSort} initialDirection="desc">Projeção</SortButton>
                <SortButton column="dataStatus" sort={sort} onSort={setSort} align="center" initialDirection="desc">Dados</SortButton>
              </div>
              {clients.map((client) => <ClientRow key={client.id} client={client} />)}
              {!clients.length && <div className="py-8 text-center text-sm text-muted-foreground">Nenhum cliente ativo.</div>}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ClientRow({ client }: { client: Client }) {
  const trend = client.metrics.prev7.spend ? ((client.metrics.last7.spend - client.metrics.prev7.spend) / client.metrics.prev7.spend) * 100 : null;
  const budgetPct = client.pacing.percentOfBudget || 0;
  const expectedPct = client.pacing.percentOfExpected;
  const paceColor = expectedPct == null ? "text-muted-foreground" : expectedPct > 115 ? "text-red-500" : expectedPct < 85 ? "text-amber-500" : "text-emerald-500";
  const kpiType = (client.primary_kpi || "").toLowerCase();
  const monetaryKpi = MONETARY_KPIS.has(kpiType);
  const lowerIsBetterKpi = LOWER_IS_BETTER_KPIS.has(kpiType);
  const kpi = client.metrics.kpiValue;
  const attainment = kpiAttainment(client);
  const attainmentPercent = attainment ? attainment.ratio * 100 : null;
  const attainmentColor = attainmentPercent == null ? "text-muted-foreground" : attainmentPercent >= 100 ? "text-emerald-500" : attainmentPercent >= 85 ? "text-amber-500" : "text-red-500";
  const formatKpi = (value: number) => kpiType === "roas" ? `${value.toFixed(2)}x` : kpiType === "ctr" ? `${value.toFixed(2)}%` : kpiType === "conversions" ? num(value) : currencyMoney(value, client.currency, 2);
  const kpiText = !client.primary_kpi || (client.mixedCurrencies && monetaryKpi) || (lowerIsBetterKpi && kpi <= 0) ? "—" : formatKpi(kpi);
  const targetText = !client.target_value || (client.mixedCurrencies && monetaryKpi) ? "sem comparação" : formatKpi(Number(client.target_value));
  const targetAccount = client.source_meta_account_id || client.accounts.find((a) => a.platform === "meta")?.account_id || client.accounts[0]?.account_id;
  const platforms = [...new Set(client.accounts.filter((a) => !a.hidden).map((a) => a.platform))];

  return (
    <Link href={targetAccount ? `/?account=${encodeURIComponent(targetAccount)}` : "/"}
      className="grid grid-cols-[1.5fr_1fr_0.85fr_0.85fr_0.9fr_70px] gap-3 px-4 py-3.5 border-b border-border/30 last:border-b-0 items-center text-foreground no-underline hover:bg-accent/30 transition-colors group">
      {/* Client name */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-semibold truncate">{client.name}</span>
          {client.group && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{ backgroundColor: client.group.color + "20", color: client.group.color }}>
              {client.group.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          {platforms.map((p) => (
            <span key={p} className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded uppercase", p === "google" ? "bg-sky-500/10 text-sky-600" : "bg-blue-500/10 text-blue-600")}>{p}</span>
          ))}
          {client.priorities.length > 0 && <span className="text-[10px] text-amber-600 font-medium">{client.priorities.length} ação(ões)</span>}
        </div>
      </div>

      {/* Pacing */}
      <div>
        <div className="flex justify-between text-[11px] mb-1">
          <span className="font-semibold">{client.mixedCurrencies ? "Moedas mistas" : currencyMoney(client.metrics.mtd.spend, client.currency)}</span>
          <span className="text-muted-foreground">{client.mixedCurrencies ? "corrigir" : client.pacing.budget ? `${budgetPct.toFixed(0)}%` : "sem budget"}</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(budgetPct, 100)}%`, backgroundColor: client.pacing.budget ? "var(--color-primary)" : "var(--color-muted-foreground)" }} />
        </div>
        <div className={cn("mt-1 text-[9.5px] font-bold", paceColor)}>
          {expectedPct == null ? "ritmo indisponível" : `${expectedPct.toFixed(0)}% do ritmo`}
        </div>
      </div>

      {/* KPI */}
      <div className="text-right">
        <div className="text-sm font-bold">{kpiText}</div>
        <div className="text-[10px] text-muted-foreground">meta {targetText}</div>
        {attainment && attainmentPercent != null && (
          <div className="mt-0.5 grid justify-items-end gap-0">
            <span className={cn("text-[9.5px] font-bold", attainmentColor)}>
              {attainmentPercent.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% atinge.
            </span>
            <span className="text-[9px] text-muted-foreground">{attainment.lowerIsBetter ? "↓ menor é melhor" : "↑ maior é melhor"}</span>
          </div>
        )}
      </div>

      {/* Trend */}
      <div className={cn("text-right text-sm font-semibold", trend == null ? "text-muted-foreground" : trend >= 0 ? "text-emerald-500" : "text-red-500")}>
        {trend == null ? "—" : <><span>{trend >= 0 ? "▲" : "▼"}</span> {Math.abs(trend).toFixed(1)}%</>}
      </div>

      {/* Forecast */}
      <div className="text-right">
        <div className="text-sm font-semibold">{!client.mixedCurrencies && client.pacing.forecast ? currencyMoney(client.pacing.forecast, client.currency) : "—"}</div>
        <div className="text-[10px] text-muted-foreground">{!client.mixedCurrencies && client.pacing.budget ? `de ${currencyMoney(client.pacing.budget, client.currency)}` : ""}</div>
      </div>

      {/* Data status */}
      <div className="grid place-items-center">
        <span className={cn("w-2 h-2 rounded-full", client.dataStatus === "fresh" ? "bg-emerald-500 shadow-[0_0_0_3px] shadow-emerald-500/20" : client.dataStatus === "stale" ? "bg-red-500 shadow-[0_0_0_3px] shadow-red-500/20" : "bg-muted-foreground")} title={client.dataStatus === "fresh" ? "Atual" : client.dataStatus === "stale" ? "Atrasado" : "Sem dados"} />
      </div>
    </Link>
  );
}

function PriorityCard({ item }: { item: Priority }) {
  const colors = {
    critical: { border: "border-l-red-500", bg: "bg-red-500/5", badge: "destructive" as const, label: "Crítico" },
    warning: { border: "border-l-amber-500", bg: "bg-amber-500/5", badge: "warning" as const, label: "Atenção" },
    info: { border: "border-l-sky-500", bg: "bg-sky-500/5", badge: "info" as const, label: "Info" },
  };
  const c = colors[item.level] || colors.info;
  return (
    <div className={cn("border-l-2 px-4 py-3 border-b border-border/30", c.border, c.bg)}>
      <div className="flex items-center gap-2">
        <Badge variant={c.badge} className="text-[10px]">{c.label}</Badge>
        {item.impact != null && <span className="text-[11px] text-muted-foreground ml-auto">impacto {currencyMoney(item.impact, item.client_currency || "BRL")}</span>}
      </div>
      <div className="text-sm font-semibold mt-1.5 text-foreground">
        {item.client_name}
        {item.client_group && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: item.client_group.color + "20", color: item.client_group.color }}>{item.client_group.name}</span>}
      </div>
      <div className="text-xs font-semibold text-foreground/80 mt-0.5">{item.title}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{item.detail}</div>
    </div>
  );
}

function CockpitKpi({ label, value, sub, danger }: { label: string; value: string; sub: string; danger?: boolean }) {
  return (
    <Card className={cn(danger && "border-red-500/30 bg-red-500/5")}>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground font-medium">{label}</div>
        <div className={cn("text-xl font-bold tracking-tight mt-1", danger && "text-red-500")}>{value}</div>
        <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>
      </CardContent>
    </Card>
  );
}
