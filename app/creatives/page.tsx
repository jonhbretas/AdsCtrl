"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import {
  compareSortValues,
  SortButton,
  SortState,
  usePersistentSort,
} from "@/components/SortableHeader";

type AccountOption = { account_id: string; name: string; platform: string; hidden?: boolean; status: string };
type Diagnostic = { code: string; tone: "positive" | "warning" | "critical" | "neutral"; title: string; detail: string; evidence: string[] };
type Creative = {
  adId: string; adName: string; campaignName: string | null; adsetName: string | null; mediaType: string;
  goal: "messages" | "sales" | "leads" | "traffic" | "engagement" | "awareness" | "app" | "other";
  goalLabel: string;
  asset: { thumbnail: string | null };
  sampleStatus: "no_delivery" | "insufficient" | "learning" | "reliable";
  sample: { label: string; reason: string };
  primaryDiagnosis: Diagnostic | null;
  diagnostics: Diagnostic[];
  metrics: {
    spend: number; impressions: number; frequency: number | null; cpm: number | null;
    linkCtr: number | null; outboundCtr: number | null; landingPageViewRate: number | null; conversionRate: number | null;
    costPerConversion: number | null; roas: number | null; engagementRate: number | null;
    conversions: number; conversionValue: number; messageConversations: number;
    messageRate: number | null; costPerMessage: number | null;
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
type CreativeSortKey =
  | "creative"
  | "spend"
  | "impressions"
  | "frequency"
  | "cpm"
  | "hookRate"
  | "holdRate"
  | "actionCtr"
  | "results"
  | "lpvRate"
  | "resultRate"
  | "costPerResult"
  | "roas"
  | "diagnosis";
type CreativeGoal = Creative["goal"];
type GoalFilter = "all" | CreativeGoal;

const DEFAULT_CREATIVE_SORT: SortState<CreativeSortKey> = {
  key: "spend",
  direction: "desc",
};
const CREATIVE_SORT_KEYS: readonly CreativeSortKey[] = [
  "creative",
  "spend",
  "impressions",
  "frequency",
  "cpm",
  "hookRate",
  "holdRate",
  "actionCtr",
  "results",
  "lpvRate",
  "resultRate",
  "costPerResult",
  "roas",
  "diagnosis",
];
const GOAL_ORDER: CreativeGoal[] = [
  "messages",
  "sales",
  "leads",
  "traffic",
  "engagement",
  "awareness",
  "app",
  "other",
];
const FALLBACK_GOAL_LABELS: Record<CreativeGoal, string> = {
  messages: "Mensagens",
  sales: "Vendas",
  leads: "Leads",
  traffic: "Tráfego",
  engagement: "Engajamento",
  awareness: "Reconhecimento",
  app: "Aplicativo",
  other: "Outros",
};
const SORT_LABELS: Record<CreativeSortKey, string> = {
  creative: "Criativo",
  spend: "Investimento",
  impressions: "Impressões",
  frequency: "Frequência",
  cpm: "CPM",
  hookRate: "Hook",
  holdRate: "Hold",
  actionCtr: "CTR de ação",
  results: "Resultados",
  lpvRate: "LPV rate",
  resultRate: "Taxa de resultado",
  costPerResult: "Custo por resultado",
  roas: "ROAS",
  diagnosis: "Leitura",
};
const hasApplicableRoas = (creative: Creative) =>
  creative.goal === "sales" || creative.metrics.conversionValue > 0;

type VisibleCreativeBenchmarks = {
  frequency: number | null;
  linkCtr: number | null;
  outboundCtr: number | null;
  landingPageViewRate: number | null;
  conversionRate: number | null;
  costPerConversion: number | null;
  messageRate: number | null;
  costPerMessage: number | null;
  roas: number | null;
  hookRate: number | null;
  holdRate: number | null;
};

function creativeMedian(
  creatives: Creative[],
  picker: (creative: Creative) => number | null,
  predicate: (creative: Creative) => boolean = () => true
) {
  const values = creatives
    .filter(
      (creative) =>
        (creative.sampleStatus === "learning" ||
          creative.sampleStatus === "reliable") &&
        predicate(creative)
    )
    .map(picker)
    .filter(
      (value): value is number =>
        value != null && Number.isFinite(value)
    )
    .sort((left, right) => left - right);
  if (values.length < 2) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2
    ? values[middle]
    : (values[middle - 1] + values[middle]) / 2;
}

function benchmarksForVisibleCreatives(
  creatives: Creative[]
): VisibleCreativeBenchmarks {
  return {
    frequency: creativeMedian(creatives, (creative) => creative.metrics.frequency),
    linkCtr: creativeMedian(creatives, (creative) => creative.metrics.linkCtr),
    outboundCtr: creativeMedian(creatives, (creative) => creative.metrics.outboundCtr),
    landingPageViewRate: creativeMedian(
      creatives,
      (creative) => creative.metrics.landingPageViewRate
    ),
    conversionRate: creativeMedian(
      creatives,
      (creative) => creative.metrics.conversionRate
    ),
    costPerConversion: creativeMedian(
      creatives,
      (creative) => creative.metrics.costPerConversion,
      (creative) => creative.metrics.conversions >= 3
    ),
    messageRate: creativeMedian(
      creatives,
      (creative) => creative.metrics.messageRate,
      (creative) => creative.goal === "messages"
    ),
    costPerMessage: creativeMedian(
      creatives,
      (creative) => creative.metrics.costPerMessage,
      (creative) =>
        creative.goal === "messages" &&
        creative.metrics.messageConversations >= 3
    ),
    roas: creativeMedian(
      creatives,
      (creative) => creative.metrics.roas,
      (creative) =>
        hasApplicableRoas(creative) &&
        creative.metrics.conversions >= 3
    ),
    hookRate: creativeMedian(
      creatives,
      (creative) => creative.metrics.video.hookRate,
      (creative) => creative.metrics.video.isVideo
    ),
    holdRate: creativeMedian(
      creatives,
      (creative) => creative.metrics.video.holdRate,
      (creative) => creative.metrics.video.isVideo
    ),
  };
}

const daysAgo = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10);
};
const money = (v: number | null | undefined, currency = "BRL") =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency, maximumFractionDigits: 2 }).format(v);
const pct = (v: number | null | undefined, digits = 1) => v == null ? "—" : `${v.toFixed(digits)}%`;
const number = (v: number | null | undefined) => v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
type BenchmarkSource = "AdsCtrl" | "Meta / CRM" | "Site / Analytics" | "Gestão";
type BenchmarkStage = "Mídia" | "Criativo" | "Funil" | "Operação";
const CREATIVE_BENCHMARKS: readonly {
  stage: BenchmarkStage;
  metric: string;
  reference: string;
  reading: string;
  source: BenchmarkSource;
}[] = [
  { stage: "Mídia", metric: "CTR no link", reference: "2%–5%", reading: "< 2%: revisar ângulo, oferta, headline e CTA.", source: "AdsCtrl" },
  { stage: "Mídia", metric: "Outbound CTR", reference: "≥ 1% saudável · ≥ 1,5% forte", reading: "Mede intenção de saída; compare anúncios do mesmo objetivo.", source: "AdsCtrl" },
  { stage: "Mídia", metric: "CPC de link", reference: "≤ meta · até +15% da mediana", reading: "Não existe faixa monetária universal; país, nicho e leilão dominam o custo.", source: "Meta / CRM" },
  { stage: "Mídia", metric: "CPM", reference: "Dentro de ±15% da mediana", reading: "CPM alto isolado não condena o criativo; cruze com CTR e CPA.", source: "AdsCtrl" },
  { stage: "Mídia", metric: "LPV rate", reference: "≥ 70% saudável · ≥ 85% forte", reading: "< 60%: suspeite de velocidade, redirecionamento ou tracking.", source: "AdsCtrl" },
  { stage: "Funil", metric: "CVR · leads / formulário", reference: "5%–15%", reading: "Clique chega, mas não converte: revisar oferta, página e formulário.", source: "AdsCtrl" },
  { stage: "Funil", metric: "CVR · e-commerce", reference: "1%–3%", reading: "Avaliar junto a ticket, margem, qualidade do tráfego e dispositivo.", source: "AdsCtrl" },
  { stage: "Funil", metric: "Clique → conversa", reference: "≥ mediana da conta", reading: "Muitos cliques sem conversa: CTA, destino ou abordagem inicial com atrito.", source: "AdsCtrl" },
  { stage: "Funil", metric: "CPL", reference: "≤ meta do cliente", reading: "Qualidade do lead e taxa de fechamento valem mais que uma faixa genérica.", source: "AdsCtrl" },
  { stage: "Funil", metric: "CPA / custo por compra", reference: "≤ meta baseada na margem", reading: "O CPA máximo deve respeitar margem, recompra e taxa de aprovação.", source: "AdsCtrl" },
  { stage: "Funil", metric: "ROAS", reference: "≥ ponto de equilíbrio / meta", reading: "A faixa 2x–4x serve só como triagem; margem e recompra definem a meta real.", source: "AdsCtrl" },
  { stage: "Mídia", metric: "Frequência · público frio", reference: "1,5–2,5x por 7 dias", reading: "Acima da faixa com CTR caindo e CPA subindo sugere fadiga.", source: "AdsCtrl" },
  { stage: "Mídia", metric: "Frequência · remarketing", reference: "3–6x por 7 dias", reading: "Tolera mais repetição, mas exige vigilância de rejeição e custo.", source: "AdsCtrl" },
  { stage: "Criativo", metric: "Video hook rate · 3s", reference: "25%–40%+", reading: "< 20%: a abertura não interrompe o scroll.", source: "AdsCtrl" },
  { stage: "Criativo", metric: "Video hold rate · ThruPlay", reference: "15%–30%", reading: "< 15%: o hook chama atenção, mas o conteúdo não sustenta.", source: "AdsCtrl" },
  { stage: "Criativo", metric: "Conclusão do vídeo · 100%", reference: "15%–30%+ direcional", reading: "Depende muito da duração; compare vídeos com duração e formato semelhantes.", source: "AdsCtrl" },
  { stage: "Criativo", metric: "Taxa de engajamento", reference: "3%–8%", reading: "Engajamento sem clique pode indicar entretenimento sem intenção.", source: "AdsCtrl" },
  { stage: "Funil", metric: "Add to cart rate", reference: "5%–12%", reading: "Abaixo: revisar oferta, preço, prova, prazo e confiança.", source: "Meta / CRM" },
  { stage: "Funil", metric: "Initiate checkout rate", reference: "≥ 50% dos ATCs", reading: "Queda entre carrinho e checkout aponta fricção comercial ou técnica.", source: "Meta / CRM" },
  { stage: "Funil", metric: "Purchase conversion rate", reference: "40%–60% dos checkouts", reading: "Queda no pagamento: frete, meios de pagamento, erro ou confiança.", source: "Meta / CRM" },
  { stage: "Funil", metric: "Carregamento da landing page", reference: "< 3 segundos", reading: "Lentidão reduz LPV e conversão, especialmente em mobile.", source: "Site / Analytics" },
  { stage: "Funil", metric: "Bounce rate", reference: "< 50%", reading: "Rejeição alta: promessa do anúncio e página podem estar desalinhadas.", source: "Site / Analytics" },
  { stage: "Mídia", metric: "Ranking de qualidade/relevância", reference: "Médio → acima da média", reading: "Abaixo da média: revisar aderência entre público, mensagem e experiência.", source: "Meta / CRM" },
  { stage: "Operação", metric: "Volume de testes", reference: "3–6 criativos por conjunto", reading: "Variar conceito e ângulo, não apenas cor ou legenda.", source: "Gestão" },
  { stage: "Operação", metric: "Ciclo de renovação", reference: "A cada 7–10 dias", reading: "Antecipar a troca se frequência e CPA subirem com CTR em queda.", source: "Gestão" },
  { stage: "Operação", metric: "Escala de orçamento", reference: "+20%–30% a cada 2–3 dias", reading: "Escalar em degraus após estabilidade; evitar saltos bruscos.", source: "Gestão" },
  { stage: "Operação", metric: "Saída do aprendizado", reference: "≈ 50 conversões/semana/conjunto", reading: "Consolidar estrutura quando o volume estiver pulverizado.", source: "Gestão" },
  { stage: "Operação", metric: "Event match quality", reference: "8/10+", reading: "Qualidade baixa compromete atribuição, otimização e públicos.", source: "Meta / CRM" },
  { stage: "Operação", metric: "Janela de remarketing", reference: "7–30 dias", reading: "Ajustar ao ciclo de decisão e excluir convertidos.", source: "Gestão" },
  { stage: "Operação", metric: "Kill rule", reference: "CPA > 130% da meta", reading: "Pausar somente após amostra suficiente; antes disso, tratar como aprendizado.", source: "Gestão" },
] as const;

