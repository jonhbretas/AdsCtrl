"use client";

// components/AccountDetail.tsx
// Drill-down por conta, buscado ao vivo (/api/account/detail).

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { brl, brlShort, num, pct, dayLabel, resultLabel, pickPrimaryResult, orderedResults } from "@/lib/format";

interface Row {
  id: string;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  results: Record<string, number>;
  objective?: string;
  thumbnail?: string;
}
interface Daily {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  reach: number;
  results: Record<string, number>;
}
interface Breakdown {
  key: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  results: Record<string, number>;
}
interface Kpis {
  spend: number;
  reach: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  results: Record<string, number>;
}
interface Detail {
  account_id: string;
  range: { since: string; until: string };
  kpis: Kpis;
  daily: Daily[];
  campaigns: Row[];
  adsets: Row[];
  ads: Row[];
  breakdowns: { age_gender: Breakdown[]; region: Breakdown[]; platform: Breakdown[]; position: Breakdown[] };
  availableResults: string[];
  error?: string;
}

const ACCENT = "#3987e5";
const ACCENT2 = "#f59e0b";
const TEAL = "#2bb3a3";

type MetricKey = "spend" | "impressions" | "clicks" | "ctr" | "cpm" | "results" | "cpr";
const METRIC_LABELS: Record<MetricKey, string> = {
  spend: "Investimento",
  impressions: "Impressões",
  clicks: "Cliques",
  ctr: "CTR",
  cpm: "CPM",
  results: "Resultados",
  cpr: "CPR",
};

