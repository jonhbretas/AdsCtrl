"use client";

// components/ReportDocument.tsx
// Documento do relatório em PDF: capa, resumo consolidado, seção Meta Ads e
// seção Google Ads. Largura fixa de página A4 — o que aparece na tela é
// exatamente o que sai na impressão (nada de gráfico responsivo que encolhe
// na hora de imprimir).

import { createContext, useContext } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import BrandMark from "@/components/BrandMark";
import {
  money,
  moneyShort,
  num,
  pct,
  dayLabel,
  resultLabel,
  pickVal,
  delta,
  PURCHASE_KEYS,
  LINKCLICK_KEYS,
  RESULT_FAMILY_BY_SLUG,
} from "@/lib/format";

// ---------- medidas da página ----------
const PAGE_W = 700; // largura útil de um A4 retrato com margem de 10mm
const HALF = (PAGE_W - 14) / 2;

// ---------- modo de leitura ----------
// O documento nasceu com largura de A4 fixa, para o que aparece na tela ser
// exatamente o que sai impresso. No celular isso obriga a rolar de lado, então
// existe um segundo modo: mesmo conteúdo, empilhado e na largura da tela.
// Em vez de passar largura por dezenas de props, quem precisa lê do contexto.
interface LayoutInfo {
  w: number; // largura útil do documento
  compact: boolean; // empilhado (celular) em vez de A4
}
const LayoutCtx = createContext<LayoutInfo>({ w: PAGE_W, compact: false });
const useLayout = () => useContext(LayoutCtx);

// ---------- paleta ----------
const INK = "#12161f";
const MUTED = "#7c8493";
const LINE = "#e7e9ef";
const BLUE = "#2f6fe4";
const TEAL = "#17a99a";
const AMBER = "#e2a33a";
const GREEN = "#1f9254";
const RED = "#cf4a45";
const META = "#1877f2";
const GOOGLE = "#3f7ff2";

// ---------- tipos do payload de /api/report ----------
interface Vals {
  results: Record<string, number>;
  values: Record<string, number>;
}
interface Kpis extends Vals {
  spend: number;
  reach: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
}
interface Row extends Vals {
  id: string;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  reach: number;
  frequency: number;
  thumbnail?: string;
}
interface Daily extends Vals {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  reach: number;
}
interface Breakdown extends Vals {
  key: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  reach: number;
}
interface MetaDetail {
  name?: string;
  currency?: string;
  kpis: Kpis;
  prevKpis: Kpis;
  daily: Daily[];
  campaigns: Row[];
  adsets: Row[];
  ads: Row[];
  breakdowns: {
    age_gender: Breakdown[];
    region: Breakdown[];
    platform: Breakdown[];
    position: Breakdown[];
    device: Breakdown[];
    hour: Breakdown[];
    age?: Breakdown[];
    gender?: Breakdown[];
  };
  error?: string | null;
}
interface GoogleReportRow {
  key: string;
  cost: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions: number;
  conversionValue: number;
  costPerConversion: number;
  topImpressionShare?: number | null;
}
interface GoogleBlock {
  account_id: string;
  name: string;
  currency: string;
  detail: any;
  extras: {
    campaigns: GoogleReportRow[];
    adGroups: GoogleReportRow[];
    keywords: GoogleReportRow[];
    devices: GoogleReportRow[];
    ages: GoogleReportRow[];
    genders: GoogleReportRow[];
    cities: GoogleReportRow[];
    notes: string[];
  } | null;
}
export interface ReportPayload {
  generated_at: string;
  account: { account_id: string; name: string; platform: string; currency: string; status: string };
  range: { since: string; until: string };
  prevRange: { since: string; until: string };
  meta: MetaDetail | null;
  google: GoogleBlock[];
  organic_note?: string;
  // Foco do cliente (clients.result_family). Define qual resultado é lido como
  // "o resultado" — sem isso, uma conta de conversas aparece medida por leads.
  result_family?: string | null;
  error?: string;
}

// ---------- helpers ----------
const br = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const ratio = (a: number, b: number) => (b ? (a / b) * 100 : 0);
// Multiplicadores (frequência, ROAS) em pt-BR: 2,33x — não 2.33x.
const mult = (v: number) => `${v.toFixed(2).replace(".", ",")}x`;
const dec = (v: number, digits = 1) => v.toFixed(digits).replace(".", ",");
const MESSAGE_KEYS = RESULT_FAMILY_BY_SLUG.mensagens.keys;
const LEAD_KEYS = RESULT_FAMILY_BY_SLUG.leads.keys;
const REGISTER_KEYS = RESULT_FAMILY_BY_SLUG.cadastros.keys;

// ---------- foco do cliente ----------
// Rótulos curtos para a coluna das tabelas e para o custo unitário. "Conversas
// iniciadas" não cabe num cabeçalho de 66px, e "Custo por resultado" diz menos
// que "Custo por conversa".
const FOCUS_SHORT: Record<string, string> = {
  vendas: "Compras",
  mensagens: "Conversas",
  leads: "Leads",
  cadastros: "Cadastros",
  cliques: "Cliques",
  lpv: "Views de LP",
  engajamento: "Engajamento",
};
const FOCUS_COST: Record<string, string> = {
  vendas: "Custo por compra",
  mensagens: "Custo por conversa",
  leads: "Custo por lead",
  cadastros: "Custo por cadastro",
  cliques: "Custo por clique no link",
  lpv: "Custo por view de LP",
  engajamento: "Custo por engajamento",
};

interface Focus {
  slug: string;
  label: string; // "Conversas iniciadas"
  short: string; // "Conversas"
  costLabel: string; // "Custo por conversa"
  keys: string[];
}

// "conversoes" não tem action_type próprio (é o agregado da Meta): sem chaves
// não dá para ancorar nada, então vale como "sem foco" e a heurística decide.
function resolveFocus(slug?: string | null): Focus | null {
  const family = slug ? RESULT_FAMILY_BY_SLUG[slug] : null;
  if (!family || family.keys.length === 0) return null;
  return {
    slug: family.slug,
    label: family.label,
    short: FOCUS_SHORT[family.slug] || family.label,
    costLabel: FOCUS_COST[family.slug] || "Custo por resultado",
    keys: family.keys,
  };
}