const BENCHMARK_STAGE_STYLE: Record<BenchmarkStage, { color: string; background: string }> = {
  Mídia: { color: "#245f9b", background: "#edf5fd" },
  Criativo: { color: "#7441a8", background: "#f5effb" },
  Funil: { color: "#8a5b16", background: "#fff7e8" },
  Operação: { color: "#287746", background: "#edf8f0" },
};

const BENCHMARK_SOURCE_STYLE: Record<BenchmarkSource, { color: string; background: string }> = {
  AdsCtrl: { color: "#176cd2", background: "#edf4fe" },
  "Meta / CRM": { color: "#6e54a3", background: "#f3effa" },
  "Site / Analytics": { color: "#8a5b16", background: "#fff6e6" },
  Gestão: { color: "#287746", background: "#edf8f0" },
};
const BENCHMARK_SOURCE_LABEL: Record<BenchmarkSource, string> = {
  AdsCtrl: "No AdsCtrl",
  "Meta / CRM": "Meta / CRM",
  "Site / Analytics": "Site / Analytics",
  Gestão: "Gestão",
};

export default function CreativesPage() {
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [accountId, setAccountId] = useState("");
  const [since, setSince] = useState(daysAgo(29));
  const [until, setUntil] = useState(daysAgo(0));
  const [lab, setLab] = useState<LabAccount | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<"all" | "video" | "static">("all");
  const [goalFilter, setGoalFilter] = useState<GoalFilter>("all");
  const [sort, setSort] = usePersistentSort<CreativeSortKey>(
    "adsctrl:sort:creatives",
    DEFAULT_CREATIVE_SORT,
    CREATIVE_SORT_KEYS
  );
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

  const goalOptions = useMemo(() => {
    const byGoal = new Map<
      CreativeGoal,
      { goal: CreativeGoal; label: string; count: number }
    >();
    for (const creative of lab?.creatives || []) {
      const current = byGoal.get(creative.goal);
      if (current) current.count += 1;
      else {
        byGoal.set(creative.goal, {
          goal: creative.goal,
          label: creative.goalLabel || FALLBACK_GOAL_LABELS[creative.goal],
          count: 1,
        });
      }
    }
    return GOAL_ORDER.flatMap((goal) => {
      const option = byGoal.get(goal);
      return option ? [option] : [];
    });
  }, [lab]);

  useEffect(() => {
    if (
      goalFilter !== "all" &&
      !goalOptions.some((option) => option.goal === goalFilter)
    ) {
      setGoalFilter("all");
    }
  }, [goalFilter, goalOptions]);

  const benchmarkCohort = useMemo(() => {
    let rows = [...(lab?.creatives || [])];
    if (goalFilter !== "all") {
      rows = rows.filter((creative) => creative.goal === goalFilter);
    }
    return rows;
  }, [lab, goalFilter]);

  const creatives = useMemo(() => {
    let rows = [...benchmarkCohort];
    if (format === "video") rows = rows.filter((c) => c.metrics.video.isVideo);
    if (format === "static") rows = rows.filter((c) => !c.metrics.video.isVideo);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((c) => `${c.adName} ${c.campaignName || ""} ${c.adsetName || ""}`.toLowerCase().includes(q));
    }
    const value = (creative: Creative) => {
      const metrics = creative.metrics;
      switch (sort.key) {
        case "creative": return creative.adName;
        case "spend": return metrics.spend;
        case "impressions": return metrics.impressions;
        case "frequency": return metrics.frequency;
        case "cpm": return metrics.cpm;
        case "hookRate": return metrics.video.isVideo ? metrics.video.hookRate : null;
        case "holdRate": return metrics.video.isVideo ? metrics.video.holdRate : null;
        case "actionCtr":
          return creative.goal === "messages" ? metrics.linkCtr : metrics.outboundCtr;
        case "results":
          return creative.goal === "messages"
            ? metrics.messageConversations
            : metrics.conversions;
        case "lpvRate":
          return creative.goal === "messages" ? null : metrics.landingPageViewRate;
        case "resultRate":
          return creative.goal === "messages"
            ? metrics.messageRate
            : metrics.conversionRate;
        case "costPerResult":
          if (
            (creative.goal === "messages"
              ? metrics.messageConversations
              : metrics.conversions) < 3
          ) return null;
          return creative.goal === "messages"
            ? metrics.costPerMessage
            : metrics.costPerConversion;
        case "roas":
          return !hasApplicableRoas(creative) || metrics.conversions < 3
            ? null
            : metrics.roas;
        case "diagnosis": {
          const tone = creative.primaryDiagnosis?.tone;
          if (tone === "critical") return 0;
          if (tone === "warning") return 1;
          if (creative.sampleStatus === "no_delivery") return 2;
          if (creative.sampleStatus === "insufficient") return 3;
          if (tone === "positive") return 4;
          if (tone === "neutral") return 5;
          return 6;
        }
      }
    };
    const decisionMetric = new Set<CreativeSortKey>([
      "hookRate",
      "holdRate",
      "actionCtr",
      "results",
      "lpvRate",
      "resultRate",
      "costPerResult",
      "roas",
    ]);
    const sampleRank = (creative: Creative) =>
      ({
        reliable: 0,
        learning: 1,
        insufficient: 2,
        no_delivery: 3,
      })[creative.sampleStatus];
    return rows.sort((left, right) => {
      const leftValue = value(left);
      const rightValue = value(right);
      const leftMissing =
        leftValue == null ||
        (typeof leftValue === "number" && Number.isNaN(leftValue));
      const rightMissing =
        rightValue == null ||
        (typeof rightValue === "number" && Number.isNaN(rightValue));
      if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
      const metricOrder = compareSortValues(
        leftValue,
        rightValue,
        sort.direction
      );
      if (metricOrder) return metricOrder;
      if (decisionMetric.has(sort.key) && !leftMissing && !rightMissing) {
        const sampleOrder = sampleRank(left) - sampleRank(right);
        if (sampleOrder) return sampleOrder;
      }
      return (
        compareSortValues(
          left.metrics.impressions,
          right.metrics.impressions,
          "desc"
        ) ||
        compareSortValues(left.adName, right.adName, "asc")
      );
    });
  }, [benchmarkCohort, format, search, sort]);

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
          <MetricGuide currency={lab.currency} />
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
              <div style={{ marginRight: 8 }}><PanelTitle title="Heatmap de criativos" subtitle={`${creatives.length} anúncios · cores vs. mediana do mesmo objetivo`} /></div>
              <div style={{ display: "flex", gap: 3, background: "#f2f2f0", padding: 3, borderRadius: 9 }}>
                {(["all", "video", "static"] as const).map((key) => <Toggle key={key} active={format === key} onClick={() => setFormat(key)}>{key === "all" ? "Todos" : key === "video" ? "Vídeos" : "Estáticos"}</Toggle>)}
              </div>
              <Field label="Objetivo">
                <select
                  value={goalFilter}
                  onChange={(event) =>
                    setGoalFilter(event.target.value as GoalFilter)
                  }
                  style={{ ...inputStyle, minWidth: 154 }}
                >
                  <option value="all">Todos os objetivos</option>
                  {goalOptions.map((option) => (
                    <option key={option.goal} value={option.goal}>
                      {option.label} ({option.count})
                    </option>
                  ))}
                </select>
              </Field>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar criativo…" style={{ ...inputStyle, minWidth: 180 }} />
              <span style={{ flex: 1 }} />
              {goalFilter === "all" && goalOptions.length > 1 && (
                <span
                  title="Conversas, leads e vendas têm valores econômicos diferentes."
                  style={{
                    color: "#946516",
                    background: "#fff8e9",
                    border: "1px solid #f1dfb8",
                    borderRadius: 999,
                    padding: "6px 9px",
                    fontSize: 10,
                    fontWeight: 650,
                    whiteSpace: "nowrap",
                  }}
                >
                  Filtre o objetivo para comparar custos
                </span>
              )}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  minHeight: 30,
                  padding: "0 8px 0 10px",
                  border: "1px solid #dfe6ef",
                  borderRadius: 999,
                  background: "#f7faff",
                  color: "#536173",
                  fontSize: 10.5,
                  whiteSpace: "nowrap",
                }}
                title="A seta ordena pelo valor exibido; em caso de empate, a amostra mais confiável vem primeiro."
              >
                <span>Ordenação:</span>
                <strong style={{ color: "#286fc9" }}>
                  {SORT_LABELS[sort.key]} {sort.direction === "asc" ? "↑" : "↓"}
                </strong>
                {(sort.key !== DEFAULT_CREATIVE_SORT.key ||
                  sort.direction !== DEFAULT_CREATIVE_SORT.direction) && (
                  <button
                    type="button"
                    onClick={() => setSort({ ...DEFAULT_CREATIVE_SORT })}
                    style={{
                      border: 0,
                      borderLeft: "1px solid #dfe6ef",
                      background: "transparent",
                      color: "#5e6b7d",
                      padding: "2px 0 2px 7px",
                      font: "inherit",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Restaurar
                  </button>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "7px 15px", borderBottom: "1px solid #ececea", background: "#fcfcfb", color: "#7b7b76", fontSize: 9.5 }}>
              <strong style={{ color: "#555" }}>Legenda do heatmap:</strong>
              <span><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#eaf7ee", border: "1px solid #cfe9d6", marginRight: 4 }} />melhor que a mediana</span>
              <span><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#fff8e9", border: "1px solid #f0dfb4", marginRight: 4 }} />próximo da mediana</span>
              <span><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#fff0ee", border: "1px solid #efd2ce", marginRight: 4 }} />pior que a mediana</span>
              <span><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#fafafa", border: "1px solid #e7e7e4", marginRight: 4 }} />sem amostra/referência</span>
              <span style={{ marginLeft: "auto" }}>Leitura automática compara anúncios do mesmo objetivo.</span>
            </div>
            <CreativeTable
              creatives={creatives}
              benchmarkCohort={benchmarkCohort}
              account={lab}
              sort={sort}
              onSort={setSort}
            />
          </section>
        </>
      )}
    </div>
  );
}

