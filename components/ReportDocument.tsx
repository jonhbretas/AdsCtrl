"use client";

import { createContext, useContext } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis, Area, AreaChart, Pie, PieChart, Cell, Legend } from "recharts";
import BrandMark from "@/components/BrandMark";
import { money, moneyShort, num, pct, dayLabel, resultLabel, pickVal, delta, PURCHASE_KEYS, ATC_KEYS, CHECKOUT_KEYS, LINKCLICK_KEYS, RESULT_FAMILY_BY_SLUG } from "@/lib/format";

const PAGE_W = 700;
const HALF = (PAGE_W - 14) / 2;

const C = {
  ink: "#0f172a",
  muted: "#64748b",
  faint: "#94a3b8",
  line: "#e2e8f0",
  blue: "#06b6d4",
  teal: "#10b981",
  amber: "#f59e0b",
  green: "#22c55e",
  red: "#ef4444",
  meta: "#1877f2",
  google: "#4285f4",
  bg: "#ffffff",
  card: "#ffffff",
  accent: "#f8fafc",
};

interface LayoutInfo { w: number; compact: boolean; }
const LayoutCtx = createContext<LayoutInfo>({ w: PAGE_W, compact: false });
const useLayout = () => useContext(LayoutCtx);

interface Vals { results: Record<string, number>; values: Record<string, number>; }
interface Kpis extends Vals { spend: number; reach: number; impressions: number; clicks: number; ctr: number; cpm: number; }
interface Row extends Vals { id: string; name: string; spend: number; impressions: number; clicks: number; ctr: number; cpm: number; reach: number; frequency: number; thumbnail?: string; }
interface Daily extends Vals { date: string; spend: number; impressions: number; clicks: number; ctr: number; cpm: number; reach: number; }
interface Breakdown extends Vals { key: string; spend: number; impressions: number; clicks: number; ctr: number; cpm: number; reach: number; }
interface MetaDetail { name?: string; currency?: string; kpis: Kpis; prevKpis: Kpis; daily: Daily[]; campaigns: Row[]; adsets: Row[]; ads: Row[]; breakdowns: { age_gender: Breakdown[]; region: Breakdown[]; platform: Breakdown[]; position: Breakdown[]; device: Breakdown[]; hour: Breakdown[]; age?: Breakdown[]; gender?: Breakdown[]; }; error?: string | null; }
interface GoogleReportRow { key: string; cost: number; impressions: number; clicks: number; ctr: number; cpc: number; conversions: number; conversionValue: number; costPerConversion: number; topImpressionShare?: number | null; }
interface GoogleBlock { account_id: string; name: string; currency: string; detail: any; extras: { campaigns: GoogleReportRow[]; adGroups: GoogleReportRow[]; keywords: GoogleReportRow[]; devices: GoogleReportRow[]; ages: GoogleReportRow[]; genders: GoogleReportRow[]; cities: GoogleReportRow[]; notes: string[]; } | null; }
export interface ReportPayload { generated_at: string; account: { account_id: string; name: string; platform: string; currency: string; status: string; }; range: { since: string; until: string; }; prevRange: { since: string; until: string; }; meta: MetaDetail | null; google: GoogleBlock[]; organic_note?: string; result_family?: string | null; brand?: string | null; error?: string; }

const br = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
const ratio = (a: number, b: number) => (b ? (a / b) * 100 : 0);
const mult = (v: number) => `${v.toFixed(2).replace(".", ",")}x`;
const ageLabel = (k: string) => k.replace("_", "–").replace("65", "65+");
const regionLabel = (k: string) => k.split(",")[0];
const platformLabel = (k: string) => k === "facebook" ? "Facebook" : k === "instagram" ? "Instagram" : k === "messenger" ? "Messenger" : k === "audience_network" ? "Audience" : k;
const deviceLabel = (k: string) => ({ ipad: "iPad", iphone: "iPhone", android_smartphone: "Android", android_tablet: "Android Tablet", desktop: "Desktop", feature_phone: "Básico" }[k] || k);
const genderLabel = (k: string) => k === "male" ? "Masculino" : k === "female" ? "Feminino" : "Desconhecido";
const MESSAGE_KEYS = RESULT_FAMILY_BY_SLUG.mensagens.keys;
const LEAD_KEYS = RESULT_FAMILY_BY_SLUG.leads.keys;
const REGISTER_KEYS = RESULT_FAMILY_BY_SLUG.cadastros.keys;

const FOCUS_SHORT: Record<string, string> = { vendas: "Compras", mensagens: "Conversas", leads: "Leads", cadastros: "Cadastros", cliques: "Cliques", lpv: "Views de LP", engajamento: "Engajamento" };
const FOCUS_COST: Record<string, string> = { vendas: "Custo por compra", mensagens: "Custo por conversa", leads: "Custo por lead", cadastros: "Custo por cadastro", cliques: "Custo por clique", lpv: "Custo por view", engajamento: "Custo por engajamento" };
interface Focus { slug: string; label: string; short: string; costLabel: string; keys: string[]; }