export default function ReportDocument({
  data,
  compact = false,
  width,
}: {
  data: ReportPayload;
  compact?: boolean;
  width?: number;
}) {
  // No modo celular a largura vem de quem hospeda (a tela); no modo documento
  // é sempre A4, custe o que custar — é o mesmo desenho que vai para o PDF.
  const w = compact ? Math.max(280, width ?? 340) : PAGE_W;
  const { meta, google, range, prevRange, account } = data;
  const cur = account.currency || "BRL";
  const m = (v: number, digits = 2) => money(v, cur, digits);

  const metaOk = meta && !meta.error;
  const k = metaOk ? meta!.kpis : null;
  const p = metaOk ? meta!.prevKpis : null;

  // Consolidado: soma o que a Meta e o Google reportam de investimento/tráfego.
  const googleTotals = google.reduce(
    (acc, g) => {
      const gk = g.detail?.kpis;
      if (!gk) return acc;
      acc.spend += gk.spend || 0;
      acc.impressions += gk.impressions || 0;
      acc.clicks += gk.clicks || 0;
      acc.conversions += gk.results?.conversions || 0;
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
  );
  const totalSpend = (k?.spend || 0) + googleTotals.spend;
  const totalImpressions = (k?.impressions || 0) + googleTotals.impressions;
  const totalClicks = (k?.clicks || 0) + googleTotals.clicks;

  return (
    <LayoutCtx.Provider value={{ w, compact }}>
    <div style={{ width: w, margin: "0 auto", color: INK, fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif" }}>
      <PrintStyles />

      {/* ---------------- CAPA ---------------- */}
      <section style={{ paddingBottom: 18, borderBottom: `2px solid ${INK}`, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
          <BrandMark size={26} />
          <span style={{ fontSize: 13, fontWeight: 750, letterSpacing: -0.2, color: INK }}>Assertivus</span>
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.4, color: MUTED, textTransform: "uppercase" }}>
          Relatório de mídia paga
        </div>
        <h1 style={{ margin: "8px 0 2px", fontSize: compact ? 22 : 30, fontWeight: 800, letterSpacing: -0.6, lineHeight: 1.15, overflowWrap: "anywhere" }}>
          {account.name}
        </h1>
        <div style={{ fontSize: compact ? 13 : 15, color: MUTED, fontWeight: 500 }}>Análise de desempenho</div>
        <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "#4a5160", lineHeight: 1.55, maxWidth: 560 }}>
          Relatório gerado com os dados de <strong>{br(range.since)}</strong> a <strong>{br(range.until)}</strong>,
          comparado com o período anterior de mesma duração ({br(prevRange.since)} a {br(prevRange.until)}).
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          {metaOk && <SourceChip color={META} platform="Meta Ads" name={meta!.name || account.name} />}
          {google.map((g) => (
            <SourceChip key={g.account_id} color={GOOGLE} platform="Google Ads" name={g.name} />
          ))}
        </div>
      </section>

      {/* ---------------- RESUMO CONSOLIDADO ---------------- */}
      {(metaOk || google.length > 0) && (
        <Block>
          <SectionTitle color={INK} kicker="Visão geral">Resumo consolidado</SectionTitle>
          <Grid cols={4}>
            <Kpi label="Investimento total" value={m(totalSpend)} />
            <Kpi label="Impressões" value={num(totalImpressions)} />
            <Kpi label="Cliques" value={num(totalClicks)} />
            <Kpi label="CTR médio" value={pct(ratio(totalClicks, totalImpressions))} />
          </Grid>
          {totalSpend > 0 && (
            <Card title="Divisão do investimento por canal" style={{ marginTop: 12 }}>
              <SplitBar
                parts={[
                  ...(metaOk ? [{ label: "Meta Ads", value: k!.spend, color: META }] : []),
                  ...google.map((g) => ({
                    label: `Google Ads · ${g.name}`,
                    value: g.detail?.kpis?.spend || 0,
                    color: GOOGLE,
                  })),
                ]}
                total={totalSpend}
                format={(v) => m(v)}
              />
            </Card>
          )}
        </Block>
      )}

      {/* ---------------- META ADS ---------------- */}
      {meta?.error && (
        <Block>
          <SectionTitle color={META} kicker="Meta Ads">{account.name}</SectionTitle>
          <Warn>Não foi possível carregar os dados da Meta: {meta.error}</Warn>
        </Block>
      )}
      {metaOk && <MetaSection detail={meta!} currency={cur} accountName={account.name} focus={resolveFocus(data.result_family)} />}

      {/* ---------------- GOOGLE ADS ---------------- */}
      {google.map((g) => (
        <GoogleSection key={g.account_id} block={g} />
      ))}

      {/* ---------------- RODAPÉ ---------------- */}
      <footer style={{ marginTop: 26, paddingTop: 12, borderTop: `1px solid ${LINE}`, fontSize: 10, color: MUTED, lineHeight: 1.6 }}>
        <div>
          Fontes: {metaOk ? "Meta Marketing API" : ""}
          {metaOk && google.length ? " · " : ""}
          {google.length ? "Google Ads API" : ""}. Dados consultados ao vivo em{" "}
          {new Date(data.generated_at).toLocaleString("pt-BR")}.
        </div>
        {data.organic_note && <div style={{ marginTop: 3 }}>{data.organic_note}</div>}
        <div style={{ marginTop: 3 }}>Gerado por Assertivus Dash.</div>
      </footer>
    </div>
    </LayoutCtx.Provider>
  );
}

// ==========================================================================
// SEÇÃO META ADS
// ==========================================================================

function MetaSection({
  detail,
  currency,
  accountName,
  focus,
}: {
  detail: MetaDetail;
  currency: string;
  accountName: string;
  focus: Focus | null;
}) {
  const k = detail.kpis;
  const p = detail.prevKpis;
  const m = (v: number, digits = 2) => money(v, currency, digits);
  const b = detail.breakdowns;
  // Recharts exige largura em número: nada de gráfico responsivo, que encolhe
  // na hora de imprimir. Empilhado, o gráfico de meia página ocupa a tela toda.
  const { w: pageW, compact } = useLayout();
  const fullChart = pageW - 34;
  const halfChart = compact ? pageW - 34 : HALF - 34;

  const linkClicks = pickVal(k.results, LINKCLICK_KEYS);
  const prevLinkClicks = pickVal(p.results, LINKCLICK_KEYS);
  const linkCtr = ratio(linkClicks, k.impressions);
  const prevLinkCtr = ratio(prevLinkClicks, p.impressions);
  const cpc = k.clicks ? k.spend / k.clicks : 0;
  const prevCpc = p.clicks ? p.spend / p.clicks : 0;
  const freq = k.reach ? k.impressions / k.reach : 0;
  const prevFreq = p.reach ? p.impressions / p.reach : 0;
  const purchases = pickVal(k.results, PURCHASE_KEYS);
  const purchaseValue = pickVal(k.values, PURCHASE_KEYS);
  const prevPurchaseValue = pickVal(p.values, PURCHASE_KEYS);
  const leads = pickVal(k.results, LEAD_KEYS) + pickVal(k.results, REGISTER_KEYS);
  const prevLeads = pickVal(p.results, LEAD_KEYS) + pickVal(p.results, REGISTER_KEYS);
  const messages = pickVal(k.results, MESSAGE_KEYS);
  const prevMessages = pickVal(p.results, MESSAGE_KEYS);

  // O resultado que o cliente contratou abre a grade e vira a coluna
  // "Resultado" das tabelas. O resto continua no relatório, mas para de
  // disputar o papel de métrica principal.
  const focusValue = focus ? pickVal(k.results, focus.keys) : 0;
  const prevFocusValue = focus ? pickVal(p.results, focus.keys) : 0;
  const showFocus = Boolean(focus) && focusValue > 0;

  const daily = detail.daily.map((d) => ({
    label: dayLabel(d.date),
    spend: d.spend,
    clicks: d.clicks,
    ctr: d.ctr,
    impressions: d.impressions,
  }));

  // Ações por tipo, com custo por ação. A Meta repete a mesma ação numa versão
  // "omni_" (soma de canais): fica de fora quando a chave base já está na lista.
  const actions = Object.entries(k.results)
    .filter(([type, total]) => total > 0 && !(type.startsWith("omni_") && k.results[type.slice(5)] != null))
    .sort((a, c) => c[1] - a[1])
    .slice(0, 12);

  const platform = b.platform.filter((row) => row.impressions > 0);
  const funnel = [
    { label: "Impressões", v: k.impressions },
    { label: "Alcance", v: k.reach },
    { label: "Cliques", v: k.clicks },
    { label: "Cliques no link", v: linkClicks },
    ...(messages > 0 ? [{ label: "Conversas iniciadas", v: messages }] : []),
    ...(leads > 0 ? [{ label: "Cadastros / leads", v: leads }] : []),
    ...(purchases > 0 ? [{ label: "Compras", v: purchases }] : []),
  ].filter((s) => s.v > 0);

  return (
    <>
      <Block>
        <SectionTitle color={META} kicker="Meta Ads · Facebook e Instagram">{detail.name || accountName}</SectionTitle>

        <Grid cols={4}>
          {showFocus && focus && (
            <>
              <Kpi
                label={focus.label}
                value={num(focusValue)}
                cur={focusValue}
                prev={prevFocusValue}
                prevText={num(prevFocusValue)}
                accent
              />
              <Kpi
                label={focus.costLabel}
                value={m(k.spend / focusValue)}
                cur={k.spend / focusValue}
                prev={prevFocusValue ? p.spend / prevFocusValue : undefined}
                prevText={prevFocusValue ? m(p.spend / prevFocusValue) : undefined}
                invert
                accent
              />
            </>
          )}
          <Kpi label="Valor investido" value={m(k.spend)} cur={k.spend} prev={p.spend} prevText={m(p.spend)} neutral />
          <Kpi label="Impressões" value={num(k.impressions)} cur={k.impressions} prev={p.impressions} prevText={num(p.impressions)} />
          <Kpi label="Alcance" value={num(k.reach)} cur={k.reach} prev={p.reach} prevText={num(p.reach)} />
          <Kpi label="Frequência" value={mult(freq)} cur={freq} prev={prevFreq} prevText={mult(prevFreq)} invert />
          <Kpi label="Total de cliques" value={num(k.clicks)} cur={k.clicks} prev={p.clicks} prevText={num(p.clicks)} />
          <Kpi label="Cliques no link" value={num(linkClicks)} cur={linkClicks} prev={prevLinkClicks} prevText={num(prevLinkClicks)} />
          <Kpi label="CTR (link)" value={pct(linkCtr)} cur={linkCtr} prev={prevLinkCtr} prevText={pct(prevLinkCtr)} />
          <Kpi label="CPC médio" value={m(cpc)} cur={cpc} prev={prevCpc} prevText={m(prevCpc)} invert />
          <Kpi label="CPM médio" value={m(k.cpm)} cur={k.cpm} prev={p.cpm} prevText={m(p.cpm)} invert />
          {messages > 0 && focus?.slug !== "mensagens" && (
            <>
              <Kpi label="Conversas iniciadas" value={num(messages)} cur={messages} prev={prevMessages} prevText={num(prevMessages)} />
              <Kpi
                label="Custo por conversa"
                value={messages ? m(k.spend / messages) : "—"}
                cur={messages ? k.spend / messages : undefined}
                prev={prevMessages ? p.spend / prevMessages : undefined}
                prevText={prevMessages ? m(p.spend / prevMessages) : undefined}
                invert
              />
            </>
          )}
          {leads > 0 && focus?.slug !== "leads" && (
            <>
              <Kpi label="Cadastros / leads" value={num(leads)} cur={leads} prev={prevLeads} prevText={num(prevLeads)} />
              <Kpi
                label="Custo por lead"
                value={leads ? m(k.spend / leads) : "—"}
                cur={leads ? k.spend / leads : undefined}
                prev={prevLeads ? p.spend / prevLeads : undefined}
                prevText={prevLeads ? m(p.spend / prevLeads) : undefined}
                invert
              />
            </>
          )}
          {purchaseValue > 0 && (
            <>
              {focus?.slug !== "vendas" && <Kpi label="Compras" value={num(purchases)} />}
              <Kpi
                label="ROAS"
                value={k.spend ? mult(purchaseValue / k.spend) : "—"}
                cur={k.spend ? purchaseValue / k.spend : undefined}
                prev={p.spend ? prevPurchaseValue / p.spend : undefined}
                prevText={p.spend ? mult(prevPurchaseValue / p.spend) : undefined}
              />
              <Kpi label="Valor de compra" value={m(purchaseValue)} cur={purchaseValue} prev={prevPurchaseValue} prevText={m(prevPurchaseValue)} />
            </>
          )}
        </Grid>
      </Block>

      {funnel.length > 1 && (
        <Block>
          <Card title="Funil do período">
            <Funnel steps={funnel} />
          </Card>
        </Block>
      )}

      <Block>
        <Card title="Investimento por dia">
          <ComposedChart width={fullChart} height={190} data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={LINE} />
            <XAxis dataKey="label" tick={{ fontSize: 9.5, fill: MUTED }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 9.5, fill: MUTED }} tickLine={false} axisLine={false} width={54} tickFormatter={(v) => moneyShort(v, currency)} />
            <Tooltip formatter={(v: any) => money(Number(v), currency)} />
            <Bar dataKey="spend" name="Investimento" fill={TEAL} radius={[3, 3, 0, 0]} maxBarSize={40} isAnimationActive={false} />
          </ComposedChart>
        </Card>
      </Block>

      <Block>
        <Row2>
          <Card title="Cliques e CTR ao longo do tempo" width={HALF}>
            <ComposedChart width={halfChart} height={170} data={daily} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={LINE} />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: MUTED }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="l" tick={{ fontSize: 9, fill: MUTED }} tickLine={false} axisLine={false} width={40} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 9, fill: MUTED }} tickLine={false} axisLine={false} width={32} tickFormatter={(v) => `${v}%`} />
              <Tooltip />
              <Bar yAxisId="l" dataKey="clicks" name="Cliques" fill={BLUE} radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false} />
              <Line yAxisId="r" type="monotone" dataKey="ctr" name="CTR" stroke={AMBER} strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </Card>
          <Card title="Impressões por hora do dia" width={HALF}>
            <BarChart
              width={halfChart}
              height={170}
              data={b.hour.map((h) => ({ label: h.key, v: h.impressions }))}
              margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={LINE} />
              <XAxis dataKey="label" tick={{ fontSize: 8, fill: MUTED }} tickLine={false} axisLine={false} interval={2} />
              <YAxis tick={{ fontSize: 9, fill: MUTED }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => num(v)} />
              <Tooltip formatter={(v: any) => num(Number(v))} />
              <Bar dataKey="v" name="Impressões" fill={BLUE} radius={[2, 2, 0, 0]} maxBarSize={14} isAnimationActive={false} />
            </BarChart>
          </Card>
        </Row2>
      </Block>

      {actions.length > 0 && (
        <Block>
          <Card title="Conversões e ações por tipo" keep={false}>
            <DataTable
              head={[
                { label: "Tipo de ação" },
                { label: "Total", align: "right" },
                { label: "Custo por ação", align: "right" },
              ]}
              rows={actions.map(([type, total]) => [
                resultLabel(type),
                num(total),
                total ? m(k.spend / total) : "—",
              ])}
            />
          </Card>
        </Block>
      )}

      <Block>
        <Row2>
          {b.age && b.age.length > 0 && (
            <Card title="Impressões e alcance por idade" width={HALF}>
              <BarChart
                width={halfChart}
                height={170}
                data={b.age.map((r) => ({ label: ageLabel(r.key), imp: r.impressions, reach: r.reach }))}
                margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={LINE} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: MUTED }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: MUTED }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => num(v)} />
                <Tooltip formatter={(v: any) => num(Number(v))} />
                <Bar dataKey="imp" name="Impressões" fill={BLUE} radius={[2, 2, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                <Bar dataKey="reach" name="Alcance" fill={TEAL} radius={[2, 2, 0, 0]} maxBarSize={22} isAnimationActive={false} />
              </BarChart>
            </Card>
          )}
          <Card title="Alcance por região (top 8)" width={HALF}>
            <BarList
              rows={[...b.region]
                .sort((a, z) => (z.reach || z.impressions) - (a.reach || a.impressions))
                .slice(0, 8)
                .map((r) => ({ key: regionLabel(r.key), value: r.reach || r.impressions, right: num(r.reach || r.impressions) }))}
              color={AMBER}
            />
          </Card>
        </Row2>
      </Block>

      <Block>
        <Row2>
          {b.gender && b.gender.length > 0 && (
            <Card title="Impressões e alcance por gênero" width={HALF}>
              <BarList
                rows={b.gender.map((r) => ({
                  key: genderLabel(r.key),
                  value: r.impressions,
                  right: `${num(r.impressions)} impr · ${num(r.reach)} alc`,
                }))}
                color={BLUE}
              />
            </Card>
          )}
          <Card title="Alcance por dispositivo" width={HALF}>
            <BarList
              rows={b.device.map((r) => ({ key: deviceLabel(r.key), value: r.reach || r.impressions, right: num(r.reach || r.impressions) }))}
              color={TEAL}
            />
          </Card>
        </Row2>
      </Block>

      {platform.length > 0 && (
        <Block>
          <Card title="Facebook × Instagram" keep={false}>
            <DataTable
              head={[
                { label: "Plataforma" },
                { label: "Investido", align: "right" },
                { label: "Alcance", align: "right" },
                { label: "Impressões", align: "right" },
                { label: "Cliques", align: "right" },
                { label: "CTR", align: "right" },
                { label: "CPM", align: "right" },
              ]}
              rows={platform.map((r) => [
                platformLabel(r.key),
                m(r.spend),
                num(r.reach),
                num(r.impressions),
                num(r.clicks),
                pct(ratio(r.clicks, r.impressions)),
                m(r.cpm),
              ])}
            />
          </Card>
        </Block>
      )}

      <Block>
        <Card title="Campanhas em destaque" keep={false}>
          <RowsTable rows={detail.campaigns.slice(0, 10)} currency={currency} focus={focus} />
        </Card>
      </Block>

      <Block>
        <Card title="Conjuntos de anúncios em destaque" keep={false}>
          <RowsTable rows={detail.adsets.slice(0, 10)} currency={currency} focus={focus} />
        </Card>
      </Block>

      <Block>
        <Card title="Anúncios em destaque" keep={false}>
          <RowsTable rows={detail.ads.slice(0, 10)} currency={currency} thumbs focus={focus} />
        </Card>
      </Block>
    </>
  );
}

