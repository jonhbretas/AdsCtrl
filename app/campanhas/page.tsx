"use client";

// app/campanhas/page.tsx
// Tela dedicada às campanhas de uma conta, em árvore: expandir a campanha
// mostra os conjuntos dela; expandir o conjunto mostra os anúncios. Cada
// nível tem pausar/reativar, orçamento (CP e CJ), duplicar (CP entre contas;
// CJ e anúncio na própria conta) e a criação de CP fica no topo.
// O dashboard leva a esta tela ao clicar no cliente/conta.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Check, ChevronDown, ChevronRight, Copy, MessageCircle, Plus, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, readJson } from "@/lib/utils";
import {
  money, num, pct, pickVal, resultLabel, pickPrimaryResult, orderedResults, brDate, objectiveLabel,
  RESULT_FAMILIES, RESULT_FAMILY_BY_SLUG, PURCHASE_KEYS,
} from "@/lib/format";
import { compareSortValues, SortButton, SortState, usePersistentSort } from "@/components/SortableHeader";
import DuplicateCampaign from "@/components/DuplicateCampaign";
import AccountChanges from "@/components/AccountChanges";
import StrategicSummaryCard from "@/components/StrategicSummaryCard";
import StructureWizard from "@/components/StructureWizard";
import { BrDateInput } from "@/components/BrDateInput";
import QuickAccess from "@/components/QuickAccess";
import { buildWhatsAppReport } from "@/lib/whatsapp-report";

interface Row {
  id: string; name: string; spend: number; impressions: number; clicks: number;
  ctr: number; cpm: number; objective?: string; thumbnail?: string; permalink?: string;
  status?: string; effective_status?: string;
  results: Record<string, number>; values: Record<string, number>;
  campaign_id?: string; adset_id?: string;
}
interface Detail {
  campaigns: Row[]; adsets: Row[]; ads: Row[];
  availableResults: string[];
  result_family?: string | null;
  error?: string;
  kpis?: { spend: number; results: Record<string, number>; values?: Record<string, number> };
  breakdowns?: { region?: { key: string; spend: number }[]; platform?: { key: string; spend: number }[]; age_gender?: { key: string; spend: number }[] };
}
interface AccountInfo { account_id: string; name: string; platform: "meta" | "google"; hidden?: boolean; currency?: string }

type RowLevel = "campaign" | "adset" | "ad";
type ResultKey = "name" | "spend" | "impressions" | "clicks" | "ctr" | "result" | "cpr" | "roas";
const SORT_KEYS: readonly ResultKey[] = ["name", "spend", "impressions", "clicks", "ctr", "result", "cpr", "roas"];

const FAMILY_PREFIX = "family:";
const ACTION_PREFIX = "action:";
const CONVERSION_FAMILIES = ["vendas", "mensagens", "leads", "cadastros"];
const ALL_CONVERSIONS = `${FAMILY_PREFIX}conversoes`;

// Datas no fuso LOCAL (Brasil): o UTC pula um dia depois das 21h e faria o
// "Mês atual" terminar amanhã e o "Mês anterior" deslocar o mês à noite.
const toIsoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toIsoLocal(d);
}

type Period = "today" | "7d" | "14d" | "30d" | "mtd" | "lastMonth" | "custom";
const PRESETS: { key: Period; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "7d", label: "7D" },
  { key: "14d", label: "14D" },
  { key: "30d", label: "30D" },
  { key: "mtd", label: "Mês atual" },
  { key: "lastMonth", label: "Mês Anterior" },
];

function firstOfMonthIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function rangeForPeriod(period: Period, customSince: string, customUntil: string) {
  const today = isoDaysAgo(0);
  switch (period) {
    case "today": return { since: today, until: today };
    case "7d": return { since: isoDaysAgo(7), until: isoDaysAgo(1) };
    case "14d": return { since: isoDaysAgo(14), until: isoDaysAgo(1) };
    case "30d": return { since: isoDaysAgo(30), until: isoDaysAgo(1) };
    case "mtd": return { since: firstOfMonthIso(), until: today };
    case "lastMonth": return monthRangeIso(prevMonthIso());
    case "custom": return { since: customSince, until: customUntil };
  }
}

function resultValue(results: Record<string, number> | undefined, selection: string | null): number {
  if (!selection || !results) return 0;
  if (selection === ALL_CONVERSIONS) {
    return CONVERSION_FAMILIES.reduce((sum, slug) => sum + pickVal(results, RESULT_FAMILY_BY_SLUG[slug]?.keys ?? []), 0);
  }
  if (selection.startsWith(FAMILY_PREFIX)) {
    return pickVal(results, RESULT_FAMILY_BY_SLUG[selection.slice(FAMILY_PREFIX.length)]?.keys ?? []);
  }
  const key = selection.startsWith(ACTION_PREFIX) ? selection.slice(ACTION_PREFIX.length) : selection;
  return key ? pickVal(results, [key]) : 0;
}