function resolveFocus(slug?: string | null): Focus | null {
  const family = slug ? RESULT_FAMILY_BY_SLUG[slug] : null;
  if (!family || family.keys.length === 0) return null;
  return { slug: family.slug, label: family.label, short: FOCUS_SHORT[family.slug] || family.label, costLabel: FOCUS_COST[family.slug] || "Custo por resultado", keys: family.keys };
}

function primaryRowResult(row: Row, focus: Focus | null): { label: string; value: number } | null {
  if (focus) { const v = pickVal(row.results, focus.keys); if (v > 0) return { label: focus.short, value: v }; }
  const tiers: [string[], string][] = [[PURCHASE_KEYS, "Compras"], [LEAD_KEYS, "Leads"], [REGISTER_KEYS, "Cadastros"], [MESSAGE_KEYS, "Conversas"]];
  for (const [keys, label] of tiers) { const v = pickVal(row.results, keys); if (v >= 3) return { label, value: v }; }
  if (row.clicks >= 50) return { label: "Cliques", value: row.clicks };
  if (row.impressions >= 100) return { label: "Impressões", value: row.impressions };
  return null;
}

export default function ReportDocument({ data, compact = false, width }: { data: ReportPayload; compact?: boolean; width?: number; }) {
  const w = compact ? Math.max(280, width ?? 340) : PAGE_W;
  const { meta, google, range, prevRange, account } = data;
  const brand = (data.brand || "").trim() || "Assertivus";
  const cur = account.currency || "BRL";
  const m = (v: number, digits = 2) => money(v, cur, digits);
  const metaOk = meta && !meta.error;
  const k = metaOk ? meta!.kpis : null;
  const p = metaOk ? meta!.prevKpis : null;

  const googleTotals = google.reduce((acc, g) => { const gk = g.detail?.kpis; if (!gk) return acc; acc.spend += gk.spend || 0; acc.impressions += gk.impressions || 0; acc.clicks += gk.clicks || 0; acc.conversions += gk.results?.conversions || 0; return acc; }, { spend: 0, impressions: 0, clicks: 0, conversions: 0 });
  const totalSpend = (k?.spend || 0) + googleTotals.spend;
  const totalImpressions = (k?.impressions || 0) + googleTotals.impressions;
  const totalClicks = (k?.clicks || 0) + googleTotals.clicks;

  return (
    <LayoutCtx.Provider value={{ w, compact }}>
      <div style={{ width: w, margin: "0 auto", color: C.ink, fontFamily: "Inter, system-ui, -apple-system, sans-serif" }}>
        <PrintStyles />

        {/* Cover */}
        <section style={{ paddingBottom: 16, marginBottom: 20, borderBottom: `2px solid ${C.ink}` }}>
          <div className="flex items-center gap-2 mb-3">
            <BrandMark size={26} />
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: -0.2, color: C.ink }}>{brand}</span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.4, textTransform: "uppercase", color: C.muted }}>Relatório de mídia paga</div>
          <h1 style={{ margin: "6px 0 2px", fontSize: compact ? 22 : 30, fontWeight: 800, letterSpacing: -0.6, lineHeight: 1.15, color: C.ink }}>{account.name}</h1>
          <div style={{ fontSize: compact ? 13 : 15, color: C.muted, fontWeight: 500 }}>Análise de desempenho</div>
          <p style={{ margin: "10px 0 0", fontSize: 12.5, color: C.muted, lineHeight: 1.55, maxWidth: 560 }}>
            Relatório de <strong style={{ color: C.ink }}>{br(range.since)}</strong> a <strong style={{ color: C.ink }}>{br(range.until)}</strong>, comparado com {br(prevRange.since)} a {br(prevRange.until)}.
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {metaOk && <SourceChip color={C.meta} platform="Meta Ads" name={meta!.name || account.name} />}
            {google.map((g) => <SourceChip key={g.account_id} color={C.google} platform="Google Ads" name={g.name} />)}
          </div>
        </section>

        {/* Consolidated Summary */}
        {(metaOk || google.length > 0) && (
          <Block>
            <SectionTitle kicker="Visão geral">Resumo consolidado</SectionTitle>
            <Grid cols={4}>
              <Kpi label="Investimento total" value={m(totalSpend)} />
              <Kpi label="Impressões" value={num(totalImpressions)} />
              <Kpi label="Cliques" value={num(totalClicks)} />
              <Kpi label="CTR médio" value={pct(ratio(totalClicks, totalImpressions))} />
            </Grid>
            {totalSpend > 0 && (
              <Card title="Divisão do investimento">
                <SplitBar parts={[...(metaOk ? [{ label: "Meta Ads", value: k!.spend, color: C.meta }] : []), ...google.map((g) => ({ label: `Google · ${g.name}`, value: g.detail?.kpis?.spend || 0, color: C.google }))]} total={totalSpend} format={(v) => m(v)} />
              </Card>
            )}
            {metaOk && <InsightBox title="Resumo em linguagem simples" lines={generateInsights(meta!.kpis, meta!.prevKpis, cur, "Meta Ads", resolveFocus(data.result_family))} />}
          </Block>
        )}

        {meta?.error && <Block><SectionTitle kicker="Meta Ads" color={C.meta}>{account.name}</SectionTitle><Warn>{meta.error}</Warn></Block>}
        {metaOk && <MetaSection detail={meta!} currency={cur} accountName={account.name} focus={resolveFocus(data.result_family)} />}
        {google.map((g) => <GoogleSection key={g.account_id} block={g} />)}

        {/* Footer */}
        <footer style={{ marginTop: 24, paddingTop: 12, borderTop: `1px solid ${C.line}`, fontSize: 10, color: C.muted, lineHeight: 1.6 }}>
          <div>Fontes: {metaOk ? "Meta Marketing API" : ""}{metaOk && google.length ? " · " : ""}{google.length ? "Google Ads API" : ""}. Dados ao vivo em {new Date(data.generated_at).toLocaleString("pt-BR")}.</div>
          {data.organic_note && <div style={{ marginTop: 2 }}>{data.organic_note}</div>}
          <div style={{ marginTop: 2 }}>Gerado por {brand}.</div>
        </footer>
      </div>
    </LayoutCtx.Provider>
  );
}

