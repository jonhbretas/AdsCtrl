"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";

type AccountOption = { account_id: string; name: string; platform: string; hidden?: boolean; status: string };
type Diagnostic = { code: string; tone: "positive" | "warning" | "critical" | "neutral"; title: string; detail: string; evidence: string[] };
type Creative = {
  adId: string; adName: string; campaignName: string | null; adsetName: string | null; mediaType: string;
  asset: { thumbnail: string | null };
  sampleStatus: "no_delivery" | "insufficient" | "learning" | "reliable";
  sample: { label: string; reason: string };
  primaryDiagnosis: Diagnostic | null;
  diagnostics: Diagnostic[];
  metrics: {
    spend: number; impressions: number; frequency: number | null; cpm: number | null;
    outboundCtr: number | null; landingPageViewRate: number | null; conversionRate: number | null;
    costPerConversion: number | null; roas: number | null; engagementRate: number | null;
    conversions: number; conversionValue: number;
    video: {
      isVideo: boolean; hookRate: number | null; holdRate: number | null;
      retention25: number | null; retention50: number | null; retention75: number | null;
      completionRate: number | null; avgWatchTimeSeconds: number | null;
    };
  };
};
type LabAccount = {
  account_id: string; account_name: string; currency: string;
  summary: any; creatives: Creative[];
};

