"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  Download,
  MoreHorizontal,
  AlertTriangle,
  Info,
  TrendingUp,
  TrendingDown,
  Minus,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Search,
  DollarSign,
  Target,
  BarChart3,
  Wallet,
  Activity,
  Settings,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
} from "lucide-react";
import {
  compareSortValues,
  SortButton,
  SortState,
  usePersistentSort,
} from "@/components/SortableHeader";
import QuickAccess from "@/components/QuickAccess";
import AccountDetail from "@/components/AccountDetail";
import AccountChanges from "@/components/AccountChanges";
import { money, num, delta, brDate, accountStatusInfo, RESULT_FAMILIES, RESULT_FAMILY_BY_SLUG, pickVal } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Metrics {
  spend: number;
  conversions: number;
  purchases?: number;
  purchase_value?: number;
  value?: number;
  results?: Record<string, number> | null;
  cpc?: number;
  daily?: { date: string; spend: number }[] | null;
}
interface PrevMetrics {
  spend: number;
  conversions: number;
  purchases?: number;
  purchase_value?: number;
  value?: number;
  results?: Record<string, number> | null;
}
interface AlertItem {
  id: number;
  level: "critical" | "warning" | "info";
  type?: string;
  title: string;
  detail: string;
  account_name: string;
  acknowledged?: boolean;
  resolved?: boolean;
  acknowledged_at?: string | null;
  resolved_at?: string | null;
  last_seen_at?: string | null;
}
interface Account {
  account_id: string;
  platform: "meta" | "google";
  name: string;
  currency: string;
  status: string;
  balance: number | null;
  is_prepaid?: boolean | null;
  unbilled_amount?: number | null;
  group_id: string | null;
  hidden?: boolean;
  linked_meta_account_id?: string | null;
  updated_at?: string;
  metrics: Metrics | null;
  prevMetrics: PrevMetrics | null;
  metricsByPeriod?: Record<string, Metrics>;
  prevByPeriod?: Record<string, PrevMetrics>;
  alerts: AlertItem[];
}
interface Group {
  id: string;
  name: string;
  color: string;
}
interface LiveOverview {
  range: { since: string; until: string };
  metrics: Record<string, Metrics>;
  prev: Record<string, PrevMetrics>;
  errors?: { account_id: string; platform: string; message: string }[];
}

type Period = "today" | "7d" | "14d" | "30d" | "mtd" | "custom";
type AccountSortKey = "name" | "channels" | "trend" | "spend" | "result" | "balance";
const ACCOUNT_SORT_KEYS: readonly AccountSortKey[] = ["name", "channels", "trend", "spend", "result", "balance"];
const PRESETS: { key: Period; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "7d", label: "7D" },
  { key: "14d", label: "14D" },
  { key: "30d", label: "30D" },
  { key: "mtd", label: "Mês atual" },
];

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function firstOfMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function rangeForPeriod(period: Period, customSince: string, customUntil: string) {
  const today = isoDaysAgo(0);
  switch (period) {
    case "today": return { since: today, until: today };
    case "7d": return { since: isoDaysAgo(7), until: isoDaysAgo(1) };
    case "14d": return { since: isoDaysAgo(14), until: isoDaysAgo(1) };
    case "30d": return { since: isoDaysAgo(30), until: isoDaysAgo(1) };
    case "mtd": return { since: firstOfMonth(), until: today };
    case "custom": return { since: customSince, until: customUntil };
  }
}

const PERIOD_SHORT: Record<Period, string> = { today: "hoje", "7d": "7d", "14d": "14d", "30d": "30d", mtd: "mês", custom: "período" };