// Sub-components
function Block({ children }: { children: React.ReactNode }) { return <section style={{ marginBottom: 20 }}>{children}</section>; }

function SectionTitle({ children, kicker, color }: { children: React.ReactNode; kicker?: string; color?: string }) {
  return <div style={{ marginBottom: 12 }}>{kicker && <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 2, color: color || C.muted }}>{kicker}</div>}<h2 style={{ fontSize: 18, fontWeight: 700, color: C.ink, margin: 0 }}>{children}</h2></div>;
}

function Grid({ cols, children }: { cols: 2 | 4; children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: cols === 4 ? "1fr 1fr 1fr 1fr" : "1fr 1fr", gap: 8, marginBottom: 8 }}>{children}</div>;
}

function Kpi({ label, value, cur, prev, prevText, invert }: { label: string; value: string; cur?: number; prev?: number; prevText?: string; invert?: boolean; }) {
  const d = cur != null && prev != null ? delta(cur, prev) : null;
  return (
    <div style={{ background: C.accent, border: `1px solid ${C.line}`, borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 11, color: C.muted, fontWeight: 500, lineHeight: 1.3 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.3, marginTop: 2, color: C.ink }}>{value}</div>
      {d && d.hasPrev && <div style={{ marginTop: 2, fontSize: 10, fontWeight: 600, color: d.pct >= 0 ? (invert ? C.red : C.green) : (invert ? C.green : C.red) }}>{d.pct >= 0 ? "▲" : "▼"} {Math.abs(d.pct).toFixed(1)}%<span style={{ color: C.muted, fontWeight: 400 }}> vs anterior</span></div>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, marginTop: 8 }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>{title}</div>
    {children}
  </div>;
}

function Warn({ children }: { children: React.ReactNode }) {
  return <div style={{ background: "#fef3c7", border: `1px solid #fcd34d`, borderRadius: 8, padding: "8px 12px", fontSize: 12.5, color: "#92400e" }}>{children}</div>;
}

function SourceChip({ color, platform, name }: { color: string; platform: string; name: string }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, border: `1px solid ${color}40`, background: `${color}10`, color }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />{platform} · {name}</span>;
}

function SplitBar({ parts, total, format }: { parts: { label: string; value: number; color: string }[]; total: number; format: (v: number) => string }) {
  return <div>
    <div style={{ display: "flex", height: 20, borderRadius: 6, overflow: "hidden" }}>{parts.map((p, i) => <div key={i} style={{ width: `${(p.value / total) * 100}%`, background: p.color, minWidth: p.value > 0 ? 4 : 0 }} title={`${p.label}: ${format(p.value)}`} />)}</div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", marginTop: 6 }}>{parts.map((p, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: p.color }} /><span style={{ color: C.muted }}>{p.label}</span><strong style={{ color: C.ink }}>{format(p.value)}</strong></div>)}</div>
  </div>;
}