export default function AccountDetail({
  accountId,
  since,
  until,
  status,
  balance,
  currency,
}: {
  accountId: string;
  since: string;
  until: string;
  status: string;
  balance: number | null;
  currency: string;
}) {
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [tab, setTab] = useState<"campaigns" | "adsets" | "ads">("campaigns");
  const [demoMetric, setDemoMetric] = useState<MetricKey>("spend");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`/api/account/detail?account_id=${accountId}&since=${since}&until=${until}`)
      .then(async (r) => {
        const t = await r.text();
        const d = t ? JSON.parse(t) : {};
        if (!r.ok || d.error) throw new Error(d.error || `Falha (HTTP ${r.status}).`);
        return d as Detail;
      })
      .then((d) => {
        if (!alive) return;
        setData(d);
        setResult(pickPrimaryResult(d.availableResults));
      })
      .catch((e) => alive && setError(e?.message ?? "Erro ao carregar detalhe."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [accountId, since, until]);

  const metricOf = (obj: { spend: number; impressions: number; clicks: number; ctr: number; cpm: number; results: Record<string, number> }, m: MetricKey) => {
    const res = result ? obj.results[result] || 0 : 0;
    switch (m) {
      case "spend": return obj.spend;
      case "impressions": return obj.impressions;
      case "clicks": return obj.clicks;
      case "ctr": return obj.ctr;
      case "cpm": return obj.cpm;
      case "results": return res;
      case "cpr": return res ? obj.spend / res : 0;
    }
  };

  const fmtMetric = (v: number, m: MetricKey) =>
    m === "spend" || m === "cpm" || m === "cpr" ? brl(v) : m === "ctr" ? pct(v) : num(v);

  // agrupa campanhas por objetivo (para "investimento & CPR por objetivo")
  const byObjective = useMemo(() => {
    if (!data) return [];
    const m: Record<string, { spend: number; res: number }> = {};
    for (const c of data.campaigns) {
      const key = c.objective || "OUTROS";
      if (!m[key]) m[key] = { spend: 0, res: 0 };
      m[key].spend += c.spend;
      m[key].res += result ? c.results[result] || 0 : 0;
    }
    return Object.entries(m)
      .map(([objective, v]) => ({ objective, spend: v.spend, cpr: v.res ? v.spend / v.res : 0, res: v.res }))
      .sort((a, b) => b.spend - a.spend);
  }, [data, result]);

  if (loading)
    return <div style={{ padding: 32, color: "#888", fontSize: 14 }}>Carregando dados da Meta…</div>;
  if (error)
    return (
      <div style={{ padding: 24 }}>
        <div style={{ background: "#fceceb", color: "#a32d2d", padding: "10px 14px", borderRadius: 8, fontSize: 14 }}>
          {error}
        </div>
      </div>
    );
  if (!data) return null;

  const k = data.kpis;
  const primaryRes = result ? k.results[result] || 0 : 0;
  const cpr = primaryRes ? k.spend / primaryRes : 0;
  const resultOptions = orderedResults(data.availableResults);

  const rows = tab === "campaigns" ? data.campaigns : tab === "adsets" ? data.adsets : data.ads;

  return (
    <div style={{ padding: "8px 4px 24px", background: "#fafafa" }}>
      {/* seletor de resultado */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <img src="https://static.xx.fbcdn.net/rsrc.php/v3/y7/r/n5Mei_7QYtI.png" alt="" width={18} height={18} style={{ opacity: 0.9 }} onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
        <strong style={{ fontSize: 15 }}>Meta Ads</strong>
        <span style={{ flex: 1 }} />
        <label style={{ fontSize: 12, color: "#888" }}>Resultado:</label>
        <select
          value={result ?? ""}
          onChange={(e) => setResult(e.target.value)}
          style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13 }}
        >
          {resultOptions.map((r) => (
            <option key={r} value={r}>
              {resultLabel(r)}
            </option>
          ))}
        </select>
      </div>

      {/* KPI CARDS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
        <KpiCard label="INVESTIMENTO" value={brl(k.spend)} />
        <KpiCard label="ALCANCE" value={num(k.reach)} sub={`CPM: ${brl(k.cpm)}`} />
        <KpiCard label="RESULTADO" value={num(primaryRes)} sub={`${resultLabel(result || "")} · CPR ${brl(cpr)}`} />
        <KpiCard
          label="CONTA"
          value={balance != null && balance > 0 ? brl(balance) : status}
          sub={balance != null && balance > 0 ? "Saldo restante" : `Status: ${status}`}
          tone={status !== "ACTIVE" ? "alert" : "default"}
        />
      </div>

      {/* GRÁFICO DIÁRIO: investimento (barra) + CPM (linha) */}
      <SectionTitle>Detalhamento de investimento</SectionTitle>
      <ChartCard height={260}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.daily.map((d) => ({ ...d, label: dayLabel(d.date) }))} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#999" }} tickLine={false} axisLine={false} />
            <YAxis yAxisId="l" tick={{ fontSize: 11, fill: "#999" }} tickLine={false} axisLine={false} tickFormatter={(v) => brlShort(v)} width={56} />
            <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: "#999" }} tickLine={false} axisLine={false} tickFormatter={(v) => brlShort(v)} width={48} />
            <Tooltip formatter={(v: any, n: any) => [brl(Number(v)), n === "spend" ? "Investimento" : "CPM"]} />
            <Bar yAxisId="l" dataKey="spend" name="Investimento" fill={TEAL} radius={[4, 4, 0, 0]} maxBarSize={48} />
            <Line yAxisId="r" type="monotone" dataKey="cpm" name="CPM" stroke={ACCENT2} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* TABELA DE CAMPANHAS/CONJUNTOS/ANÚNCIOS */}
      <SectionTitle>Tabela de campanhas</SectionTitle>
      <div style={{ border: "1px solid #eee", borderRadius: 12, background: "#fff", overflow: "hidden", marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 4, padding: 10, borderBottom: "1px solid #f0f0f0" }}>
          {(["campaigns", "adsets", "ads"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                border: "none",
                background: tab === t ? "#111" : "transparent",
                color: tab === t ? "#fff" : "#666",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {t === "campaigns" ? "Campanhas" : t === "adsets" ? "Conjuntos" : "Anúncios"}
            </button>
          ))}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 720 }}>
            <thead>
              <tr style={{ color: "#999", textAlign: "right" }}>
                <Th style={{ textAlign: "left" }}>{tab === "ads" ? "Anúncio" : tab === "adsets" ? "Conjunto" : "Campanha"}</Th>
                <Th>Investimento</Th>
                <Th>Impressões</Th>
                <Th>Cliques</Th>
                <Th>CTR</Th>
                <Th>Resultado</Th>
                <Th>CPR</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 20, textAlign: "center", color: "#aaa" }}>Sem dados no período.</td>
                </tr>
              )}
              {rows.map((r) => {
                const res = result ? r.results[result] || 0 : 0;
                return (
                  <tr key={r.id} style={{ borderTop: "1px solid #f4f4f4" }}>
                    <td style={{ padding: "10px 14px", textAlign: "left" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {tab === "ads" && r.thumbnail && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.thumbnail} alt="" width={34} height={34} style={{ borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                        )}
                        <span style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.name}>
                          {r.name}
                        </span>
                      </div>
                    </td>
                    <Td>{brl(r.spend)}</Td>
                    <Td>{num(r.impressions)}</Td>
                    <Td>{num(r.clicks)}</Td>
                    <Td>{pct(r.ctr)}</Td>
                    <Td accent>{num(res)}</Td>
                    <Td>{res ? brl(r.spend / res) : "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* DETALHAMENTO DOS OBJETIVOS */}
      <SectionTitle>Detalhamento dos objetivos</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
        <ChartCard height={220} title="Investimento por objetivo">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byObjective} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <XAxis type="number" tickFormatter={(v) => brlShort(v)} tick={{ fontSize: 11, fill: "#999" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="objective" width={130} tick={{ fontSize: 11, fill: "#666" }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: any) => brl(Number(v))} />
              <Bar dataKey="spend" fill={TEAL} radius={[0, 4, 4, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard height={220} title="Resultados por dia">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data.daily.map((d) => ({ label: dayLabel(d.date), res: result ? d.results[result] || 0 : 0, cpm: d.cpm }))} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#999" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#999" }} tickLine={false} axisLine={false} width={36} />
              <Tooltip />
              <Bar dataKey="res" name="Resultados" fill="#bfe6e0" radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Line type="monotone" dataKey="cpm" name="CPM" stroke={TEAL} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* DADOS DEMOGRÁFICOS */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 12px" }}>
        <SectionTitle noMargin>Dados demográficos</SectionTitle>
        <span style={{ flex: 1 }} />
        <label style={{ fontSize: 12, color: "#888" }}>Visualizar por:</label>
        <select value={demoMetric} onChange={(e) => setDemoMetric(e.target.value as MetricKey)} style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13 }}>
          {(Object.keys(METRIC_LABELS) as MetricKey[]).map((m) => (
            <option key={m} value={m}>{METRIC_LABELS[m]}</option>
          ))}
        </select>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <DemoCard title="PLATAFORMA" rows={data.breakdowns.platform} metric={demoMetric} metricOf={metricOf} fmt={fmtMetric} />
        <DemoCard title="POSIÇÃO (TOP 10)" rows={data.breakdowns.position.slice(0, 10)} metric={demoMetric} metricOf={metricOf} fmt={fmtMetric} />
        <DemoCard title="REGIÃO (TOP 10)" rows={data.breakdowns.region.slice(0, 10)} metric={demoMetric} metricOf={metricOf} fmt={fmtMetric} />
        <DemoCard title="IDADE E GÊNERO" rows={data.breakdowns.age_gender.slice(0, 12)} metric={demoMetric} metricOf={metricOf} fmt={fmtMetric} />
      </div>
    </div>
  );
}

// ---------- subcomponentes ----------

function KpiCard({ label, value, sub, tone = "default" }: { label: string; value: string; sub?: string; tone?: "default" | "alert" }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: "#999", letterSpacing: 0.4, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: tone === "alert" ? "#a32d2d" : "#111" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ children, noMargin }: { children: React.ReactNode; noMargin?: boolean }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, color: "#888", letterSpacing: 0.6, textTransform: "uppercase", margin: noMargin ? 0 : "8px 0 12px" }}>
      {children}
    </div>
  );
}

