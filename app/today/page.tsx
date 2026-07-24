"use client";

import { useEffect, useMemo, useState } from "react";
import {
  compareSortValues,
  SortButton,
  SortState,
  usePersistentSort,
} from "@/components/SortableHeader";

type Priority = {
  client_id: string; client_name: string; type: string;
  client_currency?: string;
  level: "critical" | "warning" | "info"; title: string; detail: string; impact?: number | null;
};
type Client = {
  id: string; name: string; source_meta_account_id?: string | null;
  primary_kpi?: string | null; target_value?: number | null;
  currency: string; accounts: { account_id: string; platform: string; hidden: boolean }[];
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
type ClientSortKey =
  | "priority"
  | "client"
  | "pacing"
  | "kpiAttainment"
  | "trend"
  | "forecast"
  | "dataStatus";
const CLIENT_SORT_KEYS: readonly ClientSortKey[] = [
  "priority",
  "client",
  "pacing",
  "kpiAttainment",
  "trend",
  "forecast",
  "dataStatus",
];
const TODAY_SORT_STORAGE_KEY = `adsctrl:sort:today:${
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date())
}`;

const currencyMoney = (value: number, currency: string, digits = 0) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value || 0);
const num = (value: number, digits = 0) =>
  (value || 0).toLocaleString("pt-BR", { maximumFractionDigits: digits });
const LOWER_IS_BETTER_KPIS = new Set([
  "cpc",
  "cpm",
  "cpa",
  "cpl",
  "cost_per_result",
  "custom",
]);
const MONETARY_KPIS = new Set([
  "roas",
  "revenue",
  "cpc",
  "cpm",
  "cpa",
  "cpl",
  "cost_per_result",
  "custom",
]);

type KpiAttainment = {
  ratio: number;
  lowerIsBetter: boolean;
};

function kpiAttainment(client: Client): KpiAttainment | null {
  const target = Number(client.target_value || 0);
  const current = Number(client.metrics.kpiValue);
  if (
    !client.primary_kpi ||
    !Number.isFinite(target) ||
    !Number.isFinite(current) ||
    target <= 0 ||
    current < 0
  ) {
    return null;
  }

  const kpiType = client.primary_kpi.toLowerCase();
  if (client.mixedCurrencies && MONETARY_KPIS.has(kpiType)) return null;

  const lowerIsBetter = LOWER_IS_BETTER_KPIS.has(kpiType);
  if (lowerIsBetter && current <= 0) return null;

  return {
    ratio: lowerIsBetter ? target / current : current / target,
    lowerIsBetter,
  };
}