function MetaSection({ detail, currency, accountName, focus }: { detail: MetaDetail; currency: string; accountName: string; focus: Focus | null; }) {
  const k = detail.kpis; const p = detail.prevKpis; const m = (v: number, d = 2) => money(v, currency, d); const b = detail.breakdowns;
  const { w: pageW, compact } = useLayout();
  const fullChart = pageW - 34; const halfChart = compact ? pageW - 34 : HALF - 34;
  const linkClicks = pickVal(k.results, LINKCLICK_KEYS); const prevLinkClicks = pickVal(p.results, LINKCLICK_KEYS);
  const linkCtr = ratio(linkClicks, k.impressions); const prevLinkCtr = ratio(prevLinkClicks, p.impressions);
  const cpc = k.clicks ? k.spend / k.clicks : 0; const prevCpc = p.clicks ? p.spend / p.clicks : 0;
  const freq = k.reach ? k.impressions / k.reach : 0; const prevFreq = p.reach ? p.impressions / p.reach : 0;
  const purchases = pickVal(k.results, PURCHASE_KEYS); const prevPurchases = pickVal(p.results, PURCHASE_KEYS);
  const purchaseValue = pickVal(k.values, PURCHASE_KEYS); const prevPurchaseValue = pickVal(p.values, PURCHASE_KEYS);
  const leads = pickVal(k.results, LEAD_KEYS) + pickVal(k.results, REGISTER_KEYS); const prevLeads = pickVal(p.results, LEAD_KEYS) + pickVal(p.results, REGISTER_KEYS);
  const messages = pickVal(k.results, MESSAGE_KEYS); const prevMessages = pickVal(p.results, MESSAGE_KEYS);
  const focusValue = focus ? pickVal(k.results, focus.keys) : 0; const prevFocusValue = focus ? pickVal(p.results, focus.keys) : 0; const showFocus = Boolean(focus) && focusValue > 0;
  const daily = detail.daily.map((d) => ({ label: dayLabel(d.date), spend: d.spend, clicks: d.clicks, ctr: d.ctr, impressions: d.impressions }));
  const actions = Object.entries(k.results).filter(([t, v]) => v > 0 && !(t.startsWith("omni_") && k.results[t.slice(5)] != null)).sort((a, c) => c[1] - a[1]).slice(0, 12);
  const platform = b.platform.filter((r) => r.impressions > 0);
  const funnel = [{ label: "Impressões", v: k.impressions }, { label: "Alcance", v: k.reach }, { label: "Cliques", v: k.clicks }, { label: "Cliques no link", v: linkClicks }, ...(messages > 0 ? [{ label: "Conversas", v: messages }] : []), ...(leads > 0 ? [{ label: "Leads", v: leads }] : []), ...(purchases > 0 ? [{ label: "Compras", v: purchases }] : [])].filter((s) => s.v > 0);

  return (<>
    <Block>
      <SectionTitle kicker="Meta Ads · Facebook e Instagram" color={C.meta}>{detail.name || accountName}</SectionTitle>
      <Grid cols={4}>
        {showFocus && focus && (<><Kpi label={focus.label} value={num(focusValue)} cur={focusValue} prev={prevFocusValue} prevText={num(prevFocusValue)} /><Kpi label={focus.costLabel} value={m(k.spend / focusValue)} cur={k.spend / focusValue} prev={prevFocusValue ? p.spend / prevFocusValue : undefined} prevText={prevFocusValue ? m(p.spend / prevFocusValue) : undefined} invert /></>)}
        <Kpi label="Investimento" value={m(k.spend)} cur={k.spend} prev={p.spend} prevText={m(p.spend)} />
        <Kpi label="Impressões" value={num(k.impressions)} cur={k.impressions} prev={p.impressions} prevText={num(p.impressions)} />
        <Kpi label="Alcance" value={num(k.reach)} cur={k.reach} prev={p.reach} prevText={num(p.reach)} />
        <Kpi label="Frequência" value={mult(freq)} cur={freq} prev={prevFreq} prevText={mult(prevFreq)} invert />
        <Kpi label="Cliques" value={num(k.clicks)} cur={k.clicks} prev={p.clicks} prevText={num(p.clicks)} />
        <Kpi label="Cliques no link" value={num(linkClicks)} cur={linkClicks} prev={prevLinkClicks} prevText={num(prevLinkClicks)} />
        <Kpi label="CTR (link)" value={pct(linkCtr)} cur={linkCtr} prev={prevLinkCtr} prevText={pct(prevLinkCtr)} />
        <Kpi label="CPC médio" value={m(cpc)} cur={cpc} prev={prevCpc} prevText={m(prevCpc)} invert />
        <Kpi label="CPM médio" value={m(k.cpm)} cur={k.cpm} prev={p.cpm} prevText={m(p.cpm)} invert />
        {messages > 0 && (<><Kpi label="Conversas" value={num(messages)} cur={messages} prev={prevMessages} prevText={num(prevMessages)} /><Kpi label="Custo/conversa" value={messages ? m(k.spend / messages) : "—"} cur={messages ? k.spend / messages : undefined} prev={prevMessages ? p.spend / prevMessages : undefined} prevText={prevMessages ? m(p.spend / prevMessages) : undefined} invert /></>)}
        {leads > 0 && (<><Kpi label="Leads" value={num(leads)} cur={leads} prev={prevLeads} prevText={num(prevLeads)} /><Kpi label="Custo/lead" value={leads ? m(k.spend / leads) : "—"} cur={leads ? k.spend / leads : undefined} prev={prevLeads ? p.spend / prevLeads : undefined} prevText={prevLeads ? m(p.spend / prevLeads) : undefined} invert /></>)}
        {purchases > 0 && (<><Kpi label="Compras" value={num(purchases)} cur={purchases} prev={prevPurchases} prevText={num(prevPurchases)} /><Kpi label="Custo/compra" value={purchases ? m(k.spend / purchases) : "—"} cur={purchases ? k.spend / purchases : undefined} prev={prevPurchases ? p.spend / prevPurchases : undefined} prevText={prevPurchases ? m(p.spend / prevPurchases) : undefined} invert /></>)}
        {purchaseValue > 0 && (<><Kpi label="ROAS" value={k.spend ? mult(purchaseValue / k.spend) : "—"} cur={k.spend ? purchaseValue / k.spend : undefined} prev={p.spend ? prevPurchaseValue / p.spend : undefined} prevText={p.spend ? mult(prevPurchaseValue / p.spend) : undefined} /><Kpi label="Valor de compra" value={m(purchaseValue)} cur={purchaseValue} prev={prevPurchaseValue} prevText={m(prevPurchaseValue)} /></>)}
      </Grid>
    </Block>
    {funnel.length > 1 && <Block><Card title="Funil"><Funnel steps={funnel} /></Card></Block>}
    <Block><Card title="Funil de conversão (e-commerce)">
      <FunnelChart
        steps={[
          { label: "Impressões", value: k.impressions },
          { label: "Alcance", value: k.reach },
          { label: "Cliques", value: k.clicks },
          { label: "Cliques no link", value: linkClicks },
          { label: "Add to Cart", value: pickVal(k.results, ATC_KEYS) },
          { label: "Init Checkout", value: pickVal(k.results, CHECKOUT_KEYS) },
          { label: "Compras", value: purchases },
        ].filter((s) => s.value > 0)}
        compact={compact}
      />
    </Card></Block>
    <Block><div style={{ display: "flex", gap: 12, flexDirection: compact ? "column" : "row" }}>
      <Card title="Cliques e CTR ao longo do tempo">
        <ComposedChart width={halfChart} height={170} data={daily} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.line} />
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: C.muted }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="l" tick={{ fontSize: 9, fill: C.muted }} tickLine={false} axisLine={false} width={40} />
          <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 9, fill: C.muted }} tickLine={false} axisLine={false} width={32} tickFormatter={(v) => `${v}%`} />
          <Tooltip contentStyle={{ borderRadius: 8, border: `1px solid ${C.line}` }} />
          <Bar yAxisId="l" dataKey="clicks" name="Cliques" fill={C.blue} radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false} />
          <Line yAxisId="r" type="monotone" dataKey="ctr" name="CTR" stroke={C.amber} strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </Card>
      <Card title="Impressões por hora">
        <BarChart width={halfChart} height={170} data={b.hour.map((h) => ({ label: h.key, v: h.impressions }))} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.line} />
          <XAxis dataKey="label" tick={{ fontSize: 8, fill: C.muted }} tickLine={false} axisLine={false} interval={2} />
          <YAxis tick={{ fontSize: 9, fill: C.muted }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => num(v)} />
          <Tooltip formatter={(v: any) => num(Number(v))} contentStyle={{ borderRadius: 8, border: `1px solid ${C.line}` }} />
          <Bar dataKey="v" name="Impressões" fill={C.blue} radius={[2, 2, 0, 0]} maxBarSize={14} isAnimationActive={false} />
        </BarChart>
      </Card>
    </div></Block>
    {actions.length > 0 && <Block><Card title="Ações por tipo">
      <DataTable head={[{ label: "Tipo" }, { label: "Total", align: "right" }, { label: "Custo", align: "right" }]} rows={actions.map(([t, v]) => [resultLabel(t), num(v), v ? m(k.spend / v) : "—"])} />
    </Card></Block>}
    {(b.age?.length ?? 0) > 0 && <Block><div style={{ display: "flex", gap: 12, flexDirection: compact ? "column" : "row" }}>
      {b.age && b.age.length > 0 && <Card title="Idade">
        <BarChart width={halfChart} height={170} data={b.age.map((r) => ({ label: ageLabel(r.key), imp: r.impressions, reach: r.reach }))} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.line} />
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: C.muted }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 9, fill: C.muted }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => num(v)} />
          <Tooltip formatter={(v: any) => num(Number(v))} contentStyle={{ borderRadius: 8, border: `1px solid ${C.line}` }} />
          <Bar dataKey="imp" name="Impressões" fill={C.blue} radius={[2, 2, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          <Bar dataKey="reach" name="Alcance" fill={C.teal} radius={[2, 2, 0, 0]} maxBarSize={22} isAnimationActive={false} />
        </BarChart>
      </Card>}
      <Card title="Região (top 8)">
        <BarList rows={[...b.region].sort((a, z) => (z.reach || z.impressions) - (a.reach || a.impressions)).slice(0, 8).map((r) => ({ key: regionLabel(r.key), value: r.reach || r.impressions, right: num(r.reach || r.impressions) }))} color={C.amber} />
      </Card>
    </div></Block>}
    <Block><div style={{ display: "flex", gap: 12, flexDirection: compact ? "column" : "row" }}>
      {b.gender && b.gender.length > 0 && <Card title="Gênero">
        <BarList rows={b.gender.map((r) => ({ key: genderLabel(r.key), value: r.impressions, right: `${num(r.impressions)} impr · ${num(r.reach)} alc` }))} color={C.blue} />
      </Card>}
      <Card title="Dispositivo">
        <BarList rows={b.device.map((r) => ({ key: deviceLabel(r.key), value: r.reach || r.impressions, right: num(r.reach || r.impressions) }))} color={C.teal} />
      </Card>
    </div></Block>
    {platform.length > 0 && <Block><Card title="Facebook × Instagram">
      <DataTable head={[{ label: "Plataforma" }, { label: "Investido", align: "right" }, { label: "Alcance", align: "right" }, { label: "Impressões", align: "right" }, { label: "Cliques", align: "right" }, { label: "CTR", align: "right" }, { label: "CPM", align: "right" }]} rows={platform.map((r) => [platformLabel(r.key), m(r.spend), num(r.reach), num(r.impressions), num(r.clicks), pct(ratio(r.clicks, r.impressions)), m(r.cpm)])} />
    </Card></Block>}
    <Block><Card title="Campanhas em destaque"><RowsTable rows={detail.campaigns.slice(0, 10)} currency={currency} focus={focus} /></Card></Block>
    <Block><Card title="Conjuntos de anúncios"><RowsTable rows={detail.adsets.slice(0, 10)} currency={currency} focus={focus} /></Card></Block>
    <Block><Card title="Anúncios em destaque"><RowsTable rows={detail.ads.slice(0, 10)} currency={currency} focus={focus} thumbs /></Card></Block>
  </>);
}