const daysAgo = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10);
};
const money = (v: number | null | undefined, currency = "BRL") =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency, maximumFractionDigits: 2 }).format(v);
const pct = (v: number | null | undefined, digits = 1) => v == null ? "—" : `${v.toFixed(digits)}%`;
const number = (v: number | null | undefined) => v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export default function CreativesPage() {
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [accountId, setAccountId] = useState("");
  const [since, setSince] = useState(daysAgo(29));
  const [until, setUntil] = useState(daysAgo(0));
  const [lab, setLab] = useState<LabAccount | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<"all" | "video" | "static">("all");
  const [sort, setSort] = useState<"spend" | "hook" | "ctr" | "cpa" | "roas">("spend");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/accounts").then((r) => r.json()).then((data) => {
      const meta = (data.accounts || []).filter((a: AccountOption) => a.platform === "meta" && !a.hidden && a.status === "ACTIVE");
      setAccounts(meta);
      if (meta[0]) setAccountId(meta[0].account_id);
    }).catch(() => setError("Não foi possível carregar as contas Meta."));
  }, []);

  async function analyze() {
    if (!accountId) return;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ account_id: accountId, since, until });
      const res = await fetch(`/api/creatives/meta?${params}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.errors?.[0]?.error || "Falha ao analisar criativos.");
      if (data.errors?.length && !data.accounts?.length) throw new Error(data.errors[0].error);
      setLab(data.accounts?.[0] || null);
    } catch (e: any) {
      setError(e?.message || "Falha ao analisar criativos.");
      setLab(null);
    } finally { setLoading(false); }
  }
  useEffect(() => { if (accountId) analyze(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [accountId]);

  const creatives = useMemo(() => {
    let rows = [...(lab?.creatives || [])];
    if (format === "video") rows = rows.filter((c) => c.metrics.video.isVideo);
    if (format === "static") rows = rows.filter((c) => !c.metrics.video.isVideo);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((c) => `${c.adName} ${c.campaignName || ""} ${c.adsetName || ""}`.toLowerCase().includes(q));
    }
    const value = (c: Creative) => sort === "spend" ? c.metrics.spend
      : sort === "hook" ? c.metrics.video.hookRate ?? -1
      : sort === "ctr" ? c.metrics.outboundCtr ?? -1
      : sort === "cpa" ? -(c.metrics.costPerConversion ?? Number.MAX_SAFE_INTEGER)
      : c.metrics.roas ?? -1;
    return rows.sort((a, b) => value(b) - value(a));
  }, [lab, format, search, sort]);

  const scatter = useMemo(() => creatives.filter((c) =>
    c.sampleStatus !== "insufficient" && c.metrics.video.hookRate != null && c.metrics.outboundCtr != null
  ).map((c) => ({
    name: c.adName, hook: c.metrics.video.hookRate, ctr: c.metrics.outboundCtr,
    spend: Math.max(c.metrics.spend, 10), diagnosis: c.primaryDiagnosis?.title || "",
  })), [creatives]);

  return (
    <div style={{ maxWidth: 1500, margin: "0 auto", padding: "26px 22px 60px", fontFamily: "system-ui, -apple-system, sans-serif", color: "#171716" }}>
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#777", letterSpacing: 0.7, textTransform: "uppercase" }}>Laboratório Meta</div>
          <h1 style={{ margin: "4px 0 0", fontSize: 29, letterSpacing: -0.8 }}>Diagnóstico de criativos</h1>
          <p style={{ margin: "5px 0 0", color: "#777", fontSize: 13 }}>Da atenção à conversão, com amostra e contexto.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Field label="Conta Meta">
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ ...inputStyle, minWidth: 230 }}>
              {accounts.map((a) => <option key={a.account_id} value={a.account_id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="De"><input type="date" value={since} max={until} onChange={(e) => setSince(e.target.value)} style={inputStyle} /></Field>
          <Field label="Até"><input type="date" value={until} min={since} max={daysAgo(0)} onChange={(e) => setUntil(e.target.value)} style={inputStyle} /></Field>
          <button onClick={analyze} disabled={loading || !accountId} style={{ ...inputStyle, background: "#111", color: "#fff", borderColor: "#111", fontWeight: 700, cursor: "pointer" }}>{loading ? "Analisando…" : "Analisar"}</button>
        </div>
      </header>

      {error && <div style={{ padding: "12px 14px", border: "1px solid #f0ceca", borderRadius: 10, color: "#a33b35", background: "#fff8f7", marginBottom: 16, fontSize: 13 }}>{error}</div>}
      {loading && !lab && <div style={{ padding: 50, textAlign: "center", color: "#888" }}>Consultando anúncios, vídeos e thumbnails na Meta…</div>}
      {lab && (
        <>
          <Summary account={lab} />
          <div style={{ display: "grid", gridTemplateColumns: "1.15fr .85fr", gap: 14, marginBottom: 16 }}>
            <VideoFunnel account={lab} />
            <div style={panelStyle}>
              <PanelTitle title="Quadrante criativo" subtitle="Hook × outbound CTR · bolha = investimento" />
              <div style={{ height: 280 }}>
                {scatter.length < 2 ? <Empty text="Poucos vídeos com amostra para o quadrante." /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 16, bottom: 12, left: 2 }}>
                      <CartesianGrid stroke="#eee" strokeDasharray="3 3" />
                      <XAxis type="number" dataKey="hook" name="Hook" unit="%" tick={{ fontSize: 10 }} />
                      <YAxis type="number" dataKey="ctr" name="Outbound CTR" unit="%" tick={{ fontSize: 10 }} width={48} />
                      <ZAxis type="number" dataKey="spend" range={[55, 450]} />
                      <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(v: any, name: any) => name === "spend" ? money(Number(v), lab.currency) : `${Number(v).toFixed(2)}%`} />
                      <Scatter data={scatter} fill="#397ee8" fillOpacity={0.72} />
                    </ScatterChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          <section style={{ ...panelStyle, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "14px 15px", display: "flex", alignItems: "end", gap: 9, borderBottom: "1px solid #ececea", flexWrap: "wrap" }}>
              <div style={{ marginRight: 8 }}><PanelTitle title="Heatmap de criativos" subtitle={`${creatives.length} anúncios no recorte`} /></div>
              <div style={{ display: "flex", gap: 3, background: "#f2f2f0", padding: 3, borderRadius: 9 }}>
                {(["all", "video", "static"] as const).map((key) => <Toggle key={key} active={format === key} onClick={() => setFormat(key)}>{key === "all" ? "Todos" : key === "video" ? "Vídeos" : "Estáticos"}</Toggle>)}
              </div>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar criativo…" style={{ ...inputStyle, minWidth: 180 }} />
              <span style={{ flex: 1 }} />
              <Field label="Ordenar">
                <select value={sort} onChange={(e) => setSort(e.target.value as any)} style={inputStyle}>
                  <option value="spend">Investimento</option><option value="hook">Hook</option><option value="ctr">Outbound CTR</option><option value="cpa">Menor CPA</option><option value="roas">ROAS</option>
                </select>
              </Field>
            </div>
            <CreativeTable creatives={creatives} account={lab} />
          </section>
        </>
      )}
    </div>
  );
}

function Summary({ account }: { account: LabAccount }) {
  const s = account.summary;
  return (
    <section style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 9, marginBottom: 14 }}>
      <Metric label="Investimento" value={money(s.spend, account.currency)} />
      <Metric label="Criativos ativos" value={`${s.creativesWithDelivery}/${s.creatives}`} />
      <Metric label="CPM" value={money(s.cpm, account.currency)} />
      <Metric label="Hook rate" value={pct(s.video?.hookRate)} accent />
      <Metric label="Hold rate" value={pct(s.video?.holdRate)} accent />
      <Metric label="Outbound CTR" value={pct(s.outboundCtr, 2)} />
      <Metric label="CPA / ROAS" value={`${money(s.costPerConversion, account.currency)} · ${s.roas == null ? "—" : `${s.roas.toFixed(2)}x`}`} />
    </section>
  );
}

function VideoFunnel({ account }: { account: LabAccount }) {
  const v = account.summary.video;
  const stages = [
    ["Impressões", account.summary.impressions],
    ["3 segundos", v.threeSecondViews],
    ["25%", v.watched25],
    ["50%", v.watched50],
    ["75%", v.watched75],
    ["100%", v.watched100],
  ] as [string, number][];
  const max = Math.max(stages[0][1], 1);
  return (
    <div style={panelStyle}>
      <PanelTitle title="Funil de retenção" subtitle="A queda entre estágios mostra onde o vídeo perde atenção" />
      <div style={{ display: "grid", gap: 8, marginTop: 15 }}>
        {stages.map(([label, value], index) => (
          <div key={label} style={{ display: "grid", gridTemplateColumns: "86px 1fr 80px", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#777" }}>{label}</span>
            <div style={{ height: 20, background: "#f0f1f3", borderRadius: 6, overflow: "hidden" }}>
              <div style={{ width: `${Math.max(value ? (value / max) * 100 : 0, value ? 2 : 0)}%`, height: "100%", background: index < 2 ? "#397ee8" : `hsl(${210 - index * 12} 68% ${53 + index * 3}%)`, borderRadius: 6 }} />
            </div>
            <span style={{ textAlign: "right", fontSize: 11, fontWeight: 650 }}>{number(value)} {index > 1 && v.threeSecondViews ? <small style={{ color: "#999" }}>{pct((value / v.threeSecondViews) * 100, 0)}</small> : null}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CreativeTable({ creatives, account }: { creatives: Creative[]; account: LabAccount }) {
  const b = account.summary.benchmarks || {};
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1280 }}>
        <thead><tr style={{ color: "#888", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.25 }}>
          <Th align="left">Criativo</Th><Th>Spend</Th><Th>Impr.</Th><Th>Freq.</Th><Th>CPM</Th>
          <Th>Hook</Th><Th>Hold</Th><Th>Outbound CTR</Th><Th>LPV rate</Th><Th>CVR</Th><Th>CPA</Th><Th>ROAS</Th><Th align="left">Leitura</Th>
        </tr></thead>
        <tbody>{creatives.map((c) => {
          const m = c.metrics, video = m.video;
          return (
            <tr key={c.adId} style={{ borderTop: "1px solid #efefed", opacity: c.sampleStatus === "no_delivery" ? 0.58 : 1 }}>
              <td style={{ padding: "9px 12px", minWidth: 265 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {c.asset.thumbnail ? <img src={c.asset.thumbnail} alt="" width={52} height={52} style={{ width: 52, height: 52, borderRadius: 8, objectFit: "cover", background: "#eee" }} /> : <div style={{ width: 52, height: 52, borderRadius: 8, background: "#eee", display: "grid", placeItems: "center", color: "#aaa", fontSize: 18 }}>◫</div>}
                  <div style={{ minWidth: 0 }}><div title={c.adName} style={{ maxWidth: 250, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 12.5, fontWeight: 650 }}>{c.adName}</div><div style={{ fontSize: 10, color: "#999", marginTop: 3 }}>{c.campaignName || "—"} · {c.sample.label}</div></div>
                </div>
              </td>
              <Td>{money(m.spend, account.currency)}</Td><Td>{number(m.impressions)}</Td><Td>{number(m.frequency)}</Td><Td>{money(m.cpm, account.currency)}</Td>
              <Heat value={video.hookRate} benchmark={b.hookRate} sample={c.sampleStatus}>{video.isVideo ? pct(video.hookRate) : "—"}</Heat>
              <Heat value={video.holdRate} benchmark={b.holdRate} sample={c.sampleStatus}>{video.isVideo ? pct(video.holdRate) : "—"}</Heat>
              <Heat value={m.outboundCtr} benchmark={b.outboundCtr} sample={c.sampleStatus}>{pct(m.outboundCtr, 2)}</Heat>
              <Heat value={m.landingPageViewRate} benchmark={b.landingPageViewRate} sample={c.sampleStatus}>{pct(m.landingPageViewRate)}</Heat>
              <Heat value={m.conversionRate} benchmark={b.conversionRate} sample={c.sampleStatus}>{pct(m.conversionRate)}</Heat>
              <Heat value={m.costPerConversion} benchmark={b.costPerConversion} sample={c.sampleStatus} invert>{money(m.costPerConversion, account.currency)}</Heat>
              <Heat value={m.roas} benchmark={b.roas} sample={c.sampleStatus}>{m.roas == null ? "—" : `${m.roas.toFixed(2)}x`}</Heat>
              <td style={{ padding: "9px 12px", minWidth: 205 }}><Diagnosis diagnosis={c.primaryDiagnosis} sample={c.sample} /></td>
            </tr>
          );
        })}</tbody>
      </table>
      {!creatives.length && <Empty text="Nenhum criativo encontrado com esses filtros." />}
    </div>
  );
}

function Heat({ value, benchmark, sample, invert, children }: { value: number | null; benchmark: number | null; sample: string; invert?: boolean; children: React.ReactNode }) {
  let background = "transparent", color = "#444";
  if (sample === "insufficient" || value == null || benchmark == null) { color = "#999"; background = "#fafafa"; }
  else {
    const ratio = benchmark ? value / benchmark : 1;
    const good = invert ? ratio <= 0.85 : ratio >= 1.15;
    const bad = invert ? ratio >= 1.2 : ratio <= 0.8;
    if (good) { background = "#eaf7ee"; color = "#247a43"; }
    else if (bad) { background = "#fff0ee"; color = "#b3443d"; }
    else { background = "#fff8e9"; color = "#946516"; }
  }
  return <td style={{ padding: "9px 8px", textAlign: "right", fontSize: 11.5, fontWeight: 650, background, color }}>{children}</td>;
}
function Diagnosis({ diagnosis, sample }: { diagnosis: Diagnostic | null; sample: { label: string; reason: string } }) {
  if (!diagnosis) return <span title={sample.reason} style={{ fontSize: 11, color: "#999" }}>{sample.label}</span>;
  const color = diagnosis.tone === "positive" ? "#267a45" : diagnosis.tone === "critical" ? "#b3443d" : diagnosis.tone === "warning" ? "#946516" : "#777";
  return <div title={diagnosis.detail}><div style={{ fontSize: 11.5, fontWeight: 700, color }}>{diagnosis.title}</div><div style={{ fontSize: 10.5, color: "#888", marginTop: 2, lineHeight: 1.3 }}>{diagnosis.detail}</div></div>;
}
function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) { return <div style={{ ...panelStyle, padding: "13px 14px" }}><div style={{ fontSize: 9.5, color: "#888", textTransform: "uppercase", fontWeight: 750, letterSpacing: 0.3 }}>{label}</div><div style={{ fontSize: 18, fontWeight: 750, marginTop: 6, color: accent ? "#286fc9" : "#191918", whiteSpace: "nowrap" }}>{value}</div></div>; }
function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) { return <div><div style={{ fontSize: 13, fontWeight: 720 }}>{title}</div><div style={{ fontSize: 10.5, color: "#999", marginTop: 2 }}>{subtitle}</div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 9.5, fontWeight: 750, color: "#888", textTransform: "uppercase" }}>{label}</span>{children}</label>; }
function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button onClick={onClick} style={{ border: 0, borderRadius: 7, padding: "6px 10px", background: active ? "#fff" : "transparent", color: active ? "#111" : "#777", boxShadow: active ? "0 1px 2px #0001" : "none", fontSize: 11, fontWeight: 650, cursor: "pointer" }}>{children}</button>; }
function Th({ children, align = "right" }: { children: React.ReactNode; align?: "left" | "right" }) { return <th style={{ padding: "10px 8px", textAlign: align, fontWeight: 700, background: "#fafaf9", borderTop: "1px solid #eee" }}>{children}</th>; }
function Td({ children }: { children: React.ReactNode }) { return <td style={{ padding: "9px 8px", textAlign: "right", fontSize: 11.5, color: "#444", whiteSpace: "nowrap" }}>{children}</td>; }
function Empty({ text }: { text: string }) { return <div style={{ height: "100%", minHeight: 100, display: "grid", placeItems: "center", color: "#aaa", fontSize: 12 }}>{text}</div>; }
const inputStyle: React.CSSProperties = { height: 34, boxSizing: "border-box", border: "1px solid #dededb", borderRadius: 8, background: "#fff", padding: "0 9px", color: "#333", fontSize: 11.5 };
const panelStyle: React.CSSProperties = { border: "1px solid #e8e8e5", borderRadius: 13, background: "#fff", padding: 15 };