function Summary({ account }: { account: LabAccount }) {
  const s = account.summary;
  const messages = account.creatives.length > 0 && account.creatives.every((c) => c.goal === "messages");
  const hasRoas = account.creatives.some(hasApplicableRoas);
  return (
    <section style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 9, marginBottom: 14 }}>
      <Metric label="Investimento" value={money(s.spend, account.currency)} />
      <Metric label="Criativos ativos" value={`${s.creativesWithDelivery}/${s.creatives}`} />
      <Metric label="CPM" value={money(s.cpm, account.currency)} />
      <Metric label="Hook rate" value={pct(s.video?.hookRate)} accent />
      <Metric label="Hold rate" value={pct(s.video?.holdRate)} accent />
      <Metric label={messages ? "CTR no link" : "Outbound CTR"} value={pct(messages ? s.linkCtr : s.outboundCtr, 2)} />
      <Metric
        label={messages ? "Custo / conversa" : hasRoas ? "CPA / ROAS" : "Custo / resultado"}
        value={
          messages
            ? `${money(s.costPerMessage, account.currency)} · ${number(s.messageConversations)} conversas`
            : hasRoas
              ? `${money(s.costPerConversion, account.currency)} · ${s.roas == null ? "—" : `${s.roas.toFixed(2)}x`}`
              : money(s.costPerConversion, account.currency)
        }
      />
    </section>
  );
}

