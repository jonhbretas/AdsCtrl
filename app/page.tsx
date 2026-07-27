"use client";

// app/page.tsx — Visão geral (overview) das contas de anúncio Meta.
// Topo: grupos + filtros + período. Esquerda: alertas. Centro: tabela expansível.
//
// Período: HOJE / 7D / 14D / 30D + personalizado.
// Todos os períodos visíveis são buscados ao vivo para que o resumo e o
// detalhe expandido usem a mesma consolidação da plataforma.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AccountDetail from "@/components/AccountDetail";
import AccountChanges from "@/components/AccountChanges";
import {
  Badge,
  Button,
  Collapsible,
  Input,
  Menu,
  Notice,
  PageHeader,
  Segmented,
  Select,
  Skeleton,
  SkeletonCard,
} from "@/components/ui";
import {
  compareSortValues,
  SortButton,
  SortState,
  usePersistentSort,
} from "@/components/SortableHeader";
import { money, num, delta, RESULT_FAMILIES, RESULT_FAMILY_BY_SLUG } from "@/lib/format";

interface Metrics {
  spend: number;
  conversions: number;
  purchases?: number;
  purchase_value?: number; // snapshot (cache)
  value?: number; // overview ao vivo
  results?: Record<string, number> | null; // por família (vendas/mensagens/...)
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
  // Separa o que é saldo do que é dívida: em conta pré-paga vale `balance`
  // (saldo restante); em conta de cartão/PayPal vale `unbilled_amount`
  // (gasto ainda não faturado). Nulo = ainda não classificada pela coleta.
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

const LEVEL_LABEL: Record<string, string> = {
  critical: "Crítico",
  warning: "Atenção",
  info: "Info",
};

type Period = "today" | "7d" | "14d" | "30d" | "custom";
type AccountSortKey =
  | "name"
  | "channels"
  | "trend"
  | "spend"
  | "result"
  | "balance";
const ACCOUNT_SORT_KEYS: readonly AccountSortKey[] = [
  "name",
  "channels",
  "trend",
  "spend",
  "result",
  "balance",
];
const PRESETS: { key: Period; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "7d", label: "7D" },
  { key: "14d", label: "14D" },
  { key: "30d", label: "30D" },
];