// Resultado principal de uma linha (o que a campanha entregou de mais relevante).
// Com foco configurado, ele manda: se a linha entregou aquilo, é aquilo que
// aparece — nada de uma campanha de conversas ser lida por um lead avulso do
// pixel só porque "lead" vem antes na lista.
// Sem foco, a API não diz qual era o objetivo da campanha, então cai na
// prioridade por tipo de conversão — e só quando o volume faz sentido para a
// linha: uma campanha de tráfego com 25 mil cliques e 4 conversas incidentais
// deve aparecer como cliques, não como conversas.
function primaryRowResult(row: Row, focus: Focus | null): { label: string; value: number } | null {
  if (focus) {
    const v = pickVal(row.results, focus.keys);
    if (v > 0) return { label: focus.short, value: v };
  }
  const conversionTiers: [string[], string][] = [
    [PURCHASE_KEYS, "Compras"],
    [LEAD_KEYS, "Leads"],
    [REGISTER_KEYS, "Cadastros"],
    [MESSAGE_KEYS, "Conversas"],
  ];
  const floor = Math.max(1, row.clicks * 0.01);
  for (const [keys, label] of conversionTiers) {
    const v = pickVal(row.results, keys);
    if (v >= floor) return { label, value: v };
  }
  const trafficTiers: [string[], string][] = [
    [LINKCLICK_KEYS, "Cliques no link"],
    [["video_view"], "Views de vídeo"],
    [["landing_page_view"], "Views de LP"],
  ];
  for (const [keys, label] of trafficTiers) {
    const v = pickVal(row.results, keys);
    if (v > 0) return { label, value: v };
  }
  const best = Object.entries(row.results)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])[0];
  return best ? { label: resultLabel(best[0]), value: best[1] } : null;
}

