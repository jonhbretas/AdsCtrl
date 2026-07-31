"use client";

// components/AccountDetail.tsx
// Drill-down por conta, buscado ao vivo (/api/account/detail).
// Deltas vs período anterior, métricas de e-commerce, funil e quebras.

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  Area,
  AreaChart,
  PieChart,
  Pie,
  Cell,
  Legend,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  money, moneyShort, num, pct, dayLabel, weekdayLabel, resultLabel,
  pickPrimaryResult, orderedResults, pickVal, delta, roas, accountStatusInfo,
  PURCHASE_KEYS, ATC_KEYS, CHECKOUT_KEYS, LINKCLICK_KEYS,
  RESULT_FAMILY_BY_SLUG,
} from "@/lib/format";
import {
  compareSortValues,
  SortButton,
  SortState,
  usePersistentSort,
} from "@/components/SortableHeader";
import { Menu } from "@/components/ui";
import DuplicateCampaign from "@/components/DuplicateCampaign";

interface Vals { results: Record<string, number>; values: Record<string, number> }
interface Row extends Vals {
  id: string; name: string; spend: number; impressions: number; clicks: number;
  ctr: number; cpm: number; objective?: string; thumbnail?: string;
  // status = configurado no objeto; effective_status = o que a Meta faz de
  // fato (pode estar pausado pelo pai, reprovado ou fora do período).
  status?: string; effective_status?: string;
  // Conjunto (ou campanha com um conjunto assim dentro) rodando o país
  // inteiro, sem recorte de localização — sintoma de duplicação esquecida.
  broad_location?: boolean;
}
interface Daily extends Vals {
  date: string; spend: number; impressions: number; clicks: number; ctr: number; cpm: number; reach: number;
}
interface Breakdown extends Vals {
  key: string; spend: number; impressions: number; clicks: number; ctr: number; cpm: number;
}
interface Kpis extends Vals {
  spend: number; reach: number; impressions: number; clicks: number; ctr: number; cpm: number;
}
interface Detail {
  account_id: string;
  range: { since: string; until: string };
  prevRange: { since: string; until: string };
  kpis: Kpis;
  prevKpis: Kpis;
  daily: Daily[];
  campaigns: Row[]; adsets: Row[]; ads: Row[];
  breakdowns: {
    age_gender: Breakdown[]; region: Breakdown[]; platform: Breakdown[];
    position: Breakdown[]; device: Breakdown[]; hour: Breakdown[];
  };
  availableResults: string[];
  result_family?: string | null;
  // Só Google, e só campanhas de Pesquisa: o que a pessoa digitou de fato.
  searchTerms?: SearchTerm[];
  error?: string;
}

interface SearchTerm {
  term: string;
  campaign: string | null;
  campaignId: string | null;
  state: "novo" | "palavra-chave" | "negativado" | "ambos";
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  ctr: number;
  costPerConversion: number | null;
}

// ---------- seleção de "Resultado" ----------
// O seletor tinha só os action_types crus que a Meta devolveu no período. Dava
// dois problemas: "Vendas" desaparecia da lista quando o período não teve
// nenhuma venda (parecia que o sistema não suportava), e a lista vinha com 25
// entradas técnicas — post_unlike, offsite_search_add_meta_leads,
// post_interaction_gross — sem os conceitos que a gente usa para decidir.
//
// Agora são dois grupos: as FAMÍLIAS (Vendas, Conversas, Leads…), sempre
// presentes mesmo com zero, e os action_types crus embaixo, para conferência.
// "family:" e "action:" no valor distinguem os dois.
const FAMILY_PREFIX = "family:";
const ACTION_PREFIX = "action:";

// Ordem de leitura por importância de negócio.
const FAMILY_MENU = ["conversoes", "vendas", "mensagens", "leads", "cadastros", "cliques", "lpv", "engajamento"];

// "Conversões reportadas" não tem action_type próprio: é a soma das famílias de
// conversão. Cada família já resolve internamente as variações que a Meta
// repete (purchase/omni_purchase/fb_pixel_purchase são a mesma venda), então
// somar as famílias não conta a mesma conversão duas vezes.
const CONVERSION_FAMILIES = ["vendas", "mensagens", "leads", "cadastros"];
const ALL_CONVERSIONS = `${FAMILY_PREFIX}conversoes`;

function selectionKeys(selection: string): string[] {
  if (selection.startsWith(FAMILY_PREFIX)) {
    return RESULT_FAMILY_BY_SLUG[selection.slice(FAMILY_PREFIX.length)]?.keys ?? [];
  }
  if (selection.startsWith(ACTION_PREFIX)) return [selection.slice(ACTION_PREFIX.length)];
  return selection ? [selection] : [];
}

function resultValue(results: Record<string, number> | undefined, selection: string | null): number {
  if (!selection || !results) return 0;
  if (selection === ALL_CONVERSIONS) {
    return CONVERSION_FAMILIES.reduce(
      (sum, slug) => sum + pickVal(results, RESULT_FAMILY_BY_SLUG[slug]?.keys ?? []),
      0
    );
  }
  const keys = selectionKeys(selection);
  return keys.length ? pickVal(results, keys) : 0;
}

function selectionLabel(selection: string): string {
  if (selection.startsWith(FAMILY_PREFIX)) {
    const slug = selection.slice(FAMILY_PREFIX.length);
    return RESULT_FAMILY_BY_SLUG[slug]?.label || slug;
  }
  const type = selection.startsWith(ACTION_PREFIX) ? selection.slice(ACTION_PREFIX.length) : selection;
  return type ? resultLabel(type) : "—";
}

const ACCENT = "#3987e5";
const ACCENT2 = "#f59e0b";
const TEAL = "#2bb3a3";

// Duas medidas e nada mais. Antes cada bloco escolhia a sua (12, 16 ou 24) e o
// mesmo componente, servindo Meta e Google, produzia ritmos diferentes nas duas
// plataformas — que é o que se nota quando se abre um cliente e depois o outro.
const GAP = 12;          // entre cards de uma mesma grade
const SECTION_GAP = 20;  // entre blocos

// Botão de ação na linha da tabela (Orçamento, Duplicar). Borda e fundo
// próprios: sem eles o rótulo se perdia entre as colunas de número.
const rowActionRest: React.CSSProperties = { background: "var(--color-card)", borderColor: "var(--color-border)", color: "var(--color-foreground)" };
const rowActionHover: React.CSSProperties = { background: "var(--color-muted)", borderColor: ACCENT, color: ACCENT };
const rowActionStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5,
  padding: "5px 10px", borderRadius: 8,
  border: "1px solid var(--color-border)", background: "var(--color-card)", color: "var(--color-foreground)",
  fontSize: 11.5, fontWeight: 600, lineHeight: 1.2, cursor: "pointer",
  whiteSpace: "nowrap", transition: "background .15s, border-color .15s, color .15s",
};

type MetricKey = "spend" | "impressions" | "clicks" | "ctr" | "cpm" | "results" | "cpr";
type DetailSortKey =
  | "name"
  | "spend"
  | "impressions"
  | "clicks"
  | "ctr"
  | "result"
  | "cpr"
  | "roas";
const DETAIL_SORT_KEYS: readonly DetailSortKey[] = [
  "name",
  "spend",
  "impressions",
  "clicks",
  "ctr",
  "result",
  "cpr",
  "roas",
];
const METRIC_LABELS: Record<MetricKey, string> = {
  spend: "Investimento", impressions: "Impressões", clicks: "Cliques",
  ctr: "CTR", cpm: "CPM", results: "Resultados", cpr: "CPR",
};