function ChartCard({ children, height, title }: { children: React.ReactNode; height: number; title?: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 12, padding: 12, marginBottom: 24 }}>
      {title && <div style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>{title}</div>}
      <div style={{ height }}>{children}</div>
    </div>
  );
}

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <th style={{ padding: "10px 14px", fontWeight: 500, textAlign: "right", ...style }}>{children}</th>;
}
function Td({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return <td style={{ padding: "10px 14px", textAlign: "right", color: accent ? ACCENT : "#333", fontWeight: accent ? 600 : 400 }}>{children}</td>;
}

function DemoCard({
  title,
  rows,
  metric,
  metricOf,
  fmt,
}: {
  title: string;
  rows: Breakdown[];
  metric: MetricKey;
  metricOf: (o: any, m: MetricKey) => number;
  fmt: (v: number, m: MetricKey) => string;
}) {
  const data = rows.map((r) => ({ key: r.key, v: metricOf(r, metric) })).filter((r) => r.v > 0);
  const max = Math.max(1, ...data.map((d) => d.v));
  return (
    <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#999", letterSpacing: 0.4, marginBottom: 12 }}>{title}</div>
      {data.length === 0 ? (
        <div style={{ fontSize: 13, color: "#bbb" }}>Sem dados para o período.</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {data.map((d) => (
            <div key={d.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, color: "#555", width: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.key}>{d.key}</span>
              <div style={{ flex: 1, height: 8, background: "#f2f2f2", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${Math.round((d.v / max) * 100)}%`, height: "100%", background: TEAL, borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 12, color: "#333", width: 88, textAlign: "right", fontWeight: 500 }}>{fmt(d.v, metric)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