function GoogleSection({ block }: { block: GoogleBlock }) {
  const d = block.detail; const e = block.extras; const m = (v: number, d = 2) => money(v, block.currency, d); const cur = block.currency || "BRL";
  const { w: pageW, compact } = useLayout(); const fullChart = pageW - 34; const halfChart = compact ? pageW - 34 : HALF - 34;
  if (!d || d.error) return <Block><SectionTitle kicker="Google Ads" color={C.google}>{block.name}</SectionTitle><Warn>{d?.error || "Dados indisponíveis."}</Warn></Block>;
  const k = d.kpis; const p = d.prevKpis;
  const daily = (d.daily || []).map((dd: Daily) => ({ label: dayLabel(dd.date), spend: dd.spend, clicks: dd.clicks, impressions: dd.impressions || 0 }));
  const gc = k.clicks || 0; const gi = k.impressions || 0; const gctr = ratio(gc, gi); const gcpc = gc ? k.spend / gc : 0;
  const conv = k.results?.conversions || 0; const convVal = k.values?.conversions || 0;
  const prevConv = p.results?.conversions || 0; const prevConvVal = p.values?.conversions || 0;
  const cpa = conv ? k.spend / conv : 0; const prevCpa = prevConv ? p.spend / prevConv : 0;
  const roas = k.spend && convVal ? convVal / k.spend : 0; const prevRoas = p.spend && prevConvVal ? prevConvVal / p.spend : 0;
  const funnel = [{ label: "Impressões", v: gi }, { label: "Cliques", v: gc }, ...(conv > 0 ? [{ label: "Conversões", v: conv }] : [])].filter((s) => s.v > 0);
  return (<Block>
    <SectionTitle kicker="Google Ads" color={C.google}>{block.name}</SectionTitle>
    <Grid cols={4}>
      <Kpi label="Investimento" value={m(k.spend)} cur={k.spend} prev={p.spend} prevText={m(p.spend)} />
      <Kpi label="Impressões" value={num(gi)} cur={gi} prev={p.impressions || 0} prevText={num(p.impressions || 0)} />
      <Kpi label="Cliques" value={num(gc)} cur={gc} prev={p.clicks || 0} prevText={num(p.clicks || 0)} />
      <Kpi label="CTR" value={pct(gctr)} cur={gctr} prev={p.ctr || 0} prevText={pct(p.ctr || 0)} />
      <Kpi label="CPC médio" value={m(gcpc)} cur={gcpc} prev={p.cpc || 0} prevText={m(p.cpc || 0)} invert />
      <Kpi label="Conversões" value={num(conv)} cur={conv} prev={prevConv} prevText={num(prevConv)} />
      <Kpi label="CPA médio" value={conv ? m(cpa) : "—"} cur={cpa || undefined} prev={prevCpa || undefined} prevText={prevConv ? m(prevCpa) : undefined} invert />
      <Kpi label="ROAS" value={roas ? mult(roas) : "—"} cur={roas || undefined} prev={prevRoas || undefined} prevText={prevRoas ? mult(prevRoas) : undefined} />
    </Grid>
    {funnel.length > 1 && <Card title="Funil"><Funnel steps={funnel} /></Card>}
    <Card title="Funil de conversão">
      <FunnelChart
        steps={[
          { label: "Impressões", value: gi },
          { label: "Cliques", value: gc },
          { label: "Conversões", value: conv },
        ].filter((s) => s.value > 0)}
        compact={compact}
      />
    </Card>
    {e?.campaigns && e.campaigns.length > 0 && <Card title="Campanhas"><GoogleTable rows={e.campaigns.slice(0, 10)} cur={block.currency} /></Card>}
    {e?.keywords && e.keywords.length > 0 && <Card title="Termos de busca"><GoogleTable rows={e.keywords.slice(0, 10)} cur={block.currency} /></Card>}
    {e?.cities && e.cities.length > 0 && <Card title="Cidades"><GoogleTable rows={e.cities.slice(0, 10)} cur={block.currency} /></Card>}
    {e?.notes && e.notes.length > 0 && <div style={{ marginTop: 8 }}>{e.notes.map((n, i) => <p key={i} style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, margin: "2px 0" }}>· {n}</p>)}</div>}
  </Block>);
}

