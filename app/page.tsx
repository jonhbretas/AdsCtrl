"use client";

// app/page.tsx — Visão geral (overview) das contas de anúncio Meta.
// Topo: grupos + filtros + período. Esquerda: alertas. Centro: tabela expansível.
//
// Período: HOJE / 7D / 14D / 30D + personalizado.
//  - 7D/14D/30D vêm do cache (snapshots do cron) e terminam ONTEM (dia atual não conta).
//  - HOJE e personalizado são buscados AO VIVO na Meta (/api/accounts/overview).

import { useEffect, useMemo, useState } from "react";
import AccountDetail from "@/components/AccountDetail";
import { brl, num, delta, RESULT_FAMILIES, RESULT_FAMILY_BY_SLUG } from "@/lib/format";

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

const LEVEL_STYLE: Record<string, { bg: string; fg: string; dot: string; label: string }> = {
  critical: { bg: "#fceceb", fg: "#a32d2d", dot: "#dc2626", label: "Crítico" },
  warning: { bg: "#faeeda", fg: "#854f0b", dot: "#f59e0b", label: "Atenção" },
  info: { bg: "#e6f1fb", fg: "#0c447c", dot: "#3987e5", label: "Info" },
};

type Period = "today" | "7d" | "14d" | "30d" | "custom";
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
  const [liveLoading, setLiveLoading] = useState(false);

  useEffect(() => {
    if (window.location.hash === "#alerts") window.location.replace("/alerts");
  }, []);

  const range = useMemo(() => rangeForPeriod(period, customSince, customUntil), [period, customSince, customUntil]);
  const isLive = period === "today" || period === "custom";
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
    if (isLive) return norm(live?.metrics?.[a.account_id]);
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
    fetch(`/api/accounts/overview?since=${range.since}&until=${range.until}`)
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
  }, [period, range.since, range.until]);

  async function refresh() {
    setRefreshing(true);
    await load();
    if (isLive) {
      try {
        const r = await fetch(`/api/accounts/overview?since=${range.since}&until=${range.until}`);
        const t = await r.text();
        setLive(t ? JSON.parse(t) : null);
      } catch { /* silencioso */ }
    }
    if (alertTab === "history") await loadHistory();
    setRefreshing(false);
  }

  // Dispara a coleta completa (insights + alertas) na hora, sem esperar o cron.
  async function collectNow() {
    if (collecting) return;
    setCollecting(true);
    setSyncMsg("Coletando dados das contas ativas… (pode levar até 1 min)");
    try {
      const r = await fetch("/api/collect", { method: "POST" });
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

  // Puxa o catálogo das duas plataformas; contas novas entram ocultas.
  async function syncAccounts() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await fetch("/api/accounts/sync", { method: "POST" });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || `Falha (HTTP ${r.status}).`);
      await load();
      setSyncMsg(
        d.added > 0
          ? `+${d.added} conta(s) nova(s): ${d.addedNames.join(", ")}`
          : `Nenhuma conta nova. ${d.total} contas acessíveis nas plataformas.`
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
    return [...list].sort((a, b) => accMetrics(b).spend - accMetrics(a).spend);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, groupFilter, platformFilter, onlyActive, search, showHidden, period, live]);

  const totals = useMemo(() => {
    let spend = 0, res = 0, val = 0;
    let prevSpend = 0, prevRes = 0, prevVal = 0;
    for (const a of filtered) {
      const m = accMetrics(a), p = accPrev(a);
      spend += m.spend; res += m.result; val += m.value;
      prevSpend += p.spend; prevRes += p.result; prevVal += p.value;
    }
    return {
      spend, res, val,
      cpr: res ? spend / res : 0,
      roas: spend ? val / spend : 0,
      prevSpend, prevRes, prevVal,
      prevCpr: prevRes ? prevSpend / prevRes : 0,
      prevRoas: prevSpend ? prevVal / prevSpend : 0,
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
  const short = PERIOD_SHORT[period];
  const fam = RESULT_FAMILY_BY_SLUG[focus] || RESULT_FAMILIES[0];

  if (loading) return <Center>Carregando overview…</Center>;
  if (error)
    return (
      <Center>
        <h1 style={{ fontSize: 20, margin: 0 }}>Não foi possível carregar</h1>
        <p style={{ color: "#a32d2d", background: "#fceceb", padding: "10px 14px", borderRadius: 8 }}>{error}</p>
      </Center>
    );

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "28px 20px", fontFamily: "system-ui, -apple-system, sans-serif", color: "#111" }}>
      {/* HEADER */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>Visão geral</h1>
          <p style={{ margin: "4px 0 0", color: "#888", fontSize: 14 }}>Métricas de mídia paga (Meta + Google) por conta.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {lastUpdated && <span style={{ fontSize: 12, color: "#aaa" }}>Coleta: {lastUpdated}</span>}
          <button onClick={refresh} disabled={refreshing} style={btnStyle}>
            {refreshing ? "Atualizando…" : "↻ Atualizar"}
          </button>
          <button onClick={syncAccounts} disabled={syncing} style={btnStyle} title="Buscar novas contas Meta e Google; elas entram ocultas">
            {syncing ? "Sincronizando…" : "⇅ Sincronizar contas"}
          </button>
          <button onClick={collectNow} disabled={collecting} style={{ ...btnStyle, background: collecting ? "#eee" : "#111", color: collecting ? "#999" : "#fff", borderColor: "#111" }} title="Buscar métricas e alertas de todas as contas agora">
            {collecting ? "Coletando…" : "⟳ Coletar agora"}
          </button>
          <a href="/admin" style={{ ...btnStyle, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>⚙ Grupos</a>
        </div>
      </header>

      {syncMsg && (
        <div style={{ background: "#e6f1fb", color: "#0c447c", padding: "8px 14px", borderRadius: 8, fontSize: 13, marginBottom: 14 }}>
          {syncMsg}
        </div>
      )}
      {!!live?.errors?.length && (
        <div style={{ background: "#fff7e8", color: "#875711", padding: "8px 14px", borderRadius: 8, fontSize: 13, marginBottom: 14 }}>
          {live.errors.length} conta(s) com dados ao vivo indisponíveis. A falha não foi convertida em zero.
        </div>
      )}

      {/* GRUPOS (chips) */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <Chip active={groupFilter === "all"} onClick={() => setGroupFilter("all")} label="Todos" color="#111" />
        {groups.map((g) => (
          <Chip key={g.id} active={groupFilter === g.id} onClick={() => setGroupFilter(g.id)} label={g.name} color={g.color} />
        ))}
      </div>

      {/* FILTROS */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 4, background: "#f2f2f2", borderRadius: 10, padding: 3 }}>
          <PeriodBtn active={platformFilter === "meta"} onClick={() => { setPlatformFilter("meta"); setFocus("vendas"); }} label="Meta / Clientes" />
          <PeriodBtn active={platformFilter === "google"} onClick={() => { setPlatformFilter("google"); setFocus("conversoes"); }} label="Google Ads" />
        </div>
        <select value={onlyActive ? "active" : "all"} onChange={(e) => setOnlyActive(e.target.value === "active")} style={selectStyle}>
          <option value="active">Somente ativas</option>
          <option value="all">Todas as contas</option>
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar conta…" style={{ ...selectStyle, minWidth: 200 }} />
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#888" }}>
          Foco:
          <select value={focus} onChange={(e) => setFocus(e.target.value)} style={selectStyle} title="Resultado principal do negócio (vendas, mensagens, leads…)">
            {RESULT_FAMILIES.map((f) => (
              <option key={f.slug} value={f.slug}>{f.label}</option>
            ))}
          </select>
        </label>
        {hiddenCount > 0 && (
          <button
            onClick={() => setShowHidden((v) => !v)}
            style={{ ...selectStyle, cursor: "pointer", color: showHidden ? "#111" : "#888", fontWeight: 500 }}
            title="Mostrar/ocultar as contas que você escondeu"
          >
            {showHidden ? "🙈 Ocultar escondidas" : `👁 Mostrar ocultas (${hiddenCount})`}
          </button>
        )}
        <span style={{ flex: 1 }} />

        {/* PERÍODO */}
        <div style={{ display: "flex", gap: 4, background: "#f2f2f2", borderRadius: 10, padding: 3 }}>
          {PRESETS.map((p) => (
            <PeriodBtn key={p.key} active={period === p.key} onClick={() => { setPeriod(p.key); setShowCustom(false); }} label={p.label} />
          ))}
          <PeriodBtn
            active={period === "custom"}
            onClick={() => { setPeriod("custom"); setShowCustom(true); }}
            label="Personalizado"
          />
        </div>
      </div>

      {/* LINHA DE PERÍODO (datas + estado ao vivo) */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 20, minHeight: 24 }}>
        {(showCustom || period === "custom") && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="date" value={customSince} max={customUntil} onChange={(e) => { setCustomSince(e.target.value); setPeriod("custom"); }} style={dateStyle} />
            <span style={{ color: "#bbb" }}>→</span>
            <input type="date" value={customUntil} min={customSince} max={isoDaysAgo(0)} onChange={(e) => { setCustomUntil(e.target.value); setPeriod("custom"); }} style={dateStyle} />
          </div>
        )}
        <span style={{ fontSize: 12, color: "#aaa" }}>{range.since} → {range.until}</span>
        {isLive && (
          <span style={{ fontSize: 12, color: liveLoading ? "#f59e0b" : "#16a34a", fontWeight: 500 }}>
            {liveLoading ? "● buscando ao vivo na Meta…" : "● dados ao vivo"}
          </span>
        )}
        {!isLive && <span style={{ fontSize: 12, color: "#bbb" }}>cache (atualiza 1x/dia) · não inclui hoje</span>}
      </div>

      {/* KPIs GERAIS (agregado do período vs período anterior, guiado pelo foco) */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <Kpi label={`Investimento (${short})`} value={liveReady ? brl(totals.spend, 0) : "…"} cur={totals.spend} prev={totals.prevSpend} neutral />
        <Kpi label={`${fam.label} (${short})`} value={liveReady ? num(totals.res) : "…"} cur={totals.res} prev={totals.prevRes} />
        <Kpi label={`Custo por resultado`} value={liveReady ? brl(totals.cpr) : "…"} cur={totals.cpr} prev={totals.prevCpr} invert />
        {fam.sales && (
          <>
            <Kpi label="Valor de compra" value={liveReady ? brl(totals.val, 0) : "…"} cur={totals.val} prev={totals.prevVal} />
            <Kpi label="ROAS" value={liveReady ? `${totals.roas.toFixed(2)}x` : "…"} cur={totals.roas} prev={totals.prevRoas} />
          </>
        )}
      </section>

      {/* LAYOUT: alertas (esq) + tabela (centro) */}
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, alignItems: "start" }}>
        {/* ALERTAS */}
        <aside id="alerts" style={{ position: "sticky", top: 76, scrollMarginTop: 76 }}>
          <div style={{ display: "flex", gap: 4, background: "#f2f2f2", borderRadius: 10, padding: 3, marginBottom: 12 }}>
            <TabBtn active={alertTab === "active"} onClick={() => setAlertTab("active")}>
              Ativos {visibleAlerts.length > 0 && <b>({visibleAlerts.length})</b>}
            </TabBtn>
            <TabBtn active={alertTab === "history"} onClick={() => setAlertTab("history")}>
              Histórico
            </TabBtn>
          </div>

          <div style={{ display: "grid", gap: 8, maxHeight: "74vh", overflowY: "auto", paddingRight: 2 }}>
            {alertTab === "active" && (
              <>
                {visibleAlerts.length === 0 && <Empty>Nenhum alerta ativo. 🎉</Empty>}
                {visibleAlerts.map((a) => {
                  const st = LEVEL_STYLE[a.level];
                  return (
                    <div key={a.id} style={{ background: st.bg, borderRadius: 10, padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: st.dot }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: st.fg }}>{st.label}</span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: st.fg }}>{a.account_name}</div>
                      <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{a.title}</div>
                      <div style={{ fontSize: 12, color: "#888", marginTop: 1 }}>{a.detail}</div>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12, color: st.fg, cursor: "pointer", userSelect: "none" }}>
                        <input
                          type="checkbox"
                          checked={false}
                          disabled={acking === a.id}
                          onChange={() => setAck(a.id, true)}
                          style={{ accentColor: st.dot, width: 15, height: 15, cursor: "pointer" }}
                        />
                        Estou ciente
                      </label>
                    </div>
                  );
                })}
              </>
            )}

            {alertTab === "history" && (
              <>
                {historyLoading && <Empty>Carregando histórico…</Empty>}
                {!historyLoading && visibleHistory.length === 0 && <Empty>Sem histórico ainda.</Empty>}
                {!historyLoading &&
                  visibleHistory.map((a) => {
                    const st = LEVEL_STYLE[a.level];
                    const badge = a.resolved ? { t: "Resolvido", c: "#16a34a" } : { t: "Ciente", c: "#6b7280" };
                    const when = a.resolved_at || a.acknowledged_at || a.last_seen_at;
                    return (
                      <div key={a.id} style={{ background: "#fafafa", border: "1px solid #eee", borderRadius: 10, padding: "10px 12px", opacity: 0.92 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: st.dot }} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#888" }}>{st.label}</span>
                          <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: badge.c, background: badge.c + "18", padding: "1px 7px", borderRadius: 8 }}>
                            {badge.t}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#444" }}>{a.account_name}</div>
                        <div style={{ fontSize: 12, color: "#777", marginTop: 2 }}>{a.title}</div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                          <span style={{ fontSize: 11, color: "#aaa" }}>{when ? new Date(when).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}</span>
                          {a.acknowledged && !a.resolved && (
                            <button onClick={() => setAck(a.id, false)} disabled={acking === a.id} style={{ fontSize: 11, color: "#3987e5", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
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
        <main style={{ border: "1px solid #eee", borderRadius: 14, overflow: "hidden", background: "#fff" }}>
          <div style={{ display: "grid", gridTemplateColumns: GRID, padding: "12px 16px", borderBottom: "1px solid #f0f0f0", fontSize: 12, color: "#999", fontWeight: 600, alignItems: "center" }}>
            <span>Cliente</span>
            <span>Canais</span>
            <span style={{ textAlign: "center" }}>Tendência</span>
            <span style={{ textAlign: "right" }}>Investimento ({short})</span>
            <span style={{ textAlign: "right" }}>{fam.label.split(" ")[0]}</span>
            <span style={{ textAlign: "right" }}>Saldo Meta</span>
            <span />
            <span />
          </div>
          {isLive && !liveReady && <div style={{ padding: 28, textAlign: "center", color: "#aaa" }}>Buscando dados ao vivo nas plataformas…</div>}
          {liveReady && filtered.length === 0 && <div style={{ padding: 28, textAlign: "center", color: "#aaa" }}>Nenhuma conta com os filtros atuais.</div>}
          {liveReady && filtered.map((a) => {
            const g = groupById(a.group_id);
            const open = !a.hidden && expanded === a.account_id;
            const m = accMetrics(a);
            const liveError = isLive ? live?.errors?.find((item) => item.account_id === a.account_id) : undefined;
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
              <div id={`account-${a.account_id}`} key={a.account_id} style={{ borderBottom: "1px solid #f4f4f4", opacity: a.hidden ? 0.55 : 1 }}>
                <div
                  onClick={() => { if (!a.hidden) setExpanded(open ? null : a.account_id); }}
                  style={{ display: "grid", gridTemplateColumns: GRID, padding: "12px 16px", alignItems: "center", cursor: a.hidden ? "default" : "pointer", background: open ? "#fafafa" : "#fff" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span style={{ width: 30, height: 30, borderRadius: "50%", background: g?.color || "#cbd5e1", color: "#fff", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                      {initials(a.name)}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.name}>{a.name}</div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {g && <span style={{ fontSize: 10, padding: "0 6px", borderRadius: 8, background: g.color + "22", color: g.color }}>{g.name}</span>}
                        {linkedMeta && <span style={{ fontSize: 10, padding: "0 6px", borderRadius: 8, background: "#e7f0fd", color: "#315b91" }}>Cliente: {linkedMeta.name}</span>}
                        {a.status !== "ACTIVE" && <span style={{ fontSize: 10, color: "#a32d2d" }}>● {a.status}</span>}
                        {a.hidden && <span style={{ fontSize: 10, color: "#999" }}>oculta</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {a.platform === "google" ? (
                      <span title="Google Ads" style={{ fontSize: 12, width: 22, height: 22, borderRadius: 6, background: "#f5f7fa", color: "#4285f4", display: "grid", placeItems: "center", fontWeight: 700 }}>G</span>
                    ) : (
                      <span title="Meta / Instagram" style={{ fontSize: 12, width: 22, height: 22, borderRadius: 6, background: "#e7f0fd", color: "#1877f2", display: "grid", placeItems: "center", fontWeight: 700 }}>f</span>
                    )}
                    {a.platform === "meta" && linkedGoogle.length > 0 && (
                      <span title={`${linkedGoogle.length} conta(s) Google vinculada(s)`} style={{ fontSize: 11, width: 22, height: 22, borderRadius: 6, background: "#f5f7fa", color: "#4285f4", display: "grid", placeItems: "center", fontWeight: 700 }}>G</span>
                    )}
                  </div>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <Sparkline points={(m.daily || []).map((d) => d.spend)} color={g?.color || "#3987e5"} />
                  </div>
                  <div title={liveError?.message} style={{ textAlign: "right", fontSize: 14, fontWeight: 600, color: liveError ? "#a16207" : undefined }}>
                    {liveError ? "Indisponível" : brl(m.spend)}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: m.result > 0 ? "#111" : "#bbb" }}>
                      {liveError ? "—" : m.result > 0 ? num(m.result) : "—"}
                    </div>
                    {fam.sales && m.value > 0 && m.spend > 0 && (
                      <div style={{ fontSize: 10.5, color: "#16a34a" }}>{(m.value / m.spend).toFixed(1)}x ROAS</div>
                    )}
                  </div>
                  <div style={{ textAlign: "right", fontSize: 14, color: a.balance != null && a.balance > 0 ? "#111" : "#bbb" }}>
                    {a.platform === "meta" && a.balance != null && a.balance > 0 ? brl(a.balance) : "—"}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleHidden(a.account_id, !a.hidden); }}
                    title={a.hidden ? "Reexibir esta conta" : "Ocultar esta conta do dashboard"}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#bbb", padding: 0, lineHeight: 1 }}
                  >
                    {a.hidden ? "↩" : "🚫"}
                  </button>
                  <div style={{ textAlign: "center", color: "#bbb", fontSize: 14 }}>{a.hidden ? "—" : open ? "▲" : "▼"}</div>
                </div>
                {open && (
                  <div style={{ borderTop: "1px solid #f0f0f0", padding: "0 16px" }}>
                    <AccountDetail
                      accountId={a.account_id}
                      platform={a.platform}
                      since={range.since}
                      until={range.until}
                      status={a.status}
                      balance={a.balance}
                      currency={a.currency}
                    />
                    {a.platform === "meta" && (
                      <div style={{ borderTop: "1px solid #e8edf5", padding: "22px 0 28px" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#4285f4", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10 }}>
                          Google Ads vinculado ao cliente
                        </div>
                        {linkedGoogle.length === 0 ? (
                          <div style={{ padding: "14px 16px", borderRadius: 10, background: "#f8f9fb", color: "#888", fontSize: 13 }}>
                            Nenhuma conta Google ativa vinculada. Faça o vínculo em Configurações → Contas.
                          </div>
                        ) : linkedGoogle.map((google) => {
                          const gm = accMetrics(google);
                          return (
                            <details key={google.account_id} style={{ border: "1px solid #e5eaf1", borderRadius: 12, marginTop: 10, background: "#fbfcfe" }}>
                              <summary style={{ cursor: "pointer", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, listStyle: "none" }}>
                                <span style={{ width: 26, height: 26, borderRadius: 7, background: "#fff", color: "#4285f4", display: "grid", placeItems: "center", fontWeight: 700 }}>G</span>
                                <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{google.name}</span>
                                <span style={{ fontSize: 12, color: "#888" }}>Investimento</span>
                                <strong style={{ fontSize: 14 }}>{brl(gm.spend)}</strong>
                                <span style={{ fontSize: 12, color: "#888" }}>Conversões</span>
                                <strong style={{ fontSize: 14 }}>{num(gm.results.conversoes || gm.result || 0)}</strong>
                              </summary>
                              <div style={{ borderTop: "1px solid #e5eaf1", padding: "0 16px" }}>
                                <AccountDetail
                                  accountId={google.account_id}
                                  platform="google"
                                  since={range.since}
                                  until={range.until}
                                  status={google.status}
                                  balance={null}
                                  currency={google.currency}
                                />
                              </div>
                            </details>
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

const GRID = "1fr 40px 68px 120px 96px 100px 26px 24px";

const btnStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  border: "1px solid #e2e2e2",
  background: "#fff",
  fontSize: 13,
  fontWeight: 500,
  color: "#333",
  cursor: "pointer",
};
const selectStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #e2e2e2",
  fontSize: 13,
  background: "#fff",
};
const dateStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #e2e2e2",
  fontSize: 13,
  background: "#fff",
  color: "#333",
};

function PeriodBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 12px",
        borderRadius: 8,
        border: "none",
        background: active ? "#fff" : "transparent",
        boxShadow: active ? "0 1px 2px rgba(0,0,0,.08)" : "none",
        fontSize: 13,
        fontWeight: 500,
        color: active ? "#111" : "#777",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function Chip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 14px",
        borderRadius: 999,
        border: active ? `1px solid ${color}` : "1px solid #e2e2e2",
        background: active ? color + "12" : "#fff",
        color: active ? color : "#555",
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      {label}
    </button>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "6px 10px",
        borderRadius: 8,
        border: "none",
        background: active ? "#fff" : "transparent",
        boxShadow: active ? "0 1px 2px rgba(0,0,0,.08)" : "none",
        fontSize: 12.5,
        fontWeight: 600,
        color: active ? "#111" : "#777",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: "#bbb", padding: "8px 2px" }}>{children}</div>;
}

function Kpi({ label, value, cur, prev, invert, neutral }: { label: string; value: string; cur?: number; prev?: number; invert?: boolean; neutral?: boolean }) {
  const d = cur != null && prev != null ? delta(cur, prev) : null;
  let badge = null;
  if (d && d.hasPrev) {
    const up = d.pct >= 0;
    const good = invert ? !up : up;
    const color = neutral || Math.abs(d.pct) < 0.05 ? "#999" : good ? "#16a34a" : "#dc2626";
    badge = (
      <span style={{ fontSize: 12, fontWeight: 600, color }}>
        {up ? "▲" : "▼"} {Math.abs(d.pct).toFixed(1)}% <span style={{ color: "#aaa", fontWeight: 400 }}>vs. ant.</span>
      </span>
    );
  }
  return (
    <div style={{ background: "#f7f7f5", borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ fontSize: 13, color: "#888" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{value}</div>
      <div style={{ marginTop: 4, minHeight: 16 }}>{badge}</div>
    </div>
  );
}

// Mini-gráfico de tendência em SVG.
function Sparkline({ points, color = "#3987e5", width = 84, height = 26 }: { points: number[]; color?: string; width?: number; height?: number }) {
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
