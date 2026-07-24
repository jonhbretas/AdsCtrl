"use client";

import { useEffect, useMemo, useState } from "react";

type AlertLevel = "critical" | "warning" | "info";
type AlertItem = {
  id: number;
  account_id: string;
  account_name: string;
  level: AlertLevel;
  type: string;
  title: string;
  detail: string;
  acknowledged: boolean;
  acknowledged_at: string | null;
  resolved: boolean;
  resolved_at: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
};

const LEVEL = {
  critical: { label: "Crítico", color: "#b23a35", bg: "#fff4f2", border: "#efcfca" },
  warning: { label: "Atenção", color: "#936116", bg: "#fff9ed", border: "#efdcae" },
  info: { label: "Informativo", color: "#2768a8", bg: "#f1f7fd", border: "#cfe0f2" },
};

export default function AlertsPage() {
  const [active, setActive] = useState<AlertItem[]>([]);
  const [history, setHistory] = useState<AlertItem[]>([]);
  const [tab, setTab] = useState<"active" | "history">("active");
  const [level, setLevel] = useState<"all" | AlertLevel>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [activeResponse, historyResponse] = await Promise.all([
        fetch("/api/alerts?scope=active", { cache: "no-store" }),
        fetch("/api/alerts?scope=history", { cache: "no-store" }),
      ]);
      const [activePayload, historyPayload] = await Promise.all([
        activeResponse.json(),
        historyResponse.json(),
      ]);
      if (!activeResponse.ok) throw new Error(activePayload.error || "Falha ao carregar alertas ativos.");
      if (!historyResponse.ok) throw new Error(historyPayload.error || "Falha ao carregar o histórico.");
      setActive(activePayload.alerts || []);
      setHistory(historyPayload.alerts || []);
    } catch (cause: any) {
      setError(cause?.message || "Falha ao carregar a central de alertas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function acknowledge(item: AlertItem, acknowledged: boolean) {
    setBusy(item.id);
    setError(null);
    try {
      const response = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, acknowledged }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || "Falha ao atualizar alerta.");
      await load();
    } catch (cause: any) {
      setError(cause?.message || "Falha ao atualizar alerta.");
    } finally {
      setBusy(null);
    }
  }

  const source = tab === "active" ? active : history;
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return source.filter((item) => {
      if (level !== "all" && item.level !== level) return false;
      if (!query) return true;
      return `${item.account_name} ${item.title} ${item.detail} ${item.type}`.toLowerCase().includes(query);
    });
  }, [source, level, search]);

  const critical = active.filter((item) => item.level === "critical").length;
  const warning = active.filter((item) => item.level === "warning").length;
  const info = active.filter((item) => item.level === "info").length;

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 22px 60px", fontFamily: "system-ui, -apple-system, sans-serif", color: "#171716" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 18, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, color: "#777", fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase" }}>Monitoramento</div>
          <h1 style={{ margin: "4px 0 0", fontSize: 29, letterSpacing: -0.8 }}>Central de alertas</h1>
          <p style={{ margin: "6px 0 0", color: "#777", fontSize: 13 }}>Problemas de entrega, status, orçamento e performance que exigem atenção.</p>
        </div>
        <button onClick={load} disabled={loading} style={buttonStyle}>{loading ? "Atualizando…" : "↻ Atualizar"}</button>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10, marginBottom: 16 }}>
        <Summary label="Alertas ativos" value={active.length} color="#333" />
        <Summary label="Críticos" value={critical} color="#b23a35" />
        <Summary label="Atenção" value={warning} color="#936116" />
        <Summary label="Informativos" value={info} color="#2768a8" />
      </section>

      {error && <div role="alert" style={{ padding: "11px 14px", border: "1px solid #efcfca", borderRadius: 10, color: "#a33b35", background: "#fff7f5", marginBottom: 14, fontSize: 13 }}>{error}</div>}

      <section style={{ border: "1px solid #e8e8e5", borderRadius: 14, background: "#fff", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 14px", borderBottom: "1px solid #ececea", background: "#fbfbfa", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 3, padding: 3, borderRadius: 9, background: "#efefed" }}>
            <Tab active={tab === "active"} onClick={() => setTab("active")}>Ativos ({active.length})</Tab>
            <Tab active={tab === "history"} onClick={() => setTab("history")}>Histórico ({history.length})</Tab>
          </div>
          <select value={level} onChange={(event) => setLevel(event.target.value as typeof level)} style={inputStyle}>
            <option value="all">Todas as severidades</option>
            <option value="critical">Críticos</option>
            <option value="warning">Atenção</option>
            <option value="info">Informativos</option>
          </select>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente ou alerta…" style={{ ...inputStyle, minWidth: 230 }} />
          <span style={{ marginLeft: "auto", color: "#999", fontSize: 11 }}>{rows.length} resultado(s)</span>
        </div>

        {loading ? (
          <Empty>Carregando alertas…</Empty>
        ) : rows.length === 0 ? (
          <Empty>{tab === "active" ? "Nenhum alerta ativo com esses filtros. ✓" : "Nenhum alerta no histórico."}</Empty>
        ) : (
          <div>
            {rows.map((item) => {
              const appearance = LEVEL[item.level] || LEVEL.info;
              const date = item.resolved_at || item.acknowledged_at || item.last_seen_at;
              return (
                <article key={item.id} style={{ display: "grid", gridTemplateColumns: "110px minmax(180px,.75fr) minmax(280px,1.7fr) 150px", gap: 16, alignItems: "center", padding: "14px 16px", borderTop: "1px solid #f0f0ee", background: item.level === "critical" && tab === "active" ? "#fffafa" : "#fff" }}>
                  <div>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 999, background: appearance.bg, border: `1px solid ${appearance.border}`, color: appearance.color, fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: appearance.color }} />
                      {appearance.label}
                    </span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 720, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.account_name}</div>
                    <div style={{ marginTop: 3, color: "#999", fontSize: 10 }}>{item.type || "monitoramento"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 680 }}>{item.title}</div>
                    <div style={{ marginTop: 4, color: "#777", fontSize: 11.5, lineHeight: 1.45 }}>{item.detail}</div>
                    {date && <div style={{ marginTop: 5, color: "#aaa", fontSize: 10 }}>Último registro: {new Date(date).toLocaleString("pt-BR")}</div>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {tab === "active" ? (
                      <button disabled={busy === item.id} onClick={() => acknowledge(item, true)} style={buttonStyle}>{busy === item.id ? "Salvando…" : "Marcar ciente"}</button>
                    ) : !item.resolved ? (
                      <button disabled={busy === item.id} onClick={() => acknowledge(item, false)} style={buttonStyle}>{busy === item.id ? "Salvando…" : "Reabrir"}</button>
                    ) : (
                      <span style={{ color: "#27874e", fontSize: 11, fontWeight: 750 }}>✓ Resolvido</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function Summary({ label, value, color }: { label: string; value: number; color: string }) {
  return <div style={{ border: "1px solid #e8e8e5", borderRadius: 13, background: "#fff", padding: "14px 16px" }}><div style={{ color: "#888", fontSize: 10, fontWeight: 750, textTransform: "uppercase" }}>{label}</div><div style={{ color, fontSize: 25, fontWeight: 780, marginTop: 5 }}>{value}</div></div>;
}
function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ border: 0, borderRadius: 7, padding: "6px 11px", background: active ? "#fff" : "transparent", color: active ? "#111" : "#777", boxShadow: active ? "0 1px 2px #0001" : "none", fontSize: 11.5, fontWeight: 680, cursor: "pointer" }}>{children}</button>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: 180, display: "grid", placeItems: "center", color: "#999", fontSize: 13 }}>{children}</div>;
}
const inputStyle: React.CSSProperties = { height: 34, border: "1px solid #dededb", borderRadius: 8, background: "#fff", padding: "0 10px", color: "#333", fontSize: 11.5 };
const buttonStyle: React.CSSProperties = { border: "1px solid #dededb", borderRadius: 8, background: "#fff", color: "#333", padding: "8px 11px", fontSize: 11.5, fontWeight: 650, cursor: "pointer" };