function Funnel({ steps }: { steps: { label: string; v: number }[] }) {
  const maxV = Math.max(...steps.map((s) => s.v), 1);
  return <div style={{ display: "grid", gap: 4 }}>{steps.map((s, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 11, color: C.muted, width: 100, textAlign: "right", flexShrink: 0 }}>{s.label}</span><div style={{ flex: 1, height: 18, borderRadius: 4, background: C.accent, overflow: "hidden" }}><div style={{ height: "100%", borderRadius: 4, transition: "width 0.3s", width: `${(s.v / maxV) * 100}%`, background: i === 0 ? C.blue : i === steps.length - 1 ? C.green : C.amber }} /></div><span style={{ fontSize: 11, fontWeight: 600, width: 80, textAlign: "right", color: C.ink }}>{num(s.v)}</span></div>)}</div>;
}

function BarList({ rows, color }: { rows: { key: string; value: number; right: string }[]; color: string }) {
  const maxV = Math.max(...rows.map((r) => r.value), 1);
  return <div style={{ display: "grid", gap: 3 }}>{rows.map((r, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 10, width: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.ink }}>{r.key}</span><div style={{ flex: 1, height: 14, borderRadius: 3, background: C.accent, overflow: "hidden" }}><div style={{ height: "100%", borderRadius: 3, width: `${(r.value / maxV) * 100}%`, background: color }} /></div><span style={{ fontSize: 10, color: C.muted, width: 64, textAlign: "right" }}>{r.right}</span></div>)}</div>;
}

