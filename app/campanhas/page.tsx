"use client";

// app/campanhas/page.tsx
// Tela dedicada às campanhas de uma conta: tabela limpa por nível
// (campanhas / conjuntos / anúncios) com pausar/reativar, orçamento (CP e CJ),
// duplicar (CP entre contas; CJ e anúncio na própria conta) e criação de CP.
// O dashboard leva a esta tela ao clicar no cliente/conta.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ChevronDown, Copy, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  money, num, pct, pickVal, resultLabel, pickPrimaryResult, orderedResults,
  RESULT_FAMILIES, RESULT_FAMILY_BY_SLUG, PURCHASE_KEYS,
} from "@/lib/format";
import { compareSortValues, SortButton, SortState, usePersistentSort } from "@/components/SortableHeader";
import DuplicateCampaign from "@/components/DuplicateCampaign";

interface Row {
  id: string; name: string; spend: number; impressions: number; clicks: number;
  ctr: number; cpm: number; objective?: string; thumbnail?: string;
  status?: string; effective_status?: string;
  results: Record<string, number>; values: Record<string, number>;
}
interface Detail {
  campaigns: Row[]; adsets: Row[]; ads: Row[];
  availableResults: string[];
  result_family?: string | null;
  error?: string;
}
interface AccountInfo { account_id: string; name: string; platform: "meta" | "google"; hidden?: boolean; currency?: string }

type Level = "campaigns" | "adsets" | "ads";
type ResultKey = "name" | "spend" | "impressions" | "clicks" | "ctr" | "result" | "cpr" | "roas";
const SORT_KEYS: readonly ResultKey[] = ["name", "spend", "impressions", "clicks", "ctr", "result", "cpr", "roas"];
const LEVEL_NOUN: Record<Level, string> = { campaigns: "a campanha", adsets: "o conjunto", ads: "o anúncio" };
const LEVEL_TITLE: Record<Level, string> = { campaigns: "Campanhas", adsets: "Conjuntos", ads: "Anúncios" };

const FAMILY_PREFIX = "family:";
const ACTION_PREFIX = "action:";
const CONVERSION_FAMILIES = ["vendas", "mensagens", "leads", "cadastros"];
const ALL_CONVERSIONS = `${FAMILY_PREFIX}conversoes`;

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
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

function selectionLabel(selection: string): string {
  if (selection.startsWith(FAMILY_PREFIX)) {
    return RESULT_FAMILY_BY_SLUG[selection.slice(FAMILY_PREFIX.length)]?.label || selection;
  }
  return resultLabel(selection.startsWith(ACTION_PREFIX) ? selection.slice(ACTION_PREFIX.length) : selection);
}