export default function AccountDetail({
  accountId, platform, since, until, status, balance, currency,
}: {
  accountId: string; platform: "meta" | "google"; since: string; until: string; status: string; balance: number | null; currency: string;
}) {
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [tab, setTab] = useState<"campaigns" | "adsets" | "ads">("campaigns");
  const [demoMetric, setDemoMetric] = useState<MetricKey>("spend");
  // Alteração de veiculação: id em andamento e o último recado ao usuário.
  const [changing, setChanging] = useState<string | null>(null);
  const [changeNote, setChangeNote] = useState<{ text: string; bad?: boolean } | null>(null);
  // Campanha escolhida para duplicar; null = diálogo fechado.
  const [duplicating, setDuplicating] = useState<{ id: string; name: string } | null>(null);
  const [budgetModal, setBudgetModal] = useState<{ id: string; name: string } | null>(null);
  const [budgetPct, setBudgetPct] = useState("30");
  const [budgetDir, setBudgetDir] = useState<"up" | "down">("up");
  const [budgetLoading, setBudgetLoading] = useState(false);
  const [previewAd, setPreviewAd] = useState<string | null>(null);
  const [tableSort, setTableSort] = usePersistentSort<DetailSortKey>(
    "adsctrl:sort:account-detail",
    { key: "spend", direction: "desc" },
    DETAIL_SORT_KEYS
  );
  const platformLabel = platform === "google" ? "Google Ads" : "Meta Ads";
  const formatMoney = (value: number, digits = 2) =>
    money(value, currency, digits);
  const formatMoneyShort = (value: number) => moneyShort(value, currency);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    fetch(`/api/account/detail?account_id=${encodeURIComponent(accountId)}&platform=${platform}&since=${since}&until=${until}`)
      .then(async (r) => {
        const t = await r.text(); const d = t ? JSON.parse(t) : {};
        if (!r.ok || d.error) throw new Error(d.error || `Falha (HTTP ${r.status}).`);
        return d as Detail;
      })
      .then((d) => {
        if (!alive) return;
        setData(d);
        // Abre no foco configurado do cliente; sem foco, na heurística antiga.
        const focus = d.result_family && RESULT_FAMILY_BY_SLUG[d.result_family] ? d.result_family : null;
        const fallback = pickPrimaryResult(d.availableResults);
        setResult(focus ? `${FAMILY_PREFIX}${focus}` : fallback ? `${ACTION_PREFIX}${fallback}` : null);
      })
      .catch((e) => alive && setError(e?.message ?? "Erro ao carregar detalhe."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [accountId, platform, since, until]);

  // Pausar/reativar. Só Meta — a rota recusa Google com 501.
  // Confirmação explícita com o nome do objeto: é dinheiro do cliente rodando,
  // e um clique errado numa tabela ordenável é fácil demais.
  const LEVEL_BY_TAB = { campaigns: "campaign", adsets: "adset", ads: "ad" } as const;
  const NOUN_BY_TAB = { campaigns: "a campanha", adsets: "o conjunto", ads: "o anúncio" } as const;

  async function toggleDelivery(row: Row) {
    if (platform !== "meta" || !row.status) return;
    const next = row.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    const verb = next === "PAUSED" ? "Pausar" : "Reativar";
    const extra =
      next === "PAUSED" && tab === "campaigns"
        ? "\n\nOs conjuntos e anúncios dentro dela param de rodar, mas seguem marcados como ativos — ao reativar a campanha, tudo volta."
        : "";
    if (!window.confirm(`${verb} ${NOUN_BY_TAB[tab]} "${row.name}"?${extra}`)) return;

    setChanging(row.id);
    setChangeNote(null);
    try {
      const response = await fetch("/api/account/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, level: LEVEL_BY_TAB[tab], id: row.id, status: next }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.error) throw new Error(payload.error || `Falha (HTTP ${response.status}).`);

      // Atualiza só a linha alterada: recarregar o detalhe inteiro custa uma
      // dezena de chamadas à Meta por causa de um clique.
      setData((current) => {
        if (!current) return current;
        const key = tab;
        const rows = current[key].map((item) =>
          item.id === row.id
            ? { ...item, status: next, effective_status: next === "PAUSED" ? "PAUSED" : item.effective_status }
            : item
        );
        return { ...current, [key]: rows };
      });
      setChangeNote({
        text: payload.unchanged
          ? `"${row.name}" já estava ${next === "PAUSED" ? "pausado" : "ativo"}.`
          : `${next === "PAUSED" ? "Pausado" : "Reativado"}: "${row.name}".`,
      });
    } catch (e: any) {
      setChangeNote({ text: e?.message || "Não foi possível alterar.", bad: true });
    } finally {
      setChanging(null);
      window.setTimeout(() => setChangeNote(null), 9000);
    }
  }

  // Valor do resultado selecionado: família, soma de conversões ou action_type.
  const resultOf = (v: Vals) => resultValue(v.results, result);

  const metricOf = (o: Breakdown | Kpis | Daily, m: MetricKey) => {
    const res = resultOf(o);
    switch (m) {
      case "spend": return o.spend;
      case "impressions": return o.impressions;
      case "clicks": return o.clicks;
      case "ctr": return o.ctr;
      case "cpm": return o.cpm;
      case "results": return res;
      case "cpr": return res ? o.spend / res : 0;
    }
  };
  const fmtMetric = (v: number, m: MetricKey) =>
    m === "spend" || m === "cpm" || m === "cpr" ? formatMoney(v) : m === "ctr" ? pct(v) : num(v);

  const byObjective = useMemo(() => {
    if (!data) return [];
    const m: Record<string, { spend: number; res: number }> = {};
    for (const c of data.campaigns) {
      const key = c.objective || "OUTROS";
      if (!m[key]) m[key] = { spend: 0, res: 0 };
      m[key].spend += c.spend;
      m[key].res += resultOf(c);
    }
    return Object.entries(m)
      .map(([objective, v]) => ({ objective, spend: v.spend, cpr: v.res ? v.spend / v.res : 0 }))
      .sort((a, b) => b.spend - a.spend);
  }, [data, result]);

  // Agrega os pontos diários por dia da semana (Dom..Sáb).
  const byWeekday = useMemo<Breakdown[]>(() => {
    if (!data) return [];
    const acc: Record<number, Breakdown> = {};
    for (const d of data.daily) {
      const wd = new Date(d.date + "T00:00:00").getDay();
      const b = acc[wd] || (acc[wd] = { key: weekdayLabel(d.date), spend: 0, impressions: 0, clicks: 0, ctr: 0, cpm: 0, results: {}, values: {} });
      b.spend += d.spend; b.impressions += d.impressions; b.clicks += d.clicks;
      for (const [k, v] of Object.entries(d.results)) b.results[k] = (b.results[k] || 0) + v;
    }
    return Array.from({ length: 7 }, (_, i) => acc[i]).filter(Boolean).map((b) => ({
      ...b, ctr: b.impressions ? (b.clicks / b.impressions) * 100 : 0, cpm: b.impressions ? (b.spend / b.impressions) * 1000 : 0,
    }));
  }, [data]);

  if (loading) return <div style={{ padding: 32, color: "var(--color-muted-foreground)", fontSize: 14 }}>Carregando dados do {platformLabel}…</div>;
  if (error)
    return <div style={{ padding: 24 }}><div style={{ background: "color-mix(in srgb, var(--color-destructive) 10%, transparent)", color: "var(--color-destructive)", padding: "10px 14px", borderRadius: 8, fontSize: 14 }}>{error}</div></div>;
  if (!data) return null;

  const k = data.kpis, p = data.prevKpis;

  // Separa o recorte que tem número do que não tem, para a métrica escolhida.
  // Depende de demoMetric: "Cliques" pode ter dado onde "Conversões" não tem.
  const segments = (() => {
    const candidates: { title: string; rows: Breakdown[] }[] = [
      { title: "PLATAFORMA", rows: data.breakdowns.platform },
      { title: "DISPOSITIVO", rows: data.breakdowns.device },
      { title: "POSIÇÃO (TOP 10)", rows: data.breakdowns.position.slice(0, 10) },
      { title: "REGIÃO (TOP 10)", rows: data.breakdowns.region.slice(0, 10) },
      { title: "IDADE E GÊNERO", rows: data.breakdowns.age_gender.slice(0, 12) },
      { title: "DIA DA SEMANA", rows: byWeekday },
    ];
    const withData = candidates.filter((c) => c.rows.some((row) => metricOf(row, demoMetric) > 0));
    const empty = candidates.filter((c) => !withData.includes(c)).map((c) => c.title.replace(/ \(TOP \d+\)/, ""));
    return { withData, empty };
  })();
  const primaryRes = resultOf(k);
  const prevPrimaryRes = resultOf(p);
  const cpr = primaryRes ? k.spend / primaryRes : 0;
  const prevCpr = prevPrimaryRes ? p.spend / prevPrimaryRes : 0;
  // Famílias sempre listadas (com a contagem do período, zero incluído) e os
  // action_types crus como segundo grupo, para conferir de onde vem o número.
  const familyOptions = FAMILY_MENU.filter((slug) => RESULT_FAMILY_BY_SLUG[slug]).map((slug) => {
    const value = `${FAMILY_PREFIX}${slug}`;
    return { value, label: RESULT_FAMILY_BY_SLUG[slug].label, count: resultValue(k.results, value) };
  });
  const rawOptions = orderedResults(data.availableResults).map((type) => ({
    value: `${ACTION_PREFIX}${type}`,
    label: resultLabel(type),
    count: k.results[type] || 0,
  }));
  const sourceRows =
    tab === "campaigns"
      ? data.campaigns
      : tab === "adsets"
        ? data.adsets
        : data.ads;
  const rowValue = (row: Row) => {
    const rowResult = resultOf(row);
    const purchaseValue = pickVal(row.values, PURCHASE_KEYS);
    switch (tableSort.key) {
      case "name": return row.name;
      case "spend": return row.spend;
      case "impressions": return row.impressions;
      case "clicks": return row.clicks;
      case "ctr": return row.ctr;
      case "result": return rowResult;
      case "cpr": return rowResult > 0 ? row.spend / rowResult : null;
      case "roas":
        return purchaseValue > 0 && row.spend > 0
          ? purchaseValue / row.spend
          : null;
    }
  };
  const rows = [...sourceRows].sort((left, right) =>
    compareSortValues(rowValue(left), rowValue(right), tableSort.direction) ||
    compareSortValues(left.name, right.name, "asc")
  );

  // E-commerce
  const purchases = pickVal(k.results, PURCHASE_KEYS);
  const prevPurchases = pickVal(p.results, PURCHASE_KEYS);
  const pValue = pickVal(k.values, PURCHASE_KEYS);
  const prevPValue = pickVal(p.values, PURCHASE_KEYS);
  const atc = pickVal(k.results, ATC_KEYS);
  const checkout = pickVal(k.results, CHECKOUT_KEYS);
  const linkClicks = pickVal(k.results, LINKCLICK_KEYS) || k.clicks;
  const freq = k.reach ? k.impressions / k.reach : 0;
  const prevFreq = p.reach ? p.impressions / p.reach : 0;
  const hasEcom = purchases > 0 || pValue > 0; // só mostra ROAS/compras quando há venda
  const hasFunnel = atc > 0 || checkout > 0 || purchases > 0;

  const funnel = [
    { label: "Impressões", v: k.impressions },
    { label: "Cliques no link", v: linkClicks },
    { label: "Carrinho", v: atc },
    { label: "Checkout", v: checkout },
    { label: "Compras", v: purchases },
  ].filter((s, i) => i === 0 || s.v > 0);

  return (
    <div style={{ padding: "8px 4px 24px", background: "var(--color-background)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: SECTION_GAP, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 15 }}>{platformLabel}</strong>
        {/* A prop `status` chegava aqui e não era mostrada em lugar nenhum:
            dava para ler número de conta desativada sem nenhum aviso no bloco.
            Conta saudável não precisa de selo — só o que exige ação aparece. */}
        {platform === "meta" && status && status !== "ACTIVE" && <AccountStatusChip status={status} />}
        <span style={{ fontSize: 12, color: "var(--color-muted-foreground)" }}>vs. período anterior ({data.prevRange.since} → {data.prevRange.until})</span>
        <span style={{ flex: 1 }} />
        <a href={`/report/${accountId}?since=${since}&until=${until}`} target="_blank" rel="noreferrer"
           style={{ fontSize: 12, color: ACCENT, textDecoration: "none", border: `1px solid ${ACCENT}55`, background: `${ACCENT}0d`, borderRadius: 8, padding: "5px 10px", fontWeight: 600 }}>
          ⤓ Relatório / PDF
        </a>
        <label style={{ fontSize: 12, color: "var(--color-muted-foreground)" }}>Resultado:</label>
        <select value={result ?? ""} onChange={(e) => setResult(e.target.value)}
                style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 13 }}>
          <optgroup label="Resultado do negócio">
            {familyOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({num(option.count)})
              </option>
            ))}
          </optgroup>
          {rawOptions.length > 0 && (
            <optgroup label="Detalhado (como a Meta reporta)">
              {rawOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} ({num(option.count)})
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      {/* KPIs PRINCIPAIS com deltas */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: GAP, marginBottom: GAP }}>
        <KpiCard label="INVESTIMENTO" value={formatMoney(k.spend)} cur={k.spend} prev={p.spend} neutral />
        <KpiCard label="ALCANCE" value={num(k.reach)} cur={k.reach} prev={p.reach} sub={`Freq. ${freq.toFixed(2)}x`} />
        <KpiCard label={selectionLabel(result || "").toUpperCase()} value={num(primaryRes)} cur={primaryRes} prev={prevPrimaryRes} />
        <KpiCard
          label="CUSTO / RESULTADO"
          value={primaryRes > 0 ? formatMoney(cpr) : "—"}
          cur={primaryRes > 0 ? cpr : undefined}
          prev={prevPrimaryRes > 0 ? prevCpr : undefined}
          invert
        />
      </div>

      {/* Métricas secundárias */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: SECTION_GAP }}>
        <MiniKpi label="Impressões" value={num(k.impressions)} cur={k.impressions} prev={p.impressions} />
        <MiniKpi label="Cliques" value={num(k.clicks)} cur={k.clicks} prev={p.clicks} />
        <MiniKpi label="CTR" value={k.impressions > 0 ? pct(k.ctr) : "—"} cur={k.impressions > 0 ? k.ctr : undefined} prev={p.impressions > 0 ? p.ctr : undefined} />
        <MiniKpi label="CPC" value={k.clicks > 0 ? formatMoney(k.spend / k.clicks) : "—"} cur={k.clicks > 0 ? k.spend / k.clicks : undefined} prev={p.clicks > 0 ? p.spend / p.clicks : undefined} invert />
        <MiniKpi label="CPM" value={k.impressions > 0 ? formatMoney(k.cpm) : "—"} cur={k.impressions > 0 ? k.cpm : undefined} prev={p.impressions > 0 ? p.cpm : undefined} invert />
        <MiniKpi label="Frequência" value={k.reach > 0 ? `${freq.toFixed(2)}x` : "—"} cur={k.reach > 0 ? freq : undefined} prev={p.reach > 0 ? prevFreq : undefined} invert />
      </div>

      {/* E-COMMERCE (só quando há venda) */}
      {hasEcom && (
        <>
          <SectionTitle>E-commerce</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: GAP, marginBottom: SECTION_GAP }}>
            <KpiCard label="ROAS" value={k.spend > 0 ? `${roas(pValue, k.spend).toFixed(2)}x` : "—"} cur={k.spend > 0 ? roas(pValue, k.spend) : undefined} prev={p.spend > 0 ? roas(prevPValue, p.spend) : undefined} />
            <KpiCard label="COMPRAS" value={num(purchases)} cur={purchases} prev={prevPurchases} />
            <KpiCard label="VALOR DE COMPRA" value={formatMoney(pValue)} cur={pValue} prev={prevPValue} />
            <KpiCard label="CUSTO / COMPRA" value={purchases > 0 ? formatMoney(k.spend / purchases) : "—"} cur={purchases > 0 ? k.spend / purchases : undefined} prev={prevPurchases > 0 ? p.spend / prevPurchases : undefined} invert />
          </div>
        </>
      )}

      {/* FUNIL (quando há sinais de carrinho/checkout/compra) */}
      {hasFunnel && (
        <>
          <SectionTitle>Funil de conversão</SectionTitle>
          <div style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, padding: 16, marginBottom: SECTION_GAP }}>
            <div style={{ display: "grid", gap: 8 }}>
              {funnel.map((s, i) => {
                const top = funnel[0].v || 1;
                const w = Math.max(4, Math.round((s.v / top) * 100));
                const conv = i > 0 && funnel[i - 1].v ? (s.v / funnel[i - 1].v) * 100 : null;
                return (
                  <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ width: 130, fontSize: 13, color: "var(--color-foreground)" }}>{s.label}</span>
                    <div style={{ flex: 1, background: "var(--color-muted)", borderRadius: 6, overflow: "hidden", height: 26 }}>
                      <div style={{ width: `${w}%`, height: "100%", background: `linear-gradient(90deg, ${ACCENT}, ${TEAL})`, borderRadius: 6, display: "flex", alignItems: "center", paddingLeft: 10, color: "#fff", fontSize: 12, fontWeight: 600 }}>
                        {num(s.v)}
                      </div>
                    </div>
                    <span style={{ width: 70, textAlign: "right", fontSize: 12, color: conv == null ? "transparent" : "var(--color-muted-foreground)" }}>
                      {conv == null ? "—" : `${conv.toFixed(1)}%`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* GRÁFICO DIÁRIO */}
      <SectionTitle>Detalhamento de investimento</SectionTitle>
      <div style={{ marginBottom: SECTION_GAP }}>
      <ChartCard height={260}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.daily.map((d) => ({ ...d, label: dayLabel(d.date) }))} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
            <YAxis yAxisId="l" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} tickFormatter={(v) => formatMoneyShort(v)} width={56} />
            <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} tickFormatter={(v) => formatMoneyShort(v)} width={48} />
            <Tooltip formatter={(v: any, n: any) => [formatMoney(Number(v)), n === "spend" ? "Investimento" : "CPM"]} contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-popover)", color: "var(--color-popover-foreground)" }} />
            <Bar yAxisId="l" dataKey="spend" name="Investimento" fill={TEAL} radius={[4, 4, 0, 0]} maxBarSize={48} />
            <Line yAxisId="r" type="monotone" dataKey="cpm" name="CPM" stroke={ACCENT2} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
      </div>

      {/* TABELA CAMPANHAS/CONJUNTOS/ANÚNCIOS */}
      <SectionTitle>Tabela de campanhas</SectionTitle>
      {changeNote && (
        <div
          style={{
            margin: "0 0 10px",
            padding: "9px 12px",
            borderRadius: 9,
            fontSize: 12.5,
            background: changeNote.bad ? "color-mix(in srgb, var(--color-destructive) 10%, transparent)" : "color-mix(in srgb, var(--color-success) 10%, transparent)",
            border: `1px solid ${changeNote.bad ? "color-mix(in srgb, var(--color-destructive) 25%, transparent)" : "color-mix(in srgb, var(--color-success) 25%, transparent)"}`,
            color: changeNote.bad ? "var(--color-destructive)" : "var(--color-success)",
          }}
        >
          {changeNote.text}
          {!changeNote.bad && " A alteração aparece em Últimas edições."}
        </div>
      )}
      <div style={{ border: "1px solid var(--color-border)", borderRadius: 12, background: "var(--color-card)", overflow: "hidden", marginBottom: SECTION_GAP }}>
        <div style={{ display: "flex", gap: 4, padding: 10, borderBottom: "1px solid var(--color-border)" }}>
          {(["campaigns", "adsets", "ads"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: tab === t ? "var(--color-foreground)" : "transparent", color: tab === t ? "var(--color-background)" : "var(--color-muted-foreground)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
              {t === "campaigns" ? "Campanhas" : t === "adsets" ? "Conjuntos" : "Anúncios"}
            </button>
          ))}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 760 }}>
            <thead>
              <tr style={{ color: "var(--color-muted-foreground)", textAlign: "right" }}>
                {/* Veiculação primeiro: é o interruptor da linha, e ler o nome
                    depois de decidir ligar/desligar é a ordem natural. */}
                {platform === "meta" && (
                  <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 500, width: 62 }}>No ar</th>
                )}
                <Th sortKey="name" sort={tableSort} onSort={setTableSort} style={{ textAlign: "left" }}>{tab === "ads" ? "Anúncio" : tab === "adsets" ? "Conjunto" : "Campanha"}</Th>
                <Th sortKey="spend" sort={tableSort} onSort={setTableSort} initialDirection="desc">Investimento</Th>
                <Th sortKey="impressions" sort={tableSort} onSort={setTableSort} initialDirection="desc">Impressões</Th>
                <Th sortKey="clicks" sort={tableSort} onSort={setTableSort} initialDirection="desc">Cliques</Th>
                <Th sortKey="ctr" sort={tableSort} onSort={setTableSort} initialDirection="desc">CTR</Th>
                <Th sortKey="result" sort={tableSort} onSort={setTableSort} initialDirection="desc">Resultado</Th>
                <Th sortKey="cpr" sort={tableSort} onSort={setTableSort}>CPR</Th>
                <Th sortKey="roas" sort={tableSort} onSort={setTableSort} initialDirection="desc">ROAS</Th>
                {/* Duplicar existe só para campanha: conjunto solto sem a
                    campanha mãe não tem para onde ir na outra conta. */}
                {platform === "meta" && tab === "campaigns" && (
                  <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 500, width: 210 }}>Ações</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={(platform === "meta" ? 9 : 8) + (platform === "meta" && tab === "campaigns" ? 1 : 0)} style={{ padding: 0 }}>
                    <div className="ec-inline-empty">
                      Nenhuma {tab === "ads" ? "peça" : tab === "adsets" ? "conjunto" : "campanha"} com entrega neste
                      período.
                    </div>
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const res = resultOf(r);
                const rv = pickVal(r.values, PURCHASE_KEYS);
                return (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                    {platform === "meta" && (
                      <td style={{ padding: "10px 14px", textAlign: "left" }}>
                        <DeliverySwitch
                          row={r}
                          busy={changing === r.id}
                          onToggle={() => toggleDelivery(r)}
                        />
                      </td>
                    )}
                    <td style={{ padding: "10px 14px", textAlign: "left" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {tab === "ads" && r.thumbnail && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.thumbnail} alt="" width={34} height={34} style={{ borderRadius: 6, objectFit: "cover", flexShrink: 0, cursor: "pointer", imageRendering: "auto" }}
                            onMouseEnter={(e) => { const t = e.currentTarget; const rect = t.getBoundingClientRect(); setPreviewAd(t.src); }}
                            onMouseLeave={() => { const t = previewAd; setTimeout(() => { if (previewAd === t) setPreviewAd(null); }, 200); }}
                          />
                        )}
                        <span style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.name}>{r.name}</span>
                        {/* País inteiro sem recorte é o padrão de campanha
                            duplicada onde ninguém trocou a localização — vale
                            mais aparecer aqui, na aba que abre primeiro, do
                            que só na Central de Alertas. */}
                        {r.broad_location && (tab === "campaigns" || tab === "adsets") && (
                          <span
                            title="Este conjunto está rodando o país inteiro, sem cidade, região ou raio configurado. Confira se a localização foi mesmo definida — é o sintoma mais comum de campanha duplicada onde ninguém trocou o público."
                            style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: "color-mix(in srgb, var(--color-warning) 16%, transparent)", color: "var(--color-warning)", border: "1px solid color-mix(in srgb, var(--color-warning) 35%, transparent)", flexShrink: 0, cursor: "help" }}
                          >
                            ⚠ país inteiro
                          </span>
                        )}
                      </div>
                    </td>
                    <Td>{formatMoney(r.spend)}</Td><Td>{num(r.impressions)}</Td><Td>{num(r.clicks)}</Td><Td>{pct(r.ctr)}</Td>
                    <Td accent>{num(res)}</Td><Td>{res ? formatMoney(r.spend / res) : "—"}</Td>
                    <Td>{rv > 0 && r.spend > 0 ? `${(rv / r.spend).toFixed(2)}x` : "—"}</Td>
                    {platform === "meta" && tab === "campaigns" && (
                      <td style={{ padding: "10px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                        {/* Eram dois "ec-btn" fantasma: texto solto no fim da
                            linha, sem borda nem fundo, indistinguível das
                            células de número ao lado. Ação que mexe em conta de
                            anúncio precisa parecer ação. */}
                        <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end" }}>
                          <button
                            onClick={() => { setBudgetModal({ id: r.id, name: r.name }); setBudgetPct("30"); setBudgetDir("up"); }}
                            title="Ajustar orçamento da campanha"
                            style={rowActionStyle}
                            onMouseEnter={(e) => Object.assign(e.currentTarget.style, rowActionHover)}
                            onMouseLeave={(e) => Object.assign(e.currentTarget.style, rowActionRest)}
                          >
                            <span aria-hidden="true">↕</span> Orçamento
                          </button>
                          <button
                            onClick={() => setDuplicating({ id: r.id, name: r.name })}
                            title="Copiar campanha e conjuntos para outra conta de anúncios"
                            style={rowActionStyle}
                            onMouseEnter={(e) => Object.assign(e.currentTarget.style, rowActionHover)}
                            onMouseLeave={(e) => Object.assign(e.currentTarget.style, rowActionRest)}
                          >
                            <span aria-hidden="true">⧉</span> Duplicar
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {duplicating && (
        <DuplicateCampaign
          sourceAccountId={accountId}
          campaignId={duplicating.id}
          campaignName={duplicating.name}
          onClose={() => setDuplicating(null)}
        />
      )}

      {/* TERMOS DE BUSCA (Google, campanhas de Pesquisa) */}
      {platform === "google" && <SearchTerms terms={data.searchTerms} currency={currency} accountId={accountId} />}

      {/* EVOLUÇÃO DIÁRIA — alcance e cliques.
          "Investimento diário" saiu daqui: era uma área com o mesmo dado do
          gráfico de Detalhamento de investimento logo acima, e vinha sozinha
          numa grade de duas colunas — meio card e meia coluna vazia ao lado.
          Não era falha de dado, era layout. Agora a grade só existe onde há
          dois gráficos, e é auto-fit para não abrir buraco em tela estreita. */}
      <SectionTitle>Evolução diária</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: GAP, marginBottom: SECTION_GAP }}>
        <ChartCard height={200} title="Alcance diário">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.daily.map((d) => ({ label: dayLabel(d.date), reach: d.reach }))} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="reachGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} width={36} tickFormatter={(v) => num(v)} />
              <Tooltip formatter={(v: any) => num(Number(v))} contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-popover)", color: "var(--color-popover-foreground)" }} />
              <Area type="monotone" dataKey="reach" name="Alcance" stroke="#10b981" strokeWidth={2} fill="url(#reachGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard height={200} title="Cliques + CTR">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data.daily.map((d) => ({ label: dayLabel(d.date), clicks: d.clicks, ctr: d.ctr }))} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="l" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} width={36} tickFormatter={(v) => num(v)} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} width={28} tickFormatter={(v) => `${v.toFixed(1)}%`} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-popover)", color: "var(--color-popover-foreground)" }} />
              <Bar yAxisId="l" dataKey="clicks" name="Cliques" fill="#06b6d4" radius={[3, 3, 0, 0]} maxBarSize={24} />
              <Line yAxisId="r" type="monotone" dataKey="ctr" name="CTR" stroke="#f59e0b" strokeWidth={2} dot={false} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* SEGMENTAÇÕES — gráficos profissionais tipo Meta Business Manager */}
      {segments.withData.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 12px" }}>
            <SectionTitle noMargin>Segmentações</SectionTitle>
            <span style={{ flex: 1 }} />
            <label style={{ fontSize: 12, color: "var(--color-muted-foreground)" }}>Visualizar por:</label>
            <select value={demoMetric} onChange={(e) => setDemoMetric(e.target.value as MetricKey)} style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 13 }}>
              {(Object.keys(METRIC_LABELS) as MetricKey[]).map((m) => <option key={m} value={m}>{METRIC_LABELS[m]}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">{segments.withData.map((segment) => {
              const rows = segment.rows.filter((r) => metricOf(r, demoMetric) > 0);
              const data = rows.map((r) => ({ name: r.key, primary: metricOf(r, demoMetric), secondary: (r as any).reach || (r as any).impressions || 0 }));
              const maxVal = Math.max(...data.map((d) => d.primary), 1);
              const isPie = segment.title === "PLATAFORMA" || segment.title === "DISPOSITIVO";
              const isAgeGender = segment.title === "IDADE E GÊNERO";

              if (isPie && data.length <= 6) {
                const COLORS = ["#06b6d4", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#3b82f6"];
                return (
                  <div key={segment.title} style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, padding: 14 }}>
                    <h4 style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted-foreground)", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 8 }}>{segment.title.replace("_", " ")}</h4>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={data} dataKey="primary" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={78} paddingAngle={2}
                          label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: any) => fmtMetric(Number(v), demoMetric)} contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-popover)", color: "var(--color-popover-foreground)" }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 6, justifyContent: "center", fontSize: 10, color: "var(--color-muted-foreground)" }}>
                      {data.map((d, i) => <span key={d.name} style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS[i % COLORS.length] }} />{d.name}</span>)}
                    </div>
                  </div>
                );
              }

              if (isAgeGender) {
                return (
                  <div key={segment.title} style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, padding: 14 }}>
                    <h4 style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted-foreground)", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 8 }}>{segment.title.replace("_", " ")}</h4>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                        <XAxis dataKey="name" tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => num(v)} />
                        <Tooltip formatter={(v: any) => fmtMetric(Number(v), demoMetric)} contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-popover)", color: "var(--color-popover-foreground)" }} />
                        <Bar dataKey="primary" name={METRIC_LABELS[demoMetric]} fill="#06b6d4" radius={[3, 3, 0, 0]} maxBarSize={24} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                );
              }

              // Default: horizontal bar chart
              return (
                <div key={segment.title} style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, padding: 14 }}>
                  <h4 style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted-foreground)", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 8 }}>{segment.title.replace("_", " ")}</h4>
                  <div style={{ display: "grid", gap: 4 }}>
                    {data.slice(0, 8).map((d) => (
                      <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 80, fontSize: 10, color: "var(--color-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>{d.name}</span>
                        <div style={{ flex: 1, height: 12, background: "var(--color-muted)", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ width: `${Math.max((d.primary / maxVal) * 100, 2)}%`, height: "100%", borderRadius: 4, background: demoMetric === "spend" || demoMetric === "cpr" ? "#06b6d4" : "#10b981" }} />
                        </div>
                        <span style={{ width: 60, fontSize: 10, fontWeight: 600, color: "var(--color-foreground)", textAlign: "right" }}>{fmtMetric(d.primary, demoMetric)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {segments.empty.length > 0 && (
            <p style={{ fontSize: 11.5, color: "var(--color-muted-foreground)", margin: "0 0 16px", lineHeight: 1.5 }}>
              Sem dado em {segments.empty.join(", ").toLowerCase()} para {METRIC_LABELS[demoMetric].toLowerCase()}
              {platform === "google"
                ? ". O Google Ads não expõe estes recortes por esta via — o que dá para agir aqui são os termos de busca acima."
                : ". Pode ser recorte que a Meta não devolve para este objetivo, ou volume baixo demais no período."}
            </p>
          )}
        </>
      )}

      {/* POR HORA — impressões e alcance lado a lado */}
      {data.breakdowns.hour.some((h) => (h as any).impressions > 0) && (
        <div style={{ marginBottom: SECTION_GAP }}>
        <ChartCard height={220} title="Impressões × Alcance por hora">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.breakdowns.hour.map((h) => ({ label: `${h.key}h`, impressions: (h as any).impressions || 0, reach: (h as any).reach || 0 }))} margin={{ top: 6, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} interval={2} />
              <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => num(v)} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-popover)", color: "var(--color-popover-foreground)" }} />
              <Bar dataKey="impressions" name="Impressões" fill="#06b6d4" radius={[3, 3, 0, 0]} maxBarSize={16} />
              <Bar dataKey="reach" name="Alcance" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={16} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        </div>
      )}

      {/* Preview popup para thumbnail de anúncio */}
      {previewAd && (
        <div
          style={{ position: "fixed", zIndex: 999, top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 400, height: 400, maxWidth: "90vw", maxHeight: "90vh", background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden", cursor: "pointer" }}
          onClick={() => setPreviewAd(null)}
          onMouseLeave={() => setPreviewAd(null)}
        >
          <img src={previewAd} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        </div>
      )}

      {/* Modal de ajuste de orçamento */}
      {budgetModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setBudgetModal(null)}>
          <div style={{ background: "var(--color-card)", borderRadius: 16, padding: 24, width: 340, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Ajustar orçamento</h3>
            <p style={{ fontSize: 13, color: "var(--color-muted-foreground)", marginBottom: 16 }}>{budgetModal.name}</p>

            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              <button onClick={() => setBudgetDir("up")} style={{ flex: 1, padding: "8px 0", border: `2px solid ${budgetDir === "up" ? "var(--color-success)" : "var(--color-border)"}`, borderRadius: 10, background: budgetDir === "up" ? "color-mix(in srgb, var(--color-success) 12%, transparent)" : "var(--color-card)", color: budgetDir === "up" ? "var(--color-success)" : "var(--color-muted-foreground)", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>↑ Aumentar</button>
              <button onClick={() => setBudgetDir("down")} style={{ flex: 1, padding: "8px 0", border: `2px solid ${budgetDir === "down" ? "var(--color-destructive)" : "var(--color-border)"}`, borderRadius: 10, background: budgetDir === "down" ? "color-mix(in srgb, var(--color-destructive) 12%, transparent)" : "var(--color-card)", color: budgetDir === "down" ? "var(--color-destructive)" : "var(--color-muted-foreground)", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>↓ Reduzir</button>
            </div>

            <label style={{ display: "grid", gap: 6, marginBottom: 16 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-muted-foreground)" }}>Percentual</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="number" value={budgetPct} onChange={(e) => setBudgetPct(e.target.value)} min={1} max={300} style={{ flex: 1, height: 40, borderRadius: 10, border: "1px solid var(--color-border)", padding: "0 12px", fontSize: 16, fontWeight: 700, textAlign: "center", background: "var(--color-background)", color: "var(--color-foreground)" }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-muted-foreground)" }}>%</span>
              </div>
            </label>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setBudgetModal(null)} style={{ flex: 1, height: 40, borderRadius: 10, border: "1px solid var(--color-border)", background: "var(--color-card)", color: "var(--color-muted-foreground)", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Cancelar</button>
              <button
                disabled={budgetLoading || !budgetPct || Number(budgetPct) <= 0}
                onClick={async () => {
                  setBudgetLoading(true);
                  try {
                    const pct = budgetDir === "up" ? (100 + Number(budgetPct)) / 100 : (100 - Number(budgetPct)) / 100;
                    const res = await fetch("/api/account/budget", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ account_id: accountId, level: "campaign", id: budgetModal.id, percentual: pct }),
                    });
                    const d = await res.json();
                    if (d.ok) { alert(`Orçamento alterado em ${d.percentual}% (${formatMoney(d.anterior || 0)} → ${formatMoney(d.atual || 0)})`); setBudgetModal(null); }
                    else alert(d.error || "Falha ao ajustar.");
                  } catch { alert("Erro ao ajustar orçamento."); }
                  finally { setBudgetLoading(false); }
                }}
                style={{ flex: 1, height: 40, borderRadius: 10, border: "none", background: budgetDir === "up" ? "#22c55e" : "#ef4444", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: budgetLoading ? 0.6 : 1 }}
              >{budgetLoading ? "Ajustando…" : `Confirmar ${budgetDir === "up" ? "aumento" : "redução"}`}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- subcomponentes ----------

function DeltaBadge({ cur, prev, invert, neutral }: { cur: number; prev: number; invert?: boolean; neutral?: boolean }) {
  const d = delta(cur, prev);
  if (!d.hasPrev) return <span style={{ fontSize: 11, color: "var(--color-muted-foreground)" }}>—</span>;
  const up = d.pct >= 0;
  const good = invert ? !up : up;
  const color = neutral || Math.abs(d.pct) < 0.05 ? "var(--color-muted-foreground)" : good ? "#16a34a" : "#dc2626";
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color }}>
      {up ? "▲" : "▼"} {Math.abs(d.pct).toFixed(1)}%
    </span>
  );
}

function KpiCard({ label, value, sub, cur, prev, invert, neutral }: { label: string; value: string; sub?: string; cur?: number; prev?: number; invert?: boolean; neutral?: boolean }) {
  return (
    <div style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: "var(--color-muted-foreground)", letterSpacing: 0.4, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: "var(--color-foreground)" }}>{value}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 3, gap: 6 }}>
        <span style={{ fontSize: 12, color: "var(--color-muted-foreground)" }}>{sub || ""}</span>
        {cur != null && prev != null && <DeltaBadge cur={cur} prev={prev} invert={invert} neutral={neutral} />}
      </div>
    </div>
  );
}