function RowsTable({
  rows,
  currency,
  thumbs,
  focus,
}: {
  rows: Row[];
  currency: string;
  thumbs?: boolean;
  focus: Focus | null;
}) {
  const m = (v: number) => money(v, currency);
  const { compact } = useLayout();
  if (rows.length === 0) return <Empty>Sem dados no período.</Empty>;

  const results = rows.map((r) => primaryRowResult(r, focus));
  // O cabeçalho só nomeia a métrica quando TODA linha visível está medindo
  // aquilo. Se alguma caiu na heurística, "Conversas" no topo com "Cliques no
  // link" na célula seria mentira — nesse caso fica o genérico.
  const uniform =
    focus != null &&
    results.some((res) => res?.label === focus.short) &&
    results.every((res) => res == null || res.label === focus.short);

  return (
    <DataTable
      head={[
        // Larguras somadas cabem na página: dez colunas em A4 não têm folga.
        { label: "Nome", width: 132 },
        { label: uniform && focus ? focus.short : "Resultado", align: "right", width: 66 },
        { label: "Custo/res.", align: "right", width: 52 },
        { label: "Investido", align: "right", width: 62 },
        { label: "CTR", align: "right", width: 36 },
        { label: "CPC", align: "right", width: 44 },
        { label: "CPM", align: "right", width: 44 },
        { label: "Alcance", align: "right", width: 50 },
        { label: "Impr.", align: "right", width: 50 },
        { label: "Freq.", align: "right", width: 34 },
      ]}
      rows={rows.map((r, i) => {
        const res = results[i];
        const freq = r.frequency || (r.reach ? r.impressions / r.reach : 0);
        return [
          <span key="n" style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
            {thumbs && r.thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.thumbnail} alt="" width={20} height={20} style={{ borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />
            )}
            {/* Na tabela A4 o nome é cortado com reticências para a linha caber.
                No cartão de celular ele é o título: quebra em duas linhas em vez
                de esticar a caixa além da tela. */}
            <span
              style={
                compact
                  ? { overflowWrap: "anywhere", minWidth: 0 }
                  : { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
              }
              title={r.name}
            >
              {r.name}
            </span>
          </span>,
          res ? (
            <span key="r">
              <strong>{num(res.value)}</strong>
              <span style={{ display: "block", fontSize: 8.5, color: MUTED }}>{res.label}</span>
            </span>
          ) : "—",
          res && res.value ? m(r.spend / res.value) : "—",
          m(r.spend),
          pct(r.ctr),
          r.clicks ? m(r.spend / r.clicks) : "—",
          m(r.cpm),
          num(r.reach),
          num(r.impressions),
          freq ? mult(freq) : "—",
        ];
      })}
    />
  );
}

// ==========================================================================
// SEÇÃO GOOGLE ADS
// ==========================================================================

function GoogleSection({ block }: { block: GoogleBlock }) {
  const currency = block.currency || "BRL";
  const m = (v: number, digits = 2) => money(v, currency, digits);
  const detail = block.detail;
  const extras = block.extras;

  if (detail?.error) {
    return (
      <Block>
        <SectionTitle color={GOOGLE} kicker="Google Ads">{block.name}</SectionTitle>
        <Warn>Não foi possível carregar os dados do Google Ads: {detail.error}</Warn>
      </Block>
    );
  }
  const k = detail?.kpis;
  const p = detail?.prevKpis;
  if (!k) return null;

  const conversions = k.results?.conversions || 0;
  const prevConversions = p?.results?.conversions || 0;
  const value = k.values?.conversions || 0;
  const prevValue = p?.values?.conversions || 0;
  const cpc = k.clicks ? k.spend / k.clicks : 0;
  const prevCpc = p?.clicks ? p.spend / p.clicks : 0;
  const convRate = ratio(conversions, k.clicks);
  const prevConvRate = ratio(prevConversions, p?.clicks || 0);
  const daily = (detail.daily || []).map((d: any) => ({
    label: dayLabel(d.date),
    spend: d.spend,
    clicks: d.clicks,
  }));
  const { w: pageW } = useLayout();

  return (
    <>
      <Block>
        <SectionTitle color={GOOGLE} kicker="Google Ads">{block.name}</SectionTitle>
        <Grid cols={4}>
          <Kpi label="Custo" value={m(k.spend)} cur={k.spend} prev={p?.spend} prevText={p ? m(p.spend) : undefined} neutral />
          <Kpi label="Impressões" value={num(k.impressions)} cur={k.impressions} prev={p?.impressions} prevText={p ? num(p.impressions) : undefined} />
          <Kpi label="Cliques" value={num(k.clicks)} cur={k.clicks} prev={p?.clicks} prevText={p ? num(p.clicks) : undefined} />
          <Kpi label="CTR" value={pct(k.ctr)} cur={k.ctr} prev={p?.ctr} prevText={p ? pct(p.ctr) : undefined} />
          <Kpi label="CPC médio" value={m(cpc)} cur={cpc} prev={prevCpc} prevText={m(prevCpc)} invert />
          <Kpi label="CPM médio" value={m(k.cpm)} cur={k.cpm} prev={p?.cpm} prevText={p ? m(p.cpm) : undefined} invert />
          <Kpi label="Conversões" value={num(conversions)} cur={conversions} prev={prevConversions} prevText={num(prevConversions)} />
          <Kpi
            label="Custo por conversão"
            value={conversions ? m(k.spend / conversions) : "—"}
            cur={conversions ? k.spend / conversions : undefined}
            prev={prevConversions ? p.spend / prevConversions : undefined}
            prevText={prevConversions ? m(p.spend / prevConversions) : undefined}
            invert
          />
          <Kpi label="Taxa de conversão" value={pct(convRate)} cur={convRate} prev={prevConvRate} prevText={pct(prevConvRate)} />
          {value > 0 && (
            <>
              <Kpi label="Valor de conversão" value={m(value)} cur={value} prev={prevValue} prevText={m(prevValue)} />
              <Kpi
                label="ROAS"
                value={k.spend ? mult(value / k.spend) : "—"}
                cur={k.spend ? value / k.spend : undefined}
                prev={p?.spend ? prevValue / p.spend : undefined}
                prevText={p?.spend ? mult(prevValue / p.spend) : undefined}
              />
            </>
          )}
        </Grid>
      </Block>

      {daily.length > 0 && (
        <Block>
          <Card title="Custo e cliques ao longo do tempo">
            <ComposedChart width={pageW - 34} height={180} data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={LINE} />
              <XAxis dataKey="label" tick={{ fontSize: 9.5, fill: MUTED }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="l" tick={{ fontSize: 9.5, fill: MUTED }} tickLine={false} axisLine={false} width={54} tickFormatter={(v) => moneyShort(v, currency)} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 9.5, fill: MUTED }} tickLine={false} axisLine={false} width={40} />
              <Tooltip />
              <Bar yAxisId="l" dataKey="spend" name="Custo" fill={GOOGLE} radius={[3, 3, 0, 0]} maxBarSize={40} isAnimationActive={false} />
              <Line yAxisId="r" type="monotone" dataKey="clicks" name="Cliques" stroke={AMBER} strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </Card>
        </Block>
      )}

      {extras && extras.campaigns.length > 0 && (
        <Block>
          <Card title="Todas as campanhas" keep={false}>
            <GoogleTable rows={extras.campaigns} currency={currency} label="Campanha" share />
          </Card>
        </Block>
      )}

      {extras && extras.adGroups.length > 0 && (
        <Block>
          <Card title="Grupos de anúncios" keep={false}>
            <GoogleTable rows={extras.adGroups.slice(0, 10)} currency={currency} label="Grupo" share />
          </Card>
        </Block>
      )}

      {extras && extras.keywords.length > 0 && (
        <Block>
          <Card title="Palavras-chave de pesquisa" keep={false}>
            <GoogleTable rows={extras.keywords.slice(0, 15)} currency={currency} label="Palavra-chave" share />
          </Card>
        </Block>
      )}

      {extras && (extras.devices.length > 0 || extras.cities.length > 0) && (
        <Block>
          <Row2>
            {extras.devices.length > 0 && (
              <Card title="Desempenho por dispositivo" width={HALF}>
                <BarList
                  rows={extras.devices.map((d) => ({ key: d.key, value: d.cost, right: `${m(d.cost)} · ${num(d.clicks)} cliques` }))}
                  color={GOOGLE}
                />
              </Card>
            )}
            {extras.cities.length > 0 && (
              <Card title="Desempenho por cidade (top 8)" width={HALF}>
                <BarList
                  rows={extras.cities.slice(0, 8).map((c) => ({ key: c.key, value: c.cost, right: `${m(c.cost)} · ${num(c.conversions)} conv` }))}
                  color={TEAL}
                />
              </Card>
            )}
          </Row2>
        </Block>
      )}

      {extras && (extras.ages.length > 0 || extras.genders.length > 0) && (
        <Block>
          <Row2>
            {extras.ages.length > 0 && (
              <Card title="Impressões por idade" width={HALF}>
                <BarList rows={extras.ages.map((a) => ({ key: a.key, value: a.impressions, right: num(a.impressions) }))} color={BLUE} />
              </Card>
            )}
            {extras.genders.length > 0 && (
              <Card title="Impressões por gênero" width={HALF}>
                <BarList rows={extras.genders.map((g) => ({ key: g.key, value: g.impressions, right: num(g.impressions) }))} color={AMBER} />
              </Card>
            )}
          </Row2>
        </Block>
      )}

      {extras && extras.notes.length > 0 && (
        <Block>
          <div style={{ fontSize: 9.5, color: MUTED }}>
            Blocos não disponíveis nesta conta: {extras.notes.join(" · ")}
          </div>
        </Block>
      )}
    </>
  );
}

