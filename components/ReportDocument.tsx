"use client";

import { createContext, useContext } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import BrandMark from "@/components/BrandMark";
import { money, moneyShort, num, pct, dayLabel, resultLabel, pickVal, delta, PURCHASE_KEYS, LINKCLICK_KEYS, RESULT_FAMILY_BY_SLUG } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAGE_W = 700;
const HALF = (PAGE_W - 14) / 2;

interface LayoutInfo { w: number; compact: boolean; }
const LayoutCtx = createContext<LayoutInfo>({ w: PAGE_W, compact: false });
const useLayout = () => useContext(LayoutCtx);

// Color tokens for charts
const C = {
  ink: "var(--color-foreground)",
  muted: "var(--color-muted-foreground)",
  line: "var(--color-border)",
  blue: "var(--color-chart-1)",
  teal: "var(--color-chart-2)",
  amber: "var(--color-chart-4)",
  green: "var(--color-success)",
  red: "var(--color-destructive)",
  meta: "#1877f2",
  google: "#4285f4",
};

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
const dec = (v: number, digits = 1) => v.toFixed(digits).replace(".", ",");
const ageLabel = (k: string) => k.replace("_", "–").replace("65", "65+");
const regionLabel = (k: string) => k.split(",")[0];
const platformLabel = (k: string) => k === "facebook" ? "Facebook" : k === "instagram" ? "Instagram" : k === "messenger" ? "Messenger" : k === "audience_network" ? "Audience" : k;
const deviceLabel = (k: string) => ({ ipad: "iPad", iphone: "iPhone", android_smartphone: "Android", android_tablet: "Android Tablet", desktop: "Desktop", feature_phone: "Básico" }[k] || k);
const genderLabel = (k: string) => k === "male" ? "Masculino" : k === "female" ? "Feminino" : "Desconhecido";
const MESSAGE_KEYS = RESULT_FAMILY_BY_SLUG.mensagens.keys;
const LEAD_KEYS = RESULT_FAMILY_BY_SLUG.leads.keys;
const REGISTER_KEYS = RESULT_FAMILY_BY_SLUG.cadastros.keys;

const FOCUS_SHORT: Record<string, string> = { vendas: "Compras", mensagens: "Conversas", leads: "Leads", cadastros: "Cadastros", cliques: "Cliques", lpv: "Views de LP", engajamento: "Engajamento" };
const FOCUS_COST: Record<string, string> = { vendas: "Custo por compra", mensagens: "Custo por conversa", leads: "Custo por lead", cadastros: "Custo por cadastro", cliques: "Custo por clique no link", lpv: "Custo por view de LP", engajamento: "Custo por engajamento" };
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
      <div style={{ width: w, margin: "0 auto", color: "var(--color-foreground)" }}>
        <PrintStyles />

        {/* Cover */}
        <section className="pb-4 mb-5" style={{ borderBottom: `2px solid var(--color-foreground)` }}>
          <div className="flex items-center gap-2 mb-3.5">
            <BrandMark size={26} />
            <span className="text-xs font-bold tracking-tight">{brand}</span>
          </div>
          <div className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">Relatório de mídia paga</div>
          <h1 className={cn("font-extrabold tracking-tight leading-tight mt-2 mb-0.5 break-words", compact ? "text-2xl" : "text-3xl")}>{account.name}</h1>
          <div className={cn("text-muted-foreground font-medium", compact ? "text-sm" : "text-base")}>Análise de desempenho</div>
          <p className="mt-3 text-xs leading-relaxed" style={{ maxWidth: 560, color: "var(--color-foreground)" }}>
            Relatório gerado com os dados de <strong>{br(range.since)}</strong> a <strong>{br(range.until)}</strong>, comparado com o período anterior de mesma duração ({br(prevRange.since)} a {br(prevRange.until)}).
          </p>
          <div className="flex gap-2 mt-3.5 flex-wrap">
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
              <Card title="Divisão do investimento por canal" className="mt-3">
                <SplitBar parts={[...(metaOk ? [{ label: "Meta Ads", value: k!.spend, color: C.meta }] : []), ...google.map((g) => ({ label: `Google Ads · ${g.name}`, value: g.detail?.kpis?.spend || 0, color: C.google }))]} total={totalSpend} format={(v) => m(v)} />
              </Card>
            )}
          </Block>
        )}

        {/* Meta */}
        {meta?.error && <Block><SectionTitle kicker="Meta Ads" color={C.meta}>{account.name}</SectionTitle><Warn>Não foi possível carregar os dados da Meta: {meta.error}</Warn></Block>}
        {metaOk && <MetaSection detail={meta!} currency={cur} accountName={account.name} focus={resolveFocus(data.result_family)} />}
        {google.map((g) => <GoogleSection key={g.account_id} block={g} />)}

        {/* Footer */}
        <footer className="mt-6 pt-3 text-[10px] text-muted-foreground leading-relaxed" style={{ borderTop: `1px solid var(--color-border)` }}>
          <div>Fontes: {metaOk ? "Meta Marketing API" : ""}{metaOk && google.length ? " · " : ""}{google.length ? "Google Ads API" : ""}. Dados consultados ao vivo em {new Date(data.generated_at).toLocaleString("pt-BR")}.</div>
          {data.organic_note && <div className="mt-0.5">{data.organic_note}</div>}
          <div className="mt-0.5">Gerado por {brand}.</div>
        </footer>
      </div>
    </LayoutCtx.Provider>
  );
}