function MiniKpi({ label, value, cur, prev, invert, neutral }: { label: string; value: string; cur?: number; prev?: number; invert?: boolean; neutral?: boolean }) {
  return (
    <div style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 11, color: "var(--color-muted-foreground)" }}>{label}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6, marginTop: 2 }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: "var(--color-foreground)" }}>{value}</span>
        {cur != null && prev != null && <DeltaBadge cur={cur} prev={prev} invert={invert} neutral={neutral} />}
      </div>
    </div>
  );
}

function SectionTitle({ children, noMargin }: { children: React.ReactNode; noMargin?: boolean }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-muted-foreground)", letterSpacing: 0.6, textTransform: "uppercase", margin: noMargin ? 0 : "8px 0 12px" }}>{children}</div>;
}

// Mesmo chip da linha da visão geral, para o status se ler igual antes e
// depois de abrir o cliente.
function AccountStatusChip({ status }: { status: string }) {
  const info = accountStatusInfo(status);
  const palette = info.tone === "bad"
    ? { bg: "color-mix(in srgb, var(--color-destructive) 14%, transparent)", border: "color-mix(in srgb, var(--color-destructive) 30%, transparent)", fg: "var(--color-destructive)" }
    : { bg: "color-mix(in srgb, var(--color-warning) 14%, transparent)", border: "color-mix(in srgb, var(--color-warning) 30%, transparent)", fg: "var(--color-warning)" };
  return (
    <span
      title={`status na plataforma: ${status}`}
      style={{
        fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
        background: palette.bg, border: `1px solid ${palette.border}`, color: palette.fg,
      }}
    >
      {info.label}
    </span>
  );
}