function GoogleTable({
  rows,
  currency,
  label,
  share,
}: {
  rows: GoogleReportRow[];
  currency: string;
  label: string;
  share?: boolean;
}) {
  const m = (v: number) => money(v, currency);
  return (
    <DataTable
      head={[
        { label, width: 168 },
        { label: "Custo", align: "right", width: 62 },
        { label: "Impr.", align: "right", width: 52 },
        { label: "Cliques", align: "right", width: 50 },
        { label: "CTR", align: "right", width: 40 },
        { label: "CPC", align: "right", width: 44 },
        { label: "Conv.", align: "right", width: 44 },
        { label: "Custo/conv.", align: "right", width: 56 },
        ...(share ? [{ label: "1ª pos.", align: "right" as const, width: 44 }] : []),
      ]}
      rows={rows.map((r) => [
        <span key="k" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.key}>
          {r.key}
        </span>,
        m(r.cost),
        num(r.impressions),
        num(r.clicks),
        pct(r.ctr),
        m(r.cpc),
        r.conversions ? r.conversions.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "0",
        r.conversions ? m(r.costPerConversion) : "—",
        ...(share ? [r.topImpressionShare == null ? "—" : pct(r.topImpressionShare)] : []),
      ])}
    />
  );
}

// ==========================================================================
// PEÇAS VISUAIS
// ==========================================================================

