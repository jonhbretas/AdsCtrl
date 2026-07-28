"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import {
  compareSortValues, SortButton, SortState, usePersistentSort,
} from "@/components/SortableHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select, Notice, PageHeader, WideScreenHint, Field, EmptyState } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { money, num } from "@/lib/format";
import { AlertTriangle, Search, ExternalLink, RefreshCw, Play, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";

type AccountOption = { account_id: string; name: string; platform: string; hidden?: boolean; status: string };
type Diagnostic = { code: string; tone: "positive" | "warning" | "critical" | "neutral"; title: string; detail: string; evidence: string[] };
type CreativeFormat = "VIDEO" | "IMAGE" | "CAROUSEL" | "OTHER";
type Creative = {
  adId: string; adName: string; campaignName: string | null; adsetName: string | null; mediaType: CreativeFormat;
  goal: "messages" | "sales" | "leads" | "traffic" | "engagement" | "awareness" | "app" | "other";
  goalLabel: string; asset: { thumbnail: string | null };
  sampleStatus: "no_delivery" | "insufficient" | "learning" | "reliable";
  sample: { label: string; reason: string };
  primaryDiagnosis: Diagnostic | null; diagnostics: Diagnostic[];
  metrics: { spend: number; impressions: number; frequency: number | null; cpm: number | null;
    linkCtr: number | null; outboundCtr: number | null; landingPageViewRate: number | null; conversionRate: number | null;
    costPerConversion: number | null; roas: number | null; engagementRate: number | null;
    conversions: number; conversionValue: number; messageConversations: number;
    messageRate: number | null; costPerMessage: number | null;
    video: { isVideo: boolean; hookRate: number | null; holdRate: number | null; retention25: number | null; retention50: number | null; retention75: number | null; completionRate: number | null; avgWatchTimeSeconds: number | null; }; };
};
type LabAccount = { account_id: string; account_name: string; currency: string; summary: any; creatives: Creative[]; };
type CreativeSortKey = "creative" | "spend" | "impressions" | "frequency" | "cpm" | "hookRate" | "holdRate" | "actionCtr" | "results" | "lpvRate" | "resultRate" | "costPerResult" | "roas" | "diagnosis";
type CreativeGoal = Creative["goal"]; type GoalFilter = "all" | CreativeGoal;

const DEFAULT_CREATIVE_SORT: SortState<CreativeSortKey> = { key: "spend", direction: "desc" };
const CREATIVE_SORT_KEYS: readonly CreativeSortKey[] = ["creative", "spend", "impressions", "frequency", "cpm", "hookRate", "holdRate", "actionCtr", "results", "lpvRate", "resultRate", "costPerResult", "roas", "diagnosis"];
const GOAL_ORDER: CreativeGoal[] = ["messages", "sales", "leads", "traffic", "engagement", "awareness", "other", "app"];
const FALLBACK_GOAL_LABELS: Record<CreativeGoal, string> = { messages: "Mensagens", sales: "Vendas", leads: "Leads", traffic: "Tráfego", engagement: "Engajamento", awareness: "Reconhecimento", app: "Aplicativo", other: "Outros" };
const SORT_LABELS: Record<CreativeSortKey, string> = { creative: "Criativo", spend: "Investimento", impressions: "Impressões", frequency: "Frequência", cpm: "CPM", hookRate: "Hook", holdRate: "Hold", actionCtr: "CTR de ação", results: "Resultados", lpvRate: "LPV rate", resultRate: "Taxa de resultado", costPerResult: "Custo por resultado", roas: "ROAS", diagnosis: "Leitura" };

function formatBucket(mt: CreativeFormat): "video" | "image" | "carousel" {
  if (mt === "VIDEO") return "video"; if (mt === "CAROUSEL") return "carousel"; return "image";
}
const FORMAT_LABELS: Record<CreativeFormat, string> = { VIDEO: "Vídeo", IMAGE: "Estático", CAROUSEL: "Carrossel", OTHER: "Estático" };
const hasApplicableRoas = (c: Creative) => c.goal === "sales" || c.metrics.conversionValue > 0;

type RejectedAd = { adId?: string; name?: string; thumbnail?: string | null; reason?: string; };

function creativeMedian(creatives: Creative[], picker: (c: Creative) => number | null, predicate: (c: Creative) => boolean = () => true) {
  const vals = creatives.filter((c) => (c.sampleStatus === "learning" || c.sampleStatus === "reliable") && predicate(c)).map(picker).filter((v): v is number => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  if (vals.length < 2) return null; const m = Math.floor(vals.length / 2); return vals.length % 2 === 0 ? (vals[m - 1] + vals[m]) / 2 : vals[m];
}

function benchmarksForVisibleCreatives(creatives: Creative[]) {
  const byGoal = new Map<CreativeGoal, Creative[]>();
  for (const c of creatives) { if (!byGoal.has(c.goal)) byGoal.set(c.goal, []); byGoal.get(c.goal)!.push(c); }
  return (goal: CreativeGoal, picker: (c: Creative) => number | null) => creativeMedian(byGoal.get(goal) || [], picker);
}

export default function CreativesPage() {
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [accountId, setAccountId] = useState("");
  const [lab, setLab] = useState<LabAccount | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const [deepLinkNotice, setDeepLinkNotice] = useState<string | null>(null);
  const [period, setPeriod] = useState<"7d" | "14d" | "30d">("7d");
  const [format, setFormat] = useState<"all" | "video" | "image" | "carousel">("all");
  const [goalFilter, setGoalFilter] = useState<GoalFilter>("all");
  const [onlyFocus, setOnlyFocus] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = usePersistentSort<CreativeSortKey>("adsctrl:sort:creatives", DEFAULT_CREATIVE_SORT, CREATIVE_SORT_KEYS);
  const [focusAds, setFocusAds] = useState<Set<string>>(new Set());
  const [rejected, setRejected] = useState<RejectedAd[] | null>(null);
  const [rejectedError, setRejectedError] = useState<string | null>(null);

  useEffect(() => {
    (async () => { try { const r = await fetch("/api/accounts"); const d = await r.json(); if (r.ok) setAccounts(d.accounts || []); } catch {} })();
    const params = new URLSearchParams(window.location.search);
    const a = params.get("account"); const iss = params.get("issue"); const ads = params.get("ads");
    if (a) setAccountId(a); if (iss) setIssue(iss);
    if (ads) setFocusAds(new Set(ads.split(",")));
  }, []);

  useEffect(() => {
    if (!issue || !accountId) return;
    setLoading(true); setError(null);
    fetch(`/api/creatives/rejected?account_id=${encodeURIComponent(accountId)}`).then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Falha."); setRejected(d.ads || []); }).catch((e) => setRejectedError(e?.message)).finally(() => setLoading(false));
  }, [issue, accountId]);

  async function analyze() {
    if (!accountId) return; setLoading(true); setError(null); setLab(null); setRejected(null); setRejectedError(null);
    try {
      const [lr, rr] = await Promise.all([fetch(`/api/creatives/meta?account_id=${encodeURIComponent(accountId)}&period=${period}`, { cache: "no-store" }), fetch(`/api/creatives/rejected?account_id=${encodeURIComponent(accountId)}`, { cache: "no-store" }).catch(() => null)]);
      const text = await lr.text();
      let ld;
      try { ld = JSON.parse(text); } catch { throw new Error(`Resposta inválida da API: ${text.slice(0, 200)}`); }
      if (!lr.ok || ld.error) throw new Error(ld.error || `HTTP ${lr.status}`);
      const acct = ld.accounts?.[0];
      if (!acct) throw new Error(`Nenhum retorno da API para esta conta.`);
      setLab(acct);
      if (rr && rr.ok) { const rd = await rr.json(); setRejected(rd.ads || []); }
    } catch (e: any) { setError(e?.message); } finally { setLoading(false); }
  }

  const creativesList = lab?.creatives || [];
  const filtered = useMemo(() => {
    let list = [...creativesList];
    if (onlyFocus && focusAds.size > 0) list = list.filter((c) => focusAds.has(c.adId));
    if (format !== "all") list = list.filter((c) => formatBucket(c.mediaType) === format);
    if (goalFilter !== "all") list = list.filter((c) => c.goal === goalFilter);
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter((c) => c.adName.toLowerCase().includes(q) || c.campaignName?.toLowerCase().includes(q)); }
    return list;
  }, [creativesList, format, goalFilter, search, focusAds, onlyFocus]);

  const benchmark = useMemo(() => lab ? benchmarksForVisibleCreatives(filtered) : null, [lab, filtered]);
  const goalCounts = useMemo(() => {
    if (!lab) return [];
    const counts = new Map<CreativeGoal, number>();
    for (const c of creativesList) counts.set(c.goal, (counts.get(c.goal) || 0) + 1);
    return GOAL_ORDER.filter((g) => counts.has(g)).map((g) => ({ goal: g, label: FALLBACK_GOAL_LABELS[g], count: counts.get(g)! }));
  }, [lab, creativesList]);
  const scatter = useMemo(() => creativesList.filter((c) => c.mediaType === "VIDEO" && c.metrics.video.hookRate != null && c.metrics.outboundCtr != null && c.metrics.spend > 0).map((c) => ({ hook: c.metrics.video.hookRate!, ctr: c.metrics.outboundCtr!, spend: c.metrics.spend, name: c.adName })), [creativesList]);

  const sorted = useMemo(() => {
    const val = (c: Creative) => { switch (sort.key) { case "creative": return c.adName; case "spend": return c.metrics.spend; case "impressions": return c.metrics.impressions; case "frequency": return c.metrics.frequency ?? -1; case "cpm": return c.metrics.cpm ?? -1; case "hookRate": return c.metrics.video.hookRate ?? -1; case "holdRate": return c.metrics.video.holdRate ?? -1; case "actionCtr": return c.metrics.outboundCtr ?? c.metrics.linkCtr ?? -1; case "results": return c.metrics.conversions; case "lpvRate": return c.metrics.landingPageViewRate ?? -1; case "resultRate": return c.metrics.conversionRate ?? -1; case "costPerResult": return c.metrics.costPerConversion ?? -1; case "roas": return c.metrics.roas ?? -1; case "diagnosis": return c.primaryDiagnosis ? 0 : 1; } };
    return [...filtered].sort((a, b) => { const av = val(a), bv = val(b); return compareSortValues(av, bv, sort.direction) || compareSortValues(a.metrics.spend, b.metrics.spend, "desc"); });
  }, [filtered, sort]);

  return (
    <div className="p-4 md:p-6 md:ml-56 pb-20 md:pb-6 space-y-4 animate-fade-in">
      <PageHeader title="Laboratório de Criativos" subtitle="Diagnóstico e heatmap de criativos Meta." actions={issue && <Button variant="ghost" size="sm" onClick={() => setIssue(null)}><RotateCcw className="h-3.5 w-3.5 mr-1" /> Voltar ao laboratório</Button>} />
      <WideScreenHint />

      {error && <Notice tone="danger" onDismiss={() => setError(null)}>{error}</Notice>}
      {deepLinkNotice && <Notice tone="warn" onDismiss={() => setDeepLinkNotice(null)}>{deepLinkNotice}</Notice>}

      {issue === "rejected" && <RejectedPanel ads={rejected} error={rejectedError} accountId={accountId} onDismiss={() => setIssue(null)} />}

      {/* Controls */}
      <Card><CardContent className="p-4">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Conta"><Select value={accountId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAccountId(e.target.value)} className="min-w-[200px]"><option value="">Selecione uma conta Meta…</option>{accounts.filter((a) => a.platform === "meta" && a.status === "ACTIVE" && !a.hidden).map((a) => <option key={a.account_id} value={a.account_id}>{a.name}</option>)}</Select></Field>
          <Field label="Período"><Select value={period} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setPeriod(e.target.value as any)}><option value="7d">7 dias</option><option value="14d">14 dias</option><option value="30d">30 dias</option></Select></Field>
          <Button onClick={analyze} disabled={loading || !accountId} className="h-9 mb-0.5">{loading ? <><RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> Analisando…</> : <><Play className="h-3.5 w-3.5 mr-1" /> Analisar</>}</Button>
        </div>
      </CardContent></Card>

      {loading && !lab && <div className="space-y-2"><Notice tone="brand">Consultando anúncios, vídeos e thumbnails na Meta — costuma levar alguns segundos.</Notice><div className="grid grid-cols-3 gap-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div><Skeleton className="h-64 rounded-xl" /></div>}
      {!loading && !lab && !error && <EmptyState icon="◉" title="Escolha uma conta e clique em Analisar" hint="O laboratório busca os anúncios do período na Meta, calcula a mediana por objetivo e aponta qual criativo merece continuar no ar." />}

      {lab && (
        <>
          <Summary account={lab} />
          <MetricGuide currency={lab.currency} />

          {(!lab.creatives || lab.creatives.length === 0) && (
            <Notice tone="warn">Nenhum criativo encontrado no período. Faça uma coleta primeiro ou escolha outro período.</Notice>
          )}

          {lab.creatives && lab.creatives.length > 0 && (
            <>
              {/* Video Funnel + Scatter */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <VideoFunnel account={lab} />
                <div className="rounded-lg border border-border/50 bg-card p-4">
                  <PanelTitle title="Quadrante criativo" subtitle="Hook × outbound CTR · bolha = investimento" />
                  <div className="h-[280px]">{scatter.length < 2 ? <Empty text="Poucos vídeos com amostra para o quadrante." /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 10, right: 16, bottom: 12, left: 2 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                        <XAxis type="number" dataKey="hook" name="Hook" unit="%" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                        <YAxis type="number" dataKey="ctr" name="Outbound CTR" unit="%" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} width={48} />
                        <ZAxis type="number" dataKey="spend" range={[55, 450]} />
                        <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(v: any, n: any) => n === "spend" ? money(Number(v), lab.currency) : `${Number(v).toFixed(2)}%`} contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)" }} />
                        <Scatter data={scatter} fill="var(--color-chart-1)" fillOpacity={0.72} />
                      </ScatterChart>
                    </ResponsiveContainer>
                  )}</div>
                </div>
              </div>

              {/* Heatmap */}
              <Card className="overflow-hidden"><CardContent className="p-0">
                <div className="flex flex-wrap items-end gap-2 px-4 py-3 border-b border-border/50 bg-muted/10">
                  <div className="mr-2"><PanelTitle title="Heatmap de criativos" subtitle={`${sorted.length} anúncios · cores vs. mediana do mesmo objetivo`} /></div>
                  <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/50 border border-border/50">
                    {(["all", "video", "image", "carousel"] as const).map((key) => (
                      <Toggle key={key} active={format === key} onClick={() => setFormat(key)}>{key === "all" ? "Todos" : key === "video" ? "Vídeos" : key === "image" ? "Estáticos" : "Carrossel"}</Toggle>
                    ))}
                  </div>
                  {focusAds.size > 0 && (
                    <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <Toggle active={onlyFocus} onClick={() => setOnlyFocus(true)}>Só do alerta ({focusAds.size})</Toggle>
                      <Toggle active={!onlyFocus} onClick={() => setOnlyFocus(false)}>Toda a conta</Toggle>
                    </div>
                  )}
                  <Field label="Objetivo"><Select value={goalFilter} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setGoalFilter(e.target.value as GoalFilter)} className="min-w-[154px]"><option value="all">Todos os objetivos</option>{goalCounts.map((o) => <option key={o.goal} value={o.goal}>{o.label} ({o.count})</option>)}</Select></Field>
                  <Input value={search} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)} placeholder="Buscar criativo…" className="min-w-[180px]" />
                  {goalFilter === "all" && goalCounts.length > 1 && <span className="px-2.5 py-1 text-[10px] font-semibold rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20 whitespace-nowrap">Filtre o objetivo para comparar custos</span>}
                  <div className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full border border-border/50 bg-muted/20 text-[10px] text-muted-foreground">
                    <span>Ordenação:</span><strong className="text-primary">{SORT_LABELS[sort.key]} {sort.direction === "asc" ? "↑" : "↓"}</strong>
                    {(sort.key !== DEFAULT_CREATIVE_SORT.key || sort.direction !== DEFAULT_CREATIVE_SORT.direction) && <button onClick={() => setSort({ ...DEFAULT_CREATIVE_SORT })} className="border-l border-border/50 pl-2 font-bold hover:text-foreground bg-transparent border-none cursor-pointer">Restaurar</button>}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-border/50 bg-muted/10 text-[9.5px] text-muted-foreground">
                  <strong className="text-foreground">Legenda do heatmap:</strong>
                  <span><i className="inline-block w-2 h-2 rounded-xs mr-1" style={{ backgroundColor: "#eaf7ee", border: "1px solid #cfe9d6" }} />melhor que a mediana</span>
                  <span><i className="inline-block w-2 h-2 rounded-xs mr-1" style={{ backgroundColor: "#fff8e9", border: "1px solid #f0dfb4" }} />próximo da mediana</span>
                  <span><i className="inline-block w-2 h-2 rounded-xs mr-1" style={{ backgroundColor: "#fff0ee", border: "1px solid #efd2ce" }} />pior que a mediana</span>
                  <span><i className="inline-block w-2 h-2 rounded-xs mr-1" style={{ backgroundColor: "#fafafa", border: "1px solid #e7e7e4" }} />sem amostra/referência</span>
                  <span className="ml-auto">Leitura automática compara anúncios do mesmo objetivo.</span>
                </div>

                <CreativeTable creatives={sorted} benchmark={benchmark} account={lab} sort={sort} onSort={setSort} focusAds={focusAds} />
              </CardContent></Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ============ SUBCOMPONENTS ============ */

function RejectedPanel({ ads, error, accountId, onDismiss }: { ads: RejectedAd[] | null; error: string | null; accountId: string; onDismiss: () => void; }) {
  if (error) return <div className="mb-4"><Notice tone="danger">{error}</Notice></div>;
  if (!ads) return null;
  return (
    <Card className="border-amber-500/30 bg-amber-500/5"><CardContent className="p-4">
      <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-semibold">Criativos reprovados</h3><Button variant="ghost" size="sm" onClick={onDismiss}>✕ Fechar</Button></div>
      {ads.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum criativo reprovado encontrado.</p> : (
        <div className="space-y-2">{ads.slice(0, 20).map((ad, i) => <RejectedRow key={i} ad={ad} accountId={accountId} />)}</div>
      )}
    </CardContent></Card>
  );
}

function RejectedRow({ ad, accountId }: { ad: RejectedAd; accountId: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-card">
      {ad.thumbnail && <img src={ad.thumbnail} alt="" className="w-12 h-12 rounded object-cover shrink-0" />}
      <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{ad.name || ad.adId || "Sem nome"}</div><div className="text-xs text-muted-foreground mt-0.5">{ad.reason || "Motivo não informado"}</div></div>
      <a href={`https://adsmanager.facebook.com/adsmanager/manage/ads?act=${encodeURIComponent(accountId.replace(/^act_/, ""))}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline shrink-0"><ExternalLink className="h-3 w-3" />Ver</a>
    </div>
  );
}

function Summary({ account }: { account: LabAccount }) {
  const c = account.creatives || [];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <SummaryKpi label="Anúncios analisados" value={String(c.length)} />
      <SummaryKpi label="Investimento no período" value={money(account.summary?.spend || 0, account.currency)} />
      <SummaryKpi label="Com amostra confiável" value={String(c.filter((cr) => cr.sampleStatus === "reliable" || cr.sampleStatus === "learning").length)} />
      <SummaryKpi label="Com diagnóstico" value={String(c.filter((cr) => cr.primaryDiagnosis).length)} />
    </div>
  );
}

function SummaryKpi({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground font-medium">{label}</div><div className="text-xl font-bold tracking-tight mt-1">{value}</div></CardContent></Card>;
}

function ActionTypesDebug({ account }: { account: LabAccount }) {
  return null;
}

function MetricGuide({ currency }: { currency: string }) {
  return null;
}

function VideoFunnel({ account }: { account: LabAccount }) {
  const c = account.creatives || [];
  const videos = c.filter((cr) => cr.metrics.video.isVideo && cr.sampleStatus !== "no_delivery" && cr.sampleStatus !== "insufficient");
  const avgHook = videos.length ? videos.reduce((s, cr) => s + (cr.metrics.video.hookRate || 0), 0) / videos.length : null;
  const avgHold = videos.length ? videos.reduce((s, cr) => s + (cr.metrics.video.holdRate || 0), 0) / videos.length : null;
  const avg25 = videos.length ? videos.reduce((s, cr) => s + (cr.metrics.video.retention25 || 0), 0) / videos.length : null;
  const avg50 = videos.length ? videos.reduce((s, cr) => s + (cr.metrics.video.retention50 || 0), 0) / videos.length : null;
  const avg75 = videos.length ? videos.reduce((s, cr) => s + (cr.metrics.video.retention75 || 0), 0) / videos.length : null;
  const avgComp = videos.length ? videos.reduce((s, cr) => s + (cr.metrics.video.completionRate || 0), 0) / videos.length : null;
  const avgWatch = videos.length ? videos.reduce((s, cr) => s + (cr.metrics.video.avgWatchTimeSeconds || 0), 0) / videos.length : null;

  return (
    <div className="rounded-lg border border-border/50 bg-card p-4">
      <PanelTitle title="Funil de vídeo" subtitle={`Média de ${videos.length} vídeo${videos.length === 1 ? "" : "s"} com amostra`} />
      <div className="space-y-1.5 mt-3">
        {videos.length === 0 ? <p className="text-sm text-muted-foreground py-4">Nenhum vídeo com amostra no período.</p> : (
          <>
            <FunnelStep label="Hook" value={avgHook} />
            <FunnelStep label="Hold" value={avgHold} />
            <FunnelStep label="Retenção 25%" value={avg25} />
            <FunnelStep label="Retenção 50%" value={avg50} />
            <FunnelStep label="Retenção 75%" value={avg75} />
            <FunnelStep label="Completude" value={avgComp} />
            {avgWatch != null && <div className="text-[11px] text-muted-foreground mt-1">Tempo médio: {avgWatch.toFixed(1)}s</div>}
          </>
        )}
      </div>
    </div>
  );
}

function FunnelStep({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-muted-foreground w-24 text-right shrink-0">{label}</span>
      <div className="flex-1 h-4 rounded bg-muted overflow-hidden">
                <div className="h-full rounded bg-primary transition-all" style={{ width: value != null ? `${Math.min(value, 100)}%` : "0%" }} />
      </div>
      <span className="text-xs font-semibold w-12 text-right tabular-nums">{value != null ? `${(value * 100).toFixed(1)}%` : "—"}</span>
    </div>
  );
}

function CreativeTable({ creatives, benchmark, account, sort, onSort, focusAds }: {
  creatives: Creative[]; benchmark: ((goal: CreativeGoal, picker: (c: Creative) => number | null) => number | null) | null;
  account: LabAccount; sort: SortState<CreativeSortKey>; onSort: (s: SortState<CreativeSortKey>) => void; focusAds: Set<string>;
}) {
  const m = (v: number) => money(v, account.currency);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1200px]">
        <div className="grid gap-2 px-4 py-2 border-b border-border/50 bg-muted/30 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider items-center" style={{ gridTemplateColumns: "28px 2fr 80px 80px 100px 80px 70px 70px 80px 70px 80px 80px 80px 80px 1fr" }}>
          <span /><SortButton column="creative" sort={sort} onSort={onSort} align="left">Nome</SortButton>
          <SortButton column="spend" sort={sort} onSort={onSort} initialDirection="desc">Invest.</SortButton>
          <SortButton column="impressions" sort={sort} onSort={onSort} initialDirection="desc">Impr.</SortButton>
          <SortButton column="frequency" sort={sort} onSort={onSort} initialDirection="desc">Freq.</SortButton>
          <SortButton column="cpm" sort={sort} onSort={onSort} initialDirection="desc">CPM</SortButton>
          <SortButton column="hookRate" sort={sort} onSort={onSort} initialDirection="desc">Hook</SortButton>
          <SortButton column="holdRate" sort={sort} onSort={onSort} initialDirection="desc">Hold</SortButton>
          <SortButton column="actionCtr" sort={sort} onSort={onSort} initialDirection="desc">CTR</SortButton>
          <SortButton column="results" sort={sort} onSort={onSort} initialDirection="desc">Result.</SortButton>
          <SortButton column="lpvRate" sort={sort} onSort={onSort} initialDirection="desc">LPV</SortButton>
          <SortButton column="resultRate" sort={sort} onSort={onSort} initialDirection="desc">Tx.Res.</SortButton>
          <SortButton column="costPerResult" sort={sort} onSort={onSort} initialDirection="desc">C.Res.</SortButton>
          <SortButton column="roas" sort={sort} onSort={onSort} initialDirection="desc">ROAS</SortButton>
          <SortButton column="diagnosis" sort={sort} onSort={onSort} align="left">Leitura</SortButton>
        </div>
        {creatives.map((c, i) => {
          const BM = benchmark ? (picker: (cr: Creative) => number | null) => benchmark(c.goal, picker) : null;
          return (
            <div key={c.adId || i} className={cn("grid gap-2 px-4 py-2.5 border-b border-border/30 items-center text-xs hover:bg-accent/20 transition-colors", focusAds.has(c.adId) && "bg-amber-500/5")} style={{ gridTemplateColumns: "28px 2fr 80px 80px 100px 80px 70px 70px 80px 70px 80px 80px 80px 80px 1fr" }}>
              <div>{c.asset.thumbnail ? <img src={c.asset.thumbnail} alt="" className="w-7 h-7 rounded object-cover" /> : <div className="w-7 h-7 rounded bg-muted" />}</div>
              <div className="min-w-0"><div className="text-sm font-semibold truncate" title={c.adName}>{c.adName}</div><div className="text-[10px] text-muted-foreground truncate">{c.campaignName} · {c.adsetName}</div></div>
              <div className="text-right tabular-nums font-medium">{m(c.metrics.spend)}</div>
              <div className="text-right tabular-nums">{num(c.metrics.impressions)}</div>
              <div className="text-right tabular-nums">{c.metrics.frequency?.toFixed(2) ?? "—"}</div>
              <div className="text-right tabular-nums">{c.metrics.cpm ? m(c.metrics.cpm) : "—"}</div>
              <Heat value={isRelevant(c.goal, "hookRate") && c.metrics.video.hookRate != null ? c.metrics.video.hookRate : null} benchmark={BM ? BM((cr) => cr.metrics.video.hookRate) : null} sample={c.sampleStatus}>{c.metrics.video.hookRate != null && c.metrics.video.isVideo ? `${c.metrics.video.hookRate.toFixed(1)}%` : "—"}</Heat>
              <Heat value={isRelevant(c.goal, "holdRate") && c.metrics.video.holdRate != null ? c.metrics.video.holdRate : null} benchmark={BM ? BM((cr) => cr.metrics.video.holdRate) : null} sample={c.sampleStatus}>{c.metrics.video.holdRate != null && c.metrics.video.isVideo ? `${c.metrics.video.holdRate.toFixed(1)}%` : "—"}</Heat>
              <Heat value={c.metrics.outboundCtr} benchmark={BM ? BM((cr) => cr.metrics.outboundCtr) : null} sample={c.sampleStatus}>{c.metrics.outboundCtr != null ? `${c.metrics.outboundCtr.toFixed(2)}%` : c.metrics.linkCtr != null ? `${c.metrics.linkCtr.toFixed(2)}%` : "—"}</Heat>
              <div className="text-right tabular-nums font-medium">{isRelevant(c.goal, "conversions") ? num(c.metrics.conversions) : "—"}</div>
              <Heat value={isRelevant(c.goal, "landingPageViewRate") ? c.metrics.landingPageViewRate : null} benchmark={BM ? BM((cr) => cr.metrics.landingPageViewRate) : null} sample={c.sampleStatus}>{isRelevant(c.goal, "landingPageViewRate") && c.metrics.landingPageViewRate != null ? `${c.metrics.landingPageViewRate.toFixed(1)}%` : "—"}</Heat>
              <Heat value={isRelevant(c.goal, "conversionRate") ? c.metrics.conversionRate : null} benchmark={BM ? BM((cr) => cr.metrics.conversionRate) : null} sample={c.sampleStatus} invert>{isRelevant(c.goal, "conversionRate") && c.metrics.conversionRate != null ? `${c.metrics.conversionRate.toFixed(2)}%` : "—"}</Heat>
              <Heat value={isRelevant(c.goal, "costPerConversion") ? c.metrics.costPerConversion : null} benchmark={BM ? BM((cr) => cr.metrics.costPerConversion) : null} sample={c.sampleStatus} invert>{isRelevant(c.goal, "costPerConversion") && c.metrics.costPerConversion != null ? m(c.metrics.costPerConversion) : "—"}</Heat>
              <Heat value={isRelevant(c.goal, "roas") && hasApplicableRoas(c) ? c.metrics.roas : null} benchmark={BM ? BM((cr) => cr.metrics.roas) : null} sample={c.sampleStatus}>{isRelevant(c.goal, "roas") && hasApplicableRoas(c) && c.metrics.roas != null ? `${c.metrics.roas.toFixed(2)}x` : "—"}</Heat>
              <Diagnosis diagnosis={c.primaryDiagnosis} sample={c.sample} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RetentionFunnel({ creative }: { creative: Creative }) {
  const v = creative.metrics.video;
  if (!v.isVideo) return null;
  const steps = [
    { label: "Hook", val: v.hookRate }, { label: "Hold", val: v.holdRate },
    { label: "25%", val: v.retention25 }, { label: "50%", val: v.retention50 },
    { label: "75%", val: v.retention75 }, { label: "Completude", val: v.completionRate },
  ];
  return <div className="space-y-0.5 mt-2">{steps.map((s) => <div key={s.label} className="flex items-center gap-1 text-[10px]"><span className="text-muted-foreground w-14 text-right">{s.label}</span><div className="flex-1 h-2.5 rounded bg-muted overflow-hidden"><div className="h-full rounded bg-primary transition-all" style={{ width: s.val != null ? `${Math.min(s.val * 100, 100)}%` : "0%" }} /></div><span className="w-10 text-right tabular-nums font-medium">{s.val != null ? `${(s.val * 100).toFixed(0)}%` : "—"}</span></div>)}</div>;
}

function Heat({ value, benchmark, sample, invert, children }: { value: number | null; benchmark: number | null; sample: string; invert?: boolean; children: React.ReactNode }) {
  let bg = "bg-transparent";
  if (value != null && benchmark != null && (sample === "reliable" || sample === "learning")) {
    const better = invert ? value < benchmark * 0.9 : value > benchmark * 1.1;
    const worse = invert ? value > benchmark * 1.1 : value < benchmark * 0.9;
    bg = better ? "bg-emerald-100 dark:bg-emerald-900/30" : worse ? "bg-red-100 dark:bg-red-900/30" : "bg-amber-50 dark:bg-amber-900/20";
  }
  return <div className={cn("text-right tabular-nums font-medium rounded px-0.5", bg)}>{children}</div>;
}

function EconomicValue({ creative, currency }: { creative: Creative; currency: string }) {
  const roas = creative.metrics.roas; const cv = creative.metrics.conversionValue;
  if (creative.goal !== "sales" || !roas || !cv) return null;
  return <span className="text-[10px] text-muted-foreground">{money(cv, currency)} ({roas.toFixed(2)}x)</span>;
}

function Diagnosis({ diagnosis, sample }: { diagnosis: Diagnostic | null; sample: { label: string; reason: string } }) {
  if (!diagnosis) return <span className="text-muted-foreground text-[10px]">{sample.label}: {sample.reason}</span>;
  return (
    <div className="text-[10px] leading-tight" title={diagnosis.detail}>
      <span className={cn("font-semibold", diagnosis.tone === "positive" ? "text-emerald-500" : diagnosis.tone === "critical" ? "text-red-500" : diagnosis.tone === "warning" ? "text-amber-500" : "text-muted-foreground")}>{diagnosis.title}</span>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return <div className={cn("border-l-2 pl-2.5 py-1", accent ? "border-primary" : "border-border")}><div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{label}</div><div className="text-sm font-bold tabular-nums">{value}</div></div>;
}

function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <><h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4><p className="text-[11px] text-muted-foreground">{subtitle}</p></>;
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={cn("px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors border-none cursor-pointer", active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent")}>{children}</button>;
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground text-center py-8">{text}</p>;
}

// Métricas relevantes por objetivo — cada coluna só aparece se fizer sentido.
function isRelevant(goal: CreativeGoal, metric: string): boolean {
  switch (goal) {
    case "sales": return !["messageRate", "costPerMessage", "engagementRate"].includes(metric);
    case "messages": return !["roas", "landingPageViewRate", "conversionRate", "costPerConversion", "hookRate", "holdRate"].includes(metric);
    case "leads": return !["roas", "messageRate", "costPerMessage", "hookRate", "holdRate", "engagementRate"].includes(metric);
    case "traffic": return !["roas", "conversionRate", "costPerConversion", "messageRate", "costPerMessage", "hookRate", "holdRate", "landingPageViewRate", "engagementRate"].includes(metric);
    case "engagement": return !["roas", "conversionRate", "costPerConversion", "landingPageViewRate", "messageRate", "costPerMessage"].includes(metric);
    case "awareness": return !["roas", "conversionRate", "costPerConversion", "landingPageViewRate", "messageRate", "costPerMessage", "hookRate", "holdRate", "outboundCtr"].includes(metric);
    case "app": return !["roas", "landingPageViewRate", "hookRate", "holdRate", "messageRate", "costPerMessage", "engagementRate"].includes(metric);
    default: return true;
  }
}
