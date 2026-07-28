"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { compareSortValues, SortButton, SortState, usePersistentSort } from "@/components/SortableHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select, Collapsible, Notice, PageHeader, WideScreenHint, Field } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { RESULT_FAMILY_BY_SLUG } from "@/lib/format";
import { CampaignTemplateList } from "@/components/CampaignTemplates";
import { ArrowLeft, RefreshCw, AlertTriangle, Plus, X, Check, ChevronDown, ChevronUp } from "lucide-react";

interface Group { id: string; name: string; color: string; }
interface Account { account_id: string; name: string; status: string; group_id: string | null; platform: "meta" | "google"; hidden?: boolean; linked_meta_account_id?: string | null; }
interface ClientRecord { id: string; name: string; status: "active" | "paused" | "archived"; objective: string | null; result_family: string | null; brand_name?: string | null; primary_kpi: string | null; target_value: number | null; monthly_budget: number | null; monthly_conversion_goal: number | null; currency: string; timezone: string; budget_start_day: number; report_email?: string | null; report_enabled?: boolean; report_last_sent_at?: string | null; track_sales?: boolean; accounts: Account[]; }
type ClientAdminSortKey = "name" | "objective" | "budget" | "result" | "kpi" | "target" | "cycle";
type GroupSortKey = "name" | "accounts";
type AccountAdminSortKey = "platform" | "name" | "status" | "client" | "group" | "visibility";
const CLIENT_ADMIN_SORT_KEYS: readonly ClientAdminSortKey[] = ["name", "objective", "budget", "result", "kpi", "target", "cycle"];
const GROUP_SORT_KEYS: readonly GroupSortKey[] = ["name", "accounts"];
const ACCOUNT_ADMIN_SORT_KEYS: readonly AccountAdminSortKey[] = ["platform", "name", "status", "client", "group", "visibility"];
const MONETARY_CLIENT_KPIS = new Set(["cpa", "cpl", "cpc", "cpm", "cost_per_result", "revenue", "custom"]);
const PALETTE = ["#3987e5", "#16a34a", "#db2777", "#f59e0b", "#7c3aed", "#0891b2", "#dc2626", "#4b5563"];
const CLIENT_GRID = "minmax(160px,1.2fr) 120px 130px 130px 120px 130px 80px";
const compactInput: React.CSSProperties = { width: "100%", height: 30, fontSize: 12, borderRadius: 8, border: "1px solid var(--color-border)", background: "transparent", padding: "0 8px" };