function PrintStyles() {
  return (
    <style>{`
      @page { size: A4 portrait; margin: 10mm; }
      @media print {
        html, body { background: #fff !important; }
        .no-print { display: none !important; }
        /* Fluidez: o documento corre entre as páginas em vez de forçar quebra
           a cada seção — quebra forçada deixa meia página vazia e parece erro.
           Só não se parte o que fica ilegível cortado: gráficos, listas e
           cartões de indicador. Tabela longa pode dividir, e o cabeçalho dela
           se repete na página seguinte, que é o que faz a divisão parecer
           intencional. */
        .rpt-keep { break-inside: avoid; page-break-inside: avoid; }
        .rpt-title { break-after: avoid; page-break-after: avoid; }
        table { break-inside: auto; }
        thead { display: table-header-group; }
        tr { break-inside: avoid; page-break-inside: avoid; }
        .rpt-card { box-shadow: none !important; }
      }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    `}</style>
  );
}

function Block({ children }: { children: React.ReactNode }) {
  return <div style={{ marginBottom: 14 }}>{children}</div>;
}

// Cada card fica com a altura do próprio conteúdo. Esticar os dois até a
// altura do maior deixava caixas com metade do corpo vazio.
function Row2({ children }: { children: React.ReactNode }) {
  const { compact } = useLayout();
  // No celular os dois cartões viram um embaixo do outro.
  return (
    <div style={{ display: "flex", flexDirection: compact ? "column" : "row", gap: 14, alignItems: "flex-start" }}>
      {children}
    </div>
  );
}