// --- MetaSection ---
function MetaSection({ detail, currency, accountName, focus }: { detail: MetaDetail; currency: string; accountName: string; focus: Focus | null; }) {
  const k = detail.kpis; const p = detail.prevKpis; const m = (v: number, digits = 2) => money(v, currency, digits); const b = detail.breakdowns;
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
  const actions = Object.entries(k.results).filter(([type, total]) => total > 0 && !(type.startsWith("omni_") && k.results[type.slice(5)] != null)).sort((a, c) => c[1] - a[1]).slice(0, 12);
  const platform = b.platform.filter((row) => row.impressions > 0);
  const funnel = [{ label: "Impressões", v: k.impressions }, { label: "Alcance", v: k.reach }, { label: "Cliques", v: k.clicks }, { label: "Cliques no link", v: linkClicks }, ...(messages > 0 ? [{ label: "Conversas iniciadas", v: messages }] : []), ...(leads > 0 ? [{ label: "Cadastros / leads", v: leads }] : []), ...(purchases > 0 ? [{ label: "Compras", v: purchases }] : [])].filter((s) => s.v > 0);

  return (
    <>
      <Block>
        <SectionTitle kicker="Meta Ads · Facebook e Instagram" color={C.meta}>{detail.name || accountName}</SectionTitle>
        <Grid cols={4}>
          {showFocus && focus && (<><Kpi label={focus.label} value={num(focusValue)} cur={focusValue} prev={prevFocusValue} prevText={num(prevFocusValue)} accent /><Kpi label={focus.costLabel} value={m(k.spend / focusValue)} cur={k.spend / focusValue} prev={prevFocusValue ? p.spend / prevFocusValue : undefined} prevText={prevFocusValue ? m(p.spend / prevFocusValue) : undefined} invert accent /></>)}
          <Kpi label="Valor investido" value={m(k.spend)} cur={k.spend} prev={p.spend} prevText={m(p.spend)} neutral />
          <Kpi label="Impressões" value={num(k.impressions)} cur={k.impressions} prev={p.impressions} prevText={num(p.impressions)} />
          <Kpi label="Alcance" value={num(k.reach)} cur={k.reach} prev={p.reach} prevText={num(p.reach)} />
          <Kpi label="Frequência" value={mult(freq)} cur={freq} prev={prevFreq} prevText={mult(prevFreq)} invert />
          <Kpi label="Total de cliques" value={num(k.clicks)} cur={k.clicks} prev={p.clicks} prevText={num(p.clicks)} />
          <Kpi label="Cliques no link" value={num(linkClicks)} cur={linkClicks} prev={prevLinkClicks} prevText={num(prevLinkClicks)} />
          <Kpi label="CTR (link)" value={pct(linkCtr)} cur={linkCtr} prev={prevLinkCtr} prevText={pct(prevLinkCtr)} />
          <Kpi label="CPC médio" value={m(cpc)} cur={cpc} prev={prevCpc} prevText={m(prevCpc)} invert />
          <Kpi label="CPM médio" value={m(k.cpm)} cur={k.cpm} prev={p.cpm} prevText={m(p.cpm)} invert />
          {messages > 0 && focus?.slug !== "mensagens" && (<><Kpi label="Conversas iniciadas" value={num(messages)} cur={messages} prev={prevMessages} prevText={num(prevMessages)} /><Kpi label="Custo por conversa" value={messages ? m(k.spend / messages) : "—"} cur={messages ? k.spend / messages : undefined} prev={prevMessages ? p.spend / prevMessages : undefined} prevText={prevMessages ? m(p.spend / prevMessages) : undefined} invert /></>)}
          {leads > 0 && focus?.slug !== "leads" && (<><Kpi label="Cadastros / leads" value={num(leads)} cur={leads} prev={prevLeads} prevText={num(prevLeads)} /><Kpi label="Custo por lead" value={leads ? m(k.spend / leads) : "—"} cur={leads ? k.spend / leads : undefined} prev={prevLeads ? p.spend / prevLeads : undefined} prevText={prevLeads ? m(p.spend / prevLeads) : undefined} invert /></>)}
          {purchases > 0 && focus?.slug !== "vendas" && (<><Kpi label="Compras" value={num(purchases)} cur={purchases} prev={prevPurchases} prevText={num(prevPurchases)} /><Kpi label="Custo por compra" value={purchases ? m(k.spend / purchases) : "—"} cur={purchases ? k.spend / purchases : undefined} prev={prevPurchases ? p.spend / prevPurchases : undefined} prevText={prevPurchases ? m(p.spend / prevPurchases) : undefined} invert /></>)}
          {purchaseValue > 0 && (<><Kpi label="ROAS" value={k.spend ? mult(purchaseValue / k.spend) : "—"} cur={k.spend ? purchaseValue / k.spend : undefined} prev={p.spend ? prevPurchaseValue / p.spend : undefined} prevText={p.spend ? mult(prevPurchaseValue / p.spend) : undefined} /><Kpi label="Valor de compra" value={m(purchaseValue)} cur={purchaseValue} prev={prevPurchaseValue} prevText={m(prevPurchaseValue)} /></>)}
        </Grid>
      </Block>
      {funnel.length > 1 && <Block><Card title="Funil do período"><Funnel steps={funnel} /></Card></Block>}
      <Block><Card title="Investimento por dia">
        <ComposedChart width={fullChart} height={190} data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
          <XAxis dataKey="label" tick={{ fontSize: 9.5, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 9.5, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} width={54} tickFormatter={(v) => moneyShort(v, currency)} />
          <Tooltip formatter={(v: any) => money(Number(v), currency)} contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)" }} />
          <Bar dataKey="spend" name="Investimento" fill={C.teal} radius={[3, 3, 0, 0]} maxBarSize={40} isAnimationActive={false} />
        </ComposedChart>
      </Card></Block>
      <Block><div className={cn("flex gap-3", compact ? "flex-col" : "flex-row")}>
        <Card title="Cliques e CTR ao longo do tempo" className="flex-1">
          <ComposedChart width={halfChart} height={170} data={daily} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
            <YAxis yAxisId="l" tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} width={40} />
            <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} width={32} tickFormatter={(v) => `${v}%`} />
            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)" }} />
            <Bar yAxisId="l" dataKey="clicks" name="Cliques" fill={C.blue} radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false} />
            <Line yAxisId="r" type="monotone" dataKey="ctr" name="CTR" stroke={C.amber} strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </Card>
        <Card title="Impressões por hora do dia" className="flex-1">
          <BarChart width={halfChart} height={170} data={b.hour.map((h) => ({ label: h.key, v: h.impressions }))} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="label" tick={{ fontSize: 8, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} interval={2} />
            <YAxis tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => num(v)} />
            <Tooltip formatter={(v: any) => num(Number(v))} contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)" }} />
            <Bar dataKey="v" name="Impressões" fill={C.blue} radius={[2, 2, 0, 0]} maxBarSize={14} isAnimationActive={false} />
          </BarChart>
        </Card>
      </div></Block>
      {actions.length > 0 && <Block><Card title="Conversões e ações por tipo">
        <DataTable head={[{ label: "Tipo de ação" }, { label: "Total", align: "right" }, { label: "Custo por ação", align: "right" }]} rows={actions.map(([type, total]) => [resultLabel(type), num(total), total ? m(k.spend / total) : "—"])} />
      </Card></Block>}
      {(b.age?.length ?? 0) > 0 && <Block><div className={cn("flex gap-3", compact ? "flex-col" : "flex-row")}>
        {b.age && b.age.length > 0 && <Card title="Impressões e alcance por idade" className="flex-1">
          <BarChart width={halfChart} height={170} data={b.age.map((r) => ({ label: ageLabel(r.key), imp: r.impressions, reach: r.reach }))} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => num(v)} />
            <Tooltip formatter={(v: any) => num(Number(v))} contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)" }} />
            <Bar dataKey="imp" name="Impressões" fill={C.blue} radius={[2, 2, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            <Bar dataKey="reach" name="Alcance" fill={C.teal} radius={[2, 2, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          </BarChart>
        </Card>}
        <Card title="Alcance por região (top 8)" className="flex-1">
          <BarList rows={[...b.region].sort((a, z) => (z.reach || z.impressions) - (a.reach || a.impressions)).slice(0, 8).map((r) => ({ key: regionLabel(r.key), value: r.reach || r.impressions, right: num(r.reach || r.impressions) }))} color={C.amber} />
        </Card>
      </div></Block>}
      <Block><div className={cn("flex gap-3", compact ? "flex-col" : "flex-row")}>
        {b.gender && b.gender.length > 0 && <Card title="Impressões e alcance por gênero" className="flex-1">
          <BarList rows={b.gender.map((r) => ({ key: genderLabel(r.key), value: r.impressions, right: `${num(r.impressions)} impr · ${num(r.reach)} alc` }))} color={C.blue} />
        </Card>}
        <Card title="Alcance por dispositivo" className="flex-1">
          <BarList rows={b.device.map((r) => ({ key: deviceLabel(r.key), value: r.reach || r.impressions, right: num(r.reach || r.impressions) }))} color={C.teal} />
        </Card>
      </div></Block>
      {platform.length > 0 && <Block><Card title="Facebook × Instagram">
        <DataTable head={[{ label: "Plataforma" }, { label: "Investido", align: "right" }, { label: "Alcance", align: "right" }, { label: "Impressões", align: "right" }, { label: "Cliques", align: "right" }, { label: "CTR", align: "right" }, { label: "CPM", align: "right" }]} rows={platform.map((r) => [platformLabel(r.key), m(r.spend), num(r.reach), num(r.impressions), num(r.clicks), pct(ratio(r.clicks, r.impressions)), m(r.cpm)])} />
      </Card></Block>}
      <Block><Card title="Campanhas em destaque"><RowsTable rows={detail.campaigns.slice(0, 10)} currency={currency} focus={focus} /></Card></Block>
      <Block><Card title="Conjuntos de anúncios em destaque"><RowsTable rows={detail.adsets.slice(0, 10)} currency={currency} focus={focus} /></Card></Block>
      <Block><Card title="Anúncios em destaque"><RowsTable rows={detail.ads.slice(0, 10)} currency={currency} focus={focus} thumbs /></Card></Block>
    </>
  );
}