export default function TodayPage() {
  const [data, setData] = useState<Cockpit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = usePersistentSort<ClientSortKey>(
    TODAY_SORT_STORAGE_KEY,
    { key: "priority", direction: "asc" },
    CLIENT_SORT_KEYS
  );

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/cockpit", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha ao montar cockpit.");
      setData(json);
    } catch (e: any) {
      setError(e?.message || "Falha ao montar cockpit.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const critical = data?.priorities.filter((p) => p.level === "critical").length || 0;
  const warning = data?.priorities.filter((p) => p.level === "warning").length || 0;
  const configured = data?.clients.filter((c) => c.pacing.budget > 0).length || 0;
  const portfolioPacing = data?.summary.budget
    ? (data.summary.spend / data.summary.budget) * 100 : 0;
  const portfolioCurrency = data?.summary.currency || "BRL";

  const clients = useMemo(() => {
    const rows = [...(data?.clients || [])];
    const value = (client: Client) => {
      switch (sort.key) {
        case "priority":
          return client.priorities.reduce(
            (rank, priority) =>
              Math.min(
                rank,
                { critical: 0, warning: 1, info: 2 }[priority.level] ?? 3
              ),
            3
          );
        case "client": return client.name;
        case "pacing": return client.pacing.percentOfExpected;
        case "kpiAttainment": return kpiAttainment(client)?.ratio ?? null;
        case "trend":
          return client.metrics.prev7.spend > 0
            ? ((client.metrics.last7.spend - client.metrics.prev7.spend) /
                client.metrics.prev7.spend) *
                100
            : null;
        case "forecast":
          return !client.mixedCurrencies && client.pacing.forecast > 0
            ? client.pacing.forecast
            : null;
        case "dataStatus":
          return { fresh: 0, stale: 1, empty: 2 }[client.dataStatus] ?? 3;
      }
    };
    return rows.sort((left, right) => {
      const leftValue = value(left);
      const rightValue = value(right);
      if (sort.key === "forecast") {
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
      if (sort.key === "priority") {
        const leftImpact = Math.max(
          0,
          ...left.priorities.map((priority) => priority.impact || 0)
        );
        const rightImpact = Math.max(
          0,
          ...right.priorities.map((priority) => priority.impact || 0)
        );
        const leftRelativeImpact =
          !left.mixedCurrencies && left.pacing.budget > 0
            ? leftImpact / left.pacing.budget
            : 0;
        const rightRelativeImpact =
          !right.mixedCurrencies && right.pacing.budget > 0
            ? rightImpact / right.pacing.budget
            : 0;
        const leftPaceDeviation =
          left.pacing.percentOfExpected == null
            ? 0
            : Math.abs(left.pacing.percentOfExpected - 100);
        const rightPaceDeviation =
          right.pacing.percentOfExpected == null
            ? 0
            : Math.abs(right.pacing.percentOfExpected - 100);
        return (
          compareSortValues(leftValue, rightValue, "asc") ||
          compareSortValues(
            leftRelativeImpact,
            rightRelativeImpact,
            "desc"
          ) ||
          compareSortValues(
            left.priorities.length,
            right.priorities.length,
            "desc"
          ) ||
          compareSortValues(
            leftPaceDeviation,
            rightPaceDeviation,
            "desc"
          ) ||
          compareSortValues(left.name, right.name, "asc")
        );
      }
      return (
        compareSortValues(leftValue, rightValue, sort.direction) ||
        compareSortValues(left.name, right.name, "asc")
      );
    });
  }, [data, sort]);

  if (loading) return <State title="Preparando seu cockpit…" detail="Consolidando clientes, pacing e prioridades." />;
  if (error) return (
    <State title="Cockpit ainda não disponível" detail={error}>
      <p style={{ color: "#777", fontSize: 13, lineHeight: 1.5 }}>
        Execute as migrações <code>supabase-migration-clients.sql</code> e <code>supabase-migration-operations.sql</code>,
        depois faça uma coleta para preencher o histórico diário.
      </p>
      <button onClick={load} style={buttonStyle}>Tentar novamente</button>
    </State>
  );
  if (!data) return null;

  return (
    <div className="adsctrl-today-page" style={{ fontFamily: "system-ui, -apple-system, sans-serif", color: "#171716" }}>
      <style>{`
        .adsctrl-today-page {
          max-width: 1420px;
          margin: 0 auto;
          padding: 28px 24px 56px;
        }
        .adsctrl-today-header {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: flex-start;
          margin-bottom: 22px;
        }
        .adsctrl-today-actions {
          display: flex;
          align-items: center;
          gap: 9px;
        }
        .adsctrl-today-summary {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 18px;
        }
        .adsctrl-today-layout {
          display: grid;
          grid-template-columns: 360px minmax(0, 1fr);
          gap: 16px;
          align-items: start;
        }
        .adsctrl-today-priority-list {
          max-height: 650px;
          overflow-y: auto;
        }
        @media (max-width: 1000px) {
          .adsctrl-today-layout {
            grid-template-columns: minmax(0, 1fr);
          }
          .adsctrl-today-priority-list {
            max-height: 360px;
          }
        }
        @media (max-width: 760px) {
          .adsctrl-today-page {
            padding: 22px 16px 44px;
          }
          .adsctrl-today-header {
            flex-direction: column;
            align-items: stretch;
          }
          .adsctrl-today-actions {
            flex-wrap: wrap;
          }
          .adsctrl-today-summary {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 520px) {
          .adsctrl-today-summary {
            grid-template-columns: minmax(0, 1fr);
          }
        }
      `}</style>
      <header className="adsctrl-today-header">
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#777", letterSpacing: 0.7, textTransform: "uppercase" }}>Cockpit diário</div>
          <h1 style={{ margin: "4px 0 0", fontSize: 30, letterSpacing: -0.9 }}>{greeting}, Jonathan.</h1>
          <p style={{ margin: "6px 0 0", color: "#777", fontSize: 14 }}>
            {critical ? `${critical} situação(ões) crítica(s) exigem atenção.` : "Nenhuma situação crítica detectada."}
          </p>
        </div>
        <div className="adsctrl-today-actions">
          <DataPill status={data.last_collection?.status || "unknown"} />
          <button onClick={load} style={buttonStyle}>↻ Atualizar</button>
          <a href="/admin#clients" style={{ ...buttonStyle, textDecoration: "none" }}>Metas e orçamento</a>
        </div>
      </header>

      <section className="adsctrl-today-summary">
        <Kpi label="Investimento no ciclo" value={data.summary.mixedCurrencies ? "Múltiplas moedas" : currencyMoney(data.summary.spend, portfolioCurrency)} sub={data.summary.mixedCurrencies ? "Veja os valores por cliente" : data.summary.budget ? `${portfolioPacing.toFixed(0)}% do orçamento cadastrado` : "Cadastre os orçamentos"} />
        <Kpi label="Orçamento do ciclo" value={data.summary.mixedCurrencies ? "Por cliente" : data.summary.budget ? currencyMoney(data.summary.budget, portfolioCurrency) : "—"} sub={`${configured}/${data.clients.length} clientes configurados`} />
        <Kpi label="Resultados reportados" value={num(data.summary.conversions, 1)} sub="Soma operacional; não deduplicada entre canais" />
        <Kpi label="Fila de decisões" value={`${critical + warning}`} sub={`${critical} críticas · ${warning} atenção`} danger={critical > 0} />
      </section>

      <div className="adsctrl-today-layout">
        <aside style={{ border: "1px solid #e8e8e5", borderRadius: 14, background: "#fff", overflow: "hidden" }}>
          <div style={{ padding: "15px 16px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Ações prioritárias</div>
              <div style={{ color: "#999", fontSize: 11, marginTop: 2 }}>Ordenadas por severidade e impacto</div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#777" }}>{data.priorities.length}</span>
          </div>
          <div className="adsctrl-today-priority-list">
            {data.priorities.length === 0 ? (
              <div style={{ padding: 24, color: "#888", fontSize: 13 }}>Tudo tranquilo por aqui. ✓</div>
            ) : data.priorities.slice(0, 15).map((priority, index) => (
              <PriorityCard key={`${priority.client_id}-${priority.type}-${index}`} item={priority} />
            ))}
          </div>
        </aside>

        <main style={{ border: "1px solid #e8e8e5", borderRadius: 14, overflowX: "auto", background: "#fff" }}>
          <div style={{ minWidth: 820 }}>
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "7px 12px", borderBottom: "1px solid #eee", background: "#fff" }}>
            <button
              type="button"
              onClick={() => setSort({ key: "priority", direction: "asc" })}
              style={{ border: 0, background: sort.key === "priority" ? "#eef5ff" : "transparent", color: sort.key === "priority" ? "#286fc9" : "#888", borderRadius: 7, padding: "5px 8px", fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}
            >
              Prioridade operacional
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr .85fr .85fr .9fr 70px", gap: 12, padding: "12px 16px", background: "#fafaf9", borderBottom: "1px solid #eee", color: "#888", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>
            <SortButton column="client" sort={sort} onSort={setSort} align="left">Cliente</SortButton>
            <SortButton column="pacing" sort={sort} onSort={setSort} align="left" initialDirection="desc">Ritmo esperado</SortButton>
            <SortButton column="kpiAttainment" sort={sort} onSort={setSort} initialDirection="desc">KPI / meta</SortButton>
            <SortButton column="trend" sort={sort} onSort={setSort} initialDirection="desc">7d vs ant.</SortButton>
            <SortButton column="forecast" sort={sort} onSort={setSort} initialDirection="desc">Projeção</SortButton>
            <SortButton column="dataStatus" sort={sort} onSort={setSort} align="center" initialDirection="desc">Dados</SortButton>
          </div>
          {clients.map((client) => <ClientRow key={client.id} client={client} />)}
          {!clients.length && <div style={{ padding: 30, color: "#888", textAlign: "center" }}>Nenhum cliente ativo.</div>}
          </div>
        </main>
      </div>
    </div>
  );
}

function ClientRow({ client }: { client: Client }) {
  const trend = client.metrics.prev7.spend
    ? ((client.metrics.last7.spend - client.metrics.prev7.spend) / client.metrics.prev7.spend) * 100 : null;
  const budgetPct = client.pacing.percentOfBudget || 0;
  const expectedPct = client.pacing.percentOfExpected;
  const paceColor =
    expectedPct == null
      ? "#bbb"
      : expectedPct > 115
        ? "#d14b4b"
        : expectedPct < 85
          ? "#d49a27"
          : "#2d9b58";
  const kpiType = (client.primary_kpi || "").toLowerCase();
  const monetaryKpi = MONETARY_KPIS.has(kpiType);
  const lowerIsBetterKpi = LOWER_IS_BETTER_KPIS.has(kpiType);
  const kpi = client.metrics.kpiValue;
  const attainment = kpiAttainment(client);
  const attainmentPercent = attainment ? attainment.ratio * 100 : null;
  const attainmentColor =
    attainmentPercent == null
      ? "#999"
      : attainmentPercent >= 100
        ? "#27874e"
        : attainmentPercent >= 85
          ? "#a56a18"
          : "#c54a4a";
  const formatKpi = (value: number) =>
    kpiType === "roas" ? `${value.toFixed(2)}x`
    : kpiType === "ctr" ? `${value.toFixed(2)}%`
    : kpiType === "conversions" ? num(value)
    : currencyMoney(value, client.currency, 2);
  const kpiText =
    !client.primary_kpi ||
    (client.mixedCurrencies && monetaryKpi) ||
    (lowerIsBetterKpi && kpi <= 0)
      ? "—"
      : formatKpi(kpi);
  const targetText = !client.target_value || (client.mixedCurrencies && monetaryKpi) ? "sem comparação" : formatKpi(Number(client.target_value));
  const targetAccount = client.source_meta_account_id
    || client.accounts.find((account) => account.platform === "meta")?.account_id
    || client.accounts[0]?.account_id;
  return (
    <a href={targetAccount ? `/?account=${encodeURIComponent(targetAccount)}` : "/"} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr .85fr .85fr .9fr 70px", gap: 12, padding: "14px 16px", borderBottom: "1px solid #f0f0ee", alignItems: "center", color: "#222", textDecoration: "none" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 650, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{client.name}</div>
        <div style={{ display: "flex", gap: 5, marginTop: 4 }}>
          {[...new Set(client.accounts.filter((a) => !a.hidden).map((a) => a.platform))].map((platform) => (
            <span key={platform} style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 6, color: platform === "google" ? "#2f6fcd" : "#176cd2", background: platform === "google" ? "#edf3fd" : "#eaf2fd", textTransform: "uppercase" }}>{platform}</span>
          ))}
          {client.priorities.length > 0 && <span style={{ fontSize: 10, color: "#a55d19" }}>{client.priorities.length} ação(ões)</span>}
        </div>
      </div>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}>
          <strong>{client.mixedCurrencies ? "Moedas mistas" : currencyMoney(client.metrics.mtd.spend, client.currency)}</strong>
          <span style={{ color: "#888" }}>{client.mixedCurrencies ? "corrigir vínculo" : client.pacing.budget ? `${budgetPct.toFixed(0)}% do orçamento` : "sem budget"}</span>
        </div>
        <div style={{ height: 6, borderRadius: 4, background: "#efefed", overflow: "hidden" }}>
          <div
            title="Parcela do orçamento já consumida"
            style={{
              width: `${Math.min(budgetPct, 100)}%`,
              height: "100%",
              background: client.pacing.budget ? "#3987e5" : "#bbb",
              borderRadius: 4,
            }}
          />
        </div>
        <div
          title="100% significa que o investimento acumulado está exatamente no ritmo esperado para o dia atual do ciclo."
          style={{ marginTop: 4, fontSize: 9.5, fontWeight: 700, color: paceColor }}
        >
          {expectedPct == null
            ? "ritmo indisponível"
            : `${expectedPct.toFixed(0)}% do ritmo esperado`}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{kpiText}</div>
        <div style={{ fontSize: 10, color: "#999" }}>meta {targetText}</div>
        {attainment && attainmentPercent != null && (
          <div
            title={
              attainment.lowerIsBetter
                ? "Atingimento = meta ÷ valor atual. Para este KPI, menor é melhor."
                : "Atingimento = valor atual ÷ meta. Para este KPI, maior é melhor."
            }
            style={{ marginTop: 3, display: "grid", justifyItems: "end", gap: 1, fontSize: 9.5 }}
          >
            <span style={{ color: attainmentColor, fontWeight: 750, whiteSpace: "nowrap" }}>
              {attainmentPercent.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% atingimento
            </span>
            <span style={{ color: "#888", whiteSpace: "nowrap" }}>
              {attainment.lowerIsBetter ? "↓ menor é melhor" : "↑ maior é melhor"}
            </span>
          </div>
        )}
      </div>
      <div style={{ textAlign: "right", fontSize: 13, fontWeight: 650, color: trend == null ? "#aaa" : trend >= 0 ? "#27874e" : "#c54a4a" }}>
        {trend == null ? "—" : `${trend >= 0 ? "▲" : "▼"} ${Math.abs(trend).toFixed(1)}%`}
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 13, fontWeight: 650 }}>{!client.mixedCurrencies && client.pacing.forecast ? currencyMoney(client.pacing.forecast, client.currency) : "—"}</div>
        <div style={{ fontSize: 10, color: "#999" }}>{!client.mixedCurrencies && client.pacing.budget ? `de ${currencyMoney(client.pacing.budget, client.currency)}` : ""}</div>
      </div>
      <div style={{ display: "grid", placeItems: "center" }}><StatusDot status={client.dataStatus} /></div>
    </a>
  );
}