function Grid({ cols, children }: { cols: number; children: React.ReactNode }) {
  const { compact } = useLayout();
  // Quatro indicadores lado a lado numa tela de 360px viram quatro tarjas
  // ilegíveis; duas colunas ainda mostram o número inteiro.
  const n = compact ? Math.min(2, cols) : cols;
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gap: 8 }}>{children}</div>;
}

function SectionTitle({ children, kicker, color }: { children: React.ReactNode; kicker: string; color: string }) {
  return (
    <div className="rpt-title" style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 12px" }}>
      <span style={{ width: 5, height: 34, borderRadius: 3, background: color, flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color }}>{kicker}</div>
        <div style={{ fontSize: 18, fontWeight: 750, letterSpacing: -0.3 }}>{children}</div>
      </div>
    </div>
  );
}

function SourceChip({ platform, name, color }: { platform: string; name: string; color: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 11px", borderRadius: 9, border: `1px solid ${color}33`, background: `${color}0f` }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
      <span style={{ fontSize: 10.5, fontWeight: 750, color }}>{platform}</span>
      <span style={{ fontSize: 10.5, color: "#4a5160" }}>{name}</span>
    </span>
  );
}

// keep = o cartão não pode ser dividido entre duas páginas. É o padrão:
// gráfico ou lista cortada ao meio parece defeito. Cartões de tabela passam
// keep={false} para a tabela poder fluir, repetindo o cabeçalho.
function Card({
  title,
  children,
  width,
  style,
  keep = true,
}: {
  title?: string;
  children: React.ReactNode;
  width?: number;
  style?: React.CSSProperties;
  keep?: boolean;
}) {
  const { compact } = useLayout();
  // Empilhado, o cartão ocupa a largura toda: metade de uma tela de celular
  // não comporta gráfico nenhum.
  const cardWidth = compact ? undefined : width;
  return (
    <div
      className={`rpt-card${keep ? " rpt-keep" : ""}`}
      style={{
        width: cardWidth,
        alignSelf: compact ? "stretch" : undefined,
        flex: cardWidth ? "0 0 auto" : undefined,
        border: `1px solid ${LINE}`,
        borderRadius: 10,
        background: "#fff",
        padding: 12,
        ...style,
      }}
    >
      {title && (
        <div
          className="rpt-title"
          style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: MUTED, marginBottom: 10 }}
        >
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

function Kpi({
  label,
  value,
  cur,
  prev,
  prevText,
  invert,
  neutral,
  accent,
}: {
  label: string;
  value: string;
  cur?: number;
  prev?: number;
  prevText?: string;
  invert?: boolean;
  neutral?: boolean;
  accent?: boolean;
}) {
  const d = cur != null && prev != null ? delta(cur, prev) : null;
  const up = d ? d.pct >= 0 : false;
  const good = invert ? !up : up;
  const color = !d || !d.hasPrev || neutral || Math.abs(d.pct) < 0.05 ? MUTED : good ? GREEN : RED;
  return (
    <div
      className="rpt-keep"
      style={{
        // accent = o resultado que o cliente contratou; precisa se distinguir
        // dos outros doze indicadores à primeira vista, inclusive impresso.
        border: `1px solid ${accent ? `${TEAL}66` : LINE}`,
        borderRadius: 10,
        padding: "10px 11px",
        background: accent ? `${TEAL}0d` : "#fff",
      }}
    >
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.3, color: accent ? TEAL : MUTED, textTransform: "uppercase", lineHeight: 1.3, minHeight: 22 }}>
        {label}
      </div>
      <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.5, marginTop: 3 }}>{value}</div>
      {d?.hasPrev && (
        <div style={{ fontSize: 10, fontWeight: 750, color, marginTop: 2 }}>
          {up ? "▲" : "▼"} {Math.abs(d.pct).toFixed(2).replace(".", ",")}%
        </div>
      )}
      {prevText && <div style={{ fontSize: 9, color: "#a3a9b5", marginTop: 1 }}>{prevText} no período anterior</div>}
    </div>
  );
}

