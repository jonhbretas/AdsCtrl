"use client";

// app/page.tsx — Visão geral (overview) das contas de anúncio Meta.
// Topo: grupos + filtros + período. Esquerda: alertas. Centro: tabela expansível.

import { useEffect, useMemo, useState } from "react";
import AccountDetail from "@/components/AccountDetail";
import { brl, num } from "@/lib/format";

interface Metrics {
  spend: number;
  conversions: number;
  cpc: number;
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
  name: string;
  currency: string;
  status: string;
  balance: number | null;
  group_id: string | null;
  updated_at?: string;
  metrics: Metrics | null;
  alerts: AlertItem[];
}
interface Group {
  id: string;
  name: string;
  color: string;
}

const LEVEL_STYLE: Record<string, { bg: string; fg: string; dot: string; label: string }> = {
  critical: { bg: "#fceceb", fg: "#a32d2d", dot: "#dc2626", label: "Crítico" },
  warning: { bg: "#faeeda", fg: "#854f0b", dot: "#f59e0b", label: "Atenção" },
  info: { bg: "#e6f1fb", fg: "#0c447c", dot: "#3987e5", label: "Info" },
};

const PRESETS: { label: string; days: number }[] = [
  { label: "7 dias", days: 7 },
  { label: "14 dias", days: 14 },
  { label: "30 dias", days: 30 },
];

function rangeFor(days: number) {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const until = new Date();
  const since = new Date();
  since.setDate(until.getDate() - days);
  return { since: fmt(since), until: fmt(until) };
}