// Data (yyyy-mm-dd) "n" dias atrás, em UTC — igual ao cron, para casar com o cache.
function isoDaysAgo(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// Janela (since/until) de cada período. Presets terminam ONTEM.
function rangeForPeriod(period: Period, customSince: string, customUntil: string) {
  const today = isoDaysAgo(0);
  switch (period) {
    case "today": return { since: today, until: today };
    case "7d": return { since: isoDaysAgo(7), until: isoDaysAgo(1) };
    case "14d": return { since: isoDaysAgo(14), until: isoDaysAgo(1) };
    case "30d": return { since: isoDaysAgo(30), until: isoDaysAgo(1) };
    case "custom": return { since: customSince, until: customUntil };
  }
}

const PERIOD_SHORT: Record<Period, string> = { today: "hoje", "7d": "7d", "14d": "14d", "30d": "30d", custom: "período" };

function initials(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export default function Dashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<"meta" | "google">("meta");
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
  const [alertTab, setAlertTab] = useState<"active" | "history">("active");
  const [history, setHistory] = useState<AlertItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [acking, setAcking] = useState<number | null>(null);
  const [live, setLive] = useState<LiveOverview | null>(null);
  // Métricas das contas Google vinculadas, buscadas sob demanda ao abrir a
  // conta Meta. Fora daqui elas não entram no overview, que é por plataforma.
  const [linkedLive, setLinkedLive] = useState<Record<string, Metrics>>({});
  const [liveLoading, setLiveLoading] = useState(false);
  const [tableSort, setTableSort] = usePersistentSort<AccountSortKey>(
    "adsctrl:sort:overview",
    { key: "spend", direction: "desc" },
    ACCOUNT_SORT_KEYS
  );

  useEffect(() => {
    if (window.location.hash === "#alerts") window.location.replace("/alerts");
  }, []);

  const range = useMemo(() => rangeForPeriod(period, customSince, customUntil), [period, customSince, customUntil]);
  const isLive = true;
  const periodKey = period === "7d" || period === "14d" || period === "30d" ? period : null;
  const liveReady = !isLive || !!live;

  // Forma normalizada (cache usa purchase_value; live usa value).
  type M = { spend: number; conversions: number; value: number; results: Record<string, number>; result: number; daily: { date: string; spend: number }[] };
  const norm = (m?: Metrics | PrevMetrics | null): M => {
    const results = m?.results || {};
    return {
      spend: m?.spend || 0,
      conversions: m?.conversions || 0,
      value: (m as Metrics)?.value ?? m?.purchase_value ?? 0,
      results,
      result: results[focus] || 0, // resultado do foco selecionado
      daily: (m as Metrics)?.daily || [],
    };
  };

  // Métricas da conta no período selecionado (cache p/ presets, live p/ hoje/custom).
  function accMetrics(a: Account): M {
    // linkedLive cobre a conta Google mostrada DENTRO de uma conta Meta: a
    // busca ao vivo é filtrada por plataforma, então com o filtro em Meta ela
    // não traz Google e aquele resumo ficava em R$ 0,00.
    if (isLive) return norm(live?.metrics?.[a.account_id] || linkedLive[a.account_id]);
    return norm((periodKey && a.metricsByPeriod?.[periodKey]) || a.metrics);
  }
  function accPrev(a: Account): M {
    if (isLive) return norm(live?.prev?.[a.account_id]);
    return norm((periodKey && a.prevByPeriod?.[periodKey]) || a.prevMetrics);
  }

  async function load() {
    setError(null);
    try {
      const r = await fetch("/api/accounts");
      const text = await r.text();
      const d = text ? JSON.parse(text) : {};
      if (!r.ok || d.error) throw new Error(d.error || `Falha ao carregar (HTTP ${r.status}).`);
      setAccounts(d.accounts || []);
      setGroups(d.groups || []);
      setAlerts(d.alerts || []);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar os dados.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!accounts.length) return;
    const requestedAccount = new URLSearchParams(window.location.search).get("account");
    if (!requestedAccount) return;
    const requested = accounts.find((account) => account.account_id === requestedAccount);
    const requestedPlatform = requestedAccount.startsWith("google:") ? "google" : "meta";
    setPlatformFilter(requestedPlatform);
    if (requestedPlatform === "google") setFocus("conversoes");
    if (requested?.status !== "ACTIVE") setOnlyActive(false);
    if (requested?.hidden) setShowHidden(true);
    setExpanded(requestedAccount);
    window.setTimeout(() => {
      document.getElementById(`account-${requestedAccount}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }, [accounts]);

  useEffect(() => {
    load();
  }, []);

  // Busca overview ao vivo quando o período é HOJE ou personalizado.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, range.since, range.until, platformFilter]);

  // Ao abrir uma conta Meta, busca as métricas das contas Google vinculadas a
  // ela. O overview é filtrado por plataforma e nunca as traz junto — por isso
  // o resumo "Google Ads vinculado ao cliente" aparecia zerado mesmo com a
  // conta faturando. Só as vinculadas àquela conta, e só quando ela é aberta.
  useEffect(() => {
    if (!expanded) return;
    const aberta = accounts.find((a) => a.account_id === expanded);
    if (!aberta || aberta.platform !== "meta") return;
    const ids = accounts
      .filter((g) => g.platform === "google" && g.linked_meta_account_id === expanded && !g.hidden)
      .map((g) => g.account_id)
      .filter((id) => !live?.metrics?.[id] && !linkedLive[id]);
    if (!ids.length) return;

    let alive = true;
    const params = new URLSearchParams({
      since: range.since,
      until: range.until,
      accounts: ids.join(","),
    });
    fetch(`/api/accounts/overview?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (alive && d?.metrics) setLinkedLive((prev) => ({ ...prev, ...d.metrics }));
      })
      .catch(() => { /* o resumo continua em branco; o detalhe abaixo tem o dado */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, accounts, range.since, range.until]);

  // Período novo invalida o que foi buscado para o período antigo.
  useEffect(() => {
    setLinkedLive({});
  }, [range.since, range.until]);

  async function refresh() {
    setRefreshing(true);
    await load();
    if (isLive) {
      try {
        const r = await fetch(`/api/accounts/overview?since=${range.since}&until=${range.until}&platform=${platformFilter}`);
        const t = await r.text();
        setLive(t ? JSON.parse(t) : null);
      } catch { /* silencioso */ }
    }
    if (alertTab === "history") await loadHistory();
    setRefreshing(false);
  }

  // Dispara a coleta (insights + alertas) na hora, sem esperar o cron. Coletar
  // uma plataforma só é seguro: o fechamento de alerta é feito conta a conta,
  // sobre as processadas na rodada — o que ficou de fora não é tocado.
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
      setSyncMsg(
        `Coleta concluída: ${d.accounts} conta(s), ${d.alerts} alerta(s)`
        + (d.failed ? `, ${d.failed} falha(s)` : "")
        + ` em ${(d.took_ms / 1000).toFixed(0)}s.`
      );
    } catch (e: any) {
      setSyncMsg(e?.message ?? "Erro na coleta.");
    } finally {
      setCollecting(false);
    }
  }

  // Puxa o catálogo; contas novas entram ocultas. A plataforma é escolhida
  // porque quase sempre a conta nova está em UMA delas: varrer as duas gasta
  // o dobro de chamada e de tempo de função para descobrir o mesmo.
  async function syncAccounts(platform: "all" | "meta" | "google" = "all") {
    setSyncing(true);
    setSyncMsg(null);
    const escopo = platform === "meta" ? "no Meta" : platform === "google" ? "no Google" : "nas plataformas";
    try {
      const r = await fetch("/api/accounts/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || `Falha (HTTP ${r.status}).`);
      await load();
      setSyncMsg(
        d.added > 0
          ? `+${d.added} conta(s) nova(s): ${d.addedNames.join(", ")}`
          : `Nenhuma conta nova. ${d.total} contas acessíveis ${escopo}.`
      );
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
    } catch {
      /* silencioso */
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (alertTab === "history") loadHistory();
  }, [alertTab]);

  // Marca/desmarca "ciente". Ao marcar, o alerta sai dos ativos e vai p/ histórico.
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
    } finally {
      setAcking(null);
    }
  }

  // Oculta/reexibe uma conta (persistido no Supabase).
  async function toggleHidden(id: string, hidden: boolean) {
    setAccounts((prev) => prev.map((a) => (a.account_id === id ? { ...a, hidden } : a)));
    try {
      const response = await fetch("/api/accounts/hidden", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: id, hidden }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.error) {
        throw new Error(payload.error || `Falha ao atualizar conta (HTTP ${response.status}).`);
      }
    } catch {
      await load();
    }
  }

  const hiddenCount = useMemo(() => accounts.filter((a) => a.hidden).length, [accounts]);
  const platformCounts = useMemo(
    () => ({
      meta: accounts.filter((a) => a.platform !== "google").length,
      google: accounts.filter((a) => a.platform === "google").length,
    }),
    [accounts]
  );

  const filtered = useMemo(() => {
    let list = accounts;
    if (!showHidden) list = list.filter((a) => !a.hidden);
    list = list.filter((a) => a.platform === platformFilter);
    if (groupFilter !== "all") list = list.filter((a) => a.group_id === groupFilter);
    if (onlyActive) list = list.filter((a) => a.status === "ACTIVE");
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((a) => a.name.toLowerCase().includes(q));
    }
    const value = (account: Account) => {
      const metrics = accMetrics(account);
      const previous = accPrev(account);
      const unavailable =
        isLive &&
        Boolean(
          live?.errors?.some(
            (item) => item.account_id === account.account_id
          )
        );
      switch (tableSort.key) {
        case "name": return account.name;
        case "channels":
          return account.platform === "meta"
            ? 1 + Number(
                accounts.some(
                  (candidate) =>
                    candidate.platform === "google" &&
                    candidate.linked_meta_account_id === account.account_id &&
                    !candidate.hidden
                )
              )
            : 1;
        case "trend":
          return !unavailable && previous.spend > 0
            ? ((metrics.spend - previous.spend) / previous.spend) * 100
            : null;
        case "spend": return unavailable ? null : metrics.spend;
        case "result": return unavailable ? null : metrics.result;
        case "balance":
          return account.platform === "meta" ? account.balance : null;
      }
    };
    return [...list].sort((left, right) => {
      const leftValue = value(left);
      const rightValue = value(right);
      if (
        tableSort.key === "spend" ||
        tableSort.key === "balance"
      ) {
        const leftMissing =
          leftValue == null ||
          (typeof leftValue === "number" && Number.isNaN(leftValue));
        const rightMissing =
          rightValue == null ||
          (typeof rightValue === "number" && Number.isNaN(rightValue));
        if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
        if (left.currency !== right.currency) {
          return compareSortValues(left.currency, right.currency, "asc");
        }
      }
      return (
        compareSortValues(
          leftValue,
          rightValue,
          tableSort.direction
        ) || compareSortValues(left.name, right.name, "asc")
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, groupFilter, platformFilter, onlyActive, search, showHidden, period, live, tableSort, focus]);

  const totals = useMemo(() => {
    let spend = 0, res = 0, val = 0;
    let prevSpend = 0, prevRes = 0, prevVal = 0;
    const byCurrency: Record<string, {
      spend: number;
      res: number;
      val: number;
      prevSpend: number;
      prevRes: number;
      prevVal: number;
    }> = {};
    for (const a of filtered) {
      const m = accMetrics(a), p = accPrev(a);
      const currency = (a.currency || "BRL").toUpperCase();
      const bucket = byCurrency[currency] || (byCurrency[currency] = {
        spend: 0,
        res: 0,
        val: 0,
        prevSpend: 0,
        prevRes: 0,
        prevVal: 0,
      });
      spend += m.spend; res += m.result; val += m.value;
      prevSpend += p.spend; prevRes += p.result; prevVal += p.value;
      bucket.spend += m.spend; bucket.res += m.result; bucket.val += m.value;
      bucket.prevSpend += p.spend; bucket.prevRes += p.result; bucket.prevVal += p.value;
    }
    const currencyTotals = Object.entries(byCurrency)
      .sort(([left], [right]) => left.localeCompare(right, "pt-BR"))
      .map(([currency, values]) => ({ currency, ...values }));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, period, live, focus]);

  const visibleAlerts = useMemo(() => {
    const names = new Set(filtered.map((a) => a.name));
    const order = { critical: 0, warning: 1, info: 2 } as Record<string, number>;
    return alerts
      .filter((a) => names.has(a.account_name))
      .sort((a, b) => order[a.level] - order[b.level]);
  }, [alerts, filtered]);

  const visibleHistory = useMemo(() => {
    const names = new Set(filtered.map((a) => a.name));
    // se um grupo específico está selecionado, filtra por contas visíveis
    return groupFilter === "all" ? history : history.filter((a) => names.has(a.account_name));
  }, [history, filtered, groupFilter]);

  const lastUpdated = useMemo(() => {
    const ts = accounts.map((a) => a.updated_at).filter(Boolean).sort().pop();
    return ts ? new Date(ts).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;
  }, [accounts]);

  const groupById = (id: string | null) => groups.find((g) => g.id === id);
  // Filtro recolhido no celular não pode virar filtro esquecido: o botão diz
  // o período em vigor e conta o que está fora do padrão.
  const activeFilters = [
    groupFilter !== "all",
    platformFilter !== "meta",
    !onlyActive,
    search.trim() !== "",
    showHidden,
  ].filter(Boolean).length;
  const periodLabel =
    period === "custom" ? "personalizado" : PRESETS.find((p) => p.key === period)?.label || period;
  const platformLabel = platformFilter === "google" ? "Google" : "Meta";
  const short = PERIOD_SHORT[period];
  const fam = RESULT_FAMILY_BY_SLUG[focus] || RESULT_FAMILIES[0];
  const primaryCurrency = totals.currencyTotals[0]?.currency || "BRL";
  const moneySummary = (
    getValue: (entry: (typeof totals.currencyTotals)[number]) => number,
    digits = 2
  ) =>
    totals.currencyTotals.length
      ? totals.currencyTotals
          .map((entry) => money(getValue(entry), entry.currency, digits))
          .join(" · ")
      : "—";
  const investmentValue = totals.mixedCurrencies
    ? moneySummary((entry) => entry.spend, 0)
    : money(totals.spend, primaryCurrency, 0);
  const cprValue = totals.mixedCurrencies
    ? totals.currencyTotals
        .map((entry) =>
          entry.res > 0
            ? money(entry.spend / entry.res, entry.currency)
            : `— ${entry.currency}`
        )
        .join(" · ")
    : totals.res > 0
      ? money(totals.cpr, primaryCurrency)
      : "—";
  const purchaseValue = totals.mixedCurrencies
    ? moneySummary((entry) => entry.val, 0)
    : money(totals.val, primaryCurrency, 0);
  const roasValue = totals.mixedCurrencies
    ? totals.currencyTotals
        .map((entry) =>
          entry.spend > 0
            ? `${(entry.val / entry.spend).toFixed(2)}x ${entry.currency}`
            : `— ${entry.currency}`
        )
        .join(" · ")
    : totals.spend > 0
      ? `${totals.roas.toFixed(2)}x`
      : "—";

  // Esqueleto no lugar de "Carregando overview…": o texto fazia a tela saltar
  // inteira quando os dados chegavam.
  if (loading) {
    return (
      <div className="ec-page">
        <div style={{ display: "grid", gap: "var(--sp-3)", maxWidth: 420, marginBottom: "var(--sp-5)" }}>
          <Skeleton h={30} w="45%" />
          <Skeleton h={14} w="72%" />
        </div>
        <div className="ec-cols" style={{ marginBottom: "var(--sp-4)" }}>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
        <SkeletonCard lines={6} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="ec-page">
        <PageHeader title="Não foi possível carregar" subtitle="Os dados de overview não voltaram." />
        <Notice tone="danger">{error}</Notice>
        <div style={{ marginTop: "var(--sp-4)" }}>
          <Button variant="primary" onClick={refresh}>
            Tentar de novo
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="ec-page">
      <PageHeader
        title="Visão geral"
        subtitle="Métricas de mídia paga (Meta + Google) por conta."
        meta={lastUpdated ? <Badge>Coleta: {lastUpdated}</Badge> : undefined}
        actions={
          <>
            {/* Atualizar já obedece ao filtro de Plataforma — só relê o que
                está na tela. Um segundo seletor aqui poderia contradizer o
                filtro; o rótulo diz o escopo em vez de duplicá-lo. */}
            <Button
              variant="ghost"
              size="sm"
              onClick={refresh}
              disabled={refreshing}
              title={`Reler os números ${platformLabel} do período em tela`}
            >
              {refreshing ? "Atualizando…" : `↻ Atualizar ${platformLabel}`}
            </Button>
            <Menu
              label={syncing ? "Sincronizando…" : "⇅ Sincronizar"}
              disabled={syncing}
              title="Buscar novas contas no catálogo; elas entram ocultas"
              items={[
                {
                  label: "Só Meta",
                  hint: `${platformCounts.meta} contas no catálogo`,
                  onSelect: () => syncAccounts("meta"),
                },
                {
                  label: "Só Google",
                  hint: `${platformCounts.google} contas no catálogo`,
                  onSelect: () => syncAccounts("google"),
                },
                {
                  label: "As duas",
                  hint: "mais lento; use quando não souber onde entrou",
                  onSelect: () => syncAccounts("all"),
                },
              ]}
            />
            <Link href="/admin" className="ec-btn" data-variant="secondary" data-size="sm">
              ⚙ Grupos
            </Link>
            {/* Coletar é a ação que traz dado novo: é a dominante da tela. */}
            <Menu
              variant="primary"
              label={collecting ? "Coletando…" : "⟳ Coletar agora"}
              disabled={collecting}
              title="Buscar métricas e alertas das contas ativas agora"
              items={[
                {
                  label: "Só Meta",
                  hint: "métricas e alertas das contas Meta ativas",
                  onSelect: () => collectNow("meta"),
                },
                {
                  label: "Só Google",
                  hint: "métricas e alertas das contas Google ativas",
                  onSelect: () => collectNow("google"),
                },
                {
                  label: "Tudo",
                  hint: "as duas plataformas; é o que o cron faz de madrugada",
                  onSelect: () => collectNow("all"),
                },
              ]}
            />
          </>
        }
      />

      {syncMsg && (
        <div style={{ marginBottom: "var(--sp-3)" }}>
          <Notice tone="brand" onDismiss={() => setSyncMsg(null)}>{syncMsg}</Notice>
        </div>
      )}
      {!!live?.errors?.length && (
        <div style={{ marginBottom: "var(--sp-3)" }}>
          <Notice tone="warn">
            {live.errors.length} conta(s) com dados ao vivo indisponíveis. A falha não foi convertida em zero.
          </Notice>
        </div>
      )}

      {/* No celular tudo daqui até o fim da régua entra atrás deste botão. */}
      <Button
        className="ec-filters__toggle"
        variant="secondary"
        size="sm"
        onClick={() => setFiltersOpen((open) => !open)}
        aria-expanded={filtersOpen}
        aria-controls="filtros-visao-geral"
      >
        ☰ Filtros · {periodLabel}
        {activeFilters > 0 ? ` (${activeFilters})` : ""}
      </Button>

      <div className="ec-filters" id="filtros-visao-geral" data-open={filtersOpen ? "true" : undefined}>
      {/* GRUPOS (chips) */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <Chip active={groupFilter === "all"} onClick={() => setGroupFilter("all")} label="Todos" color="var(--text-strong)" />
        {groups.map((g) => (
          <Chip key={g.id} active={groupFilter === g.id} onClick={() => setGroupFilter(g.id)} label={g.name} color={g.color} />
        ))}
      </div>

      {/* FILTROS
          Antes eram oito controles no mesmo plano visual, todos com o mesmo
          peso. Agora: plataforma e período em controle segmentado (a escolha
          fica visível sem ler), busca e foco como campos, e o resto discreto. */}
      <div className="ec-toolbar">
        <Segmented
          label="Plataforma"
          value={platformFilter}
          onChange={(value) => {
            setPlatformFilter(value);
            setFocus(value === "google" ? "conversoes" : "vendas");
          }}
          options={[
            { value: "meta", label: "Meta / Clientes" },
            { value: "google", label: "Google Ads" },
          ]}
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar conta…"
          aria-label="Pesquisar conta"
          style={{ flex: "0 1 210px" }}
        />
        <Select
          value={onlyActive ? "active" : "all"}
          onChange={(e) => setOnlyActive(e.target.value === "active")}
          aria-label="Filtrar por status"
          style={{ flex: "0 1 165px" }}
        >
          <option value="active">Somente ativas</option>
          <option value="all">Todas as contas</option>
        </Select>
        <label className="ec-inline-field">
          <span>Foco</span>
          <Select
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            title="Resultado principal do negócio (vendas, mensagens, leads…)"
          >
            {RESULT_FAMILIES.map((f) => (
              <option key={f.slug} value={f.slug}>{f.label}</option>
            ))}
          </Select>
        </label>
        {hiddenCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHidden((v) => !v)}
            aria-pressed={showHidden}
            title="Mostrar ou esconder as contas que você ocultou"
          >
            {showHidden ? "Ocultar escondidas" : `Mostrar ocultas (${hiddenCount})`}
          </Button>
        )}
        <span style={{ flex: 1 }} />
        <Segmented
          label="Período"
          value={period}
          onChange={(value) => {
            setPeriod(value);
            setShowCustom(value === "custom");
          }}
          options={[
            ...PRESETS.map((p) => ({ value: p.key, label: p.label })),
            { value: "custom", label: "Personalizado" },
          ]}
        />
      </div>
      </div>

      {/* LINHA DE PERÍODO (datas + procedência do dado) */}
      <div className="ec-metaline">
        {(showCustom || period === "custom") && (
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <Input
              type="date"
              value={customSince}
              max={customUntil}
              onChange={(e) => { setCustomSince(e.target.value); setPeriod("custom"); }}
              aria-label="Início do período"
              style={{ width: 148 }}
            />
            <span aria-hidden="true" style={{ color: "var(--text-faint)" }}>→</span>
            <Input
              type="date"
              value={customUntil}
              min={customSince}
              max={isoDaysAgo(0)}
              onChange={(e) => { setCustomUntil(e.target.value); setPeriod("custom"); }}
              aria-label="Fim do período"
              style={{ width: 148 }}
            />
          </span>
        )}
        <span className="ec-metaline__dates">{range.since} → {range.until}</span>
        {/* Procedência do número é decisão, não decoração: ao vivo e cache
            levam a leituras diferentes do mesmo valor. */}
        {isLive ? (
          <Badge tone={liveLoading ? "warn" : "ok"}>
            {liveLoading ? `buscando no ${platformFilter === "google" ? "Google Ads" : "Meta Ads"}…` : "dados ao vivo"}
          </Badge>
        ) : (
          <Badge title="A coleta roda uma vez por dia e não inclui o dia de hoje">cache · sem hoje</Badge>
        )}
        {totals.mixedCurrencies && (
          <Badge tone="warn">
            Moedas separadas: {totals.currencyTotals.map((entry) => entry.currency).join(" · ")}
          </Badge>
        )}
      </div>

      {/* KPIs GERAIS (agregado do período vs período anterior, guiado pelo foco) */}
      <section className="ec-kpis" aria-label="Resumo do período">
        <Kpi label={`Investimento (${short})`} value={liveReady ? investmentValue : "…"} cur={totals.mixedCurrencies ? undefined : totals.spend} prev={totals.mixedCurrencies ? undefined : totals.prevSpend} neutral />
        <Kpi label={`${fam.label} (${short})`} value={liveReady ? num(totals.res) : "…"} cur={totals.res} prev={totals.prevRes} />
        <Kpi label={`Custo por resultado`} value={liveReady ? cprValue : "…"} cur={!totals.mixedCurrencies && totals.res > 0 ? totals.cpr : undefined} prev={!totals.mixedCurrencies && totals.prevRes > 0 ? totals.prevCpr : undefined} invert />
        {fam.sales && (
          <>
            <Kpi label="Valor de compra" value={liveReady ? purchaseValue : "…"} cur={totals.mixedCurrencies ? undefined : totals.val} prev={totals.mixedCurrencies ? undefined : totals.prevVal} />
            <Kpi label="ROAS" value={liveReady ? roasValue : "…"} cur={!totals.mixedCurrencies && totals.spend > 0 ? totals.roas : undefined} prev={!totals.mixedCurrencies && totals.prevSpend > 0 ? totals.prevRoas : undefined} />
          </>
        )}
      </section>

      {/* LAYOUT: alertas (esq) + tabela (centro).
          Em tela estreita os alertas passam para cima da tabela em vez de
          espremer as duas colunas. */}
      <div className="ec-split">
        {/* ALERTAS */}
        <aside id="alerts" className="ec-split__side">
          <div className="ec-tabgroup ec-tabgroup--mb">
            <TabBtn active={alertTab === "active"} onClick={() => setAlertTab("active")}>
              Ativos {visibleAlerts.length > 0 && <b>({visibleAlerts.length})</b>}
            </TabBtn>
            <TabBtn active={alertTab === "history"} onClick={() => setAlertTab("history")}>
              Histórico
            </TabBtn>
          </div>

          <div className="ec-ackwrap">
            {alertTab === "active" && (
              <>
                {visibleAlerts.length === 0 && <Empty>Nenhum alerta ativo. 🎉</Empty>}
                {visibleAlerts.map((a) => (
                  <div key={a.id} className="ec-alert" data-tone={a.level}>
                    <div className="ec-alert__row">
                      <span className="ec-alert__dot" data-tone={a.level} />
                      <span className="ec-alert__level" data-tone={a.level}>{LEVEL_LABEL[a.level]}</span>
                    </div>
                    <div className="ec-alert__client" data-tone={a.level}>{a.account_name}</div>
                    <div className="ec-alert__title">{a.title}</div>
                    <div className="ec-alert__detail">{a.detail}</div>
                    <label className="ec-alert__ack" data-tone={a.level}>
                      <input
                        type="checkbox"
                        checked={false}
                        disabled={acking === a.id}
                        onChange={() => setAck(a.id, true)}
                      />
                      Estou ciente
                    </label>
                  </div>
                ))}
              </>
            )}

            {alertTab === "history" && (
              <>
                {historyLoading && <Empty>Carregando histórico…</Empty>}
                {!historyLoading && visibleHistory.length === 0 && <Empty>Sem histórico ainda.</Empty>}
                {!historyLoading &&
                  visibleHistory.map((a) => {
                    const badge = a.resolved ? { t: "Resolvido", c: "#16a34a" } : { t: "Ciente", c: "#6b7280" };
                    const when = a.resolved_at || a.acknowledged_at || a.last_seen_at;
                    return (
                      <div key={a.id} className="ec-history">
                        <div className="ec-history__row">
                          <span className="ec-alert__dot" data-tone={a.level} />
                          <span className="ec-alert__level" data-tone={a.level} style={{ color: "var(--text-muted)" }}>{LEVEL_LABEL[a.level]}</span>
                          <span className="ec-history__badge" style={{ marginLeft: "auto", color: badge.c, background: badge.c + "18" }}>
                            {badge.t}
                          </span>
                        </div>
                        <div className="ec-history__client">{a.account_name}</div>
                        <div className="ec-history__title">{a.title}</div>
                        <div className="ec-history__last">
                          <span className="ec-history__when">{when ? new Date(when).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}</span>
                          {a.acknowledged && !a.resolved && (
                            <button className="ec-history__reopen" onClick={() => setAck(a.id, false)} disabled={acking === a.id}>
                              reabrir
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </>
            )}
          </div>
        </aside>

        {/* TABELA */}
        <main className="ec-card ec-scroll-x" style={{ minWidth: 0 }}>
          <div className="ec-thead" style={{ minWidth: 900, display: "grid", gridTemplateColumns: GRID, padding: "12px 16px 10px", alignItems: "end", columnGap: 8 }}>
            <GridSortHeader sortKey="name" sort={tableSort} onSort={setTableSort} align="left">Cliente</GridSortHeader>
            <GridSortHeader sortKey="channels" sort={tableSort} onSort={setTableSort} align="left" initialDirection="desc">Canais</GridSortHeader>
            <GridSortHeader sortKey="trend" sort={tableSort} onSort={setTableSort} align="center" initialDirection="desc">Tendência</GridSortHeader>
            <GridSortHeader sortKey="spend" sort={tableSort} onSort={setTableSort} initialDirection="desc">Investimento ({short})</GridSortHeader>
            <GridSortHeader sortKey="result" sort={tableSort} onSort={setTableSort} initialDirection="desc">{fam.label.split(" ")[0]}</GridSortHeader>
            <GridSortHeader sortKey="balance" sort={tableSort} onSort={setTableSort} initialDirection="desc">Saldo / fatura</GridSortHeader>
            <span />
            <span />
          </div>
          {isLive && !liveReady && <div style={{ padding: 28, textAlign: "center", color: "var(--text-faint)" }}>Buscando dados ao vivo nas plataformas…</div>}
          {liveReady && filtered.length === 0 && <div style={{ padding: 28, textAlign: "center", color: "var(--text-faint)" }}>Nenhuma conta com os filtros atuais.</div>}
          {liveReady && filtered.map((a) => {
            const g = groupById(a.group_id);
            const open = !a.hidden && expanded === a.account_id;
            const m = accMetrics(a);
            const previous = accPrev(a);
            const liveError = isLive ? live?.errors?.find((item) => item.account_id === a.account_id) : undefined;
            const spendTrend = !liveError && previous.spend > 0
              ? ((m.spend - previous.spend) / previous.spend) * 100
              : null;
            const linkedMeta = a.platform === "google" && a.linked_meta_account_id
              ? accounts.find((meta) => meta.account_id === a.linked_meta_account_id)
              : null;
            const linkedGoogle = a.platform === "meta"
              ? accounts.filter((google) =>
                  google.platform === "google" &&
                  google.linked_meta_account_id === a.account_id &&
                  !google.hidden
                )
              : [];
            return (
              <div id={`account-${a.account_id}`} key={a.account_id} className="ec-accrow" data-hidden={a.hidden ? "true" : undefined}>
                <div
                  onClick={() => { if (!a.hidden) setExpanded(open ? null : a.account_id); }}
                  className={"ec-accrow__grid" + (a.hidden ? "" : " ec-row")}
                  style={{ minWidth: 900, display: "grid", gridTemplateColumns: GRID, padding: "12px 16px", alignItems: "center", columnGap: 8 }}
                  data-open={open ? "true" : undefined}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span className="ec-accavatar" style={{ background: g?.color || "var(--text-faint)" }}>
                      {initials(a.name)}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="ec-accname" title={a.name}>{a.name}</div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {g && <span className="ec-accbadge" style={{ background: g.color + "22", color: g.color }}>{g.name}</span>}
                        {linkedMeta && <span className="ec-accbadge" style={{ background: "var(--platform-meta-bg)", color: "var(--platform-meta-linked)" }}>Cliente: {linkedMeta.name}</span>}
                        {a.status !== "ACTIVE" && <span className="ec-accstatus">● {a.status}</span>}
                        {a.hidden && <span style={{ fontSize: 10, color: "var(--text-faint)" }}>oculta</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {a.platform === "google" ? (
                      <span title="Google Ads" className="ec-accbadge" data-platform="google" style={{ width: 22, height: 22, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 12, borderRadius: 6 }}>G</span>
                    ) : (
                      <span title="Meta / Instagram" className="ec-accbadge" data-platform="meta" style={{ width: 22, height: 22, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 12, borderRadius: 6 }}>f</span>
                    )}
                    {a.platform === "meta" && linkedGoogle.length > 0 && (
                      <span title={`${linkedGoogle.length} conta(s) Google vinculada(s)`} className="ec-glinked" data-platform="google" style={{ width: 22, height: 22, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 11, borderRadius: 6 }}>G</span>
                    )}
                  </div>
                  <div className="ec-trend">
                    <Sparkline points={(m.daily || []).map((d) => d.spend)} color={g?.color || "var(--brand-500)"} width={72} height={22} />
                    <span className="ec-trend__pct" data-tone={spendTrend == null ? "flat" : spendTrend >= 0 ? "good" : "bad"}>
                      {spendTrend == null ? "—" : `${spendTrend >= 0 ? "+" : ""}${spendTrend.toFixed(1)}%`}
                    </span>
                  </div>
                  <div title={liveError?.message} className="ec-cellspend" data-error={liveError ? "true" : undefined}>
                    {liveError ? "Indisponível" : money(m.spend, a.currency)}
                  </div>
                  <div className="ec-cellresult">
                    <div className="ec-cellresult__num" data-empty={m.result <= 0 ? "true" : undefined}>
                      {liveError ? "—" : m.result > 0 ? num(m.result) : "—"}
                    </div>
                    {fam.sales && m.value > 0 && m.spend > 0 && (
                      <div className="ec-roas">{(m.value / m.spend).toFixed(1)}x ROAS</div>
                    )}
                  </div>
                  <BalanceCell account={a} />
                  <button
                    className="ec-touch"
                    onClick={(e) => { e.stopPropagation(); toggleHidden(a.account_id, !a.hidden); }}
                    title={a.hidden ? "Reexibir esta conta" : "Ocultar esta conta do dashboard"}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--text-faint)", padding: 0, lineHeight: 1 }}
                  >
                    {a.hidden ? "↩" : "🚫"}
                  </button>
                  <div style={{ textAlign: "center", color: "var(--text-faint)", fontSize: 14 }}>{a.hidden ? "—" : open ? "▲" : "▼"}</div>
                </div>
                {open && (
                  <div className="ec-row__detail" style={{ borderTop: "1px solid var(--border)", padding: "0 16px" }}>
                    <OperationalLinks
                      accountId={a.account_id}
                      accountName={a.name}
                      platform={a.platform}
                      balance={a.balance}
                      currency={a.currency}
                    />
                    <AccountChanges
                      accountId={a.account_id}
                      platform={a.platform}
                      since={range.since}
                      until={range.until}
                    />
                    {/* O detalhe da plataforma agora abre por clique, como o
                        Google já fazia. São ~16 chamadas de API por conta:
                        expandir um cliente só para ver as últimas edições não
                        deve custar isso. */}
                    <Collapsible
                      tone="brand"
                      summary={
                        <>
                          <span className="ec-collapse__icon" aria-hidden="true">
                            {a.platform === "google" ? "G" : "f"}
                          </span>
                          <span className="ec-collapse__title">
                            {a.platform === "google" ? "Google Ads" : "Meta Ads"} · detalhe do período
                          </span>
                          <span className="ec-collapse__meta">
                            {liveError ? "indisponível" : money(m.spend, a.currency)}
                          </span>
                          <span className="ec-collapse__hint">campanhas, criativos, segmentações</span>
                        </>
                      }
                    >
                      <AccountDetail
                        accountId={a.account_id}
                        platform={a.platform}
                        since={range.since}
                        until={range.until}
                        status={a.status}
                        balance={a.balance}
                        currency={a.currency}
                      />
                    </Collapsible>
                    {a.platform === "meta" && (
                      <div className="ec-gsection">
                        <div className="ec-gsection__title">
                          Google Ads vinculado ao cliente
                        </div>
                        {linkedGoogle.length === 0 ? (
                          <div className="ec-gsection__empty">
                            Nenhuma conta Google ativa vinculada. Faça o vínculo em Configurações → Contas.
                          </div>
                        ) : linkedGoogle.map((google) => {
                          const gm = accMetrics(google);
                          return (
                            <div key={google.account_id} style={{ marginTop: 10 }}>
                              <Collapsible
                                summary={
                                  <>
                                    <span className="ec-collapse__icon" aria-hidden="true">G</span>
                                    <span className="ec-collapse__title">{google.name}</span>
                                    <span className="ec-collapse__meta">{money(gm.spend, google.currency)}</span>
                                    <span className="ec-collapse__hint">
                                      {num(gm.results.conversoes || gm.result || 0)} conversões
                                    </span>
                                  </>
                                }
                              >
                                <OperationalLinks
                                  accountId={google.account_id}
                                  accountName={google.name}
                                  platform="google"
                                  balance={null}
                                  currency={google.currency}
                                  compact
                                />
                                <AccountChanges
                                  accountId={google.account_id}
                                  platform="google"
                                  since={range.since}
                                  until={range.until}
                                  compact
                                />
                                <AccountDetail
                                  accountId={google.account_id}
                                  platform="google"
                                  since={range.since}
                                  until={range.until}
                                  status={google.status}
                                  balance={null}
                                  currency={google.currency}
                                />
                              </Collapsible>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </main>
      </div>
    </div>
  );
}

// ---------- subcomponentes ----------

// Largura das colunas da tabela. Dois defeitos que esta grade precisa evitar:
//
//   1. "1fr" só na coluna Cliente fazia ela engolir todo o espaço que sobrava
//      — o nome ficava isolado à esquerda e as métricas espremidas à direita,
//      com um vão enorme entre os dois. Agora toda coluna de conteúdo tem um
//      mínimo e uma fatia do que sobra, então o conjunto cresce junto.
//
//   2. Coluna fixa estreita demais para o próprio título ("Investimento
//      (período)" não cabe em 120px) fazia o rótulo vazar por cima do vizinho.
//      O mínimo abaixo já considera o título + a seta de ordenação; o que
//      ainda assim não couber quebra em duas linhas (ver SortButton).
const GRID =
  "minmax(200px,1.7fr) minmax(48px,.5fr) minmax(96px,.8fr) minmax(128px,1fr) minmax(96px,.9fr) minmax(104px,.9fr) 28px 26px";

// Saldo e fatura na mesma coluna, mas nunca com a mesma cara.
//
// A Meta devolve um campo `balance` para toda conta, com significados opostos:
// em conta pré-paga é quanto ainda há para gastar; em conta de cartão ou PayPal
// é quanto já se gastou e ainda vai ser cobrado. Mostrar os dois como "saldo"
// levava à leitura invertida — uma conta devendo R$ 1.865 parecia ter esse
// tanto disponível. Aqui o número vem sempre com o que ele é.
function BalanceCell({ account }: { account: Account }) {
  if (account.platform !== "meta") {
    return <div className="ec-cellbal"><div className="ec-cellbal__val" data-tone="void">—</div></div>;
  }

  const prepaid = account.is_prepaid;
  const balance = account.balance;
  const unbilled = account.unbilled_amount ?? null;

  if (prepaid === true && balance != null) {
    const empty = balance <= 0;
    return (
      <div className="ec-cellbal">
        <div className="ec-cellbal__val" data-tone={empty ? "danger" : undefined}>
          {money(balance, account.currency)}
        </div>
        <div className="ec-cellbal__label" data-tone={empty ? "danger" : "muted"}>
          {empty ? "sem saldo" : "saldo"}
        </div>
      </div>
    );
  }

  if (prepaid === false) {
    return (
      <div className="ec-cellbal" title="Gasto já realizado que ainda será cobrado no cartão ou no PayPal. Não é saldo disponível.">
        <div className="ec-cellbal__val" data-tone="muted">
          {unbilled != null ? money(unbilled, account.currency) : "—"}
        </div>
        <div className="ec-cellbal__label" data-tone="muted">a faturar</div>
      </div>
    );
  }

  return (
    <div className="ec-cellbal" title="A próxima coleta identifica se a conta é pré-paga ou pós-paga.">
      <div className="ec-cellbal__val" data-tone="void">—</div>
      <div className="ec-cellbal__label" data-tone="void">sem classificação</div>
    </div>
  );
}

function GridSortHeader({
  children,
  sortKey,
  sort,
  onSort,
  align = "right",
  initialDirection = "asc",
}: {
  children: React.ReactNode;
  sortKey: AccountSortKey;
  sort: SortState<AccountSortKey>;
  onSort: (next: SortState<AccountSortKey>) => void;
  align?: "left" | "center" | "right";
  initialDirection?: "asc" | "desc";
}) {
  return (
    <SortButton
      column={sortKey}
      sort={sort}
      onSort={onSort}
      align={align}
      initialDirection={initialDirection}
    >
      {children}
    </SortButton>
  );
}



function OperationalLinks({
  accountId,
  accountName,
  platform,
  balance,
  currency,
  compact = false,
}: {
  accountId: string;
  accountName: string;
  platform: "meta" | "google";
  balance: number | null;
  currency: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [business, setBusiness] = useState<{ id: string; name: string | null } | null>(null);
  const [finance, setFinance] = useState<{
    is_prepaid: boolean;
    balance: number | null;
    spend_7d: number;
    average_daily_spend: number;
    runway_days: number | null;
    estimated_depletion_date: string | null;
  } | null>(null);
  const bareId = accountId.replace(/^act_/, "").replace(/^google:/, "");
  const isMeta = platform === "meta";
  useEffect(() => {
    if (!isMeta) return;
    let alive = true;
    fetch(`/api/account/links?account_id=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (alive && payload?.business_id) {
          setBusiness({ id: payload.business_id, name: payload.business_name || null });
        }
        if (alive && payload?.finance) setFinance(payload.finance);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [accountId, isMeta]);
  const businessParam = business?.id
    ? `&business_id=${encodeURIComponent(business.id)}`
    : "";
  const billingUrl = isMeta
    ? `https://business.facebook.com/billing_hub/payment_settings?asset_id=${encodeURIComponent(bareId)}${businessParam}&placement=standalone`
    : `https://ads.google.com/aw/billing/summary?ocid=${encodeURIComponent(bareId)}`;
  const links = isMeta
    ? [
        {
          label: "Ads Manager",
          title: "Abrir campanhas desta conta no Meta Ads Manager",
          url: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent(bareId)}`,
        },
        {
          label: "Saldo / pagamento",
          title: "Abrir formas de pagamento ou adicionar fundos nesta conta",
          url: billingUrl,
          accent: true,
        },
        {
          label: "Faturas",
          title: "Abrir o faturamento desta conta",
          url: `https://business.facebook.com/billing_hub/accounts/details?asset_id=${encodeURIComponent(bareId)}${businessParam}&placement=standalone`,
        },
        {
          label: "Conta e acessos",
          title: "Abrir a conta de anúncios nas configurações da BM",
          url: `https://business.facebook.com/settings/ad-accounts/${encodeURIComponent(bareId)}${business?.id ? `?business_id=${encodeURIComponent(business.id)}` : ""}`,
        },
        {
          label: "Business Manager",
          title: business?.name
            ? `Abrir a BM ${business.name}`
            : "Abrir as configurações do Meta Business",
          url: business?.id
            ? `https://business.facebook.com/settings?business_id=${encodeURIComponent(business.id)}`
            : "https://business.facebook.com/settings",
        },
      ]
    : [
        {
          label: "Google Ads",
          title: "Abrir a visão geral deste cliente Google Ads",
          url: `https://ads.google.com/aw/overview?ocid=${encodeURIComponent(bareId)}`,
        },
        {
          label: "Campanhas",
          title: "Abrir as campanhas deste cliente Google Ads",
          url: `https://ads.google.com/aw/campaigns?ocid=${encodeURIComponent(bareId)}`,
        },
        {
          label: "Faturamento",
          title: "Abrir o resumo de faturamento ou adicionar fundos",
          url: billingUrl,
          accent: true,
        },
        {
          label: "Acessos",
          title: "Abrir usuários, acessos e segurança deste cliente",
          url: `https://ads.google.com/aw/accountaccess/users?ocid=${encodeURIComponent(bareId)}`,
        },
      ];

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1_800);
    } catch {
      window.prompt("Copie este link:", value);
    }
  }
  const effectiveBalance = finance ? finance.balance : balance;
  const runwayDays = finance?.runway_days ?? null;
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency || "BRL",
    }).format(value);
  const runwayText =
    runwayDays == null
      ? null
      : runwayDays < 1
        ? `${Math.max(1, Math.round(runwayDays * 24))}h`
        : runwayDays < 10
          ? `${runwayDays.toFixed(1)} dias`
          : `${Math.round(runwayDays)} dias`;
  const depletionText = finance?.estimated_depletion_date
    ? new Date(`${finance.estimated_depletion_date}T12:00:00`).toLocaleDateString("pt-BR")
    : null;
  const balanceText = effectiveBalance == null
    ? ""
    : `\nSaldo disponível: ${formatCurrency(effectiveBalance)}.` +
      (runwayText
        ? ` No ritmo médio dos últimos 7 dias, a previsão é durar ${runwayText}${depletionText ? ` (até aproximadamente ${depletionText})` : ""}.`
        : "");
  const clientMessage =
    `Olá! Para manter as campanhas da conta "${accountName}" (ID ${bareId}) ativas, ` +
    `acesse o link abaixo para conferir o faturamento e adicionar saldo.${balanceText}\n\n${billingUrl}\n\n` +
    "É necessário entrar com um perfil que tenha permissão financeira ou de administrador nessa conta.";

  const balTone = runwayDays != null && runwayDays <= 1 ? "danger" : runwayDays != null && runwayDays <= 5 ? "warn" : "ok";

  return (
    <section className="ec-linkrow" style={{ margin: compact ? "12px 0 0" : "14px 0 2px" }}>
      <span className="ec-linkrow__head">
        Acesso rápido{business?.name ? ` · ${business.name}` : ""}
      </span>
      {isMeta && finance?.is_prepaid && effectiveBalance != null && (
        <span
          className={"ec-linkrow__bal ec-linkrow__bal--" + balTone}
          data-tone={balTone}
          title={
            finance.average_daily_spend > 0
              ? `Média diária (7d): ${formatCurrency(finance.average_daily_spend)}`
              : "Sem gasto nos últimos 7 dias"
          }
        >
          Saldo {formatCurrency(effectiveBalance)}
          {runwayText ? ` · dura ${runwayText}` : " · sem gasto 7d"}
          {depletionText && runwayText ? ` · até ${depletionText}` : ""}
        </span>
      )}
      {links.map((link) => (
        <a
          key={link.label}
          href={link.url}
          target="_blank"
          rel="noreferrer"
          title={link.title}
          className={"ec-linkrow__item" + (link.accent ? " ec-linkrow__item--accent" : "")}
          data-accent={link.accent ? "true" : undefined}
        >
          {link.label} ↗
        </a>
      ))}
      <button
        className="ec-linkrow__action"
        onClick={() => copy(billingUrl, "billing")}
        title="Copiar para enviar ao cliente; ele precisará entrar com um perfil autorizado"
      >
        {copied === "billing" ? "Link copiado ✓" : "Copiar link de saldo"}
      </button>
      {isMeta && (
        <>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(clientMessage)}`}
            target="_blank"
            rel="noreferrer"
            title="Abrir o WhatsApp com o aviso de saldo pronto para enviar"
            style={{
              padding: "6px 9px",
              borderRadius: "var(--r-sm)",
              border: "1px solid #bfe0c8",
              background: "#edf9f0",
              color: "#20713a",
              fontSize: 11,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Enviar no WhatsApp ↗
          </a>
          <button
            onClick={() => copy(clientMessage, "message")}
            title="Copiar uma mensagem pronta com conta, saldo e link para enviar ao cliente"
            style={{
              padding: "6px 9px",
              borderRadius: "var(--r-sm)",
              border: "1px dashed #bfe0c8",
              background: "#f6fbf7",
              color: "#267a45",
              fontSize: 11,
              fontWeight: 650,
              cursor: "pointer",
            }}
          >
            {copied === "message" ? "Mensagem copiada ✓" : "Copiar aviso"}
          </button>
        </>
      )}
      <button
        onClick={() => copy(bareId, "id")}
        title="Copiar o ID desta conta de anúncios"
        style={{
          padding: "6px 9px",
          borderRadius: "var(--r-sm)",
          border: "1px solid transparent",
          background: "transparent",
          color: "var(--text-muted)",
          fontSize: 10.5,
          cursor: "pointer",
        }}
      >
        {copied === "id" ? "ID copiado ✓" : `ID ${bareId}`}
      </button>
    </section>
  );
}

function Chip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color: string }) {
  return (
    <button
      onClick={onClick}
      className={"ec-chip" + (active ? " ec-chip--active" : "")}
      style={{ color, borderColor: active ? color : undefined }}
      data-active={active ? "true" : undefined}
    >
      <span className="ec-chip__dot" style={{ background: color }} />
      {label}
    </button>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="ec-tab" data-active={active ? "true" : undefined} aria-pressed={active}>
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: "var(--text-faint)", padding: "8px 2px" }}>{children}</div>;
}

function Kpi({ label, value, cur, prev, invert, neutral }: { label: string; value: string; cur?: number; prev?: number; invert?: boolean; neutral?: boolean }) {
  const d = cur != null && prev != null ? delta(cur, prev) : null;
  let badge = null;
  if (d && d.hasPrev) {
    const up = d.pct >= 0;
    const good = invert ? !up : up;
    const tone = neutral || Math.abs(d.pct) < 0.05 ? "flat" : good ? "good" : "bad";
    badge = (
      <span className="ec-kpi__delta" data-tone={tone}>
        {up ? "▲" : "▼"} {Math.abs(d.pct).toFixed(1)}%<span> vs. anterior</span>
      </span>
    );
  }
  return (
    <div className="ec-kpi">
      <div className="ec-kpi__label">{label}</div>
      {/* Números tabulares: a coluna não "dança" quando o valor muda. */}
      <div className="ec-kpi__value">{value}</div>
      <div className="ec-kpi__foot">{badge}</div>
    </div>
  );
}

// Mini-gráfico de tendência em SVG.
function Sparkline({ points, color = "var(--data-1)", width = 84, height = 26 }: { points: number[]; color?: string; width?: number; height?: number }) {
  if (!points || points.length < 2) return <div style={{ width, height }} />;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const coords = points.map((v, i) => [i * step, height - ((v - min) / span) * (height - 4) - 2]);
  const path = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${path} L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <path d={area} fill={color + "18"} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: 640, margin: "60px auto", padding: 24, fontFamily: "system-ui, sans-serif", display: "grid", gap: 12 }}>{children}</div>;
}
