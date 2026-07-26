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
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  money, moneyShort, num, pct, dayLabel, weekdayLabel, resultLabel,
  pickPrimaryResult, orderedResults, pickVal, delta, roas,
  PURCHASE_KEYS, ATC_KEYS, CHECKOUT_KEYS, LINKCLICK_KEYS,
  RESULT_FAMILY_BY_SLUG,
} from "@/lib/format";
import {
  compareSortValues,
  SortButton,
  SortState,
  usePersistentSort,
} from "@/components/SortableHeader";

interface Vals { results: Record<string, number>; values: Record<string, number> }
interface Row extends Vals {
  id: string; name: string; spend: number; impressions: number; clicks: number;
  ctr: number; cpm: number; objective?: string; thumbnail?: string;
  // status = configurado no objeto; effective_status = o que a Meta faz de
  // fato (pode estar pausado pelo pai, reprovado ou fora do período).
  status?: string; effective_status?: string;
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
  error?: string;
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

  if (loading) return <div style={{ padding: 32, color: "#888", fontSize: 14 }}>Carregando dados do {platformLabel}…</div>;
  if (error)
    return <div style={{ padding: 24 }}><div style={{ background: "#fceceb", color: "#a32d2d", padding: "10px 14px", borderRadius: 8, fontSize: 14 }}>{error}</div></div>;
  if (!data) return null;