// Sem margem própria: dentro de uma grade ela somava com o gap e abria um vão
// diferente do resto. Quem posiciona é o bloco de fora.
function ChartCard({ children, height, title }: { children: React.ReactNode; height: number; title?: string }) {
  return (
    <div style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, padding: 12 }}>
      {title && <div style={{ fontSize: 12, color: "var(--color-muted-foreground)", marginBottom: 8 }}>{title}</div>}
      <div style={{ height }}>{children}</div>
    </div>
  );
}

function Th({
  children,
  style,
  sortKey,
  sort,
  onSort,
  initialDirection = "asc",
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  sortKey: DetailSortKey;
  sort: SortState<DetailSortKey>;
  onSort: (next: SortState<DetailSortKey>) => void;
  initialDirection?: "asc" | "desc";
}) {
  const align = style?.textAlign === "left" ? "left" : "right";
  return (
    <th
      aria-sort={sort.key === sortKey ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
      style={{ padding: "10px 14px", fontWeight: 500, textAlign: "right", ...style }}
    >
      <SortButton
        column={sortKey}
        sort={sort}
        onSort={onSort}
        align={align}
        initialDirection={initialDirection}
      >
        {children}
      </SortButton>
    </th>
  );
}
function Td({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return <td style={{ padding: "10px 14px", textAlign: "right", color: accent ? ACCENT : "var(--color-foreground)", fontWeight: accent ? 600 : 400 }}>{children}</td>;
}

// Termos de busca do Google.
//
// A ordem é por CUSTO, não por volume: a pergunta que a tabela responde é
// "estou pagando por busca que não interessa?". O estado à esquerda diz o que
// já foi tratado — quem está "novo" e gastou é o que espera decisão.
//
// Não há botão de negativar: negativar pela API mexe na estrutura da conta
// (lista de negativas, nível de campanha ou de grupo) e isso é escrita de outra
// natureza. A tabela mostra o que decidir; a decisão sai no Google Ads.
// "já é chave" e "negativado" não dizem nada a quem não vive dentro do Google
// Ads. O rótulo é curto porque a coluna é estreita; a explicação vem no title,
// que o navegador mostra ao pousar o mouse e o leitor de tela anuncia.
const TERM_STATE: Record<
  SearchTerm["state"],
  { tone: "ok" | "danger" | "neutral" | "warn"; label: string; help: string }
> = {
  "palavra-chave": {
    tone: "ok",
    label: "já é chave",
    help: "Você já cadastrou este termo como palavra-chave. O Google está comprando este tráfego de propósito.",
  },
  negativado: {
    tone: "neutral",
    label: "negativado",
    help: "Termo já na lista de palavras negativas. Não deve gerar novos cliques; o custo aqui é do que rodou antes de negativar.",
  },
  ambos: {
    tone: "warn",
    label: "chave e negativa",
    help: "O termo está como palavra-chave em um lugar e como negativa em outro. Vale conferir: normalmente é conflito entre campanhas ou grupos.",
  },
  novo: {
    tone: "warn",
    label: "sem tratar",
    help: "O termo apareceu numa busca real e ainda não é palavra-chave nem negativa. Se gastou e não converteu, é candidato a negativar; se converteu, a virar palavra-chave.",
  },
};

const SUSPECT_HELP =
  "Gastou, não converteu e continua sem tratamento — é o primeiro candidato a virar palavra negativa.";

type TermSortKey = "state" | "term" | "campaign" | "cost" | "impressions" | "clicks" | "ctr" | "conversions" | "costPerConversion";

function SearchTerms({ terms, currency, accountId }: { terms?: SearchTerm[]; currency: string; accountId: string }) {
  const [showAll, setShowAll] = useState(false);
  const [campaign, setCampaign] = useState("all");
  const [sort, setSort] = useState<SortState<TermSortKey>>({ key: "cost", direction: "desc" });
  // Negativação feita nesta sessão: termo -> o que foi criado, para poder
  // desfazer. Não substitui o dado da API; ela só reflete na próxima coleta.
  const [negated, setNegated] = useState<Record<string, { resourceName: string; matchType: string }>>({});
  const [busyTerm, setBusyTerm] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const all = terms || [];

  const keyOf = (term: SearchTerm) => `${term.campaignId || ""}::${term.term}`;

  async function negate(term: SearchTerm, matchType: "EXACT" | "PHRASE") {
    if (!term.campaignId) {
      setNote({ text: "Sem a campanha do termo não dá para negativar.", bad: true });
      return;
    }
    const alvo = matchType === "EXACT" ? "exata" : "frase";
    // Escrita na conta que está gastando: confirma antes, dizendo onde vai.
    const ok = window.confirm(
      `Negativar "${term.term}" em correspondência ${alvo}?\n\n`
      + `Campanha: ${term.campaign || "(sem nome)"}\n\n`
      + (matchType === "PHRASE"
        ? "Frase bloqueia qualquer busca que contenha este termo."
        : "Exata bloqueia só esta busca, escrita deste jeito.")
      + "\n\nDá para desfazer aqui mesmo depois."
    );
    if (!ok) return;

    setBusyTerm(keyOf(term));
    setNote(null);
    try {
      const response = await fetch("/api/google/negatives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: accountId,
          campaign_id: term.campaignId,
          text: term.term,
          match_type: matchType,
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || `Falha (HTTP ${response.status}).`);
      setNegated((prev) => ({
        ...prev,
        [keyOf(term)]: { resourceName: payload.negative?.resourceName || "", matchType },
      }));
      setNote({
        text: payload.unchanged
          ? `"${term.term}" já estava negativado em ${alvo}.`
          : `"${term.term}" negativado em ${alvo} na campanha ${term.campaign || ""}.`,
      });
    } catch (error: any) {
      setNote({ text: error?.message ?? "Falha ao negativar.", bad: true });
    } finally {
      setBusyTerm(null);
    }
  }

  async function undo(term: SearchTerm) {
    const entry = negated[keyOf(term)];
    if (!entry?.resourceName) return;
    setBusyTerm(keyOf(term));
    try {
      const response = await fetch("/api/google/negatives", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, resource_name: entry.resourceName }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || `Falha (HTTP ${response.status}).`);
      setNegated((prev) => {
        const next = { ...prev };
        delete next[keyOf(term)];
        return next;
      });
      setNote({ text: `Negativa de "${term.term}" removida.` });
    } catch (error: any) {
      setNote({ text: error?.message ?? "Falha ao desfazer.", bad: true });
    } finally {
      setBusyTerm(null);
    }
  }

  // Uma conta de Pesquisa mistura campanhas com intenção diferente (marca,
  // genérico, concorrente). Somados, o "sem tratar" de uma esconde o da outra.
  const campaigns = useMemo(() => {
    const byName = new Map<string, number>();
    for (const term of all) {
      const name = term.campaign || "(sem campanha)";
      byName.set(name, (byName.get(name) || 0) + 1);
    }
    return [...byName.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);

  const list = useMemo(() => {
    const filtered = campaign === "all"
      ? all
      : all.filter((term) => (term.campaign || "(sem campanha)") === campaign);
    return [...filtered].sort((a, b) => {
      const pick = (term: SearchTerm) => {
        switch (sort.key) {
          case "state": return TERM_STATE[term.state].label;
          case "term": return term.term;
          case "campaign": return term.campaign || "";
          // Sem custo por conversão é ausência de dado, não zero: mandar para
          // o fim das duas ordens evita que "—" ocupe o topo do "mais barato".
          case "costPerConversion": return term.costPerConversion ?? null;
          default: return term[sort.key];
        }
      };
      return compareSortValues(pick(a), pick(b), sort.direction);
    });
  }, [all, campaign, sort]);

  const wasted = list.filter((t) => t.state === "novo" && t.conversions === 0 && t.cost > 0);
  const visible = showAll ? list : list.slice(0, 12);
  const Th = ({ column, children, align = "right", initialDirection = "desc" }: {
    column: TermSortKey;
    children: React.ReactNode;
    align?: "left" | "right";
    initialDirection?: "asc" | "desc";
  }) => (
    <th style={{ padding: "10px 14px", textAlign: align, fontWeight: 500 }}>
      <SortButton column={column} sort={sort} onSort={setSort} align={align} initialDirection={initialDirection}>
        {children}
      </SortButton>
    </th>
  );

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 12px", flexWrap: "wrap" }}>
        <SectionTitle noMargin>Termos de busca</SectionTitle>
        {all.length > 0 && (
          <>
            <span style={{ fontSize: 11.5, color: "var(--color-muted-foreground)" }}>
              {list.length}
              {list.length !== all.length ? ` de ${all.length}` : ""} termos
            </span>
            {wasted.length > 0 && (
              <span className="ec-badge" data-tone="warn" title={SUSPECT_HELP}>
                {wasted.length} sem conversão e sem tratamento
              </span>
            )}
            <span style={{ flex: 1 }} />
            {campaigns.length > 1 && (
              <label className="ec-inline-field">
                <span>Campanha</span>
                <select
                  className="ec-input"
                  value={campaign}
                  onChange={(event) => { setCampaign(event.target.value); setShowAll(false); }}
                  style={{ width: "auto", maxWidth: 260, fontSize: 12 }}
                >
                  <option value="all">Todas ({all.length})</option>
                  {campaigns.map(([name, count]) => (
                    <option key={name} value={name}>{name} ({count})</option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}
      </div>

      {note && (
        <div style={{ marginBottom: 10 }}>
          <div className="ec-notice" data-tone={note.bad ? "danger" : "ok"}>
            {note.text}
            <button
              onClick={() => setNote(null)}
              aria-label="Fechar aviso"
              style={{ marginLeft: "auto", border: 0, background: "none", cursor: "pointer", color: "inherit" }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <div className="ec-card ec-card--padded" style={{ marginBottom: SECTION_GAP }}>
          <div className="ec-inline-empty" style={{ minHeight: 0 }}>
            Nenhum termo de busca no período. O Google só expõe o que a pessoa digitou em campanhas de
            <strong> Pesquisa</strong> — em Performance Max, Display e Vídeo essa lista vem vazia mesmo com entrega.
          </div>
        </div>
      ) : (
        <div className="ec-card ec-scroll-x" style={{ marginBottom: SECTION_GAP }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 720 }}>
            <thead>
              <tr style={{ color: "var(--color-muted-foreground)", textAlign: "right" }}>
                <Th column="state" align="left" initialDirection="asc">Situação</Th>
                <Th column="term" align="left" initialDirection="asc">Termo digitado</Th>
                <Th column="cost">Custo</Th>
                <Th column="impressions">Impr.</Th>
                <Th column="clicks">Cliques</Th>
                <Th column="ctr">CTR</Th>
                <Th column="conversions">Conv.</Th>
                <Th column="costPerConversion">Custo/conv.</Th>
                <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 500, width: 132 }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((term, index) => {
                const feito = negated[keyOf(term)];
                // Negativado agora: a coluna Situação passa a dizer isso na
                // hora. A API só vai refletir na próxima coleta do Google.
                const state = feito
                  ? { ...TERM_STATE.negativado, label: feito.matchType === "EXACT" ? "negativado (exata)" : "negativado (frase)" }
                  : TERM_STATE[term.state];
                const ocupado = busyTerm === keyOf(term);
                // Gastou e não converteu, sem tratamento: é o candidato a negativar.
                const suspect = !feito && term.state === "novo" && term.conversions === 0 && term.cost > 0;
                return (
                  <tr key={`${term.term}-${index}`} style={{ borderTop: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "10px 14px" }}>
                      {/* O title é o que explica o rótulo. Vem junto com o
                          motivo de estar em vermelho, quando for o caso. */}
                      <span
                        className="ec-badge"
                        data-tone={suspect ? "danger" : state.tone}
                        title={suspect ? `${state.help}\n\n${SUSPECT_HELP}` : state.help}
                      >
                        {state.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "left" }}>
                      <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{term.term}</div>
                      {term.campaign && (
                        <div style={{ fontSize: 10.5, color: "var(--color-muted-foreground)", marginTop: 2 }}>{term.campaign}</div>
                      )}
                    </td>
                    <Td accent={suspect}>{money(term.cost, currency)}</Td>
                    <Td>{num(term.impressions)}</Td>
                    <Td>{num(term.clicks)}</Td>
                    <Td>{pct(term.ctr)}</Td>
                    {/* Conversão do Google vem fracionada (modelo de
                        atribuição), então uma casa decimal em vez de num(). */}
                    <Td>{term.conversions > 0 ? term.conversions.toFixed(1).replace(".", ",") : "—"}</Td>
                    <Td>{term.costPerConversion != null ? money(term.costPerConversion, currency) : "—"}</Td>
                    <td style={{ padding: "10px 14px", textAlign: "right" }}>
                      {feito ? (
                        <button
                          className="ec-btn"
                          data-variant="ghost"
                          data-size="sm"
                          disabled={ocupado}
                          onClick={() => undo(term)}
                          title="Remover a negativa que acabou de ser criada"
                        >
                          {ocupado ? "…" : "desfazer"}
                        </button>
                      ) : term.state === "negativado" ? (
                        <span style={{ fontSize: 11, color: "var(--color-muted-foreground)" }}>já negativado</span>
                      ) : !term.campaignId ? (
                        <span style={{ fontSize: 11, color: "var(--color-muted-foreground)" }} title="A campanha do termo não veio na consulta">—</span>
                      ) : (
                        <Menu
                          size="sm"
                          variant={suspect ? "secondary" : "ghost"}
                          disabled={ocupado}
                          label={ocupado ? "…" : "⊘ Negativar"}
                          title={`Criar palavra negativa na campanha ${term.campaign || ""}`}
                          items={[
                            {
                              label: "Correspondência exata",
                              hint: "bloqueia só esta busca, escrita deste jeito",
                              onSelect: () => negate(term, "EXACT"),
                            },
                            {
                              label: "Correspondência de frase",
                              hint: "bloqueia qualquer busca que contenha o termo",
                              onSelect: () => negate(term, "PHRASE"),
                            },
                          ]}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.length > 12 && (
            <div style={{ padding: "10px 14px", borderTop: "1px solid var(--color-border)" }}>
              <button onClick={() => setShowAll((v) => !v)} className="ec-btn" data-variant="ghost" data-size="sm">
                {showAll ? "Mostrar só os 12 maiores" : `Ver todos os ${list.length} termos`}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// Estado de veiculação + o botão que o inverte.
//
// Dois status importam e podem divergir: o do objeto e o efetivo. Um anúncio
// ATIVO dentro de campanha pausada não está rodando, e mostrar só "Ativo" ali
// faria o painel mentir. Quando divergem, o efetivo aparece embaixo.
const EFFECTIVE_LABEL: Record<string, string> = {
  ACTIVE: "rodando",
  PAUSED: "pausado",
  CAMPAIGN_PAUSED: "campanha pausada",
  ADSET_PAUSED: "conjunto pausado",
  DISAPPROVED: "reprovado",
  WITH_ISSUES: "com problemas",
  PENDING_REVIEW: "em análise",
  PREAPPROVED: "pré-aprovado",
  PENDING_BILLING_INFO: "pendente de pagamento",
  IN_PROCESS: "processando",
  ARCHIVED: "arquivado",
  DELETED: "excluído",
};

// Interruptor de veiculação, no início da linha.
//
// Era um par "rótulo + botão Pausar" à direita, o que obrigava a atravessar
// dez colunas de número para agir sobre a linha que se estava lendo. Como
// switch à esquerda, o estado se lê na varredura vertical e a ação fica no
// mesmo lugar em todas as linhas.
//
// Não é um <input type="checkbox">: a mudança não é local, ela vai para a Meta
// e passa por confirmação. É um botão com role de switch, que é o que os
// leitores de tela esperam para "ligado/desligado".
function DeliverySwitch({ row, busy, onToggle }: { row: Row; busy: boolean; onToggle: () => void }) {
  if (!row.status) return <span style={{ color: "var(--color-muted-foreground)", fontSize: 12 }}>—</span>;

  const active = row.status === "ACTIVE";
  // Arquivado/excluído não voltam por um clique: mostra o estado e nada mais.
  const frozen = row.status === "ARCHIVED" || row.status === "DELETED";
  const effective = row.effective_status && row.effective_status !== row.status
    ? EFFECTIVE_LABEL[row.effective_status] || row.effective_status.toLowerCase().replace(/_/g, " ")
    : null;

  if (frozen) {
    return (
      <span className="ec-switch__frozen" title={`status: ${row.status}`}>
        {EFFECTIVE_LABEL[row.status] || row.status.toLowerCase()}
      </span>
    );
  }

  return (
    <div className="ec-switchwrap">
      <button
        role="switch"
        aria-checked={active}
        aria-label={`${active ? "Pausar" : "Reativar"} ${row.name}`}
        onClick={onToggle}
        disabled={busy}
        className="ec-switch"
        data-on={active ? "true" : undefined}
        data-busy={busy ? "true" : undefined}
        title={
          (active ? "Pausar a veiculação na Meta" : "Reativar a veiculação na Meta") +
          `\nstatus: ${row.status}${row.effective_status ? ` · efetivo: ${row.effective_status}` : ""}`
        }
      >
        <span className="ec-switch__knob" />
      </button>
      {/* O efetivo só aparece quando diverge: anúncio ATIVO dentro de conjunto
          pausado não está rodando, e o switch sozinho diria o contrário. */}
      {effective && <span className="ec-switch__note">{effective}</span>}
    </div>
  );
}

function DemoCard({ title, rows, metric, metricOf, fmt }: {
  title: string; rows: Breakdown[]; metric: MetricKey;
  metricOf: (o: any, m: MetricKey) => number; fmt: (v: number, m: MetricKey) => string;
}) {
  const data = rows.map((r) => ({ key: r.key, v: metricOf(r, metric) })).filter((r) => r.v > 0);
  const max = Math.max(1, ...data.map((d) => d.v));
  return (
    <div style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted-foreground)", letterSpacing: 0.4, marginBottom: 12 }}>{title}</div>
      {data.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--color-muted-foreground)" }}>Sem dados para o período.</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {data.map((d) => (
            <div key={d.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, color: "var(--color-foreground)", width: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.key}>{d.key}</span>
              <div style={{ flex: 1, height: 8, background: "var(--color-muted)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${Math.round((d.v / max) * 100)}%`, height: "100%", background: TEAL, borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 12, color: "var(--color-foreground)", width: 88, textAlign: "right", fontWeight: 500 }}>{fmt(d.v, metric)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