function DataTable({ head, rows }: { head: { label: string; align?: "left" | "right" }[]; rows: (string | number)[][] }) {
  return <div style={{ overflowX: "auto" }}><table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}><thead><tr style={{ borderBottom: `1px solid ${C.line}` }}>{head.map((h, i) => <th key={i} style={{ paddingBottom: 4, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.3, textAlign: h.align === "right" ? "right" : "left" }}>{h.label}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i} style={{ borderBottom: `1px solid ${C.line}80` }}>{row.map((cell, j) => <td key={j} style={{ padding: "4px 0", fontVariantNumeric: "tabular-nums", textAlign: j > 0 ? "right" : "left", fontWeight: j > 0 ? 600 : 400, color: C.ink }}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

function GoogleTable({ rows, cur }: { rows: GoogleReportRow[]; cur: string }) {
  return <div style={{ overflowX: "auto" }}><table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}><thead><tr style={{ borderBottom: `1px solid ${C.line}` }}>{["Termo", "Custo", "Impr.", "Cliques", "CTR", "CPC", "Conv.", "CPA"].map((h) => <th key={h} style={{ paddingBottom: 4, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.3, textAlign: "right" }}>{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i} style={{ borderBottom: `1px solid ${C.line}80` }}><td style={{ padding: "4px 0", textAlign: "left", fontWeight: 600, color: C.ink }}>{r.key}</td>{[r.cost, r.impressions, r.clicks, r.ctr, r.cpc, r.conversions, r.costPerConversion].map((v, j) => <td key={j} style={{ padding: "4px 0", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: C.ink }}>{j === 0 || j === 4 || j === 6 ? money(v, cur) : j === 3 ? pct(v) : num(v)}</td>)}</tr>)}</tbody></table></div>;
}

function RowsTable({ rows, currency, focus, thumbs }: { rows: Row[]; currency: string; focus: Focus | null; thumbs?: boolean; }) {
  const m = (v: number) => money(v, currency);
  const result = (row: Row) => primaryRowResult(row, focus);
  return <div style={{ overflowX: "auto" }}><table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}><thead><tr style={{ borderBottom: `1px solid ${C.line}` }}>{thumbs && <th style={{ width: 24 }} />}<th style={{ paddingBottom: 4, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.3, textAlign: "left" }}>Nome</th>{["Investido", "Impressões", "Cliques", "CTR", "CPM", "Resultado", "Custo"].map((h) => <th key={h} style={{ paddingBottom: 4, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.3, textAlign: "right" }}>{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => { const r = result(row); return <tr key={row.id || i} style={{ borderBottom: `1px solid ${C.line}80` }}>{thumbs && <td style={{ padding: "4px 0" }}>{row.thumbnail ? <img src={row.thumbnail} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: "cover" }} /> : <div style={{ width: 20, height: 20, borderRadius: 4, background: C.accent }} />}</td>}<td style={{ padding: "4px 0", fontWeight: 600, color: C.ink, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</td><td style={{ padding: "4px 0", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: C.ink }}>{m(row.spend)}</td><td style={{ padding: "4px 0", textAlign: "right", fontVariantNumeric: "tabular-nums", color: C.ink }}>{num(row.impressions)}</td><td style={{ padding: "4px 0", textAlign: "right", fontVariantNumeric: "tabular-nums", color: C.ink }}>{num(row.clicks)}</td><td style={{ padding: "4px 0", textAlign: "right", fontVariantNumeric: "tabular-nums", color: C.ink }}>{pct(row.ctr)}</td><td style={{ padding: "4px 0", textAlign: "right", fontVariantNumeric: "tabular-nums", color: C.ink }}>{m(row.cpm)}</td><td style={{ padding: "4px 0", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: C.ink }}>{r ? num(r.value) : "—"}</td><td style={{ padding: "4px 0", textAlign: "right", fontVariantNumeric: "tabular-nums", color: C.ink }}>{r && r.value > 0 ? m(row.spend / r.value) : "—"}</td></tr>; })}</tbody></table></div>;
}

function PrintStyles() {
  return <style>{`
    @media print {
      @page { margin: 8mm; }
      body { background: #fff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      table { page-break-inside: auto; } tr { page-break-inside: avoid; }
    }
  `}</style>;
}

function FunnelChart({ steps, compact }: { steps: { label: string; value: number }[]; compact?: boolean }) {
  const maxVal = Math.max(...steps.map((s) => s.value), 1);
  const barMaxW = compact ? 200 : 400;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "8px 0" }}>
      {steps.map((s, i) => {
        const pct = (s.value / maxVal) * 100;
        const prevPct = i > 0 ? (steps[i - 1].value / maxVal) * 100 : 100;
        const drop = prevPct > 0 ? (1 - pct / prevPct) * 100 : 0;
        const barW = (s.value / maxVal) * barMaxW;
        const colors = ["#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#10b981"];
        return (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
            <div style={{ width: compact ? 80 : 110, textAlign: "right", fontSize: compact ? 9 : 10, color: C.muted, flexShrink: 0 }}>{s.label}</div>
            <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
              <div style={{ width: barW, height: 22, borderRadius: 4, background: colors[i % colors.length], display: "flex", alignItems: "center", justifyContent: "center", minWidth: 40, transition: "width 0.3s" }}>
                <span style={{ fontSize: compact ? 9 : 10, fontWeight: 700, color: "#fff" }}>{num(s.value)}</span>
              </div>
            </div>
            <div style={{ width: 40, textAlign: "right", fontSize: 9, color: i > 0 ? (drop > 20 ? C.red : drop > 5 ? C.amber : C.green) : "transparent" }}>
              {i > 0 && drop > 0 ? `-${drop.toFixed(0)}%` : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Insights humanizados em linguagem de cliente leigo
function generateInsights(kpis: Kpis, prevKpis: Kpis, currency: string, platform: string, focus?: Focus | null): string[] {
  const lines: string[] = [];
  const spend = kpis.spend || 0;
  const prevSpend = prevKpis.spend || 0;
  const m = (v: number) => money(v, currency);

  if (spend > 0) lines.push(`Foram investidos ${m(spend)} em anúncios no ${platform} durante este período.`);

  const impressions = kpis.impressions || 0;
  if (impressions > 0) lines.push(`Os anúncios foram exibidos ${impressions.toLocaleString("pt-BR")} vezes, alcançando ${(kpis.reach || 0).toLocaleString("pt-BR")} pessoas diferentes.`);

  const clicks = kpis.clicks || 0;
  if (clicks > 0) lines.push(`Isso gerou ${clicks.toLocaleString("pt-BR")} cliques, com um custo médio de ${m(spend / clicks)} por clique.`);

  if (focus) {
    const fv = pickVal(kpis.results, focus.keys);
    const pfv = prevKpis ? pickVal(prevKpis.results, focus.keys) : 0;
    if (fv > 0 && spend > 0) {
      const cpa = spend / fv;
      if (pfv > 0 && prevSpend > 0) {
        const prevCpa = prevSpend / pfv;
        const diff = ((cpa - prevCpa) / prevCpa) * 100;
        lines.push(`O custo por ${focus.label.toLowerCase()} foi de ${m(cpa)}, ${Math.abs(diff).toFixed(0)}% ${diff > 0 ? "maior" : "menor"} que no período anterior.`);
      } else {
        lines.push(`O custo por ${focus.label.toLowerCase()} foi de ${m(cpa)}.`);
      }
    }
  }

  const purchases = pickVal(kpis.results, PURCHASE_KEYS);
  const purchaseVal = pickVal(kpis.values, PURCHASE_KEYS);
  if (purchases > 0 && purchaseVal > 0 && spend > 0) {
    const roas = purchaseVal / spend;
    if (roas > 2) {
      lines.push(`A cada R$1 investido, você recuperou R$${roas.toFixed(2)} em vendas — um retorno de ${roas.toFixed(0)}x sobre o investimento.`);
    } else if (roas > 1) {
      lines.push(`O retorno ficou em R$${roas.toFixed(2)} para cada R$1 investido — acima do ponto de equilíbrio.`);
    } else if (roas > 0) {
      lines.push(`O retorno ainda está abaixo de R$1 para cada R$1 investido, indicando que as campanhas precisam de ajustes para se tornarem rentáveis.`);
    }
  }

  if (spend > prevSpend && prevSpend > 0) {
    const pct = ((spend - prevSpend) / prevSpend) * 100;
    lines.push(`O investimento ${pct > 0 ? "aumentou" : "caiu"} ${Math.abs(pct).toFixed(0)}% em relação ao período anterior.`);
  }

  return lines;
}

function InsightBox({ title, lines }: { title: string; lines: string[] }) {
  if (!lines.length) return null;
  return (
    <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, padding: "12px 14px", marginTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "#0369a1", marginBottom: 6 }}>{title}</div>
      {lines.map((l, i) => <p key={i} style={{ fontSize: 12, lineHeight: 1.6, color: C.ink, margin: "3px 0" }}>{l}</p>)}
    </div>
  );
}