  const k = data.kpis, p = data.prevKpis;
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
    <div style={{ padding: "8px 4px 24px", background: "#fafafa" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 15 }}>{platformLabel}</strong>
        <span style={{ fontSize: 12, color: "#aaa" }}>vs. período anterior ({data.prevRange.since} → {data.prevRange.until})</span>
        <span style={{ flex: 1 }} />
        <a href={`/report/${accountId}?since=${since}&until=${until}`} target="_blank" rel="noreferrer"
           style={{ fontSize: 12, color: ACCENT, textDecoration: "none", border: `1px solid ${ACCENT}33`, borderRadius: 8, padding: "5px 10px" }}>
          ⤓ Relatório / PDF
        </a>
        <label style={{ fontSize: 12, color: "#888" }}>Resultado:</label>
        <select value={result ?? ""} onChange={(e) => setResult(e.target.value)}
                style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13 }}>
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 12 }}>
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 12 }}>
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
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
          <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 12, padding: 16, marginBottom: 24 }}>
            <div style={{ display: "grid", gap: 8 }}>
              {funnel.map((s, i) => {
                const top = funnel[0].v || 1;
                const w = Math.max(4, Math.round((s.v / top) * 100));
                const conv = i > 0 && funnel[i - 1].v ? (s.v / funnel[i - 1].v) * 100 : null;
                return (
                  <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ width: 130, fontSize: 13, color: "#555" }}>{s.label}</span>
                    <div style={{ flex: 1, background: "#f2f2f2", borderRadius: 6, overflow: "hidden", height: 26 }}>
                      <div style={{ width: `${w}%`, height: "100%", background: `linear-gradient(90deg, ${ACCENT}, ${TEAL})`, borderRadius: 6, display: "flex", alignItems: "center", paddingLeft: 10, color: "#fff", fontSize: 12, fontWeight: 600 }}>
                        {num(s.v)}
                      </div>
                    </div>
                    <span style={{ width: 70, textAlign: "right", fontSize: 12, color: conv == null ? "transparent" : "#888" }}>
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
      <ChartCard height={260}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.daily.map((d) => ({ ...d, label: dayLabel(d.date) }))} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#999" }} tickLine={false} axisLine={false} />
            <YAxis yAxisId="l" tick={{ fontSize: 11, fill: "#999" }} tickLine={false} axisLine={false} tickFormatter={(v) => formatMoneyShort(v)} width={56} />
            <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: "#999" }} tickLine={false} axisLine={false} tickFormatter={(v) => formatMoneyShort(v)} width={48} />
            <Tooltip formatter={(v: any, n: any) => [formatMoney(Number(v)), n === "spend" ? "Investimento" : "CPM"]} />
            <Bar yAxisId="l" dataKey="spend" name="Investimento" fill={TEAL} radius={[4, 4, 0, 0]} maxBarSize={48} />
            <Line yAxisId="r" type="monotone" dataKey="cpm" name="CPM" stroke={ACCENT2} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* TABELA CAMPANHAS/CONJUNTOS/ANÚNCIOS */}
      <SectionTitle>Tabela de campanhas</SectionTitle>
      {changeNote && (
        <div
          style={{
            margin: "0 0 10px",
            padding: "9px 12px",
            borderRadius: 9,
            fontSize: 12.5,
            background: changeNote.bad ? "#fdf0ef" : "#eef7f1",
            border: `1px solid ${changeNote.bad ? "#f0cfcc" : "#cfe6d8"}`,
            color: changeNote.bad ? "#a3372f" : "#2b7143",
          }}
        >
          {changeNote.text}
          {!changeNote.bad && " A alteração aparece em Últimas edições."}
        </div>
      )}
      <div style={{ border: "1px solid #eee", borderRadius: 12, background: "#fff", overflow: "hidden", marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 4, padding: 10, borderBottom: "1px solid #f0f0f0" }}>
          {(["campaigns", "adsets", "ads"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: tab === t ? "#111" : "transparent", color: tab === t ? "#fff" : "#666", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
              {t === "campaigns" ? "Campanhas" : t === "adsets" ? "Conjuntos" : "Anúncios"}
            </button>
          ))}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 760 }}>
            <thead>
              <tr style={{ color: "#999", textAlign: "right" }}>
                <Th sortKey="name" sort={tableSort} onSort={setTableSort} style={{ textAlign: "left" }}>{tab === "ads" ? "Anúncio" : tab === "adsets" ? "Conjunto" : "Campanha"}</Th>
                <Th sortKey="spend" sort={tableSort} onSort={setTableSort} initialDirection="desc">Investimento</Th>
                <Th sortKey="impressions" sort={tableSort} onSort={setTableSort} initialDirection="desc">Impressões</Th>
                <Th sortKey="clicks" sort={tableSort} onSort={setTableSort} initialDirection="desc">Cliques</Th>
                <Th sortKey="ctr" sort={tableSort} onSort={setTableSort} initialDirection="desc">CTR</Th>
                <Th sortKey="result" sort={tableSort} onSort={setTableSort} initialDirection="desc">Resultado</Th>
                <Th sortKey="cpr" sort={tableSort} onSort={setTableSort}>CPR</Th>
                <Th sortKey="roas" sort={tableSort} onSort={setTableSort} initialDirection="desc">ROAS</Th>
                {platform === "meta" && <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 500 }}>Veiculação</th>}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={platform === "meta" ? 9 : 8} style={{ padding: 20, textAlign: "center", color: "#aaa" }}>Sem dados no período.</td></tr>}
              {rows.map((r) => {
                const res = resultOf(r);
                const rv = pickVal(r.values, PURCHASE_KEYS);
                return (
                  <tr key={r.id} style={{ borderTop: "1px solid #f4f4f4" }}>
                    <td style={{ padding: "10px 14px", textAlign: "left" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {tab === "ads" && r.thumbnail && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.thumbnail} alt="" width={34} height={34} style={{ borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                        )}
                        <span style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.name}>{r.name}</span>
                      </div>
                    </td>
                    <Td>{formatMoney(r.spend)}</Td><Td>{num(r.impressions)}</Td><Td>{num(r.clicks)}</Td><Td>{pct(r.ctr)}</Td>
                    <Td accent>{num(res)}</Td><Td>{res ? formatMoney(r.spend / res) : "—"}</Td>
                    <Td>{rv > 0 && r.spend > 0 ? `${(rv / r.spend).toFixed(2)}x` : "—"}</Td>
                    {platform === "meta" && (
                      <td style={{ padding: "10px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <DeliveryCell
                          row={r}
                          busy={changing === r.id}
                          onToggle={() => toggleDelivery(r)}
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* OBJETIVOS */}
      <SectionTitle>Detalhamento dos objetivos</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
        <ChartCard height={220} title="Investimento por objetivo">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byObjective} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <XAxis type="number" tickFormatter={(v) => formatMoneyShort(v)} tick={{ fontSize: 11, fill: "#999" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="objective" width={130} tick={{ fontSize: 11, fill: "#666" }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: any) => formatMoney(Number(v))} />
              <Bar dataKey="spend" fill={TEAL} radius={[0, 4, 4, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard height={220} title="Resultados por dia">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data.daily.map((d) => ({ label: dayLabel(d.date), res: resultOf(d), cpm: d.cpm }))} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
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

      {/* DEMOGRÁFICOS + DISPOSITIVO */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 12px" }}>
        <SectionTitle noMargin>Segmentações</SectionTitle>
        <span style={{ flex: 1 }} />
        <label style={{ fontSize: 12, color: "#888" }}>Visualizar por:</label>
        <select value={demoMetric} onChange={(e) => setDemoMetric(e.target.value as MetricKey)} style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13 }}>
          {(Object.keys(METRIC_LABELS) as MetricKey[]).map((m) => <option key={m} value={m}>{METRIC_LABELS[m]}</option>)}
        </select>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <DemoCard title="PLATAFORMA" rows={data.breakdowns.platform} metric={demoMetric} metricOf={metricOf} fmt={fmtMetric} />
        <DemoCard title="DISPOSITIVO" rows={data.breakdowns.device} metric={demoMetric} metricOf={metricOf} fmt={fmtMetric} />
        <DemoCard title="POSIÇÃO (TOP 10)" rows={data.breakdowns.position.slice(0, 10)} metric={demoMetric} metricOf={metricOf} fmt={fmtMetric} />
        <DemoCard title="REGIÃO (TOP 10)" rows={data.breakdowns.region.slice(0, 10)} metric={demoMetric} metricOf={metricOf} fmt={fmtMetric} />
        <DemoCard title="IDADE E GÊNERO" rows={data.breakdowns.age_gender.slice(0, 12)} metric={demoMetric} metricOf={metricOf} fmt={fmtMetric} />
        <DemoCard title="DIA DA SEMANA" rows={byWeekday} metric={demoMetric} metricOf={metricOf} fmt={fmtMetric} />
      </div>

      {/* POR HORA */}
      <ChartCard height={200} title="Por hora do dia">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.breakdowns.hour.map((h) => ({ label: h.key, v: metricOf(h, demoMetric) }))} margin={{ top: 6, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#999" }} tickLine={false} axisLine={false} interval={1} />
            <YAxis tick={{ fontSize: 11, fill: "#999" }} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => (demoMetric === "spend" || demoMetric === "cpm" || demoMetric === "cpr" ? formatMoneyShort(v) : num(v))} />
            <Tooltip formatter={(v: any) => fmtMetric(Number(v), demoMetric)} />
            <Bar dataKey="v" fill={ACCENT} radius={[3, 3, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

// ---------- subcomponentes ----------

function DeltaBadge({ cur, prev, invert, neutral }: { cur: number; prev: number; invert?: boolean; neutral?: boolean }) {
  const d = delta(cur, prev);
  if (!d.hasPrev) return <span style={{ fontSize: 11, color: "#bbb" }}>—</span>;
  const up = d.pct >= 0;
  const good = invert ? !up : up;
  const color = neutral || Math.abs(d.pct) < 0.05 ? "#999" : good ? "#16a34a" : "#dc2626";
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color }}>
      {up ? "▲" : "▼"} {Math.abs(d.pct).toFixed(1)}%
    </span>
  );
}

function KpiCard({ label, value, sub, cur, prev, invert, neutral }: { label: string; value: string; sub?: string; cur?: number; prev?: number; invert?: boolean; neutral?: boolean }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: "#999", letterSpacing: 0.4, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: "#111" }}>{value}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 3, gap: 6 }}>
        <span style={{ fontSize: 12, color: "#999" }}>{sub || ""}</span>
        {cur != null && prev != null && <DeltaBadge cur={cur} prev={prev} invert={invert} neutral={neutral} />}
      </div>
    </div>
  );
}

function MiniKpi({ label, value, cur, prev, invert, neutral }: { label: string; value: string; cur?: number; prev?: number; invert?: boolean; neutral?: boolean }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 11, color: "#999" }}>{label}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6, marginTop: 2 }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>{value}</span>
        {cur != null && prev != null && <DeltaBadge cur={cur} prev={prev} invert={invert} neutral={neutral} />}
      </div>
    </div>
  );
}