function MetricGuide({ currency }: { currency: string }) {
  const accountCurrency = (currency || "BRL").toUpperCase();
  return (
    <details open style={{ ...panelStyle, marginBottom: 14, padding: 0, overflow: "hidden" }}>
      <summary style={{ cursor: "pointer", listStyle: "none", padding: "15px 16px", display: "flex", alignItems: "center", gap: 12, background: "#f7fafc" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 780 }}>Benchmarks práticos de criativos e funil</div>
          <div style={{ fontSize: 10.5, color: "#77808b", marginTop: 3 }}>Faixas de triagem no estilo “cola PPC”: métrica, referência, gargalo e onde validar</div>
        </div>
        <span style={{ fontSize: 10, fontWeight: 800, color: "#087b8d", background: "#e4f7fa", borderRadius: 999, padding: "5px 9px" }}>{CREATIVE_BENCHMARKS.length} REFERÊNCIAS</span>
      </summary>
      <div style={{ borderTop: "1px solid #e6ebef", padding: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 8, marginBottom: 12 }}>
          {[
            ["1", "Meta do cliente", "Margem, CPL/CPA e ROAS de equilíbrio"],
            ["2", "Mediana da conta", "Mesmo objetivo, janela e amostra comparável"],
            ["3", "Faixa de mercado", "Somente como orientação inicial"],
          ].map(([order, title, detail]) => (
            <div key={order} style={{ display: "flex", gap: 9, alignItems: "center", border: "1px solid #e2e8ee", borderRadius: 9, padding: "9px 10px", background: "#fff" }}>
              <span style={{ width: 22, height: 22, borderRadius: "50%", display: "grid", placeItems: "center", flexShrink: 0, background: order === "1" ? "#102d4f" : order === "2" ? "#087f94" : "#e9eef3", color: order === "3" ? "#5e6975" : "#fff", fontSize: 10, fontWeight: 800 }}>{order}</span>
              <div>
                <div style={{ fontSize: 11, fontWeight: 760, color: "#253342" }}>{title}</div>
                <div style={{ fontSize: 9.5, color: "#87909a", marginTop: 1 }}>{detail}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ border: "1px solid #dce4eb", borderRadius: 11, overflow: "auto", maxHeight: 470, background: "#fff" }}>
          <table style={{ width: "100%", minWidth: 1020, borderCollapse: "collapse" }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
              <tr style={{ background: "#102d4f", color: "#fff", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.35 }}>
                <th style={{ width: 48, padding: "10px 8px", textAlign: "center" }}>#</th>
                <th style={{ width: 94, padding: "10px 9px", textAlign: "left" }}>Etapa</th>
                <th style={{ width: 230, padding: "10px 10px", textAlign: "left" }}>Métrica</th>
                <th style={{ width: 230, padding: "10px 10px", textAlign: "left", background: "#087f94" }}>Referência ideal</th>
                <th style={{ padding: "10px 12px", textAlign: "left" }}>Leitura / próxima ação</th>
                <th style={{ width: 115, padding: "10px 10px", textAlign: "center" }}>Dado disponível em</th>
              </tr>
            </thead>
            <tbody>
              {CREATIVE_BENCHMARKS.map((item, index) => {
                const stageStyle = BENCHMARK_STAGE_STYLE[item.stage];
                const sourceStyle = BENCHMARK_SOURCE_STYLE[item.source];
                return (
                  <tr key={`${item.stage}-${item.metric}`} style={{ borderTop: "1px solid #edf0f2", background: index % 2 ? "#fbfcfd" : "#fff" }}>
                    <td style={{ padding: "9px 8px", textAlign: "center" }}>
                      <span style={{ width: 21, height: 21, display: "inline-grid", placeItems: "center", borderRadius: "50%", color: "#102d4f", background: "#eaf0f6", fontSize: 9.5, fontWeight: 800 }}>{index + 1}</span>
                    </td>
                    <td style={{ padding: "9px" }}>
                      <span style={{ display: "inline-flex", color: stageStyle.color, background: stageStyle.background, borderRadius: 999, padding: "3px 7px", fontSize: 9, fontWeight: 800 }}>{item.stage}</span>
                    </td>
                    <td style={{ padding: "9px 10px", color: "#273544", fontSize: 11, fontWeight: 720 }}>{item.metric}</td>
                    <td style={{ padding: "9px 10px", color: "#147347", background: index % 2 ? "#f0faf3" : "#f5fcf7", fontSize: 11, fontWeight: 780 }}>{item.reference}</td>
                    <td style={{ padding: "9px 12px", color: "#65707b", fontSize: 10.5, lineHeight: 1.38 }}>{item.reading}</td>
                    <td style={{ padding: "9px 10px", textAlign: "center" }}>
                      <span style={{ display: "inline-flex", justifyContent: "center", color: sourceStyle.color, background: sourceStyle.background, borderRadius: 999, padding: "3px 7px", fontSize: 8.5, fontWeight: 800, whiteSpace: "nowrap" }}>{BENCHMARK_SOURCE_LABEL[item.source]}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10, borderRadius: 9, padding: "9px 11px", background: "#fff8e9", color: "#805714", fontSize: 10.5, lineHeight: 1.45 }}>
          <strong>Como usar:</strong> esta conta está em <strong>{accountCurrency}</strong>. Por isso, CPC, CPM, CPL e CPA devem permanecer na moeda da conta e ser julgados pela meta do cliente e pela própria mediana — não por valores universais em dólar. As cores usam a mediana dos anúncios com amostra do mesmo objetivo no período; busca e filtro de formato não alteram essa referência. Com menos de dois pares comparáveis, a célula fica neutra. Esta tabela é uma referência secundária e não um benchmark oficial da Meta.
        </div>
      </div>
    </details>
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

function CreativeTable({
  creatives,
  benchmarkCohort,
  account,
  sort,
  onSort,
}: {
  creatives: Creative[];
  benchmarkCohort: Creative[];
  account: LabAccount;
  sort: SortState<CreativeSortKey>;
  onSort: (next: SortState<CreativeSortKey>) => void;
}) {
  const benchmarksByGoal = useMemo(() => {
    const output = new Map<CreativeGoal, VisibleCreativeBenchmarks>();
    for (const goal of new Set(benchmarkCohort.map((creative) => creative.goal))) {
      output.set(
        goal,
        benchmarksForVisibleCreatives(
          benchmarkCohort.filter((creative) => creative.goal === goal)
        )
      );
    }
    return output;
  }, [benchmarkCohort]);
  const messagesOnly = creatives.length > 0 && creatives.every((c) => c.goal === "messages");
  const showLpv = creatives.some((creative) => creative.goal !== "messages");
  const showRoas = creatives.some(
    hasApplicableRoas
  );
  useEffect(() => {
    if (
      creatives.length > 0 &&
      ((!showLpv && sort.key === "lpvRate") ||
        (!showRoas && sort.key === "roas"))
    ) {
      onSort({ key: "results", direction: "desc" });
    }
  }, [creatives.length, showLpv, showRoas, sort.key, onSort]);
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1380 }}>
        <thead><tr style={{ color: "#888", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.25 }}>
          <Th sortKey="creative" sort={sort} onSort={onSort} align="left">Criativo</Th>
          <Th sortKey="spend" sort={sort} onSort={onSort} initialDirection="desc">Spend</Th>
          <Th sortKey="impressions" sort={sort} onSort={onSort} initialDirection="desc">Impr.</Th>
          <Th sortKey="frequency" sort={sort} onSort={onSort} initialDirection="desc">Freq.</Th>
          <Th sortKey="cpm" sort={sort} onSort={onSort} initialDirection="desc">CPM</Th>
          <Th sortKey="hookRate" sort={sort} onSort={onSort} initialDirection="desc">Hook</Th>
          <Th sortKey="holdRate" sort={sort} onSort={onSort} initialDirection="desc">Hold</Th>
          <Th sortKey="actionCtr" sort={sort} onSort={onSort} initialDirection="desc">{messagesOnly ? "CTR no link" : "CTR de ação"}</Th>
          <Th sortKey="results" sort={sort} onSort={onSort} initialDirection="desc">{messagesOnly ? "Conversas" : "Resultados"}</Th>
          {showLpv && <Th sortKey="lpvRate" sort={sort} onSort={onSort} initialDirection="desc">LPV rate</Th>}
          <Th sortKey="resultRate" sort={sort} onSort={onSort} initialDirection="desc">{messagesOnly ? "Taxa conversa" : "Taxa resultado"}</Th>
          <Th sortKey="costPerResult" sort={sort} onSort={onSort}>{messagesOnly ? "Custo/conversa" : "Custo/resultado"}</Th>
          {showRoas && <Th sortKey="roas" sort={sort} onSort={onSort} initialDirection="desc">ROAS</Th>}
          <Th sortKey="diagnosis" sort={sort} onSort={onSort} align="left">Leitura</Th>
        </tr></thead>
        <tbody>{creatives.map((c) => {
          const m = c.metrics, video = m.video;
          const b = benchmarksByGoal.get(c.goal)!;
          const isMessages = c.goal === "messages";
          const resultCount = isMessages
            ? m.messageConversations
            : m.conversions;
          const lowEconomicSample = resultCount < 3;
          const roasApplicable = hasApplicableRoas(c);
          return (
            <tr key={c.adId} style={{ borderTop: "1px solid #efefed", opacity: c.sampleStatus === "no_delivery" ? 0.58 : 1 }}>
              <td style={{ padding: "9px 12px", minWidth: 265 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {c.asset.thumbnail ? <img src={c.asset.thumbnail} alt="" width={52} height={52} style={{ width: 52, height: 52, borderRadius: 8, objectFit: "cover", background: "#eee" }} /> : <div style={{ width: 52, height: 52, borderRadius: 8, background: "#eee", display: "grid", placeItems: "center", color: "#aaa", fontSize: 18 }}>◫</div>}
                  <div style={{ minWidth: 0 }}><div title={c.adName} style={{ maxWidth: 250, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 12.5, fontWeight: 650 }}>{c.adName}</div><div style={{ fontSize: 10, color: "#999", marginTop: 3 }}>{c.campaignName || "—"} · <span style={{ color: "#3970b7", fontWeight: 700 }}>{c.goalLabel}</span> · {c.sample.label}</div></div>
                </div>
              </td>
              <Td>{money(m.spend, account.currency)}</Td><Td>{number(m.impressions)}</Td><Td>{number(m.frequency)}</Td><Td>{money(m.cpm, account.currency)}</Td>
              <Heat value={video.hookRate} benchmark={b.hookRate} sample={c.sampleStatus}>{video.isVideo ? pct(video.hookRate) : "—"}</Heat>
              <Heat value={video.holdRate} benchmark={b.holdRate} sample={c.sampleStatus}>{video.isVideo ? pct(video.holdRate) : "—"}</Heat>
              <Heat value={isMessages ? m.linkCtr : m.outboundCtr} benchmark={isMessages ? b.linkCtr : b.outboundCtr} sample={c.sampleStatus}>{pct(isMessages ? m.linkCtr : m.outboundCtr, 2)}</Heat>
              <Td>{number(resultCount)}</Td>
              {showLpv && <Heat value={isMessages ? null : m.landingPageViewRate} benchmark={b.landingPageViewRate} sample={c.sampleStatus}>{isMessages ? "—" : pct(m.landingPageViewRate)}</Heat>}
              <Heat value={isMessages ? m.messageRate : m.conversionRate} benchmark={isMessages ? b.messageRate : b.conversionRate} sample={c.sampleStatus}>{pct(isMessages ? m.messageRate : m.conversionRate)}</Heat>
              <Heat
                value={isMessages ? m.costPerMessage : m.costPerConversion}
                benchmark={isMessages ? b.costPerMessage : b.costPerConversion}
                sample={lowEconomicSample ? "insufficient" : c.sampleStatus}
                invert
              >
                <EconomicValue
                  value={money(
                    isMessages ? m.costPerMessage : m.costPerConversion,
                    account.currency
                  )}
                  lowSample={lowEconomicSample}
                  resultCount={resultCount}
                />
              </Heat>
              {showRoas && (
                <Heat
                  value={roasApplicable ? m.roas : null}
                  benchmark={b.roas}
                  sample={
                    roasApplicable && lowEconomicSample
                      ? "insufficient"
                      : c.sampleStatus
                  }
                >
                  {!roasApplicable ? (
                    <span title="ROAS aparece somente para vendas ou quando há valor de conversão atribuído.">—</span>
                  ) : (
                    <EconomicValue
                      value={m.roas == null ? "—" : `${m.roas.toFixed(2)}x`}
                      lowSample={lowEconomicSample}
                      resultCount={resultCount}
                    />
                  )}
                </Heat>
              )}
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
function EconomicValue({
  value,
  lowSample,
  resultCount,
}: {
  value: string;
  lowSample: boolean;
  resultCount: number;
}) {
  return (
    <span
      title={
        lowSample
          ? "São necessários pelo menos 3 resultados para classificar esta métrica."
          : undefined
      }
      style={{ display: "inline-grid", justifyItems: "end", gap: 2 }}
    >
      <span>{value}</span>
      {lowSample && (
        <small
          style={{
            color: "#8b8b86",
            fontSize: 8.5,
            fontWeight: 700,
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          n={number(resultCount)} · baixa amostra
        </small>
      )}
    </span>
  );
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
function Th({
  children,
  align = "right",
  sortKey,
  sort,
  onSort,
  initialDirection = "asc",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  sortKey: CreativeSortKey;
  sort: SortState<CreativeSortKey>;
  onSort: (next: SortState<CreativeSortKey>) => void;
  initialDirection?: "asc" | "desc";
}) {
  return (
    <th
      aria-sort={sort.key === sortKey ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
      style={{ padding: "10px 8px", textAlign: align, fontWeight: 700, background: "#fafaf9", borderTop: "1px solid #eee" }}
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
function Td({ children }: { children: React.ReactNode }) { return <td style={{ padding: "9px 8px", textAlign: "right", fontSize: 11.5, color: "#444", whiteSpace: "nowrap" }}>{children}</td>; }
function Empty({ text }: { text: string }) { return <div style={{ height: "100%", minHeight: 100, display: "grid", placeItems: "center", color: "#aaa", fontSize: 12 }}>{text}</div>; }
const inputStyle: React.CSSProperties = { height: 34, boxSizing: "border-box", border: "1px solid #dededb", borderRadius: 8, background: "#fff", padding: "0 9px", color: "#333", fontSize: 11.5 };
const panelStyle: React.CSSProperties = { border: "1px solid #e8e8e5", borderRadius: 13, background: "#fff", padding: 15 };