export default function Admin() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [clientsUnavailable, setClientsUnavailable] = useState<string | null>(null);
  const collectingCount = accounts.filter((a) => !a.hidden).length;
  const [loading, setLoading] = useState(true);
  const [loadRevision, setLoadRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [clientSort, setClientSort] = usePersistentSort<ClientAdminSortKey>("adsctrl:sort:admin-clients", { key: "name", direction: "asc" }, CLIENT_ADMIN_SORT_KEYS);
  const [groupSort, setGroupSort] = usePersistentSort<GroupSortKey>("adsctrl:sort:admin-groups", { key: "name", direction: "asc" }, GROUP_SORT_KEYS);
  const [accountSort, setAccountSort] = usePersistentSort<AccountAdminSortKey>("adsctrl:sort:admin-accounts", { key: "name", direction: "asc" }, ACCOUNT_ADMIN_SORT_KEYS);

  async function load() { setError(null); try { const [r, cr] = await Promise.all([fetch("/api/accounts"), fetch("/api/clients?status=active")]); const d = JSON.parse(await r.text()); if (!r.ok || d.error) throw new Error(d.error || "Falha."); setAccounts(d.accounts || []); setGroups(d.groups || []); const cd = JSON.parse(await cr.text()); if (cr.ok && !cd.error) { setClients(cd.clients || []); setClientsUnavailable(null); } else { setClients([]); setClientsUnavailable(cd.error || "Migração necessária."); } } catch (e: any) { setError(e?.message); } finally { setLoadRevision((r) => r + 1); setLoading(false); } }
  async function refreshClients() { try { const r = await fetch("/api/clients?status=active", { cache: "no-store" }); const d = JSON.parse(await r.text()); if (!r.ok || d.error) throw new Error(d.error || "Falha."); setClients(d.clients || []); setClientsUnavailable(null); } catch (e: any) { setError(e?.message); } }
  useEffect(() => { load(); }, []);

  const countByGroup = useMemo(() => { const m: Record<string, number> = {}; for (const a of accounts) if (a.group_id) m[a.group_id] = (m[a.group_id] || 0) + 1; return m; }, [accounts]);
  const metaAccounts = useMemo(() => accounts.filter((a) => a.platform === "meta" && !a.hidden && a.status === "ACTIVE").sort((a, b) => a.name.localeCompare(b.name)), [accounts]);
  const metaGoogleAccounts = useMemo(() => accounts.filter((a) => a.platform === "meta" && !a.hidden).sort((a, b) => a.name.localeCompare(b.name)), [accounts]);
  const googleAccounts = useMemo(() => accounts.filter((a) => a.platform === "google").sort((a, b) => a.name.localeCompare(b.name)), [accounts]);

  const sortedClients = useMemo(() => {
    const objLabel: Record<string, string> = { leads: "Leads", sales: "Vendas", traffic: "Tráfego", engagement: "Engajamento", awareness: "Reconhecimento", app: "Aplicativo", other: "Outro" };
    const resLabel: Record<string, string> = { conversoes: "Conversões", vendas: "Vendas", leads: "Leads", mensagens: "Mensagens", cadastros: "Cadastros", cliques: "Cliques", lpv: "LPV", engajamento: "Engajamento" };
    const kpiL: Record<string, string> = { cpa: "CPA", cpl: "CPL", roas: "ROAS", revenue: "Receita", conversions: "Conversões", ctr: "CTR", cpc: "CPC", cpm: "CPM", custom: "Custo / resultado" };
    const val = (c: ClientRecord) => { switch (clientSort.key) { case "name": return c.name; case "objective": return c.objective ? objLabel[c.objective] || c.objective : null; case "budget": return c.monthly_budget; case "result": return c.result_family ? resLabel[c.result_family] || c.result_family : null; case "kpi": return c.primary_kpi ? kpiL[c.primary_kpi] || c.primary_kpi : null; case "target": return c.target_value; case "cycle": return c.budget_start_day; } };
    return [...clients].sort((a, b) => { const av = val(a), bv = val(b); if (clientSort.key === "budget" || clientSort.key === "target") { const am = av == null || (typeof av === "number" && Number.isNaN(av)); const bm = bv == null || (typeof bv === "number" && Number.isNaN(bv)); if (am !== bm) return am ? 1 : -1; if (clientSort.key === "budget" && a.currency !== b.currency) return compareSortValues(a.currency, b.currency, "asc"); if (clientSort.key === "target" && a.primary_kpi !== b.primary_kpi) return compareSortValues(a.primary_kpi, b.primary_kpi, "asc"); if (clientSort.key === "target" && MONETARY_CLIENT_KPIS.has(a.primary_kpi || "") && a.currency !== b.currency) return compareSortValues(a.currency, b.currency, "asc"); } return compareSortValues(av, bv, clientSort.direction) || compareSortValues(a.name, b.name, "asc"); });
  }, [clients, clientSort]);
  const sortedGroups = useMemo(() => { const v = (g: Group) => groupSort.key === "name" ? g.name : countByGroup[g.id] || 0; return [...groups].sort((a, b) => compareSortValues(v(a), v(b), groupSort.direction) || compareSortValues(a.name, b.name, "asc")); }, [groups, groupSort, countByGroup]);
  const sortedAccounts = useMemo(() => { const clientById = new Map(clients.map((c) => [c.id, c])); const v = (a: Account) => { switch (accountSort.key) { case "platform": return a.platform; case "name": return a.name; case "status": return a.status; case "client": return clientById.get(a.group_id || "")?.name || ""; case "group": return groups.find((g) => g.id === a.group_id)?.name || ""; case "visibility": return a.hidden ? 1 : 0; } }; return [...accounts].sort((a, b) => compareSortValues(v(a), v(b), accountSort.direction) || compareSortValues(a.name, b.name, "asc")); }, [accounts, accountSort, clients, groups]);

  async function api(url: string, opts: { method: string; body?: string }) { const r = await fetch(url, opts); const d = await r.json(); if (!r.ok || d.error) throw new Error(d.error || "Falha."); return d; }
  async function createGroup() { if (!newName.trim()) return; setBusy(true); try { await api("/api/groups", { method: "POST", body: JSON.stringify({ name: newName.trim(), color: newColor }) }); await load(); setNewName(""); } catch (e: any) { setError(e?.message); } finally { setBusy(false); } }
  async function removeGroup(id: string) { setBusy(true); try { await api(`/api/groups?id=${encodeURIComponent(id)}`, { method: "DELETE" }); await load(); } catch (e: any) { setError(e?.message); } finally { setBusy(false); } }
  async function renameGroup(id: string, name: string) { try { await api("/api/groups", { method: "PATCH", body: JSON.stringify({ id, name }) }); await load(); } catch (e: any) { setError(e?.message); } }
  async function setGroup(accountId: string, groupId: string | null) { setAccounts((prev) => prev.map((a) => a.account_id === accountId ? { ...a, group_id: groupId } : a)); try { await api("/api/accounts/group", { method: "POST", body: JSON.stringify({ account_id: accountId, group_id: groupId }) }); } catch (e: any) { setError(e?.message); await load(); } }
  async function toggleHidden(accountId: string, hidden: boolean) { setAccounts((prev) => prev.map((a) => a.account_id === accountId ? { ...a, hidden } : a)); try { await api("/api/accounts/hidden", { method: "POST", body: JSON.stringify({ account_id: accountId, hidden }) }); } catch (e: any) { setError(e?.message); await load(); } }
  async function linkGoogle(googleId: string, metaId: string) { setAccounts((prev) => prev.map((a) => a.account_id === googleId ? { ...a, linked_meta_account_id: metaId || null } : a)); try { await api("/api/accounts/link", { method: "POST", body: JSON.stringify({ google_account_id: googleId, meta_account_id: metaId || null }) }); await refreshClients(); } catch (e: any) { setError(e?.message); await load(); } }
  async function sync(platform: "meta" | "google") { try { const r = await api("/api/accounts/sync", { method: "POST", body: JSON.stringify({ platform }) }); await load(); setError(r.added ? `${r.added} conta(s) nova(s).` : `Sincronização ${platform} concluída.`); } catch (e: any) { setError(e?.message); } }
  async function updateClient(id: string, patch: Partial<ClientRecord>) { setClients((prev) => prev.map((c) => c.id === id ? { ...c, ...patch } : c)); try { const r = await api(`/api/clients/${id}`, { method: "PATCH", body: JSON.stringify(patch) }); const confirmed = Object.keys(patch).reduce((n, k) => { const f = k as keyof ClientRecord; (n as any)[f] = r.client?.[f] ?? patch[f]; return n; }, {} as Partial<ClientRecord>); setClients((prev) => prev.map((c) => c.id === id ? { ...c, ...confirmed } : c)); } catch (e: any) { await load(); setError(e?.message); } }
  function updateClientField(client: ClientRecord, field: string, value: any) { const patch: any = {}; patch[field] = value; updateClient(client.id, patch); }
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="p-4 md:p-6 md:ml-56 pb-20 md:pb-6 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-14 rounded-lg" /><Skeleton className="h-32 rounded-lg" /></div>;

  return (
    <div className="p-4 md:p-6 md:ml-56 pb-20 md:pb-6 space-y-4 animate-fade-in">
      <PageHeader title="Configurações" subtitle={`${accounts.length} contas no catálogo.`} actions={<Link href="/"><Button variant="ghost" size="sm"><ArrowLeft className="h-3.5 w-3.5 mr-1" /> Voltar</Button></Link>} />

      <WideScreenHint>A tabela de metas é larga; no computador fica mais confortável.</WideScreenHint>

      {error && <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/20 bg-red-500/10 text-sm text-red-500"><AlertTriangle className="h-4 w-4 shrink-0" />{error}<button onClick={() => setError(null)} className="ml-auto bg-transparent border-none cursor-pointer text-xs font-semibold hover:underline">✕</button></div>}

      <div className="space-y-4">
        {/* Clients Section */}
        <Collapsible id="clients" storageKey="admin:clients"
          summary={<SectionHead icon="◎" title="Metas e orçamento por cliente" hint="Objetivo, orçamento, KPI e ciclo." meta={`${clients.length} cliente${clients.length === 1 ? "" : "s"}`} />}>
          {clientsUnavailable ? <Notice tone="warn">{clientsUnavailable}</Notice> : (
            <div className="overflow-x-auto">
              <div className="min-w-[940px] space-y-2">
                <div className="grid gap-2 px-3 py-2 rounded-lg border border-border/50 bg-muted/30 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider items-center" style={{ gridTemplateColumns: CLIENT_GRID }}>
                  <SortButton column="name" sort={clientSort} onSort={setClientSort} align="left">Cliente</SortButton>
                  <SortButton column="objective" sort={clientSort} onSort={setClientSort} align="left">Objetivo</SortButton>
                  <SortButton column="budget" sort={clientSort} onSort={setClientSort} align="left" initialDirection="desc">Orçamento</SortButton>
                  <SortButton column="result" sort={clientSort} onSort={setClientSort} align="left">Resultado</SortButton>
                  <SortButton column="kpi" sort={clientSort} onSort={setClientSort} align="left">KPI</SortButton>
                  <SortButton column="target" sort={clientSort} onSort={setClientSort} align="left" initialDirection="desc">Meta</SortButton>
                  <SortButton column="cycle" sort={clientSort} onSort={setClientSort} align="left">Ciclo</SortButton>
                </div>
                {sortedClients.map((client) => {
                  const los = (client.primary_kpi || "").toLowerCase();
                  return (
                    <div key={client.id} className="grid gap-2 p-3 rounded-lg border border-border/50 bg-card items-end" style={{ gridTemplateColumns: CLIENT_GRID }}>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{client.name}</div>
                        <div className="flex gap-1 mt-1.5 flex-wrap">{(client.accounts || []).map((a) => <span key={a.account_id} className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded uppercase", a.platform === "google" ? "bg-sky-500/10 text-sky-600" : "bg-blue-500/10 text-blue-600")}>{a.platform}</span>)}</div>
                      </div>
                      <Field label="Objetivo"><select value={client.objective || ""} onChange={(e) => updateClientField(client, "objective", e.target.value || null)} style={compactInput}><option value="">—</option><option value="leads">Leads</option><option value="sales">Vendas</option><option value="traffic">Tráfego</option><option value="engagement">Engajamento</option><option value="awareness">Reconhecimento</option><option value="app">Aplicativo</option><option value="other">Outro</option></select></Field>
                      <Field label={`Orçamento · ${client.currency}`}><input key={`${client.id}-b-${loadRevision}`} type="number" min="0" step="10" defaultValue={client.monthly_budget ?? ""} placeholder="0" onBlur={(e) => updateClientField(client, "monthly_budget", e.target.value ? Number(e.target.value) : null)} style={compactInput} /></Field>
                      <Field label="Resultado"><select value={client.result_family || ""} onChange={(e) => updateClientField(client, "result_family", e.target.value || null)} style={compactInput}><option value="">Automático</option><option value="conversoes">Conversões</option><option value="vendas">Vendas</option><option value="leads">Leads</option><option value="mensagens">Mensagens</option><option value="cadastros">Cadastros</option><option value="cliques">Cliques</option><option value="lpv">LPV</option><option value="engajamento">Engajamento</option></select></Field>
                      <Field label="KPI"><select value={client.primary_kpi || ""} onChange={(e) => updateClient(client.id, { primary_kpi: e.target.value || null, target_value: null })} style={compactInput}><option value="">—</option><option value="cpl">CPL</option><option value="cpa">CPA</option><option value="roas">ROAS</option><option value="revenue">Receita</option><option value="conversions">Conversões</option><option value="ctr">CTR</option><option value="cpc">CPC</option><option value="cpm">CPM</option><option value="custom">Custo / resultado</option></select></Field>
                      <Field label={`Meta${MONETARY_CLIENT_KPIS.has(los) ? ` · ${client.currency}` : los === "ctr" ? " · %" : los === "roas" ? " · x" : ""}`}><input key={`${client.id}-t-${loadRevision}`} type="number" min="0" step="any" defaultValue={client.target_value ?? ""} placeholder="—" onBlur={(e) => updateClientField(client, "target_value", e.target.value ? Number(e.target.value) : null)} style={compactInput} /></Field>
                      <Field label="Dia início"><select value={client.budget_start_day} onChange={(e) => updateClientField(client, "budget_start_day", Number(e.target.value))} style={compactInput}>{Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}º</option>)}</select></Field>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Collapsible>

        {/* Groups Section */}
        <Collapsible id="groups" storageKey="admin:groups" summary={<SectionHead icon="◈" title="Grupos" hint="Agrupam contas e clientes." meta={`${groups.length} grupo${groups.length === 1 ? "" : "s"}`} />}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input value={newName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)} placeholder="Nome do grupo" className="flex-[1_1_200px]" />
              <div className="flex gap-1">{[...PALETTE, ...PALETTE].slice(0, 8).map((c) => <button key={c} onClick={() => setNewColor(c)} className={cn("w-6 h-6 rounded-full border-2 transition-all cursor-pointer", newColor === c ? "border-foreground scale-110" : "border-transparent")} style={{ backgroundColor: c }} />)}</div>
              <Button onClick={createGroup} disabled={busy || !newName.trim()} size="sm"><Plus className="h-3.5 w-3.5 mr-1" /> Criar grupo</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[500px]">
                <thead><tr className="border-b border-border text-muted-foreground uppercase tracking-wider"><th className="text-left p-2 font-semibold"><SortButton column="name" sort={groupSort} onSort={setGroupSort} align="left">Grupo</SortButton></th><th className="text-right p-2 font-semibold"><SortButton column="accounts" sort={groupSort} onSort={setGroupSort} initialDirection="desc">Contas</SortButton></th><th className="p-2 w-16" /></tr></thead>
                <tbody>{sortedGroups.map((g) => (
                  <tr key={g.id} className="border-b border-border/30"><td className="p-2"><span className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color }} /><input defaultValue={g.name} onBlur={(e) => { if (e.target.value.trim() && e.target.value.trim() !== g.name) renameGroup(g.id, e.target.value.trim()); }} className="text-xs font-semibold bg-transparent border-none outline-none focus:ring-1 focus:ring-ring rounded px-1" /></span></td><td className="p-2 text-right text-muted-foreground">{countByGroup[g.id] || 0}</td><td className="p-2 text-right"><Button variant="ghost" size="sm" onClick={() => removeGroup(g.id)} disabled={busy} className="h-7 text-xs text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></Button></td></tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </Collapsible>

        {/* Accounts Section */}
        <Collapsible id="accounts" storageKey="admin:accounts" defaultOpen summary={<SectionHead icon="◫" title="Contas" hint="Ativar/ocultar, vincular Google a Meta e definir grupo." meta={`${collectingCount} ativa${collectingCount === 1 ? "" : "s"} de ${accounts.length}`} />}>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs text-muted-foreground">Sincronizar:</span>
            <Button variant="secondary" size="sm" onClick={() => sync("meta")}><RefreshCw className="h-3 w-3 mr-1" /> Meta</Button>
            <Button variant="secondary" size="sm" onClick={() => sync("google")}><RefreshCw className="h-3 w-3 mr-1" /> Google</Button>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[800px] space-y-1">
              <div className="grid gap-2 px-3 py-2 rounded-lg border border-border/50 bg-muted/30 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider items-center" style={{ gridTemplateColumns: "60px 1.5fr 80px 1fr 1.2fr 110px 130px" }}>
                <SortButton column="platform" sort={accountSort} onSort={setAccountSort} align="left">Plat.</SortButton>
                <SortButton column="name" sort={accountSort} onSort={setAccountSort} align="left">Nome</SortButton>
                <SortButton column="status" sort={accountSort} onSort={setAccountSort} align="left">Status</SortButton>
                <SortButton column="client" sort={accountSort} onSort={setAccountSort} align="left">Cliente</SortButton>
                <SortButton column="group" sort={accountSort} onSort={setAccountSort} align="left">Grupo</SortButton>
                <SortButton column="visibility" sort={accountSort} onSort={setAccountSort} align="center">Visível</SortButton>
                <span>Vincular Google</span>
              </div>
              {sortedAccounts.map((a) => (
                <div key={a.account_id} className="grid gap-2 px-3 py-2 rounded-lg border border-border/30 bg-card text-xs items-center" style={{ gridTemplateColumns: "60px 1.5fr 80px 1fr 1.2fr 110px 130px" }}>
                  <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded text-center", a.platform === "google" ? "bg-sky-500/10 text-sky-600" : "bg-blue-500/10 text-blue-600")}>{a.platform}</span>
                  <span className="font-medium truncate" title={a.name}>{a.name}</span>
                  <span className={cn("text-[10px] font-semibold", a.status === "ACTIVE" ? "text-emerald-500" : "text-muted-foreground")}>{a.status}</span>
                  <span className="text-muted-foreground truncate">{a.group_id ? groups.find((g) => g.id === a.group_id)?.name || "—" : "—"}</span>
                  <select value={a.group_id || ""} onChange={(e) => setGroup(a.account_id, e.target.value || null)} className="text-xs rounded border border-input bg-transparent px-1 py-1" style={{ fontSize: 11 }}>
                    <option value="">sem grupo</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                  <div className="flex justify-center">
                    <button onClick={() => toggleHidden(a.account_id, !a.hidden)} className={cn("px-2 py-0.5 rounded text-[10px] font-semibold border-none cursor-pointer transition-colors", a.hidden ? "bg-muted text-muted-foreground hover:text-foreground" : "bg-primary/10 text-primary hover:bg-primary/20")}>{a.hidden ? "oculto" : "ativo"}</button>
                  </div>
                  <div className="flex justify-end">
                    {a.platform === "google" ? (
                      <select value={a.linked_meta_account_id || ""} onChange={(e) => linkGoogle(a.account_id, e.target.value)} className="text-[10px] rounded border border-input bg-transparent px-1 py-1 w-full max-w-[120px]" title="Vincular a uma conta Meta">
                        <option value="">—</option>{metaAccounts.map((m) => <option key={m.account_id} value={m.account_id}>{m.name}</option>)}
                      </select>
                    ) : <span className="text-[10px] text-muted-foreground">—</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 border-t border-border/50 pt-3 px-1">
            <CampaignTemplateList />
          </div>
        </Collapsible>
      </div>
    </div>
  );
}

function SectionHead({ icon, title, hint, meta }: { icon: string; title: string; hint: string; meta: string }) {
  return (
    <div className="flex items-center gap-3 flex-1 min-w-0">
      <span className="text-base">{icon}</span>
      <div className="min-w-0">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-muted-foreground ml-2">{hint}</span>
      </div>
      <span className="ml-auto text-xs font-semibold text-muted-foreground shrink-0">{meta}</span>
    </div>
  );
}