function initials(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function Sparkline({ points, color = "#22d3ee", width = 72, height = 22 }: { points: number[]; color?: string; width?: number; height?: number }) {
  if (!points || points.length < 2) return <div style={{ width, height }} />;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const coords = points.map((v, i) => [i * step, height - ((v - min) / span) * (height - 4) - 2]);
  const path = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${path} L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} className="block">
      <path d={area} fill={color + "18"} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function Dashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<"meta" | "google" | "all">("meta");
  const [onlyActive, setOnlyActive] = useState(true);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<Period>("7d");
  const [focus, setFocus] = useState<string>("vendas");
  const [customSince, setCustomSince] = useState(isoDaysAgo(7));
  const [customUntil, setCustomUntil] = useState(isoDaysAgo(1));
  const [showCustom, setShowCustom] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [salesData, setSalesData] = useState<Map<string, { revenue: number; orders: number; spend: number }>>(new Map());
  const [alertTab, setAlertTab] = useState<"active" | "history">("active");
  const [history, setHistory] = useState<AlertItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [acking, setAcking] = useState<number | null>(null);
  const [live, setLive] = useState<LiveOverview | null>(null);
  const [linkedLive, setLinkedLive] = useState<Record<string, Metrics>>({});
  const [liveLoading, setLiveLoading] = useState(false);
  const [tableSort, setTableSort] = usePersistentSort<AccountSortKey>(
    "adsctrl:sort:overview",
    { key: "spend", direction: "desc" },
    ACCOUNT_SORT_KEYS
  );

  const router = useRouter();

  // Clicar na linha expande as campanhas (Meta + Google vinculado) dentro da
  // conta; a seta no fim da linha abre a tela completa de campanhas.
  function openCampaigns(accountId: string) {
    window.localStorage.setItem("adsctrl:selected-account", accountId);
    window.dispatchEvent(new CustomEvent("adsctrl:account-selected", { detail: accountId }));
    router.push(`/campanhas?account=${encodeURIComponent(accountId)}`);
  }

  useEffect(() => {
    if (window.location.hash === "#alerts") window.location.replace("/alerts");
  }, []);

  // Chegou com ?account= na URL (ex.: link direto de outra tela): abre a
  // visão geral já com a linha da conta expandida e rola até ela.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("account");
    if (!requested) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("account");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    const found = accounts.find((acc) => acc.account_id === requested);
    const isGoogle = requested.startsWith("google:") || found?.platform === "google";
    if (isGoogle) setFocus("conversoes");
    setPlatformFilter(isGoogle ? "google" : "meta");
    if (found?.status !== "ACTIVE") setOnlyActive(false);
    if (found?.hidden) setShowHidden(true);
    setExpanded(requested);
    let tries = 0;
    const scroll = () => {
      const el = document.getElementById(`account-${requested}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      else if (tries++ < 10) setTimeout(scroll, 200);
    };
    scroll();
  }, [accounts]);

  const range = useMemo(() => rangeForPeriod(period, customSince, customUntil), [period, customSince, customUntil]);
  const isLive = true;
  const periodKey = period === "7d" || period === "14d" || period === "30d" ? period : null;
  const liveReady = !isLive || !!live;

  type M = { spend: number; conversions: number; value: number; results: Record<string, number>; result: number; daily: { date: string; spend: number }[] };
  const norm = (m?: Metrics | PrevMetrics | null): M => {
    const results = m?.results || {};
    return {
      spend: m?.spend || 0,
      conversions: m?.conversions || 0,
      value: (m as Metrics)?.value ?? m?.purchase_value ?? 0,
      results,
      result: results[focus] || 0,
      daily: (m as Metrics)?.daily || [],
    };
  };

  function accMetrics(a: Account): M {
    if (isLive) return norm(live?.metrics?.[a.account_id] || linkedLive[a.account_id]);
    return norm((periodKey && a.metricsByPeriod?.[periodKey]) || a.metrics);
  }
  function accPrev(a: Account): M {
    if (isLive) return norm(live?.prev?.[a.account_id]);
    return norm((periodKey && a.prevByPeriod?.[periodKey]) || a.prevMetrics);
  }

  // Conta Google vinculada a um cliente Meta, por id da conta Meta. Em "Todas"
  // a linha do cliente precisa somar as duas plataformas — sem isto, o
  // Investimento da linha ficava igual ao de "Meta", porque cada linha só
  // lia os próprios números, nunca os da conta vinculada. Contas vinculadas
  // entram mesmo ocultas: o vínculo é declaração de que o Google faz parte
  // do cliente, e "Todas" é a visão por cliente.
  const linkedGoogleByMeta = useMemo(() => {
    const map = new Map<string, Account[]>();
    for (const g of accounts) {
      if (g.platform === "google" && g.linked_meta_account_id) {
        const list = map.get(g.linked_meta_account_id) || [];
        list.push(g);
        map.set(g.linked_meta_account_id, list);
      }
    }
    return map;
  }, [accounts]);

  // Métricas da linha, combinadas com a conta Google vinculada quando "Todas"
  // está selecionado. Fora de "Todas", a linha mostra só a própria conta —
  // clicar em Meta continua mostrando só Meta, como já era. Quando o dado ao
  // vivo da conta Google faltar (erro de API), cai no snapshot do período.
  function combine(own: M, a: Account): M {
    if (platformFilter !== "all" || a.platform !== "meta") return own;
    const linked = linkedGoogleByMeta.get(a.account_id) || [];
    if (!linked.length) return own;
    let spend = own.spend, conversions = own.conversions, value = own.value;
    const results = { ...own.results };
    for (const g of linked) {
      const gm = isLive
        ? norm(live?.metrics?.[g.account_id] || linkedLive[g.account_id] || (periodKey && g.metricsByPeriod?.[periodKey]) || g.metrics)
        : norm((periodKey && g.metricsByPeriod?.[periodKey]) || g.metrics);
      spend += gm.spend; conversions += gm.conversions; value += gm.value;
      for (const [k, v] of Object.entries(gm.results)) results[k] = (results[k] || 0) + v;
    }
    return { ...own, spend, conversions, value, results, result: results[focus] || 0 };
  }
  function comboMetrics(a: Account): M { return combine(accMetrics(a), a); }

  function comboPrev(a: Account): M {
    if (platformFilter !== "all" || a.platform !== "meta") return accPrev(a);
    const linked = linkedGoogleByMeta.get(a.account_id) || [];
    const own = accPrev(a);
    if (!linked.length) return own;
    let spend = own.spend, conversions = own.conversions, value = own.value;
    const results = { ...own.results };
    for (const g of linked) {
      const gp = isLive
        ? norm(live?.prev?.[g.account_id] || (periodKey && g.prevByPeriod?.[periodKey]) || g.prevMetrics)
        : norm((periodKey && g.prevByPeriod?.[periodKey]) || g.prevMetrics);
      spend += gp.spend; conversions += gp.conversions; value += gp.value;
      for (const [k, v] of Object.entries(gp.results)) results[k] = (results[k] || 0) + v;
    }
    return { ...own, spend, conversions, value, results, result: results[focus] || 0 };
  }

  async function load() {
    setError(null);
    try {
      const [r, sr] = await Promise.all([
        fetch("/api/accounts"),
        fetch("/api/sales?months=1", { cache: "no-store" }).catch(() => null),
      ]);
      const text = await r.text();
      const d = text ? JSON.parse(text) : {};
      if (!r.ok || d.error) throw new Error(d.error || `Falha ao carregar (HTTP ${r.status}).`);
      setAccounts(d.accounts || []);
      setGroups(d.groups || []);
      setAlerts(d.alerts || []);

      // Carrega dados de vendas (ROI offline) por nome de conta/cliente
      if (sr && sr.ok) {
        const sd = await sr.json();
        const map = new Map<string, { revenue: number; orders: number; spend: number }>();
        for (const row of sd.rows || []) {
          const m = row.months?.[0];
          if (m && (m.revenue != null || m.orders != null)) {
            map.set(row.name.toLowerCase().trim(), {
              revenue: m.revenue ?? 0,
              orders: m.orders ?? 0,
              spend: m.spend || 0,
            });
          }
        }
        setSalesData(map);
      }
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar os dados.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!isLive) { setLive(null); return; }
    if (period === "custom" && (!range.since || !range.until || range.since > range.until)) return;
    let alive = true;
    setLiveLoading(true);
    setLive(null);
    fetch(`/api/accounts/overview?since=${range.since}&until=${range.until}&platform=${platformFilter}`)
      .then(async (r) => {
        const t = await r.text();
        const d = t ? JSON.parse(t) : {};
        if (!r.ok || d.error) throw new Error(d.error || `Falha (HTTP ${r.status}).`);
        return d as LiveOverview;
      })
      .then((d) => { if (alive) setLive(d); })
      .catch(() => { if (alive) setLive({ range, metrics: {}, prev: {} }); })
      .finally(() => { if (alive) setLiveLoading(false); });
    return () => { alive = false; };
  }, [period, range.since, range.until, platformFilter]);

  useEffect(() => { setLinkedLive({}); }, [range.since, range.until]);

  // Métricas ao vivo das contas Google vinculadas à conta Meta expandida.
  // No filtro Meta a busca ao vivo só traz contas Meta; sem esta busca o
  // cabeçalho do bloco Google (dentro da conta) ficaria zerado. Em "Todas"
  // a busca ao vivo já inclui o Google e nada é buscado de novo aqui.
  useEffect(() => {
    if (!expanded) return;
    const aberta = accounts.find((a) => a.account_id === expanded);
    if (!aberta || aberta.platform !== "meta") return;
    const ids = accounts
      .filter((g) => g.platform === "google" && g.linked_meta_account_id === expanded)
      .map((g) => g.account_id)
      .filter((id) => !live?.metrics?.[id] && !linkedLive[id]);
    if (!ids.length) return;
    let alive = true;
    const params = new URLSearchParams({ since: range.since, until: range.until, accounts: ids.join(",") });
    fetch(`/api/accounts/overview?${params}`)
      .then((r) => r.json())
      .then((d) => { if (alive && d?.metrics) setLinkedLive((prev) => ({ ...prev, ...d.metrics })); })
      .catch(() => {});
    return () => { alive = false; };
  }, [expanded, accounts, range.since, range.until, live]);

  async function refresh() {
    setRefreshing(true);
    await load();
    if (isLive) {
      try {
        const r = await fetch(`/api/accounts/overview?since=${range.since}&until=${range.until}&platform=${platformFilter}`);
        const t = await r.text();
        setLive(t ? JSON.parse(t) : null);
      } catch { /* silent */ }
    }
    if (alertTab === "history") await loadHistory();
    setRefreshing(false);
  }

  async function collectNow(platform: "all" | "meta" | "google" = "all") {
    if (collecting) return;
    setCollecting(true);
    const escopo = platform === "meta" ? "do Meta" : platform === "google" ? "do Google" : "de todas as plataformas";
    setSyncMsg(`Coletando dados ${escopo}… (pode levar até 1 min)`);
    try {
      const r = await fetch("/api/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || `Falha (HTTP ${r.status}).`);
      await load();
      setSyncMsg(`Coleta concluída: ${d.accounts} conta(s), ${d.alerts} alerta(s)` + (d.failed ? `, ${d.failed} falha(s)` : "") + ` em ${(d.took_ms / 1000).toFixed(0)}s.`);
    } catch (e: any) {
      setSyncMsg(e?.message ?? "Erro na coleta.");
    } finally {
      setCollecting(false);
    }
  }

  async function syncAccounts(platform: "all" | "meta" | "google" = "all") {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await fetch("/api/accounts/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || `Falha (HTTP ${r.status}).`);
      await load();
      setSyncMsg(d.added > 0 ? `+${d.added} conta(s) nova(s): ${d.addedNames.join(", ")}` : `Nenhuma conta nova. ${d.total} contas acessíveis.`);
    } catch (e: any) {
      setSyncMsg(e?.message ?? "Erro ao sincronizar.");
    } finally {
      setSyncing(false);
    }
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const r = await fetch("/api/alerts?scope=history");
      const d = await r.json();
      setHistory(d.alerts || []);
    } catch { /* silent */ } finally { setHistoryLoading(false); }
  }

  useEffect(() => { if (alertTab === "history") loadHistory(); }, [alertTab]);

  async function setAck(id: number, acknowledged: boolean) {
    setAcking(id);
    try {
      await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, acknowledged }),
      });
      if (acknowledged) {
        setAlerts((prev) => prev.filter((a) => a.id !== id));
      } else {
        setHistory((prev) => prev.filter((a) => a.id !== id));
        await load();
      }
    } finally { setAcking(null); }
  }

  async function toggleHidden(id: string, hidden: boolean) {
    setAccounts((prev) => prev.map((a) => (a.account_id === id ? { ...a, hidden } : a)));
    try {
      const response = await fetch("/api/accounts/hidden", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: id, hidden }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.error) throw new Error(payload.error || `Falha ao atualizar conta.`);
    } catch { await load(); }
  }

  const hiddenCount = useMemo(() => accounts.filter((a) => a.hidden).length, [accounts]);
  const platformCounts = useMemo(() => ({
    meta: accounts.filter((a) => a.platform !== "google").length,
    google: accounts.filter((a) => a.platform === "google").length,
  }), [accounts]);

  const filtered = useMemo(() => {
    let list = accounts;
    if (!showHidden) list = list.filter((a) => !a.hidden);
    if (platformFilter !== "all") list = list.filter((a) => a.platform === platformFilter);
    if (groupFilter !== "all") list = list.filter((a) => a.group_id === groupFilter);
    if (onlyActive) list = list.filter((a) => a.status === "ACTIVE");
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((a) => a.name.toLowerCase().includes(q));
    }
    // Em "Todas", a conta Google vinculada já entra somada na linha do
    // cliente Meta (ver combine()). Listá-la de novo como linha própria
    // contaria o investimento duas vezes no total da tela.
    if (platformFilter === "all") {
      const visibleMetaIds = new Set(list.filter((a) => a.platform === "meta").map((a) => a.account_id));
      list = list.filter((a) => !(a.platform === "google" && a.linked_meta_account_id && visibleMetaIds.has(a.linked_meta_account_id)));
    }
    const value = (account: Account) => {
      const metrics = combine(accMetrics(account), account);
      const previous = combine(accPrev(account), account);
      const unavailable = isLive && Boolean(live?.errors?.some((item) => item.account_id === account.account_id));
      switch (tableSort.key) {
        case "name": return account.name;
        case "channels": return account.platform === "meta" ? 1 + Number(accounts.some((candidate) => candidate.platform === "google" && candidate.linked_meta_account_id === account.account_id)) : 1;
        case "trend": return !unavailable && previous.spend > 0 ? ((metrics.spend - previous.spend) / previous.spend) * 100 : null;
        case "spend": return unavailable ? null : metrics.spend;
        case "result": return unavailable ? null : metrics.result;
        case "balance": return account.platform === "meta" ? account.balance : null;
      }
    };
    return [...list].sort((left, right) => {
      const leftValue = value(left);
      const rightValue = value(right);
      if (tableSort.key === "spend" || tableSort.key === "balance") {
        const leftMissing = leftValue == null || (typeof leftValue === "number" && Number.isNaN(leftValue));
        const rightMissing = rightValue == null || (typeof rightValue === "number" && Number.isNaN(rightValue));
        if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
        if (left.currency !== right.currency) return compareSortValues(left.currency, right.currency, "asc");
      }
      return compareSortValues(leftValue, rightValue, tableSort.direction) || compareSortValues(left.name, right.name, "asc");
    });
  }, [accounts, groupFilter, platformFilter, onlyActive, search, showHidden, period, live, tableSort, focus, linkedGoogleByMeta, linkedLive]);

  const totals = useMemo(() => {
    let spend = 0, res = 0, val = 0;
    let prevSpend = 0, prevRes = 0, prevVal = 0;
    const byCurrency: Record<string, { spend: number; res: number; val: number; prevSpend: number; prevRes: number; prevVal: number }> = {};
    for (const a of filtered) {
      const m = comboMetrics(a), p = comboPrev(a);
      const currency = (a.currency || "BRL").toUpperCase();
      const bucket = byCurrency[currency] || (byCurrency[currency] = { spend: 0, res: 0, val: 0, prevSpend: 0, prevRes: 0, prevVal: 0 });
      spend += m.spend; res += m.result; val += m.value;
      prevSpend += p.spend; prevRes += p.result; prevVal += p.value;
      bucket.spend += m.spend; bucket.res += m.result; bucket.val += m.value;
      bucket.prevSpend += p.spend; bucket.prevRes += p.result; bucket.prevVal += p.value;
    }
    const currencyTotals = Object.entries(byCurrency).sort(([left], [right]) => left.localeCompare(right, "pt-BR")).map(([currency, values]) => ({ currency, ...values }));
    return {
      spend, res, val,
      cpr: res ? spend / res : 0,
      roas: spend ? val / spend : 0,
      prevSpend, prevRes, prevVal,
      prevCpr: prevRes ? prevSpend / prevRes : 0,
      prevRoas: prevSpend ? prevVal / prevSpend : 0,
      currencyTotals,
      mixedCurrencies: currencyTotals.length > 1,
    };
  }, [filtered, period, live, focus, platformFilter, linkedGoogleByMeta, linkedLive]);

  const CONVERSION_FAMILY_SLUGS = ["vendas", "mensagens", "leads", "cadastros"];
  const familyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of RESULT_FAMILIES) counts[f.slug] = 0;
    for (const a of filtered) {
      const m = comboMetrics(a);
      for (const f of RESULT_FAMILIES) {
        if (f.slug === "conversoes") continue;
        counts[f.slug] += pickVal(m.results, f.keys);
      }
    }
    counts.conversoes = CONVERSION_FAMILY_SLUGS.reduce((s, slug) => s + (counts[slug] || 0), 0);
    return counts;
  }, [filtered, period, live, platformFilter, linkedGoogleByMeta, linkedLive]);

  const visibleAlerts = useMemo(() => {
    const names = new Set(filtered.map((a) => a.name));
    const order = { critical: 0, warning: 1, info: 2 } as Record<string, number>;
    return alerts.filter((a) => names.has(a.account_name)).sort((a, b) => order[a.level] - order[b.level]);
  }, [alerts, filtered]);

  const visibleHistory = useMemo(() => {
    const names = new Set(filtered.map((a) => a.name));
    return groupFilter === "all" ? history : history.filter((a) => names.has(a.account_name));
  }, [history, filtered, groupFilter]);

  const lastUpdated = useMemo(() => {
    const ts = accounts.map((a) => a.updated_at).filter(Boolean).sort().pop();
    return ts ? new Date(ts).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;
  }, [accounts]);

  const groupById = (id: string | null) => groups.find((g) => g.id === id);
  const activeFilters = [groupFilter !== "all", platformFilter !== "meta" && platformFilter !== "all", !onlyActive, search.trim() !== "", showHidden].filter(Boolean).length;
  const periodLabel = period === "custom" ? "personalizado" : PRESETS.find((p) => p.key === period)?.label || period;
  const platformLabel = platformFilter === "google" ? "Google" : platformFilter === "all" ? "Meta + Google" : "Meta";
  const short = PERIOD_SHORT[period];
  const fam = RESULT_FAMILY_BY_SLUG[focus] || RESULT_FAMILIES[0];
  const primaryCurrency = totals.currencyTotals[0]?.currency || "BRL";
  const moneySummary = (getValue: (entry: (typeof totals.currencyTotals)[number]) => number, digits = 2) =>
    totals.currencyTotals.length ? totals.currencyTotals.map((entry) => money(getValue(entry), entry.currency, digits)).join(" · ") : "—";
  const investmentValue = totals.mixedCurrencies ? moneySummary((entry) => entry.spend, 0) : money(totals.spend, primaryCurrency, 0);
  const cprValue = totals.mixedCurrencies ? totals.currencyTotals.map((entry) => entry.res > 0 ? money(entry.spend / entry.res, entry.currency) : `— ${entry.currency}`).join(" · ") : totals.res > 0 ? money(totals.cpr, primaryCurrency) : "—";
  const purchaseValue = totals.mixedCurrencies ? moneySummary((entry) => entry.val, 0) : money(totals.val, primaryCurrency, 0);
  const roasValue = totals.mixedCurrencies ? totals.currencyTotals.map((entry) => entry.spend > 0 ? `${(entry.val / entry.spend).toFixed(2)}x ${entry.currency}` : `— ${entry.currency}`).join(" · ") : totals.spend > 0 ? `${totals.roas.toFixed(2)}x` : "—";

  if (loading) {
    return (
      <div className="p-4 md:p-6 md:ml-56 pb-20 md:pb-6 space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1,2,3,4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 md:p-6 md:ml-56 pb-20 md:pb-6">
        <Card className="max-w-lg mx-auto mt-20">
          <CardContent className="p-8 text-center space-y-4">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
            <h2 className="text-xl font-semibold">Não foi possível carregar</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={refresh}>Tentar de novo</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 md:ml-56 pb-20 md:pb-6 space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Visão Geral</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Métricas de mídia paga (Meta + Google) por conta</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {lastUpdated && <Badge variant="secondary" className="text-xs">Coleta: {lastUpdated}</Badge>}
          {syncMsg && (
            <Badge variant="info" className="text-xs max-w-[240px] truncate" title={syncMsg}>
              {syncMsg}
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4 mr-1", refreshing && "animate-spin")} />
            {refreshing ? "Atualizando…" : `Atualizar ${platformLabel}`}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => syncAccounts("meta")} disabled={syncing}>
                <Download className="h-4 w-4" /> Sincronizar Meta
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => syncAccounts("google")} disabled={syncing}>
                <Download className="h-4 w-4" /> Sincronizar Google
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => collectNow("meta")} disabled={collecting}>
                <Activity className="h-4 w-4" /> Coletar Meta
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => collectNow("google")} disabled={collecting}>
                <Activity className="h-4 w-4" /> Coletar Google
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => collectNow("all")} disabled={collecting}>
                <Activity className="h-4 w-4" /> Coletar Tudo
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/admin"><Settings className="h-4 w-4" /> Grupos</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Live errors */}
      {!!live?.errors?.length && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{live.errors.length} conta(s) com dados ao vivo indisponíveis.</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-2 p-1 rounded-lg bg-muted/50 border border-border/50">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => { setPeriod(p.key); setShowCustom(false); }}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                period === p.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setShowCustom(true)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
              period === "custom" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Personalizado
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 p-1 rounded-lg bg-muted/50 border border-border/50">
          <button onClick={() => setPlatformFilter("meta")} className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-colors", platformFilter === "meta" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            Meta
          </button>
          <button onClick={() => setPlatformFilter("all")} className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-colors", platformFilter === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            Todas
          </button>
          <button onClick={() => { setPlatformFilter("google"); setFocus("conversoes"); }} className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-colors", platformFilter === "google" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            Google
          </button>
        </div>

        <div className="relative flex-1 min-w-[140px] max-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar conta…"
            className="w-full h-8 pl-8 pr-3 text-xs rounded-lg border border-border/50 bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-colors placeholder:text-muted-foreground"
          />
        </div>

        <select
          value={onlyActive ? "active" : "all"}
          onChange={(e) => setOnlyActive(e.target.value === "active")}
          className="h-8 px-2.5 text-xs rounded-lg border border-border/50 bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring/30"
        >
          <option value="active">Somente ativas</option>
          <option value="all">Todas</option>
        </select>

        <select
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          className="h-8 px-2.5 text-xs rounded-lg border border-border/50 bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring/30"
        >
          {RESULT_FAMILIES.map((f) => (
            <option key={f.slug} value={f.slug}>
              {f.label}{liveReady && familyCounts[f.slug] > 0 ? ` (${familyCounts[f.slug].toLocaleString("pt-BR")})` : ""}
            </option>
          ))}
        </select>

        {hiddenCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setShowHidden((v) => !v)} className="h-8 text-xs">
            {showHidden ? "Ocultar" : `Mostrar (${hiddenCount})`}
          </Button>
        )}
      </div>

      {/* Custom period */}
      {showCustom && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input type="date" value={customSince} max={customUntil}
            onChange={(e) => { setCustomSince(e.target.value); setPeriod("custom"); }}
            className="h-8 px-2.5 text-xs rounded-lg border border-border/50 bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
          <span className="text-muted-foreground">→</span>
          <input type="date" value={customUntil} min={customSince} max={isoDaysAgo(0)}
            onChange={(e) => { setCustomUntil(e.target.value); setPeriod("custom"); }}
            className="h-8 px-2.5 text-xs rounded-lg border border-border/50 bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
          <span className="text-xs text-muted-foreground">{range.since} → {range.until}</span>
          <Badge variant={liveLoading ? "warning" : "success"} className="text-[10px]">
            {liveLoading ? "buscando…" : "dados ao vivo"}
          </Badge>
          {totals.mixedCurrencies && (
            <Badge variant="warning" className="text-[10px]">
              Moedas: {totals.currencyTotals.map((e) => e.currency).join(" · ")}
            </Badge>
          )}
        </div>
      )}

      {/* Groups */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setGroupFilter("all")}
          className={cn(
            "px-3 py-1.5 text-xs font-medium rounded-full border transition-colors",
            groupFilter === "all"
              ? "bg-primary/10 border-primary/30 text-primary"
              : "border-border/50 text-muted-foreground hover:text-foreground hover:bg-accent/50"
          )}
        >
          Todos
        </button>
        {groups.map((g) => (
          <button
            key={g.id}
            onClick={() => setGroupFilter(g.id)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-full border transition-colors",
              groupFilter === g.id
                ? "border-primary/30 text-primary"
                : "border-border/50 text-muted-foreground hover:text-foreground hover:bg-accent/50"
            )}
            style={groupFilter === g.id ? { backgroundColor: g.color + "18", borderColor: g.color + "40", color: `color-mix(in srgb, ${g.color} 62%, var(--color-foreground))` } : undefined}
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: g.color }} />
            {g.name}
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={DollarSign}
          label={`Investimento (${short})`}
          value={liveReady ? investmentValue : "…"}
          trend={!totals.mixedCurrencies && totals.prevSpend > 0 ? ((totals.spend - totals.prevSpend) / totals.prevSpend) * 100 : null}
        />
        <KpiCard
          icon={Target}
          label={`${fam.label} (${short})`}
          value={liveReady ? num(totals.res) : "…"}
          trend={totals.prevRes > 0 ? ((totals.res - totals.prevRes) / totals.prevRes) * 100 : null}
        />
        <KpiCard
          icon={BarChart3}
          label="Custo por resultado"
          value={liveReady ? cprValue : "…"}
          trend={!totals.mixedCurrencies && totals.prevCpr > 0 ? ((totals.cpr - totals.prevCpr) / totals.prevCpr) * 100 : null}
          invertTrend
        />
        {fam.sales && (
          <KpiCard
            icon={Activity}
            label="ROAS"
            value={liveReady ? roasValue : "…"}
            trend={!totals.mixedCurrencies && totals.prevSpend > 0 ? ((totals.roas - totals.prevRoas) / totals.prevRoas) * 100 : null}
          />
        )}
      </div>

      {/* Main area: Table only */}
      <div>
        {/* Table */}
        <Card className="min-w-0 overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              {/* Header */}
              <div className="grid grid-cols-[1.7fr_0.5fr_0.8fr_1fr_0.9fr_0.7fr_0.9fr_28px_28px] gap-2 px-4 py-2.5 border-b border-border/50 bg-muted/30 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider items-center">
                <GridSortHeader sortKey="name" sort={tableSort} onSort={setTableSort} align="left">Cliente</GridSortHeader>
                <GridSortHeader sortKey="channels" sort={tableSort} onSort={setTableSort} align="left" initialDirection="desc">Canais</GridSortHeader>
                <GridSortHeader sortKey="trend" sort={tableSort} onSort={setTableSort} align="center" initialDirection="desc">Tendência</GridSortHeader>
                <GridSortHeader sortKey="spend" sort={tableSort} onSort={setTableSort} initialDirection="desc">Investimento ({short})</GridSortHeader>
                <GridSortHeader sortKey="result" sort={tableSort} onSort={setTableSort} initialDirection="desc">{fam.label.split(" ")[0]}</GridSortHeader>
                <span>Vendas (ROI)</span>
                <GridSortHeader sortKey="balance" sort={tableSort} onSort={setTableSort} initialDirection="desc">Saldo / fatura</GridSortHeader>
                <span /><span />
              </div>

              {isLive && !liveReady && (
                <div className="py-12 text-center text-sm text-muted-foreground">Buscando dados ao vivo…</div>
              )}
              {liveReady && filtered.length === 0 && (
                <div className="py-12 text-center text-sm text-muted-foreground">Nenhuma conta com os filtros atuais.</div>
              )}

              {liveReady && filtered.map((a) => {
                const g = groupById(a.group_id);
                const m = comboMetrics(a);
                const previous = comboPrev(a);
                const liveError = isLive ? live?.errors?.find((item) => item.account_id === a.account_id) : undefined;
                const spendTrend = !liveError && previous.spend > 0 ? ((m.spend - previous.spend) / previous.spend) * 100 : null;
                const linkedMeta = a.platform === "google" && a.linked_meta_account_id ? accounts.find((meta) => meta.account_id === a.linked_meta_account_id) : null;
                const linkedGoogle = a.platform === "meta" ? accounts.filter((google) => google.platform === "google" && google.linked_meta_account_id === a.account_id) : [];
                const open = !a.hidden && expanded === a.account_id;
                const dimmed = expanded !== null && !open && !a.hidden;

                return (
                  <div id={`account-${a.account_id}`} key={a.account_id} className={cn("border-b border-border/30 last:border-b-0 transition-all duration-300", a.hidden && "opacity-55", dimmed && "opacity-40")}>
                    <div
                      onClick={() => { if (!a.hidden) setExpanded(open ? null : a.account_id); }}
                      className={cn(
                        "grid grid-cols-[1.7fr_0.5fr_0.8fr_1fr_0.9fr_0.7fr_0.9fr_28px_28px] gap-2 px-4 py-3 items-center transition-colors",
                        a.hidden ? "cursor-default" : "cursor-pointer hover:bg-accent/30",
                        open && "bg-accent/20"
                      )}
                    >
                      {/* Client */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar className="h-7 w-7 border border-border/50">
                          <AvatarFallback className="text-[11px] font-bold" style={{ backgroundColor: g?.color || "var(--color-muted-foreground)", color: "#fff" }}>
                            {initials(a.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate flex items-center gap-1.5" title={a.name}>
                            {!a.hidden && (open ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />)}
                            <span className="truncate">{a.name}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {g && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: g.color + "20", color: `color-mix(in srgb, ${g.color} 62%, var(--color-foreground))` }}>{g.name}</span>}
                            {linkedMeta && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 font-medium">Cliente</span>}
                            {/* Mesmo formato dos chips ao lado (grupo, Cliente):
                                pílula com fundo, em português. Antes era
                                "● UNSETTLED" em texto solto vermelho — destoava
                                da linha e não dizia o que havia de errado. */}
                            {a.status !== "ACTIVE" && (() => {
                              const s = accountStatusInfo(a.status);
                              return (
                                <span
                                  title={`status na plataforma: ${a.status}`}
                                  className={cn(
                                    "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                                    s.tone === "bad" ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                  )}
                                >
                                  {s.label}
                                </span>
                              );
                            })()}
                            {a.hidden && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">oculta</span>}
                          </div>
                        </div>
                      </div>

                      {/* Platform badges */}
                      <div className="flex gap-1">
                        {a.platform === "google" ? (
                          <span className="w-5 h-5 rounded text-[10px] font-bold grid place-items-center bg-sky-500/10 text-sky-600 dark:text-sky-400" title="Google Ads">G</span>
                        ) : (
                          <span className="w-5 h-5 rounded text-[10px] font-bold grid place-items-center bg-blue-500/10 text-blue-600 dark:text-blue-400" title="Meta">f</span>
                        )}
                        {a.platform === "meta" && linkedGoogle.length > 0 && (
                          <span className="w-5 h-5 rounded text-[10px] font-bold grid place-items-center bg-sky-500/10 text-sky-600 dark:text-sky-400" title={`${linkedGoogle.length} vinculada(s)`}>G</span>
                        )}
                      </div>

                      {/* Trend */}
                      <div className="grid justify-items-center gap-1">
                        <Sparkline points={(m.daily || []).map((d) => d.spend)} color={g?.color || "var(--color-chart-1)"} width={64} height={20} />
                        {spendTrend != null && (
                          <span className={cn("text-[10px] font-semibold flex items-center gap-0.5", spendTrend >= 0 ? "text-emerald-500" : "text-red-500")}>
                            {spendTrend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                            {Math.abs(spendTrend).toFixed(1)}%
                          </span>
                        )}
                      </div>

                      {/* Spend */}
                      <div className={cn("text-right text-sm font-semibold", liveError && "text-amber-500")} title={liveError?.message}>
                        {liveError ? "Indisponível" : money(m.spend, a.currency)}
                      </div>

                      {/* Result */}
                      <div className="text-right">
                        <div className={cn("text-sm font-semibold", m.result > 0 ? "text-foreground" : "text-muted-foreground")}>
                          {liveError ? "—" : m.result > 0 ? num(m.result) : "—"}
                        </div>
                        {fam.sales && m.value > 0 && m.spend > 0 && (
                          <div className="text-[11px] text-emerald-500 font-medium">{(m.value / m.spend).toFixed(1)}x ROAS</div>
                        )}
                      </div>

                      {/* Vendas (ROI) */}
                      <div className="text-right">
                        {(() => {
                          const v = salesData.get(a.name.toLowerCase().trim());
                          if (!v) return <span className="text-[11px] text-muted-foreground">—</span>;
                          const roas = v.spend > 0 ? v.revenue / v.spend : null;
                          return (
                            <>
                              <div className="text-sm font-semibold">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v.revenue)}</div>
                              {roas != null && <div className={cn("text-[11px] font-medium", roas >= 1 ? "text-emerald-500" : "text-red-500")}>{roas.toFixed(2)}x ROI</div>}
                            </>
                          );
                        })()}
                      </div>

                      {/* Balance */}
                      <BalanceCell account={a} />

                      {/* Hide/Show */}
                      <button onClick={(e) => { e.stopPropagation(); toggleHidden(a.account_id, !a.hidden); }}
                        className="text-muted-foreground hover:text-foreground transition-colors" title={a.hidden ? "Reexibir" : "Ocultar"}>
                        {a.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>

                      {/* Tela completa de campanhas da conta */}
                      <div className="text-center text-muted-foreground">
                        {a.hidden ? "—" : (
                          <button
                            onClick={(e) => { e.stopPropagation(); openCampaigns(a.account_id); }}
                            title="Abrir tela de campanhas"
                            className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                          >
                            <ArrowRight className="h-3.5 w-3.5 inline" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Acessos rápidos da conta (não navegam para campanhas) */}
                    {!a.hidden && (
                      <div className="border-t border-border/10 px-4" onClick={(e) => e.stopPropagation()}>
                        <QuickAccess accountId={a.account_id} accountName={a.name} platform={a.platform} balance={a.balance} currency={a.currency} compact />
                      </div>
                    )}

                    {/* Campanhas do Meta e do Google vinculado, dentro da conta.
                        Mesma ordem para as duas plataformas: últimas edições e
                        só então o bloco recolhível com a árvore de campanhas. */}
                    {open && (
                      <div className="border-t border-border/30 px-4 py-4 space-y-4 bg-muted/10">
                        <AccountChanges accountId={a.account_id} platform={a.platform} since={range.since} until={range.until} />
                        <CollapsibleSection
                          icon={a.platform === "google" ? <GoogleIcon /> : <MetaIcon />}
                          title={a.platform === "google" ? `Google Ads (${a.name})` : `Meta Ads (${a.name})`}
                          subtitle="campanhas, conjuntos e anúncios"
                          meta={liveError ? "indisponível" : money(accMetrics(a).spend, a.currency)}
                        >
                          <AccountDetail accountId={a.account_id} platform={a.platform} since={range.since} until={range.until}
                            status={a.status} balance={a.balance} currency={a.currency} />
                        </CollapsibleSection>

                        {a.platform === "meta" && linkedGoogle.map((google) => {
                          const gm = accMetrics(google);
                          return (
                            <div key={google.account_id} className="space-y-1.5">
                              {google.hidden && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
                                  Google oculta — vinculada e incluída na soma do cliente
                                </span>
                              )}
                              <AccountChanges accountId={google.account_id} platform="google" since={range.since} until={range.until} />
                              <CollapsibleSection
                                icon={<GoogleIcon />}
                                title={`Google Ads (${google.name})`}
                                subtitle="campanhas, termos de busca, segmentações"
                                meta={money(gm.spend, google.currency)}
                              >
                                <AccountDetail accountId={google.account_id} platform="google" since={range.since} until={range.until}
                                  status={google.status} balance={null} currency={google.currency} />
                              </CollapsibleSection>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// --- Subcomponents ---

function KpiCard({ icon: Icon, label, value, trend, invertTrend }: {
  icon: React.ElementType;
  label: string;
  value: string;
  trend: number | null;
  invertTrend?: boolean;
}) {
  const isGood = trend != null ? (invertTrend ? trend < 0 : trend > 0) : null;
  return (
    <Card className="relative overflow-hidden group card-hover">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground font-medium">{label}</span>
          <Icon className="h-4 w-4 text-muted-foreground/60" />
        </div>
        <div className="text-xl font-bold tracking-tight truncate">{value}</div>
        {trend != null && (
          <div className={cn("flex items-center gap-1 mt-1 text-xs font-medium", isGood ? "text-emerald-500" : "text-red-500")}>
            {isGood ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            <span>{Math.abs(trend).toFixed(1)}%</span>
            <span className="text-muted-foreground font-normal">vs anterior</span>
          </div>
        )}
      </CardContent>
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    </Card>
  );
}

function AlertCard({ alert, onAck, acking }: { alert: AlertItem; onAck: () => void; acking: boolean }) {
  const colors = {
    critical: { border: "border-red-500/30", bg: "bg-red-500/5", text: "text-red-600 dark:text-red-400", dot: "bg-red-500" },
    warning: { border: "border-amber-500/30", bg: "bg-amber-500/5", text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
    info: { border: "border-sky-500/30", bg: "bg-sky-500/5", text: "text-sky-600 dark:text-sky-400", dot: "bg-sky-500" },
  };
  const c = colors[alert.level];
  return (
    <Card className={cn("border-l-2", c.border, c.bg)}>
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <span className={cn("w-1.5 h-1.5 rounded-full", c.dot)} />
          <span className={cn("text-[11px] font-bold", c.text)}>
            {alert.level === "critical" ? "Crítico" : alert.level === "warning" ? "Atenção" : "Info"}
          </span>
        </div>
        <div className={cn("text-sm font-semibold", c.text)}>{alert.account_name}</div>
        <div className="text-xs text-muted-foreground">{alert.title}</div>
        <div className="text-xs text-muted-foreground/70">{alert.detail}</div>
        <label className="flex items-center gap-2 pt-1 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={false} disabled={acking} onChange={onAck}
            className="rounded border-border accent-primary" />
          Estou ciente
        </label>
      </CardContent>
    </Card>
  );
}

function HistoryCard({ alert, onReopen, acking }: { alert: AlertItem; onReopen?: () => void; acking: boolean }) {
  const dotColors: Record<string, string> = { critical: "bg-red-500", warning: "bg-amber-500", info: "bg-sky-500" };
  const badge = alert.resolved ? { label: "Resolvido", color: "text-emerald-500 dark:text-emerald-400 bg-emerald-500/10" } : { label: "Ciente", color: "text-gray-500 dark:text-gray-400 bg-gray-500/10" };
  const when = alert.resolved_at || alert.acknowledged_at || alert.last_seen_at;
  return (
    <Card className="opacity-80">
      <CardContent className="p-3 space-y-1">
        <div className="flex items-center gap-1.5">
          <span className={cn("w-1.5 h-1.5 rounded-full", dotColors[alert.level])} />
          <span className="text-[11px] font-bold text-muted-foreground">
            {alert.level === "critical" ? "Crítico" : alert.level === "warning" ? "Atenção" : "Info"}
          </span>
          <span className={cn("ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full", badge.color)}>
            {badge.label}
          </span>
        </div>
        <div className="text-sm font-semibold text-foreground/80">{alert.account_name}</div>
        <div className="text-xs text-muted-foreground">{alert.title}</div>
        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] text-muted-foreground">
            {when ? new Date(when).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
          </span>
          {onReopen && (
            <button onClick={onReopen} disabled={acking}
              className="text-[11px] text-primary hover:underline bg-transparent border-none cursor-pointer p-0">
              reabrir
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function BalanceCell({ account }: { account: Account }) {
  if (account.platform !== "meta") {
    return <div className="text-right text-sm text-muted-foreground">—</div>;
  }
  const prepaid = account.is_prepaid;
  const balance = account.balance;
  const unbilled = account.unbilled_amount ?? null;

  if (prepaid === true && balance != null) {
    const empty = balance <= 0;
    return (
      <div className="text-right leading-tight">
        <div className={cn("text-sm", empty ? "text-red-500 font-bold" : "text-foreground font-medium")}>
          {money(balance, account.currency)}
        </div>
        <div className={cn("text-[10px]", empty ? "text-red-500" : "text-muted-foreground")}>
          {empty ? "sem saldo" : "saldo"}
        </div>
      </div>
    );
  }
  if (prepaid === false) {
    return (
      <div className="text-right leading-tight" title="Gasto a faturar no cartão/PayPal">
        <div className="text-sm text-muted-foreground font-normal">
          {unbilled != null ? money(unbilled, account.currency) : "—"}
        </div>
        <div className="text-[10px] text-muted-foreground/60">a faturar</div>
      </div>
    );
  }
  return (
    <div className="text-right leading-tight" title="Aguardando classificação">
      <div className="text-sm text-muted-foreground">—</div>
      <div className="text-[10px] text-muted-foreground/60">sem classificação</div>
    </div>
  );
}

function GridSortHeader({ children, sortKey, sort, onSort, align = "right", initialDirection = "asc" }: {
  children: React.ReactNode;
  sortKey: AccountSortKey;
  sort: SortState<AccountSortKey>;
  onSort: (next: SortState<AccountSortKey>) => void;
  align?: "left" | "center" | "right";
  initialDirection?: "asc" | "desc";
}) {
  return (
    <SortButton column={sortKey} sort={sort} onSort={onSort} align={align} initialDirection={initialDirection}>
      {children}
    </SortButton>
  );
}

function CollapsibleSection({ icon, title, subtitle, meta, children }: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  meta: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border/50 overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-3 w-full px-4 py-3 text-left bg-muted/10 hover:bg-accent/20 transition-colors cursor-pointer border-none">
        <span className="w-6 h-6 rounded grid place-items-center shrink-0">
          {icon}
        </span>
        <span className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          <span className="text-xs text-muted-foreground ml-2">{meta}</span>
        </span>
        <span className="text-[11px] text-muted-foreground hidden sm:inline">{subtitle}</span>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 py-3 border-t border-border/30 space-y-3">{children}</div>}
    </div>
  );
}

function MetaIcon() {
  return (
    <svg viewBox="0 0 32 32" className="w-5 h-5" fill="#0532b8">
      <path d="M5,19.5c0-4.6,2.3-9.4,5-9.4c1.5,0,2.7,0.9,4.6,3.6c-1.8,2.8-2.9,4.5-2.9,4.5c-2.4,3.8-3.2,4.6-4.5,4.6 C5.9,22.9,5,21.7,5,19.5 M20.7,17.8L19,15c-0.4-0.7-0.9-1.4-1.3-2c1.5-2.3,2.7-3.5,4.2-3.5c3,0,5.4,4.5,5.4,10.1 c0,2.1-0.7,3.3-2.1,3.3S23.3,22,20.7,17.8 M16.4,11c-2.2-2.9-4.1-4-6.3-4C5.5,7,2,13.1,2,19.5c0,4,1.9,6.5,5.1,6.5 c2.3,0,3.9-1.1,6.9-6.3c0,0,1.2-2.2,2.1-3.7c0.3,0.5,0.6,1,0.9,1.6l1.4,2.4c2.7,4.6,4.2,6.1,6.9,6.1c3.1,0,4.8-2.6,4.8-6.7 C30,12.6,26.4,7,22.1,7C19.8,7,18,8.8,16.4,11" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 -1.5 24 24" className="w-5 h-5">
      <g transform="scale(0.09)">
        <path d="M5.888,166.405103 L90.88,20.9 C101.676138,27.2558621 156.115862,57.3844138 164.908138,63.1135172 L79.9161379,208.627448 C70.6206897,220.906621 -5.888,185.040138 5.888,166.396276 L5.888,166.405103 Z" fill="#FBBC04" />
        <path d="M250.084224,166.401789 L165.092224,20.9055131 C153.210293,1.13172 127.619121,-6.05393517 106.600638,5.62496138 C85.582155,17.3038579 79.182155,42.4624786 91.0640861,63.1190303 L176.056086,208.632961 C187.938017,228.397927 213.52919,235.583582 234.547672,223.904686 C254.648086,212.225789 261.966155,186.175582 250.084224,166.419444 L250.084224,166.401789 Z" fill="#4285F4" />
        <ellipse fill="#34A853" cx="42.6637241" cy="187.924414" rx="42.6637241" ry="41.6044138" />
      </g>
    </svg>
  );
}