function Funnel({ steps }: { steps: { label: string; v: number }[] }) {
  const top = steps[0]?.v || 1;
  const { compact } = useLayout();
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {steps.map((s, i) => {
        const w = Math.max(2, Math.round((s.v / top) * 100));
        const conv = i > 0 && steps[i - 1].v ? (s.v / steps[i - 1].v) * 100 : null;
        // Barra curta não comporta o número dentro dela: escreve ao lado.
        const inside = w >= 14;
        return (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: compact ? 6 : 10 }}>
            <span style={{ width: compact ? 74 : 118, flexShrink: 0, fontSize: compact ? 9.5 : 10.5, color: "#4a5160", lineHeight: 1.2 }}>{s.label}</span>
            <div style={{ flex: 1, background: "#f2f4f7", borderRadius: 5, height: 22, display: "flex", alignItems: "center" }}>
              <div
                style={{
                  width: `${w}%`,
                  height: "100%",
                  background: `linear-gradient(90deg, ${BLUE}, ${TEAL})`,
                  borderRadius: 5,
                  display: "flex",
                  alignItems: "center",
                  paddingLeft: inside ? 8 : 0,
                  color: "#fff",
                  fontSize: 10.5,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {inside ? num(s.v) : ""}
              </div>
              {!inside && <span style={{ fontSize: 10.5, fontWeight: 700, color: INK, marginLeft: 7 }}>{num(s.v)}</span>}
            </div>
            <span style={{ width: 52, textAlign: "right", fontSize: 9.5, color: conv == null ? "transparent" : MUTED }}>
              {conv == null ? "—" : `${dec(conv)}%`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SplitBar({
  parts,
  total,
  format,
}: {
  parts: { label: string; value: number; color: string }[];
  total: number;
  format: (v: number) => string;
}) {
  const visible = parts.filter((p) => p.value > 0);
  return (
    <div>
      <div style={{ display: "flex", height: 16, borderRadius: 5, overflow: "hidden", background: "#f2f4f7" }}>
        {visible.map((p, i) => (
          <div key={i} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
        {visible.map((p, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, color: "#4a5160" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
            {p.label}
            <strong style={{ color: INK }}>{format(p.value)}</strong>
            <span style={{ color: MUTED }}>({dec((p.value / total) * 100)}%)</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function BarList({ rows, color }: { rows: { key: string; value: number; right: string }[]; color: string }) {
  // Ordena pela barra mostrada: lista fora de ordem parece erro de dado.
  const data = rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...data.map((r) => r.value));
  const { compact } = useLayout();
  if (data.length === 0) return <Empty>Sem dados no período.</Empty>;
  // No celular, rótulo e números ficam acima da barra: lado a lado sobrariam
  // uns 60px para a barra, que deixa de significar qualquer coisa.
  if (compact) {
    return (
      <div style={{ display: "grid", gap: 9 }}>
        {data.map((r) => (
          <div key={r.key}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 10.5, marginBottom: 3 }}>
              <span style={{ color: "#4a5160", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.key}>
                {r.key}
              </span>
              <span style={{ color: INK, fontWeight: 600, whiteSpace: "nowrap" }}>{r.right}</span>
            </div>
            <div style={{ height: 7, background: "#f2f4f7", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: `${Math.round((r.value / max) * 100)}%`, height: "100%", background: color, borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gap: 7 }}>
      {data.map((r) => (
        <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 92, fontSize: 10, color: "#4a5160", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.key}>
            {r.key}
          </span>
          <div style={{ flex: 1, height: 7, background: "#f2f4f7", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: `${Math.round((r.value / max) * 100)}%`, height: "100%", background: color, borderRadius: 4 }} />
          </div>
          <span style={{ fontSize: 9.5, color: INK, fontWeight: 600, width: 120, textAlign: "right" }}>{r.right}</span>
        </div>
      ))}
    </div>
  );
}

function DataTable({
  head,
  rows,
}: {
  head: { label: string; align?: "left" | "right"; width?: number }[];
  rows: React.ReactNode[][];
}) {
  const { compact } = useLayout();
  if (rows.length === 0) return <Empty>Sem dados no período.</Empty>;

  // Dez colunas não cabem numa tela de celular por nenhum arranjo de largura.
  // Em vez de encolher a fonte até o ilegível ou obrigar a rolar de lado, cada
  // linha vira um cartão: a primeira coluna é o título e o resto vira par
  // rótulo/valor. Mesmos dados, mesma ordem — muda só o empacotamento.
  if (compact) {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((cells, i) => (
          <div key={i} className="rpt-keep" style={{ border: `1px solid ${LINE}`, borderRadius: 9, padding: "9px 10px", background: "#fff" }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 7, lineHeight: 1.3, overflowWrap: "anywhere" }}>
              {cells[0]}
            </div>
            {/* minmax(0,1fr): sem isso a coluna não encolhe abaixo do rótulo
                mais comprido e o cartão vaza alguns pixels em telas de 360px. */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "4px 12px" }}>
              {cells.slice(1).map((cell, j) => (
                <div key={j} style={{ display: "flex", justifyContent: "space-between", gap: 6, fontSize: 10.5, lineHeight: 1.35, minWidth: 0 }}>
                  <span style={{ color: MUTED, overflowWrap: "anywhere" }}>{head[j + 1]?.label}</span>
                  <span style={{ fontWeight: 600, textAlign: "right", overflowWrap: "anywhere" }}>{cell}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
  // Tabela com dez colunas em uma página A4 não perdoa: os valores ficam com
  // nowrap (número quebrado é ilegível), mas o cabeçalho pode quebrar em duas
  // linhas e o respiro é curto — senão a tabela vaza para fora do card.
  return (
    <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", fontSize: 9.5 }}>
      <thead>
        <tr>
          {head.map((h, i) => (
            <th
              key={i}
              style={{
                textAlign: h.align === "right" ? "right" : "left",
                width: h.width,
                padding: "0 5px 6px",
                fontSize: 8,
                fontWeight: 800,
                letterSpacing: 0.2,
                textTransform: "uppercase",
                color: MUTED,
                borderBottom: `1px solid ${LINE}`,
                lineHeight: 1.2,
              }}
            >
              {h.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ background: i % 2 ? "#fafbfc" : "#fff" }}>
            {row.map((cell, j) => (
              <td
                key={j}
                style={{
                  textAlign: head[j]?.align === "right" ? "right" : "left",
                  padding: "5px",
                  borderBottom: `1px solid ${LINE}`,
                  color: j === 0 ? INK : "#39404e",
                  fontWeight: j === 0 ? 600 : 400,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, color: "#b4b9c4", padding: "8px 2px" }}>{children}</div>;
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#fdf0ef", border: "1px solid #f0cfcc", color: "#a3372f", padding: "9px 12px", borderRadius: 8, fontSize: 11.5 }}>
      {children}
    </div>
  );
}

// ---------- rótulos ----------
function platformLabel(key: string): string {
  const map: Record<string, string> = {
    facebook: "Facebook",
    instagram: "Instagram",
    audience_network: "Audience Network",
    messenger: "Messenger",
    threads: "Threads",
    whatsapp: "WhatsApp",
    unknown: "Não identificado",
  };
  return map[key] || key;
}

// A Meta devolve as regiões em inglês ("Rio de Janeiro (state)").
function regionLabel(key: string): string {
  return key.replace(/\s*\((state|region|province)\)$/i, "");
}

// No eixo do gráfico o rótulo precisa ser curto ou vaza para fora do card.
function ageLabel(key: string): string {
  return /unknown|desconhec/i.test(key) ? "N/D" : key;
}
function deviceLabel(key: string): string {
  const map: Record<string, string> = {
    mobile_app: "App (celular)",
    mobile_web: "Web (celular)",
    desktop: "Computador",
    android_smartphone: "Android",
    iphone: "iPhone",
    ipad: "iPad",
    android_tablet: "Tablet Android",
    unknown: "Não identificado",
  };
  return map[key] || key;
}
function genderLabel(key: string): string {
  const map: Record<string, string> = { male: "Masculino", female: "Feminino", unknown: "Não identificado" };
  return map[key] || key;
}