function PriorityCard({ item }: { item: Priority }) {
  const style = item.level === "critical"
    ? { dot: "#d94747", bg: "#fff8f7", label: "Crítico" }
    : item.level === "warning"
      ? { dot: "#d99425", bg: "#fffaf1", label: "Atenção" }
      : { dot: "#3987e5", bg: "#f5f9ff", label: "Info" };
  return (
    <div style={{ padding: "13px 16px", borderBottom: "1px solid #f0f0ee", background: style.bg }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: style.dot }} />
        <span style={{ fontSize: 10, textTransform: "uppercase", color: style.dot, fontWeight: 800 }}>{style.label}</span>
        {item.impact != null && <span style={{ marginLeft: "auto", fontSize: 11, color: "#777" }}>impacto {currencyMoney(item.impact, item.client_currency || "BRL")}</span>}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6 }}>{item.client_name}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#444", marginTop: 2 }}>{item.title}</div>
      <div style={{ fontSize: 11.5, lineHeight: 1.4, color: "#777", marginTop: 3 }}>{item.detail}</div>
    </div>
  );
}

function Kpi({ label, value, sub, danger }: { label: string; value: string; sub: string; danger?: boolean }) {
  return (
    <div style={{ border: `1px solid ${danger ? "#f0ceca" : "#e8e8e5"}`, borderRadius: 14, padding: "16px 18px", background: danger ? "#fffafa" : "#fff" }}>
      <div style={{ fontSize: 11, color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 25, fontWeight: 760, marginTop: 7, letterSpacing: -0.5, color: danger ? "#b93d3d" : "#171716" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#999", marginTop: 5 }}>{sub}</div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const config = status === "fresh" ? ["#2d9b58", "Atual"] : status === "stale" ? ["#d94747", "Atrasado"] : ["#aaa", "Sem dados"];
  return <span title={config[1]} style={{ width: 10, height: 10, borderRadius: "50%", background: config[0], boxShadow: `0 0 0 3px ${config[0]}20` }} />;
}
function DataPill({ status }: { status: string }) {
  const good = status === "success";
  return <span style={{ fontSize: 11, padding: "7px 10px", borderRadius: 9, background: good ? "#eef8f1" : "#fff6e7", color: good ? "#267a45" : "#9a681d", fontWeight: 650 }}>● Coleta {good ? "saudável" : status}</span>;
}
function State({ title, detail, children }: { title: string; detail: string; children?: React.ReactNode }) {
  return <div style={{ maxWidth: 620, margin: "90px auto", padding: 28, fontFamily: "system-ui", border: "1px solid #eee", borderRadius: 16 }}><h1 style={{ fontSize: 21, margin: 0 }}>{title}</h1><p style={{ color: "#777", fontSize: 14 }}>{detail}</p>{children}</div>;
}
const buttonStyle: React.CSSProperties = { border: "1px solid #dededb", background: "#fff", color: "#333", borderRadius: 9, padding: "8px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