export default function CampaignsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [accountId, setAccountId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Level>("campaigns");
  const [result, setResult] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [changing, setChanging] = useState<string | null>(null);
  const [budget, setBudget] = useState<{ level: "campaign" | "adset"; id: string; name: string } | null>(null);
  const [duplicateCJ, setDuplicateCJ] = useState<{ id: string; name: string } | null>(null);
  const [duplicateAd, setDuplicateAd] = useState<{ id: string; name: string } | null>(null);
  const [duplicateCP, setDuplicateCP] = useState<{ id: string; name: string } | null>(null);
  const [newCampaign, setNewCampaign] = useState(false);
  const [tableSort, setTableSort] = usePersistentSort<ResultKey>("adsctrl:sort:campanhas", { key: "spend", direction: "desc" }, SORT_KEYS);

  const range = useMemo(() => ({ since: isoDaysAgo(14), until: isoDaysAgo(1) }), []);
  const account = accounts.find((item) => item.account_id === accountId);
  const isMeta = account?.platform === "meta";

  // Leitura do ?account= da URL (padrão das demais telas, sem useSearchParams).
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("account") || "";
    const stored = window.localStorage.getItem("adsctrl:selected-account") || "";
    setAccountId(requested || stored);
  }, []);

  useEffect(() => {
    fetch("/api/accounts", { cache: "no-store" })
      .then((r) => r.json())
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

  const rows = useMemo(() => {
    if (!detail) return [];
    const source = tab === "campaigns" ? detail.campaigns : tab === "adsets" ? detail.adsets : detail.ads;
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
    return [...source].sort(
      (left, right) => compareSortValues(rowValue(left), rowValue(right), tableSort.direction) || compareSortValues(left.name, right.name, "asc")
    );
  }, [detail, tab, result, tableSort]);

  function flash(text: string, bad = false) {
    setNote({ text, bad });
    window.setTimeout(() => setNote(null), 8000);
  }

  function selectAccount(next: string) {
    window.localStorage.setItem("adsctrl:selected-account", next);
    window.dispatchEvent(new CustomEvent("adsctrl:account-selected", { detail: next }));
    router.push(`/campanhas?account=${encodeURIComponent(next)}`);
  }

  async function toggleDelivery(row: Row) {
    if (!isMeta || !row.status) return;
    const next = row.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    const verb = next === "PAUSED" ? "Pausar" : "Reativar";
    if (!window.confirm(`${verb} ${LEVEL_NOUN[tab]} "${row.name}"?`)) return;
    setChanging(row.id);
    setNote(null);
    try {
      const r = await fetch("/api/account/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, level: tab === "campaigns" ? "campaign" : tab === "adsets" ? "adset" : "ad", id: row.id, status: next }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Falha.");
      setDetail((current) => {
        if (!current) return current;
        const key = tab;
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

  const countFor = (level: Level) => detail?.[level].length ?? 0;

  return (
    <div className="p-4 md:p-6 md:ml-56 pb-20 md:pb-6 space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link href="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground no-underline"><ArrowLeft className="h-3 w-3" /> Visão Geral</Link>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight truncate">{account?.name || "Campanhas"}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Estrutura e veiculação · últimos 14 dias · {account ? (account.platform === "google" ? "Google Ads" : "Meta Ads") : "—"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <select value={accountId} onChange={(e) => selectAccount(e.target.value)} className="h-9 w-full min-w-[180px] max-w-[320px] appearance-none rounded-lg border border-border bg-background px-3 pr-8 text-xs outline-none focus:ring-1 focus:ring-ring sm:w-auto">
              {accounts.map((item) => <option key={item.account_id} value={item.account_id}>{item.platform === "google" ? "Google" : "Meta"} · {item.name}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
          <Button variant="ghost" size="sm" onClick={async () => { try { await reload(); flash("Dados atualizados."); } catch (e: any) { flash(e.message, true); } }}><RefreshCw className="h-3.5 w-3.5 mr-1" /> Atualizar</Button>
          <Button size="sm" onClick={() => setNewCampaign(true)} disabled={!isMeta} title={isMeta ? "Criar campanha" : "Criar campanha só na Meta"}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Nova campanha
          </Button>
        </div>
      </div>

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

      {/* Tabs + resultado */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50 border border-border/50">
          {(["campaigns", "adsets", "ads"] as const).map((level) => (
            <button key={level} onClick={() => setTab(level)} className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-colors", tab === level ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {LEVEL_TITLE[level]} <span className="opacity-60">({countFor(level)})</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Resultado:</span>
          <select value={result ?? ""} onChange={(e) => setResult(e.target.value)} className="h-8 rounded-lg border border-border/50 bg-muted/30 px-2 text-xs outline-none focus:ring-2 focus:ring-ring/30">
            <optgroup label="Resultado do negócio">
              {RESULT_FAMILIES.map((f) => <option key={f.slug} value={`${FAMILY_PREFIX}${f.slug}`}>{f.label}</option>)}
            </optgroup>
            {orderedResults(detail?.availableResults || []).length > 0 && (
              <optgroup label="Detalhado (como a Meta reporta)">
                {orderedResults(detail?.availableResults || []).map((type) => <option key={type} value={`${ACTION_PREFIX}${type}`}>{resultLabel(type)}</option>)}
              </optgroup>
            )}
          </select>
        </div>
      </div>

      {/* Tabela */}
      <Card className="min-w-0 overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <div className="grid grid-cols-[44px_1.6fr_0.9fr_0.9fr_0.8fr_0.7fr_0.9fr_0.8fr_0.8fr_190px] gap-2 px-4 py-2.5 border-b border-border/50 bg-muted/30 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider items-center">
              <span>No ar</span>
              <SortHeader sortKey="name" sort={tableSort} onSort={setTableSort} align="left">{tab === "ads" ? "Anúncio" : tab === "adsets" ? "Conjunto" : "Campanha"}</SortHeader>
              {tab === "campaigns" && <SortHeader sortKey="name" sort={tableSort} onSort={setTableSort}>Objetivo</SortHeader>}
              <SortHeader sortKey="spend" sort={tableSort} onSort={setTableSort} initialDirection="desc">Investimento</SortHeader>
              <SortHeader sortKey="impressions" sort={tableSort} onSort={setTableSort} initialDirection="desc">Impressões</SortHeader>
              <SortHeader sortKey="clicks" sort={tableSort} onSort={setTableSort} initialDirection="desc">Cliques</SortHeader>
              <SortHeader sortKey="ctr" sort={tableSort} onSort={setTableSort} initialDirection="desc">CTR</SortHeader>
              <SortHeader sortKey="result" sort={tableSort} onSort={setTableSort} initialDirection="desc">Resultado</SortHeader>
              <SortHeader sortKey="cpr" sort={tableSort} onSort={setTableSort}>CPR</SortHeader>
              {tab === "campaigns" && <SortHeader sortKey="roas" sort={tableSort} onSort={setTableSort} initialDirection="desc">ROAS</SortHeader>}
              <span className="text-right">Ações</span>
            </div>

            {loading && !detail && (
              <div className="py-12 text-center text-sm text-muted-foreground">Carregando…</div>
            )}
            {!loading && detail && rows.length === 0 && (
              <div className="py-12 text-center text-sm text-muted-foreground">Nenhum {tab === "ads" ? "anúncio" : tab === "adsets" ? "conjunto" : "campanha"} no período.</div>
            )}

            {rows.map((row) => {
              const res = resultValue(row.results, result);
              const rv = pickVal(row.values, PURCHASE_KEYS);
              return (
                <div key={row.id} className="grid grid-cols-[44px_1.6fr_0.9fr_0.9fr_0.8fr_0.7fr_0.9fr_0.8fr_0.8fr_190px] gap-2 px-4 py-3 items-center border-b border-border/30 last:border-b-0 transition-colors hover:bg-accent/20">
                  <DeliverySwitch row={row} busy={changing === row.id} onToggle={() => toggleDelivery(row)} metaOnly={isMeta} />
                  <div className="flex items-center gap-2.5 min-w-0">
                    {tab === "ads" && row.thumbnail && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={row.thumbnail} alt="" width={30} height={30} className="rounded-md object-cover shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate" title={row.name}>{row.name}</div>
                      {row.status && row.status !== "ACTIVE" && row.status !== "PAUSED" && (
                        <div className="text-[10px] text-muted-foreground">status: {row.status.toLowerCase().replace(/_/g, " ")}</div>
                      )}
                    </div>
                  </div>
                  {tab === "campaigns" && (
                    <div className="text-xs text-muted-foreground truncate" title={row.objective}>{row.objective || "—"}</div>
                  )}
                  <div className="text-right text-sm font-semibold">{money(row.spend, account?.currency)}</div>
                  <div className="text-right text-sm text-foreground/80">{num(row.impressions)}</div>
                  <div className="text-right text-sm text-foreground/80">{num(row.clicks)}</div>
                  <div className="text-right text-sm text-foreground/80">{pct(row.ctr)}</div>
                  <div className={cn("text-right text-sm font-semibold", res > 0 ? "text-foreground" : "text-muted-foreground")}>{res > 0 ? num(res) : "—"}</div>
                  <div className="text-right text-sm text-foreground/80">{res > 0 ? money(row.spend / res, account?.currency) : "—"}</div>
                  {tab === "campaigns" && (
                    <div className="text-right text-xs text-emerald-500 font-medium">{rv > 0 && row.spend > 0 ? `${(rv / row.spend).toFixed(1)}x` : "—"}</div>
                  )}
                  <div className="flex items-center gap-1.5 justify-end">
                    {(tab === "campaigns" || tab === "adsets") && (
                      <button type="button" onClick={() => setBudget({ level: tab === "campaigns" ? "campaign" : "adset", id: row.id, name: row.name })} disabled={!isMeta} title="Ajustar orçamento" className="rounded-md border border-border/60 bg-muted/20 px-2 py-1 text-[10px] font-semibold text-foreground hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-40">Orçamento</button>
                    )}
                    <button type="button"
                      onClick={() => {
                        if (tab === "campaigns") setDuplicateCP({ id: row.id, name: row.name });
                        else if (tab === "adsets") setDuplicateCJ({ id: row.id, name: row.name });
                        else setDuplicateAd({ id: row.id, name: row.name });
                      }}
                      disabled={!isMeta}
                      title={tab === "campaigns" ? "Duplicar campanha para outra conta" : tab === "adsets" ? "Duplicar conjunto nesta conta" : "Duplicar anúncio neste conjunto"}
                      className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/20 px-2 py-1 text-[10px] font-semibold text-foreground hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-40">
                      <Copy className="h-2.5 w-2.5" /> Duplicar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Modais */}
      {budget && <BudgetModal accountId={accountId} level={budget.level} id={budget.id} name={budget.name} currency={account?.currency} onClose={() => setBudget(null)} onDone={(msg) => { setBudget(null); flash(msg); reload().catch(() => {}); }} />}
      {duplicateCJ && <DuplicateSameModal noun="conjunto" name={duplicateCJ.name} onClose={() => setDuplicateCJ(null)} onSubmit={async (suffix) => { const ok = await handleDuplicateSame("adset", duplicateCJ.id, suffix); if (ok) setDuplicateCJ(null); return ok; }} />}
      {duplicateAd && <DuplicateSameModal noun="anúncio" name={duplicateAd.name} onClose={() => setDuplicateAd(null)} onSubmit={async (suffix) => { const ok = await handleDuplicateSame("ad", duplicateAd.id, suffix); if (ok) setDuplicateAd(null); return ok; }} />}
      {duplicateCP && <DuplicateCampaign sourceAccountId={accountId} campaignId={duplicateCP.id} campaignName={duplicateCP.name} onClose={() => setDuplicateCP(null)} />}
      {newCampaign && <NewCampaignModal onClose={() => setNewCampaign(false)} onSubmit={async (name, objective, status) => { const ok = await handleNewCampaign(name, objective, status); if (ok) setNewCampaign(false); return ok; }} />}
    </div>
  );
}

/* ------------------------------ subcomponentes ----------------------------- */

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

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border/50 bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
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