// --- GoogleSection ---
function GoogleSection({ block }: { block: GoogleBlock }) {
  const d = block.detail; const e = block.extras; const m = (v: number, d = 2) => money(v, block.currency, d); const cur = block.currency || "BRL";
  const { w: pageW, compact } = useLayout(); const fullChart = pageW - 34; const halfChart = compact ? pageW - 34 : HALF - 34;
  if (!d || d.error) { return <Block><SectionTitle kicker="Google Ads" color={C.google}>{block.name}</SectionTitle><Warn>{d?.error || "Dados indisponíveis."}</Warn></Block>; }
  const k = d.kpis; const p = d.prevKpis;
  const daily = (d.daily || []).map((dd: Daily) => ({ label: dayLabel(dd.date), spend: dd.spend, clicks: dd.clicks, impressions: dd.impressions || 0 }));
  const googClicks = k.clicks || 0; const googImpressions = k.impressions || 0; const googCtr = ratio(googClicks, googImpressions); const googCpc = googClicks ? k.spend / googClicks : 0;
  const conversions = k.results?.conversions || 0; const conversionValue = k.values?.conversions || 0;
  const prevConversions = p.results?.conversions || 0; const prevConversionValue = p.values?.conversions || 0;
  const costPerConversion = conversions ? k.spend / conversions : 0; const prevCpa = prevConversions ? p.spend / prevConversions : 0;
  const roas = k.spend && conversionValue ? conversionValue / k.spend : 0; const prevRoas = p.spend && prevConversionValue ? prevConversionValue / p.spend : 0;
  const googleFunnel = [{ label: "Impressões", v: googImpressions }, { label: "Cliques", v: googClicks }, ...(conversions > 0 ? [{ label: "Conversões", v: conversions }] : [])].filter((s) => s.v > 0);
  return (
    <Block>
      <SectionTitle kicker="Google Ads" color={C.google}>{block.name}</SectionTitle>
      <Grid cols={4}>
        <Kpi label="Investimento" value={m(k.spend)} cur={k.spend} prev={p.spend} prevText={m(p.spend)} neutral />
        <Kpi label="Impressões" value={num(googImpressions)} cur={googImpressions} prev={p.impressions || 0} prevText={num(p.impressions || 0)} />
        <Kpi label="Cliques" value={num(googClicks)} cur={googClicks} prev={p.clicks || 0} prevText={num(p.clicks || 0)} />
        <Kpi label="CTR" value={pct(googCtr)} cur={googCtr} prev={p.ctr || 0} prevText={pct(p.ctr || 0)} />
        <Kpi label="CPC médio" value={m(googCpc)} cur={googCpc} prev={p.cpc || 0} prevText={m(p.cpc || 0)} invert />
        <Kpi label="Conversões" value={num(conversions)} cur={conversions} prev={prevConversions} prevText={num(prevConversions)} />
        <Kpi label="CPA médio" value={conversions ? m(costPerConversion) : "—"} cur={costPerConversion || undefined} prev={prevCpa || undefined} prevText={prevConversions ? m(prevCpa) : undefined} invert />
        <Kpi label="ROAS" value={roas ? mult(roas) : "—"} cur={roas || undefined} prev={prevRoas || undefined} prevText={prevRoas ? mult(prevRoas) : undefined} />
      </Grid>
      {googleFunnel.length > 1 && <div className="mt-3"><Card title="Funil do período"><Funnel steps={googleFunnel} /></Card></div>}
      <div className="mt-3"><Card title="Investimento por dia">
        <ComposedChart width={fullChart} height={190} data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
          <XAxis dataKey="label" tick={{ fontSize: 9.5, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 9.5, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} width={54} tickFormatter={(v) => moneyShort(v, cur)} />
          <Tooltip formatter={(v: any) => money(Number(v), cur)} contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)" }} />
          <Bar dataKey="spend" name="Investimento" fill={C.google} radius={[3, 3, 0, 0]} maxBarSize={40} isAnimationActive={false} />
        </ComposedChart>
      </Card></div>
      {e?.campaigns && e.campaigns.length > 0 && <div className="mt-3"><Card title="Campanhas"><GoogleTable rows={e.campaigns.slice(0, 10)} cur={block.currency} /></Card></div>}
      {e?.keywords && e.keywords.length > 0 && <div className="mt-3"><Card title="Principais termos de busca"><GoogleTable rows={e.keywords.slice(0, 10)} cur={block.currency} /></Card></div>}
      {e?.cities && e.cities.length > 0 && <div className="mt-3"><Card title="Cidades com mais conversões"><GoogleTable rows={e.cities.slice(0, 10)} cur={block.currency} /></Card></div>}
      {e?.notes && e.notes.length > 0 && <div className="mt-3 space-y-1">{e.notes.map((n, i) => <p key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground"><span>·</span>{n}</p>)}</div>}
    </Block>
  );
}

// --- Atomic components ---
function Block({ children }: { children: React.ReactNode }) { return <section className="mb-5">{children}</section>; }

function SectionTitle({ children, kicker, color }: { children: React.ReactNode; kicker?: string; color?: string; }) {
  return (
    <div className="mb-3">
      {kicker && <div className="text-[11px] font-bold tracking-wider uppercase mb-0.5" style={{ color: color || "var(--color-muted-foreground)" }}>{kicker}</div>}
      <h2 className="text-lg font-bold tracking-tight">{children}</h2>
    </div>
  );
}

function Grid({ cols, children }: { cols: 2 | 4; children: React.ReactNode }) {
  return <div className={cn("grid gap-2", cols === 4 ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2")}>{children}</div>;
}

function Kpi({ label, value, cur, prev, prevText, invert, neutral, accent }: { label: string; value: string; cur?: number; prev?: number; prevText?: string; invert?: boolean; neutral?: boolean; accent?: boolean; }) {
  const d = cur != null && prev != null ? delta(cur, prev) : null;
  let badge = null;
  if (d && d.hasPrev) {
    const up = d.pct >= 0; const good = invert ? !up : up;
    badge = (
      <span className={cn("text-[10px] font-semibold", good ? "text-emerald-500" : "text-red-500")}>
        {up ? "▲" : "▼"} {Math.abs(d.pct).toFixed(1)}%<span className="text-muted-foreground font-normal"> vs anterior</span>
      </span>
    );
  }
  return (
    <div className={cn("rounded-lg border p-3", accent ? "border-primary/30 bg-primary/5" : "border-border/50 bg-card")}>
      <div className="text-[11px] text-muted-foreground font-medium leading-tight">{label}</div>
      <div className={cn("text-lg font-bold tracking-tight mt-0.5 tabular-nums", accent && "text-primary")}>{value}</div>
      <div className="mt-0.5 min-h-[15px]">{badge}</div>
    </div>
  );
}

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string; }) {
  return (
    <div className={cn("rounded-lg border border-border/50 bg-card p-3 print:border print:border-gray-200", className)}>
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">{title}</div>
      {children}
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 text-xs text-amber-600">{children}</div>;
}

function SourceChip({ color, platform, name }: { color: string; platform: string; name: string }) {
  return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border" style={{ borderColor: color + "40", backgroundColor: color + "10", color }}><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />{platform} · {name}</span>;
}

function SplitBar({ parts, total, format }: { parts: { label: string; value: number; color: string }[]; total: number; format: (v: number) => string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex h-5 rounded overflow-hidden">{parts.map((p, i) => <div key={i} className="h-full transition-all" style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.color, minWidth: p.value > 0 ? 4 : 0 }} title={`${p.label}: ${format(p.value)}`} />)}</div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">{parts.map((p, i) => <div key={i} className="flex items-center gap-1.5 text-[10px]"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: p.color }} /><span className="text-muted-foreground">{p.label}</span><span className="font-semibold">{format(p.value)}</span></div>)}</div>
    </div>
  );
}

function Funnel({ steps }: { steps: { label: string; v: number }[] }) {
  const maxV = Math.max(...steps.map((s) => s.v), 1);
  return (
    <div className="space-y-1.5">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-2.5">
          <span className="text-[11px] text-muted-foreground w-28 shrink-0 text-right">{s.label}</span>
          <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
            <div className="h-full rounded transition-all" style={{ width: `${(s.v / maxV) * 100}%`, backgroundColor: i === 0 ? C.blue : i === steps.length - 1 ? C.green : C.amber }} />
          </div>
          <span className="text-xs font-semibold w-20 text-right tabular-nums">{num(s.v)}</span>
        </div>
      ))}
    </div>
  );
}