function initials(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export default function Dashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [onlyActive, setOnlyActive] = useState(true);
  const [search, setSearch] = useState("");
  const [days, setDays] = useState(7);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [alertTab, setAlertTab] = useState<"active" | "history">("active");
  const [history, setHistory] = useState<AlertItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [acking, setAcking] = useState<number | null>(null);

  const range = useMemo(() => rangeFor(days), [days]);

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
    load();
  }, []);

  async function refresh() {
    setRefreshing(true);
    await load();
    if (alertTab === "history") await loadHistory();
    setRefreshing(false);
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

  const filtered = useMemo(() => {
    let list = accounts;
    if (groupFilter !== "all") list = list.filter((a) => a.group_id === groupFilter);
    if (onlyActive) list = list.filter((a) => a.status === "ACTIVE");
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((a) => a.name.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => (b.metrics?.spend || 0) - (a.metrics?.spend || 0));
  }, [accounts, groupFilter, onlyActive, search]);

  const totals = useMemo(() => {
    const spend = filtered.reduce((s, a) => s + (a.metrics?.spend || 0), 0);
    const conv = filtered.reduce((s, a) => s + (a.metrics?.conversions || 0), 0);
    return { spend, conv, cpa: conv ? spend / conv : 0 };
  }, [filtered]);

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
          <p style={{ margin: "4px 0 0", color: "#888", fontSize: 14 }}>Métricas de mídia paga (Meta) por conta.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {lastUpdated && <span style={{ fontSize: 12, color: "#aaa" }}>Coleta: {lastUpdated}</span>}
          <button onClick={refresh} disabled={refreshing} style={btnStyle}>
            {refreshing ? "Atualizando…" : "↻ Atualizar"}
          </button>
          <a href="/admin" style={{ ...btnStyle, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>⚙ Grupos</a>
        </div>
      </header>

      {/* GRUPOS (chips) */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <Chip active={groupFilter === "all"} onClick={() => setGroupFilter("all")} label="Todos" color="#111" />
        {groups.map((g) => (
          <Chip key={g.id} active={groupFilter === g.id} onClick={() => setGroupFilter(g.id)} label={g.name} color={g.color} />
        ))}
      </div>

      {/* FILTROS */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 20 }}>
        <select value={onlyActive ? "active" : "all"} onChange={(e) => setOnlyActive(e.target.value === "active")} style={selectStyle}>
          <option value="active">Somente ativas</option>
          <option value="all">Todas as contas</option>
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar conta…" style={{ ...selectStyle, minWidth: 220 }} />
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 4, background: "#f2f2f2", borderRadius: 10, padding: 3 }}>
          {PRESETS.map((p) => (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "none",
                background: days === p.days ? "#fff" : "transparent",
                boxShadow: days === p.days ? "0 1px 2px rgba(0,0,0,.08)" : "none",
                fontSize: 13,
                fontWeight: 500,
                color: days === p.days ? "#111" : "#777",
                cursor: "pointer",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: "#aaa" }}>{range.since} → {range.until}</span>
      </div>

      {/* KPIs GERAIS */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        <Kpi label={`Investimento (${days}d)`} value={brl(totals.spend, 0)} />
        <Kpi label="Conversões" value={num(totals.conv)} />
        <Kpi label="CPA médio" value={brl(totals.cpa)} />
      </section>

      {/* LAYOUT: alertas (esq) + tabela (centro) */}
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, alignItems: "start" }}>
        {/* ALERTAS */}
        <aside style={{ position: "sticky", top: 16 }}>
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 160px 150px 40px", padding: "12px 16px", borderBottom: "1px solid #f0f0f0", fontSize: 12, color: "#999", fontWeight: 600 }}>
            <span>Cliente</span>
            <span>Canais</span>
            <span style={{ textAlign: "right" }}>Investimento ({days}d)</span>
            <span style={{ textAlign: "right" }}>Saldo Meta</span>
            <span />
          </div>
          {filtered.length === 0 && <div style={{ padding: 28, textAlign: "center", color: "#aaa" }}>Nenhuma conta com os filtros atuais.</div>}
          {filtered.map((a) => {
            const g = groupById(a.group_id);
            const open = expanded === a.account_id;
            return (
              <div key={a.account_id} style={{ borderBottom: "1px solid #f4f4f4" }}>
                <div
                  onClick={() => setExpanded(open ? null : a.account_id)}
                  style={{ display: "grid", gridTemplateColumns: "1fr 90px 160px 150px 40px", padding: "12px 16px", alignItems: "center", cursor: "pointer", background: open ? "#fafafa" : "#fff" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span style={{ width: 30, height: 30, borderRadius: "50%", background: g?.color || "#cbd5e1", color: "#fff", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                      {initials(a.name)}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.name}>{a.name}</div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {g && <span style={{ fontSize: 10, padding: "0 6px", borderRadius: 8, background: g.color + "22", color: g.color }}>{g.name}</span>}
                        {a.status !== "ACTIVE" && <span style={{ fontSize: 10, color: "#a32d2d" }}>● {a.status}</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <span title="Meta / Instagram" style={{ fontSize: 12, width: 22, height: 22, borderRadius: 6, background: "#e7f0fd", color: "#1877f2", display: "grid", placeItems: "center", fontWeight: 700 }}>f</span>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 14, fontWeight: 600 }}>{brl(a.metrics?.spend || 0)}</div>
                  <div style={{ textAlign: "right", fontSize: 14, color: a.balance != null && a.balance > 0 ? "#111" : "#bbb" }}>
                    {a.balance != null && a.balance > 0 ? brl(a.balance) : "—"}
                  </div>
                  <div style={{ textAlign: "center", color: "#bbb", fontSize: 14 }}>{open ? "▲" : "▼"}</div>
                </div>
                {open && (
                  <div style={{ borderTop: "1px solid #f0f0f0", padding: "0 16px" }}>
                    <AccountDetail
                      accountId={a.account_id}
                      since={range.since}
                      until={range.until}
                      status={a.status}
                      balance={a.balance}
                      currency={a.currency}
                    />
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

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#f7f7f5", borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ fontSize: 13, color: "#888" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: 640, margin: "60px auto", padding: 24, fontFamily: "system-ui, sans-serif", display: "grid", gap: 12 }}>{children}</div>;
}