export default function CampaignsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [accountId, setAccountId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [changing, setChanging] = useState<string | null>(null);
  const [openCampaigns, setOpenCampaigns] = useState<Set<string>>(new Set());
  const [openAdsets, setOpenAdsets] = useState<Set<string>>(new Set());
  const [budget, setBudget] = useState<{ level: "campaign" | "adset"; id: string; name: string } | null>(null);
  const [duplicateCJ, setDuplicateCJ] = useState<{ id: string; name: string } | null>(null);
  const [duplicateAd, setDuplicateAd] = useState<{ id: string; name: string } | null>(null);
  const [duplicateCP, setDuplicateCP] = useState<{ id: string; name: string } | null>(null);
  const [newCampaign, setNewCampaign] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [structureOpen, setStructureOpen] = useState(false);
  const [tableSort, setTableSort] = usePersistentSort<ResultKey>("adsctrl:sort:campanhas", { key: "spend", direction: "desc" }, SORT_KEYS);
  const [period, setPeriod] = useState<Period>("14d");
  const [customSince, setCustomSince] = useState(isoDaysAgo(14));
  const [customUntil, setCustomUntil] = useState(isoDaysAgo(1));
  const [showCustom, setShowCustom] = useState(false);
  const [selectedCampaigns, setSelectedCampaigns] = useState<Set<string>>(new Set());
  // Rótulo do resultado escolhido na página ("Cliques no Link", "Conversas
  // iniciadas"...) — o resumo segue a MESMA métrica da árvore.
  const resultLabelText = useMemo(() => {
    if (!result) return null;
    if (result === ALL_CONVERSIONS) return "Conversões";
    if (result.startsWith(FAMILY_PREFIX)) {
      const slug = result.slice(FAMILY_PREFIX.length);
      return RESULT_FAMILY_BY_SLUG[slug]?.label || null;
    }
    if (result.startsWith(ACTION_PREFIX)) return resultLabel(result.slice(ACTION_PREFIX.length));
    return null;
  }, [result]);

  const range = useMemo(() => rangeForPeriod(period, customSince, customUntil), [period, customSince, customUntil]);
  const periodLabel = period === "custom" ? "período personalizado" : PRESETS.find((p) => p.key === period)?.label || period;
  const periodRangeText = period === "custom" ? `${brDate(range.since)} → ${brDate(range.until)}` : periodLabel;
  const account = accounts.find((item) => item.account_id === accountId);
  const isMeta = account?.platform === "meta";

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("account") || "";
    const stored = window.localStorage.getItem("adsctrl:selected-account") || "";
    setAccountId(requested || stored);
  }, []);

  useEffect(() => {
    setSelectedCampaigns(new Set());
  }, [accountId]);

  useEffect(() => {
    fetch("/api/accounts", { cache: "no-store" })
      .then(readJson)
      .then((d) => {
        const list = (d.accounts || []).filter((item: AccountInfo) => !item.hidden);
        setAccounts(list);
        if (!list.length) { setLoading(false); return; }
        setAccountId((current) => {
          if (current && list.some((item: AccountInfo) => item.account_id === current)) return current;
          const first = list[0];
          router.replace(`/campanhas?account=${encodeURIComponent(first.account_id)}`);
          return first.account_id;
        });
      })
      .catch(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    setLoading(true); setError(null);
    setOpenCampaigns(new Set()); setOpenAdsets(new Set());
    const platform = accountId.startsWith("google:") ? "google" : "meta";
    fetch(`/api/account/detail?account_id=${encodeURIComponent(accountId)}&platform=${platform}&since=${range.since}&until=${range.until}`, { cache: "no-store" })
      .then(async (r) => {
        const text = await r.text();
        const d = text ? JSON.parse(text) : {};
        if (!r.ok || d.error) throw new Error(d.error || `Falha (HTTP ${r.status}).`);
        return d as Detail;
      })
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        const focus = d.result_family && RESULT_FAMILY_BY_SLUG[d.result_family] ? d.result_family : null;
        const fallback = pickPrimaryResult(d.availableResults);
        setResult(focus ? `${FAMILY_PREFIX}${focus}` : fallback ? `${ACTION_PREFIX}${fallback}` : null);
      })
      .catch((e) => alive && setError(e?.message ?? "Erro ao carregar."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [accountId, range.since, range.until]);

  // Árvore: conjuntos agrupados pela campanha mãe, anúncios pelo conjunto.
  const adsetsByCampaign = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const row of detail?.adsets || []) {
      const key = row.campaign_id || "__sem_campanha__";
      const list = map.get(key) || [];
      list.push(row);
      map.set(key, list);
    }
    return map;
  }, [detail]);

  const adsByAdset = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const row of detail?.ads || []) {
      const key = row.adset_id || "__sem_conjunto__";
      const list = map.get(key) || [];
      list.push(row);
      map.set(key, list);
    }
    return map;
  }, [detail]);

  const sortRows = useMemo(() => {
    return (rows: Row[]) => {
      const rowValue = (row: Row) => {
        const rowResult = resultValue(row.results, result);
        const purchaseValue = pickVal(row.values, PURCHASE_KEYS);
        switch (tableSort.key) {
          case "name": return row.name;
          case "spend": return row.spend;
          case "impressions": return row.impressions;
          case "clicks": return row.clicks;
          case "ctr": return row.ctr;
          case "result": return rowResult;
          case "cpr": return rowResult > 0 ? row.spend / rowResult : null;
          case "roas": return purchaseValue > 0 && row.spend > 0 ? purchaseValue / row.spend : null;
        }
      };
      return [...rows].sort(
        (left, right) => compareSortValues(rowValue(left), rowValue(right), tableSort.direction) || compareSortValues(left.name, right.name, "asc")
      );
    };
  }, [tableSort, result]);

  const sortedCampaigns = useMemo(() => sortRows(detail?.campaigns || []), [sortRows, detail]);
  const allSelected = sortedCampaigns.length > 0 && sortedCampaigns.every((row) => selectedCampaigns.has(row.id));
  const someSelected = selectedCampaigns.size > 0;

  function toggleSelectAll() {
    setSelectedCampaigns(allSelected ? new Set() : new Set(sortedCampaigns.map((row) => row.id)));
  }

  function flash(text: string, bad = false) {
    setNote({ text, bad });
    window.setTimeout(() => setNote(null), 8000);
  }

  function selectAccount(next: string) {
    // Atualiza o estado direto (a página não remonta em troca de query da
    // mesma rota — router.push deixava o seletor sem efeito) e espelha a
    // URL para virar link compartilhável.
    window.localStorage.setItem("adsctrl:selected-account", next);
    window.dispatchEvent(new CustomEvent("adsctrl:account-selected", { detail: next }));
    setAccountId(next);
    const url = new URL(window.location.href);
    url.searchParams.set("account", next);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function toggleSet(set: Set<string>, setter: (next: Set<string>) => void, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  }

  async function toggleDelivery(level: RowLevel, row: Row) {
    if (!isMeta || !row.status) return;
    const next = row.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    const verb = next === "PAUSED" ? "Pausar" : "Reativar";
    const noun = level === "campaign" ? "a campanha" : level === "adset" ? "o conjunto" : "o anúncio";
    if (!window.confirm(`${verb} ${noun} "${row.name}"?`)) return;
    setChanging(row.id);
    setNote(null);
    try {
      const r = await fetch("/api/account/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, level, id: row.id, status: next }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Falha.");
      setDetail((current) => {
        if (!current) return current;
        const key = level === "campaign" ? "campaigns" : level === "adset" ? "adsets" : "ads";
        const nextRows = current[key].map((item) => item.id === row.id ? { ...item, status: next, effective_status: next === "PAUSED" ? "PAUSED" : item.effective_status } : item);
        return { ...current, [key]: nextRows };
      });
      flash(d.unchanged ? `"${row.name}" já estava ${next === "PAUSED" ? "pausado" : "ativo"}.` : `${verb}: "${row.name}".`);
    } catch (e: any) {
      flash(e?.message || "Não foi possível alterar.", true);
    } finally {
      setChanging(null);
    }
  }

  async function reload() {
    const platform = accountId.startsWith("google:") ? "google" : "meta";
    const r = await fetch(`/api/account/detail?account_id=${encodeURIComponent(accountId)}&platform=${platform}&since=${range.since}&until=${range.until}`, { cache: "no-store" });
    const d = await r.json();
    if (!r.ok || d.error) throw new Error(d.error || "Falha ao atualizar.");
    setDetail(d);
  }

  async function handleDuplicateSame(level: "adset" | "ad", id: string, suffix: string) {
    try {
      const endpoint = level === "adset" ? "/api/meta/duplicate-adset" : "/api/meta/duplicate-ad";
      const body: Record<string, string> = { account_id: accountId, name_suffix: suffix };
      if (level === "adset") body.adset_id = id;
      else body.ad_id = id;
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Falha ao duplicar.");
      flash(`Duplicado (pausado): ${d.name || id}.`);
      await reload();
      return true;
    } catch (e: any) {
      flash(e?.message || "Falha ao duplicar.", true);
      return false;
    }
  }

  async function handleNewCampaign(name: string, objective: string, status: string) {
    try {
      const r = await fetch("/api/meta/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, name, objective, status }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Falha ao criar.");
      flash(`Campanha criada (${status === "PAUSED" ? "pausada" : "ativa"}): ${name}.`);
      await reload();
      return true;
    } catch (e: any) {
      flash(e?.message || "Falha ao criar.", true);
      return false;
    }
  }

  if (loading && !detail && !accounts.length) {
    return (
      <div className="p-4 md:p-6 md:ml-56 pb-20 md:pb-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const counts = detail ? { campaigns: detail.campaigns.length, adsets: detail.adsets.length, ads: detail.ads.length } : null;
  const rowCount = counts ? `${counts.campaigns} campanha${counts.campaigns === 1 ? "" : "s"} · ${counts.adsets} conjunto${counts.adsets === 1 ? "" : "s"} · ${counts.ads} anúncio${counts.ads === 1 ? "" : "s"}` : "";

  return (
    <div className="p-4 md:p-6 md:ml-56 pb-20 md:pb-6 space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link href="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground no-underline"><ArrowLeft className="h-3 w-3" /> Visão Geral</Link>
          </div>
          {/* O nome da conta É o seletor: trocar de conta fica ao lado do
              título, sem procurar no canto direito. Borda + fundo indicam
              que é um seletor (dropdown) e não só o título. */}
          <div className="mt-1 inline-flex min-w-0 max-w-[min(90vw,600px)] items-center gap-1 rounded-lg border border-border/60 bg-card px-2.5 py-1 shadow-sm">
            <select
              value={accountId}
              onChange={(e) => selectAccount(e.target.value)}
              title="Trocar conta de anúncios"
              className="block min-w-0 max-w-[min(70vw,520px)] cursor-pointer appearance-none truncate rounded-lg border-none bg-transparent p-0 text-xl font-bold tracking-tight outline-none [&>option]:text-sm [&>option]:font-normal hover:text-primary/90 md:text-2xl"
            >
              {accounts.map((item) => <option key={item.account_id} value={item.account_id}>{item.platform === "google" ? "Google" : "Meta"} · {item.name}</option>)}
            </select>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">Estrutura e veiculação · {periodRangeText} · {account ? (account.platform === "google" ? "Google Ads" : "Meta Ads") : "—"}{counts ? ` · ${rowCount}` : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={async () => { try { await reload(); flash("Dados atualizados."); } catch (e: any) { flash(e.message, true); } }}><RefreshCw className="h-3.5 w-3.5 mr-1" /> Atualizar</Button>
          <Button variant="ghost" size="sm" onClick={() => setReportOpen(true)} disabled={!accountId || !detail} title={someSelected ? `Resumo com as ${selectedCampaigns.size} campanha(s) selecionada(s), no período da página` : "Resumo curto para colar no WhatsApp (fechamento mensal)"}><MessageCircle className="h-3.5 w-3.5 mr-1" /> Resumo{someSelected ? ` (${selectedCampaigns.size})` : ""}</Button>
          <Button variant="ghost" size="sm" onClick={() => setStructureOpen(true)} disabled={!isMeta} title={isMeta ? "Gerar funil de campanhas a partir da estratégia (pausado)" : "Gerar estrutura só na Meta"}><Sparkles className="h-3.5 w-3.5 mr-1" /> Sugerir estrutura</Button>
          <Button size="sm" onClick={() => setNewCampaign(true)} disabled={!isMeta} title={isMeta ? "Criar campanha" : "Criar campanha só na Meta"}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Nova campanha
          </Button>
        </div>
      </div>

      {accountId && account && (
        <QuickAccess accountId={accountId} accountName={account.name} platform={account.platform} balance={null} currency={account.currency || "BRL"} compact />
      )}

      {!isMeta && account && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Conta do Google: leitura e relatório funcionam; pausar, orçamento, duplicar e criar ainda só existem na Meta.</span>
        </div>
      )}

      {note && (
        <div className={cn("flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm", note.bad ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400")}>
          <span>{note.text}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Período */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-muted/50 border border-border/50">
          {PRESETS.map((p) => (
            <button key={p.key} type="button" onClick={() => { setPeriod(p.key); setShowCustom(false); }} className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-colors", period === p.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{p.label}</button>
          ))}
          <button type="button" onClick={() => { setShowCustom(true); setPeriod("custom"); }} className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-colors", period === "custom" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>Personalizado</button>
        </div>

        {!showCustom && (
          <span className="rounded-md border border-border/50 bg-muted/30 px-2 py-1 text-[10.5px] font-semibold text-muted-foreground">📅 {brDate(range.since)} → {brDate(range.until)}</span>
        )}

        {showCustom && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <BrDateInput value={customSince} onChange={(value) => { setCustomSince(value); setPeriod("custom"); }} max={customUntil} className="h-8 px-2.5 text-xs rounded-lg border border-border/50 bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring/30" />
            <span className="text-muted-foreground">→</span>
            <BrDateInput value={customUntil} onChange={(value) => { setCustomUntil(value); setPeriod("custom"); }} min={customSince} max={isoDaysAgo(0)} className="h-8 px-2.5 text-xs rounded-lg border border-border/50 bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring/30" />
            <span className="text-xs text-muted-foreground">{brDate(range.since)} → {brDate(range.until)}</span>
          </div>
        )}
      </div>

      {/* Resultado */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Resultado:</span>
        <select value={result ?? ""} onChange={(e) => setResult(e.target.value)} className="h-8 rounded-lg border border-border/50 bg-muted/30 px-2 text-xs outline-none focus:ring-2 focus:ring-ring/30">
          <optgroup label="Resultado do negócio">
            {RESULT_FAMILIES.map((f) => <option key={f.slug} value={`${FAMILY_PREFIX}${f.slug}`}>{f.label} ({num(resultValue(detail?.kpis?.results, `${FAMILY_PREFIX}${f.slug}`))})</option>)}
          </optgroup>
          {orderedResults(detail?.availableResults || []).length > 0 && (
            <optgroup label="Detalhado (como a Meta reporta)">
              {orderedResults(detail?.availableResults || []).map((type) => <option key={type} value={`${ACTION_PREFIX}${type}`}>{resultLabel(type)} ({num((detail?.kpis?.results || {})[type] || 0)})</option>)}
            </optgroup>
          )}
        </select>
        <span className="ml-auto hidden text-[10px] text-muted-foreground sm:block">Clique na campanha para ver os conjuntos; clique no conjunto para ver os anúncios.</span>
      </div>

      {/* Resumo estratégico: o norte do mês da conta */}
      {accountId && <StrategicSummaryCard accountId={accountId} />}

      {/* Árvore */}
      <Card className="min-w-0 overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[30px_26px_44px_1.8fr_1fr_0.9fr_0.9fr_0.8fr_0.7fr_0.9fr_0.8fr_0.8fr_180px] gap-2 px-4 py-2.5 border-b border-border/50 bg-muted/30 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider items-center">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                title={allSelected ? "Desmarcar todas" : "Selecionar todas (para o resumo)"}
                className="h-3.5 w-3.5 accent-primary"
              />
              <span />
              <span>No ar</span>
              <SortHeader sortKey="name" sort={tableSort} onSort={setTableSort} align="left">Nome</SortHeader>
              <SortHeader sortKey="name" sort={tableSort} onSort={setTableSort}>Objetivo</SortHeader>
              <SortHeader sortKey="spend" sort={tableSort} onSort={setTableSort} initialDirection="desc">Investimento</SortHeader>
              <SortHeader sortKey="impressions" sort={tableSort} onSort={setTableSort} initialDirection="desc">Impressões</SortHeader>
              <SortHeader sortKey="clicks" sort={tableSort} onSort={setTableSort} initialDirection="desc">Cliques</SortHeader>
              <SortHeader sortKey="ctr" sort={tableSort} onSort={setTableSort} initialDirection="desc">CTR</SortHeader>
              <SortHeader sortKey="result" sort={tableSort} onSort={setTableSort} initialDirection="desc">Resultado</SortHeader>
              <SortHeader sortKey="cpr" sort={tableSort} onSort={setTableSort}>CPR</SortHeader>
              <SortHeader sortKey="roas" sort={tableSort} onSort={setTableSort} initialDirection="desc">ROAS</SortHeader>
              <span className="text-right">Ações</span>
            </div>

            {loading && !detail && <div className="py-12 text-center text-sm text-muted-foreground">Carregando…</div>}
            {!loading && detail && sortedCampaigns.length === 0 && (
              <div className="py-12 text-center text-sm text-muted-foreground">Nenhuma campanha no período. Use "Nova campanha" para começar.</div>
            )}

            {sortedCampaigns.map((campaign) => {
              const campaignOpen = openCampaigns.has(campaign.id);
              const children = sortRows(adsetsByCampaign.get(campaign.id) || []);
              return (
                <div key={campaign.id} className="border-b border-border/30 last:border-b-0">
                  <CampaignRow
                    row={campaign}
                    level="campaign"
                    expanded={campaignOpen}
                    childCount={children.length}
                    childNoun="conjunto"
                    selected={selectedCampaigns.has(campaign.id)}
                    onToggleSelect={() => toggleSet(selectedCampaigns, setSelectedCampaigns, campaign.id)}
                    onToggleExpand={() => toggleSet(openCampaigns, setOpenCampaigns, campaign.id)}
                    onToggleDelivery={() => toggleDelivery("campaign", campaign)}
                    busy={changing === campaign.id}
                    metaOnly={isMeta}
                    result={result}
                    currency={account?.currency}
                    onBudget={() => setBudget({ level: "campaign", id: campaign.id, name: campaign.name })}
                    onDuplicate={() => setDuplicateCP({ id: campaign.id, name: campaign.name })}
                  />
                  {campaignOpen && (
                    <div className="bg-muted/[0.07]">
                      {children.length === 0 && <EmptyChildren text="Sem conjuntos nesta campanha." depth={1} />}
                      {children.map((adset) => {
                        const adsetOpen = openAdsets.has(adset.id);
                        const ads = sortRows(adsByAdset.get(adset.id) || []);
                        return (
                          <div key={adset.id} className="border-t border-border/20">
                            <CampaignRow
                              row={adset}
                              level="adset"
                              expanded={adsetOpen}
                              childCount={ads.length}
                              childNoun="anúncio"
                              onToggleExpand={() => toggleSet(openAdsets, setOpenAdsets, adset.id)}
                              onToggleDelivery={() => toggleDelivery("adset", adset)}
                              busy={changing === adset.id}
                              metaOnly={isMeta}
                              result={result}
                              currency={account?.currency}
                              onBudget={() => setBudget({ level: "adset", id: adset.id, name: adset.name })}
                              onDuplicate={() => setDuplicateCJ({ id: adset.id, name: adset.name })}
                              depth={1}
                            />
                            {adsetOpen && (
                              <div className="bg-muted/[0.04]">
                                {ads.length === 0 && <EmptyChildren text="Sem anúncios neste conjunto." depth={2} />}
                                {ads.map((ad) => (
                                  <CampaignRow
                                    key={ad.id}
                                    row={ad}
                                    level="ad"
                                    expanded={false}
                                    onToggleExpand={() => {}}
                                    onToggleDelivery={() => toggleDelivery("ad", ad)}
                                    busy={changing === ad.id}
                                    metaOnly={isMeta}
                                    result={result}
                                    currency={account?.currency}
                                    onDuplicate={() => setDuplicateAd({ id: ad.id, name: ad.name })}
                                    depth={2}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Segmentações: faixa etária, região anunciada e plataforma */}
      {detail && (
        <SegmentationSection
          breakdowns={detail.breakdowns}
          currency={account?.currency}
          totalSpend={detail.kpis?.spend || 0}
        />
      )}

      {/* Últimas edições + impacto das decisões (Meta mostra o impacto) */}
      {accountId && (
        <section>
          <div className="mb-1">
            <h2 className="text-sm font-semibold">Últimas edições</h2>
            <p className="text-xs text-muted-foreground mt-0.5">O que foi alterado na conta no período — pausas, orçamentos, lances e criativos{isMeta ? " · o botão abaixo mostra o antes/depois de cada decisão" : ""}.</p>
          </div>
          <AccountChanges accountId={accountId} platform={accountId.startsWith("google:") ? "google" : "meta"} since={range.since} until={range.until} />
        </section>
      )}

      {/* Modais */}
      {budget && <BudgetModal accountId={accountId} level={budget.level} id={budget.id} name={budget.name} currency={account?.currency} onClose={() => setBudget(null)} onDone={(msg) => { setBudget(null); flash(msg); reload().catch(() => {}); }} />}
      {duplicateCJ && <DuplicateSameModal noun="conjunto" name={duplicateCJ.name} onClose={() => setDuplicateCJ(null)} onSubmit={async (suffix) => { const ok = await handleDuplicateSame("adset", duplicateCJ.id, suffix); if (ok) setDuplicateCJ(null); return ok; }} />}
      {duplicateAd && <DuplicateSameModal noun="anúncio" name={duplicateAd.name} onClose={() => setDuplicateAd(null)} onSubmit={async (suffix) => { const ok = await handleDuplicateSame("ad", duplicateAd.id, suffix); if (ok) setDuplicateAd(null); return ok; }} />}
      {duplicateCP && <DuplicateCampaign sourceAccountId={accountId} campaignId={duplicateCP.id} campaignName={duplicateCP.name} onClose={() => setDuplicateCP(null)} />}
      {newCampaign && <NewCampaignModal onClose={() => setNewCampaign(false)} onSubmit={async (name, objective, status) => { const ok = await handleNewCampaign(name, objective, status); if (ok) setNewCampaign(false); return ok; }} />}
      {reportOpen && <WhatsAppReportModal accountId={accountId} accountName={account?.name || "Conta"} currency={account?.currency} since={range.since} until={range.until} periodLabel={periodRangeText} selectedCampaignIds={[...selectedCampaigns]} detail={detail} resultSelection={result} resultSelectionLabel={resultLabelText} onClose={() => setReportOpen(false)} />}
      {structureOpen && <StructureWizard accountId={accountId} accountName={account?.name || "Conta"} onClose={() => setStructureOpen(false)} onCreated={() => { flash("Estrutura criada. Revise os orçamentos e publique."); reload().catch(() => {}); }} />}
    </div>
  );
}

/* ------------------------------ linhas da árvore --------------------------- */

const LEVEL_PILL: Record<RowLevel, { label: string; className: string }> = {
  campaign: { label: "CP", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  adset: { label: "CJ", className: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  ad: { label: "AD", className: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
};

function CampaignRow({
  row, level, expanded, childCount, childNoun, onToggleExpand, onToggleDelivery, busy, metaOnly, result, currency, onBudget, onDuplicate, depth = 0, selected = false, onToggleSelect,
}: {
  row: Row; level: RowLevel; expanded: boolean; childCount?: number; childNoun?: string;
  onToggleExpand: () => void; onToggleDelivery: () => void; busy: boolean; metaOnly: boolean;
  result: string | null; currency?: string; onBudget?: () => void; onDuplicate: () => void; depth?: number;
  selected?: boolean; onToggleSelect?: () => void;
}) {
  const res = resultValue(row.results, result);
  const rv = pickVal(row.values, PURCHASE_KEYS);
  const pill = LEVEL_PILL[level];
  const hasChildren = level !== "ad" && childCount != null && childCount > 0;

  return (
    <div
      onClick={level === "ad" ? undefined : onToggleExpand}
      className={cn(
        "group grid grid-cols-[30px_26px_44px_1.8fr_1fr_0.9fr_0.9fr_0.8fr_0.7fr_0.9fr_0.8fr_0.8fr_180px] gap-2 px-4 py-2.5 items-center transition-colors",
        level === "ad" ? "cursor-default" : "cursor-pointer hover:bg-accent/20",
        expanded && "bg-accent/10",
        selected && "bg-primary/5"
      )}
      style={{ paddingLeft: `calc(1rem + ${depth * 1.75}rem)` }}
    >
      <span onClick={(e) => e.stopPropagation()} className="flex items-center justify-center">
        {level === "campaign" && onToggleSelect ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            title={`Incluir "${row.name}" no resumo`}
            className="h-3.5 w-3.5 accent-primary cursor-pointer"
          />
        ) : null}
      </span>

      <span className="text-muted-foreground">
        {level !== "ad" && (expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />)}
      </span>

      <span onClick={(e) => e.stopPropagation()}>
        <DeliverySwitch row={row} busy={busy} onToggle={onToggleDelivery} metaOnly={metaOnly} />
      </span>

      <div className="flex items-center gap-2 min-w-0">
        {level === "ad" && (row.thumbnail || row.permalink) && (
          <span onClick={(e) => e.stopPropagation()} className="shrink-0">
            {row.permalink ? (
              <a href={row.permalink} target="_blank" rel="noreferrer" title={`Abrir o conteúdo no ${row.permalink.includes("instagram") ? "Instagram" : "Facebook"} e conferir o desempenho`} className="block no-underline">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={row.thumbnail} alt="" width={28} height={28} className="rounded-md object-cover transition-opacity hover:opacity-70" />
              </a>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={row.thumbnail} alt="" width={28} height={28} className="rounded-md object-cover" />
            )}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={cn("shrink-0 rounded px-1 py-0.5 text-[8.5px] font-bold", pill.className)}>{pill.label}</span>
            <span className="text-sm font-medium truncate" title={row.name}>{row.name}</span>
          </div>
          {row.status && row.status !== "ACTIVE" && row.status !== "PAUSED" && (
            <div className="text-[10px] text-muted-foreground">status: {row.status.toLowerCase().replace(/_/g, " ")}</div>
          )}
        </div>
        {hasChildren && (
          <span className="hidden shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground lg:inline">{childCount} {childNoun}{childCount === 1 ? "" : "s"}</span>
        )}
      </div>

      <div className="text-xs text-muted-foreground truncate" title={row.objective}>{level === "campaign" ? objectiveLabel(row.objective) : ""}</div>
      <div className="text-right text-sm font-semibold">{money(row.spend, currency)}</div>
      <div className="text-right text-sm text-foreground/80">{num(row.impressions)}</div>
      <div className="text-right text-sm text-foreground/80">{num(row.clicks)}</div>
      <div className="text-right text-sm text-foreground/80">{pct(row.ctr)}</div>
      <div className={cn("text-right text-sm font-semibold", res > 0 ? "text-foreground" : "text-muted-foreground")}>{res > 0 ? num(res) : "—"}</div>
      <div className="text-right text-sm text-foreground/80">{res > 0 ? money(row.spend / res, currency) : "—"}</div>
      <div className="text-right text-xs text-emerald-500 font-medium">{level === "campaign" && rv > 0 && row.spend > 0 ? `${(rv / row.spend).toFixed(1)}x` : "—"}</div>

      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
        {level !== "ad" && onBudget && (
          <ActionButton onClick={onBudget} disabled={!metaOnly} title="Ajustar orçamento">Orçamento</ActionButton>
        )}
        <ActionButton onClick={onDuplicate} disabled={!metaOnly} title={level === "campaign" ? "Duplicar campanha para outra conta" : level === "adset" ? "Duplicar conjunto nesta conta" : "Duplicar anúncio neste conjunto"}>
          <Copy className="h-2.5 w-2.5" /> Duplicar
        </ActionButton>
      </div>
    </div>
  );
}

function EmptyChildren({ text, depth }: { text: string; depth: number }) {
  return (
    <div className="px-4 py-3 text-[11px] text-muted-foreground" style={{ paddingLeft: `calc(1.75rem + ${depth * 1.75}rem)` }}>
      {text}
    </div>
  );
}

function ActionButton({ children, onClick, disabled, title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[10px] font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/* ------------------------------ cabeçalho --------------------------------- */

function SortHeader({ children, sortKey, sort, onSort, align = "right", initialDirection = "asc" }: {
  children: React.ReactNode; sortKey: ResultKey; sort: SortState<ResultKey>; onSort: (next: SortState<ResultKey>) => void;
  align?: "left" | "center" | "right"; initialDirection?: "asc" | "desc";
}) {
  return <SortButton column={sortKey} sort={sort} onSort={onSort} align={align} initialDirection={initialDirection}>{children}</SortButton>;
}

function DeliverySwitch({ row, busy, onToggle, metaOnly }: { row: Row; busy: boolean; onToggle: () => void; metaOnly: boolean }) {
  if (!row.status) return <span className="text-xs text-muted-foreground">—</span>;
  const active = row.status === "ACTIVE";
  const frozen = row.status === "ARCHIVED" || row.status === "DELETED";
  if (frozen) return <span className="text-[10px] text-muted-foreground">{row.status.toLowerCase()}</span>;
  return (
    <button
      role="switch"
      aria-checked={active}
      aria-label={`${active ? "Pausar" : "Reativar"} ${row.name}`}
      onClick={onToggle}
      disabled={busy || !metaOnly}
      className={cn("flex h-5 w-9 items-center rounded-full border p-0.5 transition-colors disabled:cursor-not-allowed", active ? "border-success bg-success" : "border-border bg-muted", !metaOnly && "opacity-40")}
      data-on={active ? "true" : undefined}
    >
      <span className={cn("h-3.5 w-3.5 rounded-full transition-transform", active ? "translate-x-4 bg-white" : "translate-x-0 bg-muted-foreground")} />
    </button>
  );
}

/* ------------------------------ segmentações ------------------------------ */

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  messenger: "Messenger",
  audience_network: "Rede de audiência",
};

function genderLabel(gender: string): string {
  if (gender === "female") return "Feminino";
  if (gender === "male") return "Masculino";
  if (gender === "unknown") return "Não informado";
  return gender;
}

function ageGenderLabel(key: string): string {
  const [age, gender] = key.split("·").map((part) => part.trim());
  return `${age} · ${genderLabel(gender || "")}`;
}

function SegBlock({ title, rows, color, currency }: { title: string; rows: { key: string; spend: number }[]; color: string; currency?: string }) {
  const total = rows.reduce((acc, row) => acc + row.spend, 0);
  const max = Math.max(...rows.map((row) => row.spend), 1);
  if (!rows.length) return null;
  return (
    <div className="rounded-lg border border-border/50 bg-card p-3">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="mt-2.5 space-y-2">
        {rows.map((row) => (
          <div key={row.key} className="grid grid-cols-[110px_1fr_64px] items-center gap-2">
            <span className="truncate text-[10.5px] text-foreground/80" title={row.key}>{row.key}</span>
            <div className="h-2.5 rounded bg-muted overflow-hidden">
              <div className="h-full rounded transition-all" style={{ width: `${Math.max((row.spend / max) * 100, 2)}%`, background: color }} />
            </div>
            <span className="text-right text-[10.5px] tabular-nums text-muted-foreground">{total ? `${Math.round((row.spend / total) * 100)}%` : "—"}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 text-right text-[9.5px] text-muted-foreground/70">por investimento · {money(total, currency)}</div>
    </div>
  );
}

function SegmentationSection({ breakdowns, currency, totalSpend }: { breakdowns?: Detail["breakdowns"]; currency?: string; totalSpend: number }) {
  const platform = (breakdowns?.platform || []).filter((row) => row.spend > 0).map((row) => ({ key: PLATFORM_LABELS[row.key] || row.key, spend: row.spend })).sort((a, b) => b.spend - a.spend).slice(0, 6);
  const region = (breakdowns?.region || []).filter((row) => row.spend > 0).slice(0, 10);
  const ageGender = (breakdowns?.age_gender || []).filter((row) => row.spend > 0).slice(0, 12).map((row) => ({ key: ageGenderLabel(row.key), spend: row.spend }));

  if (!platform.length && !region.length && !ageGender.length) return null;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Segmentações</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Para quem o anúncio foi entregue no período — plataforma, região e faixa etária.</p>
        </div>
        <span className="text-[10px] text-muted-foreground">Investimento total: {money(totalSpend, currency)}</span>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <SegBlock title="Plataforma" rows={platform} color="#38bdf8" currency={currency} />
        <SegBlock title="Região anunciada" rows={region} color="#34d399" currency={currency} />
        <SegBlock title="Idade e gênero" rows={ageGender} color="#a78bfa" currency={currency} />
      </div>
    </Card>
  );
}

/* ------------------------------ modais ------------------------------------ */

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border/50 bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function monthRangeIso(monthIso: string): { since: string; until: string } {
  const [year, month] = monthIso.split("-").map(Number);
  const since = `${year}-${String(month).padStart(2, "0")}-01`;
  const until = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { since, until };
}

function prevMonthIso(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Resumo pronto para colar no WhatsApp: o que foi feito na conta, de forma
// curta — quanto, onde (objetivo/região/plataforma) e o resultado. Usa o
// período escolhido na página e, com campanhas selecionadas, só elas entram.
function WhatsAppReportModal({ accountId, accountName, currency, since, until, periodLabel, selectedCampaignIds, detail, resultSelection, resultSelectionLabel, onClose }: {
  accountId: string; accountName: string; currency?: string;
  since: string; until: string; periodLabel: string; selectedCampaignIds: string[];
  /** O detalhe já carregado pela página — mesmo período, então nada de
   *  refazer as ~18 chamadas à Meta ao abrir o resumo (era metade do rate
   *  limit). Só o faturado (2 chamadas leves) ainda é buscado aqui. */
  detail: Detail | null;
  /** Resultado escolhido na página (família ou ação): o resumo usa a MESMA
   *  métrica da árvore, não a família dominante da conta. */
  resultSelection: string | null;
  resultSelectionLabel: string | null;
  onClose: () => void;
}) {
  const [revenue, setRevenue] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [editingNames, setEditingNames] = useState(false);
  // Apelidos: o resumo troca o nome original pelo apelido editado (resolve
  // nomes duplicados/longos sem mexer na conta). Fica no navegador.
  const [aliases, setAliases] = useState<Record<string, string>>(() => {
    try { return JSON.parse(window.localStorage.getItem("adsctrl:report-aliases") || "{}"); } catch { return {}; }
  });

  function setAlias(original: string, aliasValue: string) {
    setAliases((prev) => {
      const next = { ...prev };
      const clean = aliasValue.trim();
      if (clean && clean !== original) next[original] = clean;
      else delete next[original];
      try { window.localStorage.setItem("adsctrl:report-aliases", JSON.stringify(next)); } catch { /* sem storage não quebra o resumo */ }
      return next;
    });
  }

  const days = Math.max(1, Math.round((Date.parse(until) - Date.parse(since)) / 86400000) + 1);

  // Valor faturado: vendas informadas por cliente, no MÊS do período
  // escolhido (a conta pertence a um cliente via client_ad_accounts).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [salesRes, clientsRes] = await Promise.all([
          fetch("/api/sales?months=6", { cache: "no-store" }),
          fetch("/api/clients", { cache: "no-store" }),
        ]);
        const [salesData, clientsData] = await Promise.all([salesRes.json(), clientsRes.json()]);
        if (!alive) return;
        const client = (clientsData.clients || []).find((item: any) => (item.accounts || []).some((acc: any) => acc.account_id === accountId));
        const row = (salesData.rows || []).find((item: any) => String(item.name || "").toLowerCase().trim() === String(client?.name || "").toLowerCase().trim());
        const targetMonth = until.slice(0, 7);
        const month = (row?.months || []).find((item: any) => String(item.month || "").startsWith(targetMonth));
        if (month && month.revenue != null) setRevenue(Number(month.revenue) || 0);
      } catch {
        // sem faturado no resumo é aceitável
      }
    })();
    return () => { alive = false; };
  }, [accountId, until]);

  // Escopo: só as campanhas marcadas (e conjuntos/anúncios delas), ou a
  // conta toda quando nada foi selecionado.
  const scoped = useMemo(() => {
    if (!detail) return null;
    const selected = new Set(selectedCampaignIds);
    if (selected.size === 0) {
      return { campaigns: detail.campaigns, adsets: detail.adsets, ads: detail.ads, filtered: false };
    }
    const campaigns = detail.campaigns.filter((row) => selected.has(row.id));
    const campaignIds = new Set(campaigns.map((row) => row.id));
    const adsets = detail.adsets.filter((row) => row.campaign_id && campaignIds.has(row.campaign_id));
    const adsetIds = new Set(adsets.map((row) => row.id));
    const ads = detail.ads.filter((row) => row.adset_id && adsetIds.has(row.adset_id));
    return { campaigns, adsets, ads, filtered: true };
  }, [detail, selectedCampaignIds]);

  // Investimento exibido no resumo: por padrão o real. Se editar (ex.: mostrar
  // um valor menor), o total é repartido proporcionalmente entre campanhas e
  // criativos para a soma bater no novo valor.
  const [overrideSpend, setOverrideSpend] = useState("");
  const realSpend = useMemo(() => scoped ? scoped.campaigns.reduce((acc, row) => acc + row.spend, 0) : 0, [scoped]);
  const overrideParsed = Number.parseFloat(overrideSpend.replace(",", "."));
  const effectiveSpend = Number.isFinite(overrideParsed) && overrideParsed > 0 ? overrideParsed : realSpend;
  const spendFactor = realSpend > 0 ? effectiveSpend / realSpend : 1;
  const spendEdited = realSpend > 0 && effectiveSpend !== realSpend;

  const report = useMemo(() => {
    if (!detail || !scoped) return "";

    const fam = (slug: string) => RESULT_FAMILY_BY_SLUG[slug];

    // Substantivos do rótulo selecionado na página: linha usa minúsculas
    // ("cliques no link"); total usa singular ("Clique no Link").
    const selectionShort = resultSelectionLabel ? resultSelectionLabel.toLowerCase() : null;
    const selectionNoun = resultSelectionLabel ? (resultSelectionLabel.endsWith("s") ? resultSelectionLabel.slice(0, -1) : resultSelectionLabel) : null;

    // Resultado de uma campanha/anúncio. Com resultado selecionado na página,
    // usa EXATAMENTE ele — o resumo segue a mesma métrica da árvore (foi o
    // caso do CA-CAMPINAS: selecionou "Cliques no Link" e o resumo deve dizer
    // cliques, não mensagens). Sem seleção, cai na heurística por objetivo,
    // devolvendo também a família para rotular o que a conta entrega.
    const rowResult = (row: Row, objective?: string): { value: number; family: string } => {
      const map = row.results;
      if (resultSelection) {
        return { value: resultValue(map, resultSelection), family: "selected" };
      }
      const tryFam = (slug: string): number => pickVal(map, fam(slug).keys);
      switch (objective) {
        case "OUTCOME_SALES": {
          const v = tryFam("vendas");
          if (v > 0) return { value: v, family: "vendas" };
          break;
        }
        case "OUTCOME_LEADS": {
          const v = tryFam("leads") + tryFam("cadastros");
          if (v > 0) return { value: v, family: "leads" };
          break;
        }
        case "OUTCOME_TRAFFIC": {
          const v = tryFam("cliques");
          if (v > 0) return { value: v, family: "cliques" };
          break;
        }
        case "OUTCOME_ENGAGEMENT": {
          const msg = tryFam("mensagens");
          if (msg > 0) return { value: msg, family: "mensagens" };
          const eng = tryFam("engajamento");
          if (eng > 0) return { value: eng, family: "engajamento" };
          break;
        }
        case "OUTCOME_AWARENESS": {
          const v = tryFam("lpv");
          if (v > 0) return { value: v, family: "lpv" };
          break;
        }
      }
      const vendas = tryFam("vendas");
      if (vendas > 0) return { value: vendas, family: "vendas" };
      const msg = tryFam("mensagens");
      if (msg > 0) return { value: msg, family: "mensagens" };
      const leads = tryFam("leads") + tryFam("cadastros");
      if (leads > 0) return { value: leads, family: "leads" };
      return { value: Object.values(map).reduce((acc, v) => acc + v, 0), family: "conversoes" };
    };

    // Substantivos por família: plural curto (nas linhas) e singular (no
    // "custo por conversa/venda/lead").
    const FAMILY_SHORT: Record<string, string> = {
      vendas: "vendas", mensagens: "conversas", leads: "leads", cadastros: "cadastros",
      cliques: "cliques", engajamento: "engajamentos", lpv: "views de LP",
    };
    const FAMILY_NOUN: Record<string, string> = {
      vendas: "venda", mensagens: "conversa", leads: "lead", cadastros: "cadastro",
      cliques: "clique", engajamento: "engajamento", lpv: "view de LP",
    };
    const nounFor = (family: string, short: boolean): string => {
      if (family === "selected") return short ? selectionShort || "resultados" : selectionNoun || "resultado";
      return short ? FAMILY_SHORT[family] || "resultados" : FAMILY_NOUN[family] || "resultado";
    };

    const TYPE_LABELS: Record<string, string> = {
      OUTCOME_SALES: "Vendas",
      OUTCOME_LEADS: "Leads",
      OUTCOME_TRAFFIC: "Tráfego (cliques)",
      OUTCOME_ENGAGEMENT: "Engajamento",
      OUTCOME_AWARENESS: "Reconhecimento",
      OUTCOME_APP_PROMOTION: "Promoção de app",
    };

    // Resultado somado por tipo de campanha, com o rótulo do resultado real.
    const byType = new Map<string, { label: string; family: string; results: number }>();
    const familyTotals = new Map<string, number>();
    for (const row of scoped.campaigns) {
      const r = rowResult(row, row.objective);
      if (r.value <= 0) continue;
      familyTotals.set(r.family, (familyTotals.get(r.family) || 0) + r.value);
      const label = TYPE_LABELS[row.objective || ""] || objectiveLabel(row.objective) || "Outros";
      const key = `${label}||${r.family}`;
      const entry = byType.get(key) || { label, family: r.family, results: 0 };
      entry.results += r.value;
      byType.set(key, entry);
    }
    const campaignTypes = [...byType.values()]
      .map((entry) => ({ label: entry.label, results: entry.results, familyLabel: resultSelectionLabel || fam(entry.family).label }))
      .sort((a, b) => b.results - a.results);

    // A família dominante da conta define o rótulo do total ("Conversas
    // iniciadas: 35 · custo por conversa R$ 25") — quando não há seleção.
    const dominant = [...familyTotals.entries()].sort((a, b) => b[1] - a[1])[0];
    const resultsLabel = resultSelectionLabel || (dominant && dominant[0] !== "conversoes" ? fam(dominant[0]).label : "Resultados");
    const resultsNoun = selectionNoun || (dominant ? FAMILY_NOUN[dominant[0]] || "resultado" : "resultado");

    // Criativos: o anúncio herda o objetivo da campanha mãe (o insight de
    // anúncio não traz o objetivo) e entra com nome, gasto, resultado e link.
    // IMPORTANTE: no nível de anúncio a Meta conta a MESMA conversa em vários
    // anúncios (atribuição sobreposta) — a soma das linhas estoura o total da
    // campanha (já vimos "559 conversas" num criativo de R$ 86). Por isso o
    // resultado exibido é o total CONFIAVEL da campanha repartido pela
    // participação bruta de cada anúncio: bate com o fechamento e mantém a
    // ordem de performance. O apelido é aplicado antes de agregar.
    const adsetToCampaign = new Map(scoped.adsets.map((s) => [s.id, s.campaign_id]));
    const campaignObjective = new Map(scoped.campaigns.map((c) => [c.id, c.objective]));
    const campaignResult = new Map<string, { value: number; family: string }>();
    for (const row of scoped.campaigns) campaignResult.set(row.id, rowResult(row, row.objective));
    const rawByCampaign = new Map<string, number>();
    for (const row of scoped.ads) {
      if (row.spend <= 0) continue;
      const campaignId = row.adset_id ? adsetToCampaign.get(row.adset_id) : undefined;
      if (!campaignId) continue;
      const raw = rowResult(row, campaignObjective.get(campaignId)).value;
      rawByCampaign.set(campaignId, (rawByCampaign.get(campaignId) || 0) + raw);
    }
    const creativeAgg = new Map<string, { name: string; spend: number; results: number; resultNoun: string; permalink?: string }>();
    for (const row of scoped.ads) {
      if (row.spend <= 0) continue;
      const campaignId = row.adset_id ? adsetToCampaign.get(row.adset_id) : undefined;
      const objective = campaignId ? campaignObjective.get(campaignId) : undefined;
      const r = rowResult(row, objective);
      const parent = campaignId ? campaignResult.get(campaignId) : undefined;
      const rawSum = campaignId ? rawByCampaign.get(campaignId) || 0 : 0;
      let results = r.value;
      let resultNoun = nounFor(r.family, true);
      if (parent && parent.value > 0 && rawSum > 0 && r.value > 0) {
        results = Math.max(1, Math.round(parent.value * (r.value / rawSum)));
        resultNoun = nounFor(parent.family, true);
      }
      const name = aliases[row.name] || row.name;
      const existing = creativeAgg.get(name);
      if (existing) {
        existing.spend += row.spend;
        existing.results += results;
        if (!existing.permalink) existing.permalink = row.permalink;
      } else {
        creativeAgg.set(name, { name, spend: row.spend, results, resultNoun, permalink: row.permalink });
      }
    }
    const creatives = [...creativeAgg.values()].sort((a, b) => b.spend - a.spend);

    // Investimento exibido (real ou editado) com os valores diluídos.
    const spend = effectiveSpend;
    // Campanhas escaladas pelo fator; a maior absorve a sobra do
    // arredondamento para a soma bater EXATAMENTE no valor exibido.
    const scaledCampaigns = scoped.campaigns.map((row) => {
      const r = rowResult(row, row.objective);
      return { name: aliases[row.name] || row.name, objective: row.objective, spend: row.spend * spendFactor, results: r.value, resultNoun: nounFor(r.family, true) };
    });
    if (scaledCampaigns.length > 0) {
      const sum = scaledCampaigns.reduce((acc, c) => acc + c.spend, 0);
      const diff = spend - sum;
      const biggest = scaledCampaigns.reduce((a, b) => (b.spend >= a.spend ? b : a));
      biggest.spend = Math.max(0, biggest.spend + diff);
    }
    const scaledCreatives = creatives.map((c) => ({ ...c, spend: c.spend * spendFactor }));
    // Total honesto: a soma dos resultados de cada campanha pelo próprio
    // objetivo — nunca a soma bruta de todas as ações da Meta, que infla o
    // número e zera o CPR.
    const totalResults = [...familyTotals.values()].reduce((acc, v) => acc + v, 0);
    const results = totalResults > 0 ? totalResults : null;
    const cpr = results ? spend / results : null;
    const activeCreatives = scoped.ads.filter((row) => row.status === "ACTIVE" || row.effective_status === "ACTIVE").length;
    return buildWhatsAppReport({
      accountName,
      currency: currency || "BRL",
      periodLabel,
      periodRange: { since, until },
      days,
      campaigns: scaledCampaigns,
      campaignTypes,
      creatives: scaledCreatives,
      // A quebra por região vem da API para a conta toda; com seleção de
      // campanhas não há região por campanha, então ela sai fora do resumo.
      regions: scoped.filtered ? [] : detail.breakdowns?.region || [],
      creativeCount: { total: scoped.ads.length, active: activeCreatives },
      totalSpend: spend,
      results,
      resultsLabel,
      resultsNoun,
      cpr,
      revenue,
    });
  }, [detail, scoped, accountName, currency, periodLabel, since, until, days, aliases, resultSelection, resultSelectionLabel, effectiveSpend, spendFactor, revenue]);

  async function copy() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt("Copie o texto:", report);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold">Resumo para WhatsApp</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Pronto para colar — negrito, emojis e leitura rápida. Ideal para o fechamento mensal.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Fechar">✕</button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="rounded-md border border-border/50 bg-muted/30 px-2 py-1 text-[10.5px] font-semibold text-muted-foreground">📅 {periodLabel}</span>
        <span className={cn("rounded-md border px-2 py-1 text-[10.5px] font-semibold", scoped?.filtered ? "border-primary/30 bg-primary/10 text-primary" : "border-border/50 bg-muted/30 text-muted-foreground")}>
          {scoped?.filtered ? `🎯 Só as ${scoped.campaigns.length} campanha(s) selecionada(s)` : "🎯 Todas as campanhas da conta"}
        </span>
        <button type="button" onClick={() => setEditingNames((v) => !v)} className={cn("rounded-md border px-2 py-1 text-[10.5px] font-semibold transition-colors", editingNames ? "border-primary/30 bg-primary/10 text-primary" : "border-border/50 bg-muted/30 text-muted-foreground hover:text-foreground")}>
          ✏️ {editingNames ? "Fechar nomes" : "Ajustar nomes"}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10.5px]">
        <label htmlFor="override-spend" className="font-semibold text-muted-foreground">💵 Investimento exibido:</label>
        <input
          id="override-spend"
          type="text"
          inputMode="decimal"
          value={overrideSpend}
          onChange={(e) => setOverrideSpend(e.target.value)}
          placeholder={money(realSpend, currency || "BRL")}
          disabled={!realSpend}
          title="Deixe vazio para usar o investimento real"
          className="h-7 w-28 rounded-md border border-border/50 bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring disabled:opacity-40"
        />
        {spendEdited && (
          <>
            <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 font-semibold text-amber-600 dark:text-amber-400">diluído nas campanhas para somar {money(effectiveSpend, currency || "BRL")}</span>
            <button type="button" onClick={() => setOverrideSpend("")} className="rounded-md border border-border/50 bg-muted/30 px-2 py-1 font-semibold text-muted-foreground hover:text-foreground transition-colors">usar valor real</button>
          </>
        )}
        <span className="text-muted-foreground">vazio = valor real ({money(realSpend, currency || "BRL")})</span>
      </div>

      {editingNames && scoped && (
        <div className="mt-2 space-y-1.5 rounded-lg border border-border/50 bg-muted/20 p-3 max-h-64 overflow-y-auto">
          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Apelidos — o resumo usa o nome editado; vazio volta ao original (salvo no navegador)</div>
          {[...new Map<string, string>([
            ...scoped.campaigns.map((row) => [row.name, aliases[row.name] || row.name] as [string, string]),
            ...scoped.ads.filter((row) => row.spend > 0).map((row) => [row.name, aliases[row.name] || row.name] as [string, string]),
          ]).entries()].map(([original, current]) => (
            <input
              key={original}
              defaultValue={current}
              onBlur={(e) => setAlias(original, e.target.value)}
              placeholder={original}
              title={original}
              className="h-7 w-full rounded-md border border-border/50 bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
            />
          ))}
        </div>
      )}

      <div className="mt-3">
        {!detail && <div className="grid place-items-center rounded-lg border border-border/50 bg-muted/20 py-10 text-xs text-muted-foreground">Carregando…</div>}
        {detail && report && (
          <pre onClick={(e) => { const range = document.createRange(); range.selectNodeContents(e.currentTarget); const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range); }} className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border/50 bg-muted/20 p-3 text-xs leading-5 text-foreground select-text cursor-text">{report}</pre>
        )}
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Fechar</Button>
        <Button size="sm" onClick={copy} disabled={!report} className="min-w-32">
          {copied ? <><Check className="h-3.5 w-3.5 mr-1" /> Copiado!</> : <><Copy className="h-3.5 w-3.5 mr-1" /> Copiar para o WhatsApp</>}
        </Button>
      </div>
    </Overlay>
  );
}

const OBJETIVOS: { value: string; label: string }[] = [
  { value: "OUTCOME_AWARENESS", label: "Reconhecimento" },
  { value: "OUTCOME_TRAFFIC", label: "Tráfego" },
  { value: "OUTCOME_ENGAGEMENT", label: "Engajamento" },
  { value: "OUTCOME_LEADS", label: "Leads" },
  { value: "OUTCOME_SALES", label: "Vendas" },
  { value: "OUTCOME_APP_PROMOTION", label: "Promoção de app" },
];

function NewCampaignModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (name: string, objective: string, status: string) => Promise<boolean> }) {
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("OUTCOME_SALES");
  const [status, setStatus] = useState("PAUSED");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Overlay onClose={onClose}>
      <h3 className="text-base font-bold">Nova campanha</h3>
      <p className="mt-1 text-xs text-muted-foreground">Cria a campanha (casca). Conjuntos e anúncios entram depois — recomendo nascer pausada e ativar só quando estiver completa.</p>
      <div className="mt-4 space-y-3">
        <div className="grid gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Nome</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: CP - Vendas - Topo de funil" maxLength={160} autoFocus className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <div className="grid gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Objetivo</label>
          <select value={objective} onChange={(e) => setObjective(e.target.value)} className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus:ring-1 focus:ring-ring">
            {OBJETIVOS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status inicial</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus:ring-1 focus:ring-ring">
            <option value="PAUSED">Pausada (recomendado)</option>
            <option value="ACTIVE">Ativa</option>
          </select>
        </div>
        {error && <div className="rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button size="sm" disabled={busy || !name.trim()} onClick={async () => { setBusy(true); setError(null); const ok = await onSubmit(name.trim(), objective, status); if (!ok) { setBusy(false); setError("Não foi possível criar. Veja a mensagem acima."); } }}>
            {busy ? "Criando…" : "Criar campanha"}
          </Button>
        </div>
      </div>
    </Overlay>
  );
}

function DuplicateSameModal({ noun, name, onClose, onSubmit }: { noun: string; name: string; onClose: () => void; onSubmit: (suffix: string) => Promise<boolean> }) {
  const [suffix, setSuffix] = useState("[cópia]");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Overlay onClose={onClose}>
      <h3 className="text-base font-bold">Duplicar {noun}</h3>
      <p className="mt-1 text-xs text-muted-foreground">Cria uma cópia <strong>pausada</strong> na mesma conta com sufixo no nome. Confira a cópia antes de ativar.</p>
      <div className="mt-4 space-y-3">
        <div className="grid gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sufixo no nome</label>
          <input value={suffix} onChange={(e) => setSuffix(e.target.value)} maxLength={40} autoFocus className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">Nome resultante: <span className="font-semibold text-foreground">{name} {suffix.trim()}</span></div>
        {error && <div className="rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button size="sm" disabled={busy} onClick={async () => { setBusy(true); setError(null); const ok = await onSubmit(suffix.trim()); if (!ok) { setBusy(false); setError("Não foi possível duplicar. Veja a mensagem acima."); } }}>
            {busy ? "Duplicando…" : "Duplicar"}
          </Button>
        </div>
      </div>
    </Overlay>
  );
}

function BudgetModal({ accountId, level, id, name, currency, onClose, onDone }: { accountId: string; level: "campaign" | "adset"; id: string; name: string; currency?: string; onClose: () => void; onDone: (msg: string) => void }) {
  const [pct, setPct] = useState("30");
  const [dir, setDir] = useState<"up" | "down">("up");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = level === "campaign" ? "campanha" : "conjunto";
  return (
    <Overlay onClose={onClose}>
      <h3 className="text-base font-bold">Ajustar orçamento</h3>
      <p className="mt-1 text-xs text-muted-foreground">{label} · {name}</p>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={() => setDir("up")} className={cn("flex-1 rounded-xl border-2 px-3 py-2 text-sm font-bold transition-colors", dir === "up" ? "border-success bg-success/10 text-success" : "border-border text-muted-foreground")}>↑ Aumentar</button>
        <button type="button" onClick={() => setDir("down")} className={cn("flex-1 rounded-xl border-2 px-3 py-2 text-sm font-bold transition-colors", dir === "down" ? "border-destructive bg-destructive/10 text-destructive" : "border-border text-muted-foreground")}>↓ Reduzir</button>
      </div>
      <div className="mt-4 grid gap-1.5">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Percentual</label>
        <div className="flex items-center gap-2">
          <input type="number" value={pct} onChange={(e) => setPct(e.target.value)} min={1} max={300} className="h-10 w-full flex-1 rounded-lg border border-input bg-transparent px-3 text-center text-base font-bold outline-none focus:ring-1 focus:ring-ring" />
          <span className="text-sm font-bold text-muted-foreground">%</span>
        </div>
      </div>
      {error && <div className="mt-3 rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</div>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button size="sm" disabled={busy || !pct || Number(pct) <= 0} onClick={async () => {
          setBusy(true); setError(null);
          try {
            const factor = dir === "up" ? (100 + Number(pct)) / 100 : (100 - Number(pct)) / 100;
            const r = await fetch("/api/account/budget", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account_id: accountId, level, id, percentual: factor }) });
            const d = await r.json();
            if (!r.ok || d.error) throw new Error(d.error || "Falha ao ajustar.");
            onDone(`Orçamento alterado em ${d.percentual}% (${money(d.anterior, currency)} → ${money(d.atual, currency)}).`);
          } catch (e: any) {
            setError(e?.message || "Falha ao ajustar.");
            setBusy(false);
          }
        }}>
          {busy ? "Ajustando…" : `Confirmar ${dir === "up" ? "aumento" : "redução"}`}
        </Button>
      </div>
    </Overlay>
  );
}