function BarList({ rows, color }: { rows: { key: string; value: number; right: string }[]; color: string }) {
  const maxV = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-1">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-[11px] w-20 truncate shrink-0">{r.key}</span>
          <div className="flex-1 h-4 rounded bg-muted overflow-hidden">
            <div className="h-full rounded" style={{ width: `${(r.value / maxV) * 100}%`, backgroundColor: color }} />
          </div>
          <span className="text-[10px] text-muted-foreground w-16 text-right tabular-nums">{r.right}</span>
        </div>
      ))}
    </div>
  );
}

function DataTable({ head, rows }: { head: { label: string; align?: "left" | "right" }[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-border">{head.map((h, i) => <th key={i} className={cn("pb-1.5 font-semibold text-muted-foreground uppercase tracking-wider", h.align === "right" ? "text-right" : "text-left")}>{h.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => <tr key={i} className="border-b border-border/50 last:border-0">{row.map((cell, j) => <td key={j} className={cn("py-1 tabular-nums", j > 0 ? "text-right font-medium" : "text-left")}>{cell}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

function GoogleTable({ rows, cur }: { rows: GoogleReportRow[]; cur: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-border">
            <th className="pb-1.5 font-semibold text-muted-foreground uppercase tracking-wider text-left">Termo</th>
            <th className="pb-1.5 font-semibold text-muted-foreground uppercase tracking-wider text-right">Custo</th>
            <th className="pb-1.5 font-semibold text-muted-foreground uppercase tracking-wider text-right">Impr.</th>
            <th className="pb-1.5 font-semibold text-muted-foreground uppercase tracking-wider text-right">Cliques</th>
            <th className="pb-1.5 font-semibold text-muted-foreground uppercase tracking-wider text-right">CTR</th>
            <th className="pb-1.5 font-semibold text-muted-foreground uppercase tracking-wider text-right">CPC</th>
            <th className="pb-1.5 font-semibold text-muted-foreground uppercase tracking-wider text-right">Conv.</th>
            <th className="pb-1.5 font-semibold text-muted-foreground uppercase tracking-wider text-right">CPA</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => <tr key={i} className="border-b border-border/50 last:border-0">
            <td className="py-1 text-left font-medium">{r.key}</td>
            <td className="py-1 text-right tabular-nums">{money(r.cost, cur)}</td>
            <td className="py-1 text-right tabular-nums">{num(r.impressions)}</td>
            <td className="py-1 text-right tabular-nums">{num(r.clicks)}</td>
            <td className="py-1 text-right tabular-nums">{pct(r.ctr)}</td>
            <td className="py-1 text-right tabular-nums">{money(r.cpc, cur)}</td>
            <td className="py-1 text-right tabular-nums">{num(r.conversions)}</td>
            <td className="py-1 text-right tabular-nums">{r.costPerConversion ? money(r.costPerConversion, cur) : "—"}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  );
}

function RowsTable({ rows, currency, focus, thumbs }: { rows: Row[]; currency: string; focus: Focus | null; thumbs?: boolean; }) {
  const m = (v: number) => money(v, currency);
  const result = (row: Row) => primaryRowResult(row, focus);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-border">
            {thumbs && <th className="pb-1.5 w-6" />}
            <th className="pb-1.5 font-semibold text-muted-foreground uppercase tracking-wider text-left">Nome</th>
            <th className="pb-1.5 font-semibold text-muted-foreground uppercase tracking-wider text-right">Investido</th>
            <th className="pb-1.5 font-semibold text-muted-foreground uppercase tracking-wider text-right">Impressões</th>
            <th className="pb-1.5 font-semibold text-muted-foreground uppercase tracking-wider text-right">Cliques</th>
            <th className="pb-1.5 font-semibold text-muted-foreground uppercase tracking-wider text-right">CTR</th>
            <th className="pb-1.5 font-semibold text-muted-foreground uppercase tracking-wider text-right">CPM</th>
            <th className="pb-1.5 font-semibold text-muted-foreground uppercase tracking-wider text-right">Resultado</th>
            <th className="pb-1.5 font-semibold text-muted-foreground uppercase tracking-wider text-right">Custo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const r = result(row);
            return <tr key={row.id || i} className="border-b border-border/50 last:border-0">
              {thumbs && <td className="py-1">{row.thumbnail ? <img src={row.thumbnail} alt="" className="w-6 h-6 rounded object-cover" /> : <div className="w-6 h-6 rounded bg-muted" />}</td>}
              <td className="py-1 text-left font-medium truncate max-w-[140px]" title={row.name}>{row.name}</td>
              <td className="py-1 text-right tabular-nums">{m(row.spend)}</td>
              <td className="py-1 text-right tabular-nums">{num(row.impressions)}</td>
              <td className="py-1 text-right tabular-nums">{num(row.clicks)}</td>
              <td className="py-1 text-right tabular-nums">{pct(row.ctr)}</td>
              <td className="py-1 text-right tabular-nums">{m(row.cpm)}</td>
              <td className="py-1 text-right tabular-nums font-semibold">{r ? num(r.value) : "—"}</td>
              <td className="py-1 text-right tabular-nums">{r && r.value > 0 ? m(row.spend / r.value) : "—"}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}

function PrintStyles() {
  return <style>{`
    @media print {
      @page { margin: 10mm; }
      body { background: #fff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .rpt-doc { width: 100% !important; }
      .no-print { display: none !important; }
      .recharts-surface { overflow: visible; }
    }
  `}</style>;
}