function SectionTitle({ children, noMargin }: { children: React.ReactNode; noMargin?: boolean }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: "#888", letterSpacing: 0.6, textTransform: "uppercase", margin: noMargin ? 0 : "8px 0 12px" }}>{children}</div>;
}

function ChartCard({ children, height, title }: { children: React.ReactNode; height: number; title?: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 12, padding: 12, marginBottom: 24 }}>
      {title && <div style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>{title}</div>}
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
  return <td style={{ padding: "10px 14px", textAlign: "right", color: accent ? ACCENT : "#333", fontWeight: accent ? 600 : 400 }}>{children}</td>;
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

function DeliveryCell({ row, busy, onToggle }: { row: Row; busy: boolean; onToggle: () => void }) {
  if (!row.status) return <span style={{ color: "#bbb", fontSize: 12 }}>—</span>;

  const active = row.status === "ACTIVE";
  // Arquivado/excluído não voltam por um clique: mostra o estado e nada mais.
  const frozen = row.status === "ARCHIVED" || row.status === "DELETED";
  const effective = row.effective_status && row.effective_status !== row.status
    ? EFFECTIVE_LABEL[row.effective_status] || row.effective_status.toLowerCase().replace(/_/g, " ")
    : null;

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
        <span
          title={`status: ${row.status}${row.effective_status ? ` · efetivo: ${row.effective_status}` : ""}`}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 11.5, fontWeight: 600, color: active ? "#2b7143" : "#8a6116",
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: active ? "#2bb36b" : "#e0a83a" }} />
          {active ? "Ativo" : frozen ? EFFECTIVE_LABEL[row.status] : "Pausado"}
        </span>
        {!frozen && (
          <button
            onClick={onToggle}
            disabled={busy}
            title={active ? "Pausar a veiculação na Meta" : "Reativar a veiculação na Meta"}
            style={{
              padding: "4px 10px", borderRadius: 7,
              border: `1px solid ${active ? "#f0d8b4" : "#cfe0f5"}`,
              background: busy ? "#f4f4f5" : "#fff",
              color: busy ? "#aaa" : active ? "#8a6116" : "#1768ca",
              fontSize: 11, fontWeight: 650,
              cursor: busy ? "default" : "pointer",
            }}
          >
            {busy ? "…" : active ? "Pausar" : "Reativar"}
          </button>
        )}
      </div>
      {effective && <span style={{ fontSize: 10, color: "#a0a4ad" }}>na Meta: {effective}</span>}
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
