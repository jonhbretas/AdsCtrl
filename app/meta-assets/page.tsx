"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { compareSortValues, SortButton, SortState, usePersistentSort } from "@/components/SortableHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select, Notice, PageHeader, WideScreenHint, Field } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { RefreshCw, AlertTriangle, CheckCircle2, XCircle, HelpCircle, ExternalLink, Search, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";

type Connection = { index: number; user_id: string | null; name: string; status: "ok" | "partial" | "error"; error: string | null; account_count: number; business_count: number; };
type Business = { id: string; name: string; verification_status?: string; created_time?: string; connection_indexes: number[]; };
type MetaAccount = { account_id: string; name: string; status: string; status_code: number; disable_reason: number | null; currency: string; timezone: string | null; business: { id: string | null; name: string | null } | null; connection_indexes: number[]; is_prepaid: boolean; available_balance: number | null; billing_balance: number; payment_summary: string | null; spend_today: number; spend_7d: number; metrics_available: boolean; metric_range: { since: string; until: string }; amount_spent: number; spend_cap: number | null; spend_cap_remaining: number | null; min_daily_budget: number | null; permissions: string[]; catalog: { synced: boolean; hidden: boolean | null; status: string | null; }; };
type Payload = { generated_at: string; scope: "account" | "all"; requested_account_id: string | null; range: { since: string; until: string }; range_uses_account_timezone: boolean; limitations: { daily_spend_limit: string; secrets: string }; connections: Connection[]; businesses: Business[]; accounts: MetaAccount[]; error?: string; };
type CatalogAccount = { account_id: string; name: string; status: string; hidden: boolean; currency: string; };
type MetaSortKey = "account" | "status" | "today" | "spend7d" | "prepaidAvailable" | "postpaidOutstanding" | "amountSpent" | "spendCap" | "payment" | "connection";
const DEFAULT_SORT: SortState<MetaSortKey> = { key: "account", direction: "asc" };
const META_SORT_KEYS: readonly MetaSortKey[] = ["account", "status", "today", "spend7d", "prepaidAvailable", "postpaidOutstanding", "amountSpent", "spendCap", "payment", "connection"];

export default function MetaAssetsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [catalog, setCatalog] = useState<CatalogAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState("");
  const [sort, setSort] = usePersistentSort<MetaSortKey>("adsctrl:sort:meta-assets", DEFAULT_SORT, META_SORT_KEYS);

  async function load() { setLoading(true); setError(null); try { const [r, cr] = await Promise.all([fetch("/api/meta/assets", { cache: "no-store" }), fetch("/api/accounts?platform=meta")]); const d = await r.json(); if (!r.ok || d.error) throw new Error(d.error || "Falha."); setData(d); const cd = await cr.json(); if (cr.ok) setCatalog(cd.accounts || []); } catch (e: any) { setError(e?.message); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);

  const accountById = useMemo(() => new Map(accountsFromCatalog(catalog).map((a) => [a.account_id, a])), [catalog]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [sections, setSections] = useState({ connections: false, businesses: false, accounts: true });

  const rows = useMemo(() => {
    if (!data) return [];
    return [...data.accounts].sort((a, b) => {
      const v = (ac: MetaAccount) => { switch (sort.key) { case "account": return ac.name; case "status": return ac.status; case "today": return ac.spend_today; case "spend7d": return ac.spend_7d; case "prepaidAvailable": return ac.available_balance ?? -1; case "postpaidOutstanding": return ac.billing_balance; case "amountSpent": return ac.amount_spent; case "spendCap": return ac.spend_cap ?? -1; case "payment": return ac.payment_summary || ""; case "connection": return ac.connection_indexes[0] ?? -1; } };
      return compareSortValues(v(a), v(b), sort.direction) || compareSortValues(a.name, b.name, "asc");
    });
  }, [data, sort]);

  async function copy(value: string, key: string) {
    try { await navigator.clipboard.writeText(value); setCopiedKey(key); setTimeout(() => setCopiedKey(null), 1800); }
    catch { window.prompt("Copie:", value); }
  }

  return (
    <div className="p-4 md:p-6 md:ml-56 pb-20 md:pb-6 space-y-4 animate-fade-in">
      <PageHeader title="Raio-X Meta" subtitle="Estrutura de conexões, negócios e contas de anúncio." actions={
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}><RefreshCw className={cn("h-3.5 w-3.5 mr-1", loading && "animate-spin")} /> Atualizar</Button>
      } />
      <WideScreenHint />

      {error && <Notice tone="danger" onDismiss={() => setError(null)}>{error}</Notice>}
      {data?.error && <Notice tone="warn">{data.error}</Notice>}

      {loading ? <div className="space-y-2"><Skeleton className="h-24 rounded-lg" /><Skeleton className="h-32 rounded-lg" /><Skeleton className="h-48 rounded-lg" /></div> : data && (
        <div className="space-y-4">
          {/* Connections */}
          <Card>
            <button onClick={() => setSections((s) => ({ ...s, connections: !s.connections }))} className="flex items-center justify-between w-full px-4 py-3 text-left bg-transparent border-none cursor-pointer">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Conexões ({data.connections.length})</h3>
              {sections.connections ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
            {sections.connections && <CardContent className="p-4 pt-2 border-t border-border/50">
              {data.connections.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma conexão encontrada.</p> : (
                <div className="space-y-2">{data.connections.map((c) => (
                  <div key={c.index} className="flex items-center gap-3 p-2.5 rounded-lg border border-border/50">
                    {c.status === "ok" ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> : c.status === "partial" ? <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" /> : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                    <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{c.name}</div>{c.user_id && <div className="text-[11px] text-muted-foreground">ID: {c.user_id}</div>}</div>
                    <div className="text-xs text-muted-foreground text-right shrink-0">{c.account_count} contas · {c.business_count} negócios</div>
                  </div>
                ))}</div>
              )}
            </CardContent>}
          </Card>

          {/* Businesses */}
          <Card>
            <button onClick={() => setSections((s) => ({ ...s, businesses: !s.businesses }))} className="flex items-center justify-between w-full px-4 py-3 text-left bg-transparent border-none cursor-pointer">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Negócios ({data.businesses.length})</h3>
              {sections.businesses ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
            {sections.businesses && <CardContent className="p-4 pt-2 border-t border-border/50">
              {data.businesses.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum negócio encontrado.</p> : (
                <div className="space-y-2">{data.businesses.map((b) => (
                  <div key={b.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-border/50">
                    <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{b.name}</div><div className="text-[11px] text-muted-foreground">ID: {b.id}</div></div>
                    <Badge variant={b.verification_status === "verified" ? "success" : "warning"} className="text-[10px]">{b.verification_status || "não verificado"}</Badge>
                    <span className="text-xs text-muted-foreground">{b.created_time ? new Date(b.created_time).toLocaleDateString("pt-BR") : ""}</span>
                  </div>
                ))}</div>
              )}
            </CardContent>}
          </Card>

          {/* Accounts table */}
          <Card><CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contas de anúncio ({data.accounts.length})</h3>
              <div className="relative w-48"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" /><input value={accountFilter} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAccountFilter(e.target.value)} placeholder="Filtrar…" className="w-full h-8 pl-8 pr-3 text-xs rounded-lg border border-border/50 bg-muted/30 focus:outline-none" /></div>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[1000px]">
                <div className="grid gap-2 px-4 py-2 border-b border-border/50 bg-muted/30 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider items-center" style={{ gridTemplateColumns: "1.5fr 80px 90px 100px 110px 110px 110px 90px 100px 80px" }}>
                  <SortButton column="account" sort={sort} onSort={setSort} align="left">Conta</SortButton>
                  <SortButton column="status" sort={sort} onSort={setSort} align="center">Status</SortButton>
                  <SortButton column="today" sort={sort} onSort={setSort} initialDirection="desc">Hoje</SortButton>
                  <SortButton column="spend7d" sort={sort} onSort={setSort} initialDirection="desc">7d</SortButton>
                  <SortButton column="amountSpent" sort={sort} onSort={setSort} initialDirection="desc">Gasto total</SortButton>
                  <SortButton column="prepaidAvailable" sort={sort} onSort={setSort} initialDirection="desc">Saldo pré</SortButton>
                  <SortButton column="postpaidOutstanding" sort={sort} onSort={setSort} initialDirection="desc">Fatura</SortButton>
                  <SortButton column="spendCap" sort={sort} onSort={setSort} initialDirection="desc">Limite</SortButton>
                  <SortButton column="payment" sort={sort} onSort={setSort} align="left">Pagamento</SortButton>
                  <SortButton column="connection" sort={sort} onSort={setSort} align="center">Conexão</SortButton>
                </div>
                {rows.filter((a) => !accountFilter || a.name.toLowerCase().includes(accountFilter.toLowerCase())).map((a) => {
                  const open = expanded === a.account_id;
                  const fmt = (v: number, c: string) => v ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: c }).format(v) : "—";
                  return (
                    <div key={a.account_id}>
                      <div className={cn("grid gap-2 px-4 py-3 border-b border-border/30 items-center text-xs cursor-pointer hover:bg-accent/20 transition-colors", open && "bg-accent/20")} style={{ gridTemplateColumns: "1.5fr 80px 90px 100px 110px 110px 110px 90px 100px 80px" }} onClick={() => setExpanded(open ? null : a.account_id)}>
                        <div className="min-w-0"><div className="text-sm font-semibold truncate">{a.name}</div><div className="text-[10px] text-muted-foreground">ID: {a.account_id.replace(/^act_/, "")}</div></div>
                        <div className="text-center"><span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", a.status === "ACTIVE" ? "bg-emerald-500/10 text-emerald-500" : a.status === "DISABLED" ? "bg-red-500/10 text-red-500" : "bg-muted text-muted-foreground")}>{a.status}</span></div>
                        <div className="text-right font-medium tabular-nums">{a.metrics_available ? fmt(a.spend_today, a.currency) : "—"}</div>
                        <div className="text-right font-medium tabular-nums">{a.metrics_available ? fmt(a.spend_7d, a.currency) : "—"}</div>
                        <div className="text-right font-medium tabular-nums">{fmt(a.amount_spent, a.currency)}</div>
                        <div className="text-right tabular-nums">{a.is_prepaid && a.available_balance != null ? <span className="font-semibold">{fmt(a.available_balance, a.currency)}</span> : <span className="text-muted-foreground">—</span>}</div>
                        <div className="text-right tabular-nums">{!a.is_prepaid ? <span className="font-semibold">{fmt(a.billing_balance, a.currency)}</span> : <span className="text-muted-foreground">—</span>}</div>
                        <div className="text-right tabular-nums">{a.spend_cap != null ? fmt(a.spend_cap, a.currency) : <span className="text-muted-foreground">—</span>}</div>
                        <div className="text-muted-foreground truncate text-[10px]" title={a.payment_summary || ""}>{a.payment_summary || "—"}</div>
                        <div className="flex justify-center">
                          {a.connection_indexes.map((ci) => (
                            <span key={ci} className="w-5 h-5 rounded text-[10px] font-bold grid place-items-center bg-primary/10 text-primary">{ci + 1}</span>
                          ))}
                        </div>
                      </div>
                        {open && (
                        <div className="px-4 py-3 border-b border-border/30 bg-muted/10 space-y-2">
                          <div className="flex flex-wrap gap-4 text-xs">
                            <div><span className="text-muted-foreground">Moeda:</span> {a.currency}</div>
                            <div><span className="text-muted-foreground">Fuso:</span> {a.timezone || "—"}</div>
                            <div><span className="text-muted-foreground">Negócio:</span> {a.business?.name || "—"}</div>
                            <div><span className="text-muted-foreground">Pré-paga:</span> {a.is_prepaid ? "Sim" : "Não"}</div>
                            <div><span className="text-muted-foreground">Gasto mínimo/dia:</span> {a.min_daily_budget ? fmt(a.min_daily_budget, a.currency) : "—"}</div>
                          </div>
                          <div className="flex flex-wrap gap-4 text-xs">
                            <div><span className="text-muted-foreground">Catálogo:</span> {a.catalog.synced ? "sincronizado" : "não sincronizado"} · {a.catalog.status || "—"}</div>
                            <div><span className="text-muted-foreground">Permissões:</span> {a.permissions.join(", ") || "—"}</div>
                          </div>
                          {/* Acesso rápido */}
                          {(() => {
                            const bareId = a.account_id.replace(/^act_/, "");
                            const busId = a.business?.id;
                            const busParam = busId ? `&business_id=${encodeURIComponent(busId)}` : "";
                            const accLinks = [
                              { label: "Ads Manager", url: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent(bareId)}`, accent: false },
                              { label: "Saldo / pagamento", url: `https://business.facebook.com/billing_hub/payment_settings?asset_id=${encodeURIComponent(bareId)}${busParam}&placement=standalone`, accent: true },
                              { label: "Faturas", url: `https://business.facebook.com/billing_hub/accounts/details?asset_id=${encodeURIComponent(bareId)}${busParam}&placement=standalone`, accent: false },
                              { label: "Conta e acessos", url: `https://business.facebook.com/settings/ad-accounts/${encodeURIComponent(bareId)}${busId ? `?business_id=${encodeURIComponent(busId)}` : ""}`, accent: false },
                              { label: "Business Manager", url: busId ? `https://business.facebook.com/settings?business_id=${encodeURIComponent(busId)}` : "https://business.facebook.com/settings", accent: false },
                            ];
                            const billingUrl = accLinks[1].url;
                            return (
                              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/30">
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mr-1">Acesso rápido · {a.business?.name || "Conta"}</span>
                                {accLinks.map((link) => (
                                  <a key={link.label} href={link.url} target="_blank" rel="noreferrer"
                                    className={cn(
                                      "px-2 py-1 text-[10px] font-semibold rounded-md border transition-colors inline-flex items-center gap-1 no-underline",
                                      link.accent
                                        ? "bg-primary/10 border-primary/20 text-primary hover:bg-primary/20"
                                        : "bg-muted/30 border-border/50 text-muted-foreground hover:text-foreground hover:bg-accent/50"
                                    )}>
                                    {link.label} <ExternalLink className="h-2.5 w-2.5" />
                                  </a>
                                ))}
                                <button onClick={() => copy(billingUrl, `${bareId}-link`)}
                                  className="px-2 py-1 text-[10px] font-semibold rounded-md border border-dashed border-primary/30 text-primary hover:bg-primary/10 transition-colors cursor-pointer bg-transparent">
                                  {copiedKey === `${bareId}-link` ? <><Check className="h-2.5 w-2.5 inline" /> Copiado</> : <><Copy className="h-2.5 w-2.5 inline" /> Copiar link</>}
                                </button>
                                <button onClick={() => copy(bareId, `${bareId}-id`)}
                                  className="px-2 py-1 text-[10px] rounded-md text-muted-foreground hover:text-foreground transition-colors cursor-pointer bg-transparent border-none">
                                  {copiedKey === `${bareId}-id` ? "✓ ID" : `ID ${bareId}`}
                                </button>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent></Card>

          {/* Limitations */}
          {data.limitations && (
            <Card><CardContent className="p-4 text-xs text-muted-foreground space-y-1">
              <p>Limite de gasto diário: {data.limitations.daily_spend_limit}.</p>
              <p>Tokens de acesso: {data.limitations.secrets === "ok" ? "configurados" : "falta configurar"}.</p>
              {data.generated_at && <p>Gerado em: {new Date(data.generated_at).toLocaleString("pt-BR")}.</p>}
            </CardContent></Card>
          )}
        </div>
      )}
    </div>
  );
}

function accountsFromCatalog(catalog: CatalogAccount[]): { account_id: string; name: string }[] {
  const seen = new Set<string>();
  return catalog.filter((a) => { if (seen.has(a.account_id)) return false; seen.add(a.account_id); return true; });
}
