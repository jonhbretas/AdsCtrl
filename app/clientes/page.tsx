"use client";

// Clientes — metas, orçamento, grupos e contas de anúncio.
//
// Saiu de /admin no redesenho: Config passou a guardar só o que é do sistema
// (marca, e-mail, integrações). Aqui fica o cadastro que muda por cliente.
// A entrega do relatório vive em /relatorios, ao lado do link do painel.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { compareSortValues, SortButton, usePersistentSort } from "@/components/SortableHeader";
import { Button } from "@/components/ui/button";
import { Input, Collapsible, Modal, Notice, PageHeader, WideScreenHint, Field } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CampaignTemplateList } from "@/components/CampaignTemplates";
import { BrDateInput } from "@/components/BrDateInput";
import { brDate } from "@/lib/format";
import { RefreshCw, AlertTriangle, Plus, X, Mail, Phone, FolderOpen, ExternalLink, CalendarClock, FileText } from "lucide-react";

interface Group { id: string; name: string; color: string; }
interface Account { account_id: string; name: string; status: string; group_id: string | null; platform: "meta" | "google"; hidden?: boolean; linked_meta_account_id?: string | null; is_primary?: boolean; }
interface ClientRecord { id: string; name: string; status: "active" | "paused" | "archived"; objective: string | null; result_family: string | null; brand_name?: string | null; primary_kpi: string | null; target_value: number | null; monthly_budget: number | null; monthly_conversion_goal: number | null; target_roas?: number | null; max_cpa?: number | null; max_daily_spend?: number | null; max_budget_change_percent?: number | null; automation_mode?: "observe" | "approval" | "autonomous" | null; currency: string; timezone: string; budget_start_day: number; track_sales?: boolean; facebook_page_id?: string | null; instagram_business_id?: string | null; legal_name?: string | null; cnpj?: string | null; person_type?: "fisica" | "juridica"; cpf?: string | null; address_street?: string | null; address_number?: string | null; address_complement?: string | null; address_neighborhood?: string | null; address_city?: string | null; address_state?: string | null; address_zip_code?: string | null; address_country?: string | null; state_registration?: string | null; municipal_registration?: string | null; legal_representative_name?: string | null; legal_representative_cpf?: string | null; legal_representative_role?: string | null; billing_email?: string | null; billing_phone?: string | null; contact_name?: string | null; contact_email?: string | null; contact_phone?: string | null; whatsapp_phone?: string | null; drive_folder_url?: string | null; contract_start_date?: string | null; contract_end_date?: string | null; contract_notice_days?: number; accounts: Account[]; }
type ClientAdminSortKey = "name" | "objective" | "budget" | "result" | "kpi" | "target" | "cycle";
type GroupSortKey = "name" | "accounts";
type AccountAdminSortKey = "platform" | "name" | "status" | "client" | "group" | "visibility";
const CLIENT_ADMIN_SORT_KEYS: readonly ClientAdminSortKey[] = ["name", "objective", "budget", "result", "kpi", "target", "cycle"];
const GROUP_SORT_KEYS: readonly GroupSortKey[] = ["name", "accounts"];
const ACCOUNT_ADMIN_SORT_KEYS: readonly AccountAdminSortKey[] = ["platform", "name", "status", "client", "group", "visibility"];
const MONETARY_CLIENT_KPIS = new Set(["cpa", "cpl", "cpc", "cpm", "cost_per_result", "revenue", "custom"]);
const PALETTE = ["#3987e5", "#16a34a", "#db2777", "#f59e0b", "#7c3aed", "#0891b2", "#dc2626", "#4b5563"];
// A coluna de vendas reais entra no fim: é um sim/não, não uma meta.
const CLIENT_GRID = "minmax(160px,1.2fr) 120px 130px 130px 120px 130px 80px 96px";
const compactInput: React.CSSProperties = { width: "100%", height: 30, fontSize: 12, borderRadius: 8, border: "1px solid var(--color-border)", background: "transparent", padding: "0 8px" };
const inputClass = "h-9 w-full rounded-lg border border-border bg-transparent px-3 text-sm outline-none focus:ring-1 focus:ring-ring";

export default function ClientesPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [clientsUnavailable, setClientsUnavailable] = useState<string | null>(null);
  const collectingCount = accounts.filter((a) => !a.hidden).length;
  const [loading, setLoading] = useState(true);
  const [loadRevision, setLoadRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [expandedProfiles, setExpandedProfiles] = useState<Set<string>>(new Set());
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [clientModal, setClientModal] = useState<ClientRecord | null | false>(false);
  const [clientForm, setClientForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [accountBusy, setAccountBusy] = useState<string | null>(null);
  const [driveBusy, setDriveBusy] = useState<string | null>(null);
  const [clientSort, setClientSort] = usePersistentSort<ClientAdminSortKey>("adsctrl:sort:admin-clients", { key: "name", direction: "asc" }, CLIENT_ADMIN_SORT_KEYS);
  const [groupSort, setGroupSort] = usePersistentSort<GroupSortKey>("adsctrl:sort:admin-groups", { key: "name", direction: "asc" }, GROUP_SORT_KEYS);
  const [accountSort, setAccountSort] = usePersistentSort<AccountAdminSortKey>("adsctrl:sort:admin-accounts", { key: "name", direction: "asc" }, ACCOUNT_ADMIN_SORT_KEYS);

  async function load() { setError(null); try { const [r, cr] = await Promise.all([fetch("/api/accounts"), fetch("/api/clients?status=active")]); const d = JSON.parse(await r.text()); if (!r.ok || d.error) throw new Error(d.error || "Falha."); setAccounts(d.accounts || []); setGroups(d.groups || []); const cd = JSON.parse(await cr.text()); if (cr.ok && !cd.error) { setClients(cd.clients || []); setClientsUnavailable(null); } else { setClients([]); setClientsUnavailable(cd.error || "Migração necessária."); } } catch (e: any) { setError(e?.message); } finally { setLoadRevision((r) => r + 1); setLoading(false); } }
  async function refreshClients() { try { const r = await fetch("/api/clients?status=active", { cache: "no-store" }); const d = JSON.parse(await r.text()); if (!r.ok || d.error) throw new Error(d.error || "Falha."); setClients(d.clients || []); setClientsUnavailable(null); } catch (e: any) { setError(e?.message); } }
  useEffect(() => { load(); }, []);

  const countByGroup = useMemo(() => { const m: Record<string, number> = {}; for (const a of accounts) if (a.group_id) m[a.group_id] = (m[a.group_id] || 0) + 1; return m; }, [accounts]);
  const metaAccounts = useMemo(() => accounts.filter((a) => a.platform === "meta" && !a.hidden && a.status === "ACTIVE").sort((a, b) => a.name.localeCompare(b.name)), [accounts]);

  const sortedClients = useMemo(() => {
    const objLabel: Record<string, string> = { leads: "Leads", sales: "Vendas", traffic: "Tráfego", engagement: "Engajamento", awareness: "Reconhecimento", app: "Aplicativo", other: "Outro" };
    const resLabel: Record<string, string> = { conversoes: "Conversões", vendas: "Vendas", leads: "Leads", mensagens: "Mensagens", cadastros: "Cadastros", cliques: "Cliques", lpv: "LPV", engajamento: "Engajamento" };
    const kpiL: Record<string, string> = { cpa: "CPA", cpl: "CPL", roas: "ROAS", revenue: "Receita", conversions: "Conversões", ctr: "CTR", cpc: "CPC", cpm: "CPM", custom: "Custo / resultado" };
    const val = (c: ClientRecord) => { switch (clientSort.key) { case "name": return c.name; case "objective": return c.objective ? objLabel[c.objective] || c.objective : null; case "budget": return c.monthly_budget; case "result": return c.result_family ? resLabel[c.result_family] || c.result_family : null; case "kpi": return c.primary_kpi ? kpiL[c.primary_kpi] || c.primary_kpi : null; case "target": return c.target_value; case "cycle": return c.budget_start_day; } };
    return [...clients].sort((a, b) => { const av = val(a), bv = val(b); if (clientSort.key === "budget" || clientSort.key === "target") { const am = av == null || (typeof av === "number" && Number.isNaN(av)); const bm = bv == null || (typeof bv === "number" && Number.isNaN(bv)); if (am !== bm) return am ? 1 : -1; if (clientSort.key === "budget" && a.currency !== b.currency) return compareSortValues(a.currency, b.currency, "asc"); if (clientSort.key === "target" && a.primary_kpi !== b.primary_kpi) return compareSortValues(a.primary_kpi, b.primary_kpi, "asc"); if (clientSort.key === "target" && MONETARY_CLIENT_KPIS.has(a.primary_kpi || "") && a.currency !== b.currency) return compareSortValues(a.currency, b.currency, "asc"); } return compareSortValues(av, bv, clientSort.direction) || compareSortValues(a.name, b.name, "asc"); });
  }, [clients, clientSort]);
  const visibleClients = useMemo(() => { const query = clientQuery.trim().toLocaleLowerCase(); return query ? sortedClients.filter((client) => [client.name, client.legal_name, client.cnpj, client.contact_name, client.contact_email].filter(Boolean).join(" ").toLocaleLowerCase().includes(query)) : sortedClients; }, [sortedClients, clientQuery]);
  const sortedGroups = useMemo(() => { const v = (g: Group) => groupSort.key === "name" ? g.name : countByGroup[g.id] || 0; return [...groups].sort((a, b) => compareSortValues(v(a), v(b), groupSort.direction) || compareSortValues(a.name, b.name, "asc")); }, [groups, groupSort, countByGroup]);
  const sortedAccounts = useMemo(() => { const ownerByAccount = new Map(clients.flatMap((client) => (client.accounts || []).map((account) => [account.account_id, client.name] as const))); const v = (a: Account) => { switch (accountSort.key) { case "platform": return a.platform; case "name": return a.name; case "status": return a.status; case "client": return ownerByAccount.get(a.account_id) || ""; case "group": return groups.find((g) => g.id === a.group_id)?.name || ""; case "visibility": return a.hidden ? 1 : 0; } }; return [...accounts].sort((a, b) => compareSortValues(v(a), v(b), accountSort.direction) || compareSortValues(a.name, b.name, "asc")); }, [accounts, accountSort, clients, groups]);

  async function api(url: string, opts: { method: string; body?: string }) { const r = await fetch(url, opts); const d = await r.json(); if (!r.ok || d.error) throw new Error(d.error || "Falha."); return d; }
  async function createGroup() { if (!newName.trim()) return; setBusy(true); try { await api("/api/groups", { method: "POST", body: JSON.stringify({ name: newName.trim(), color: newColor }) }); await load(); setNewName(""); } catch (e: any) { setError(e?.message); } finally { setBusy(false); } }
  async function removeGroup(id: string) { setBusy(true); try { await api(`/api/groups?id=${encodeURIComponent(id)}`, { method: "DELETE" }); await load(); } catch (e: any) { setError(e?.message); } finally { setBusy(false); } }
  async function renameGroup(id: string, name: string) { try { await api("/api/groups", { method: "PATCH", body: JSON.stringify({ id, name }) }); await load(); } catch (e: any) { setError(e?.message); } }
  async function setGroup(accountId: string, groupId: string | null) { setAccounts((prev) => prev.map((a) => a.account_id === accountId ? { ...a, group_id: groupId } : a)); try { await api("/api/accounts/group", { method: "POST", body: JSON.stringify({ account_id: accountId, group_id: groupId }) }); } catch (e: any) { setError(e?.message); await load(); } }
  async function toggleHidden(accountId: string, hidden: boolean) { setAccounts((prev) => prev.map((a) => a.account_id === accountId ? { ...a, hidden } : a)); try { await api("/api/accounts/hidden", { method: "POST", body: JSON.stringify({ account_id: accountId, hidden }) }); } catch (e: any) { setError(e?.message); await load(); } }
  async function linkGoogle(googleId: string, metaId: string) { setAccounts((prev) => prev.map((a) => a.account_id === googleId ? { ...a, linked_meta_account_id: metaId || null } : a)); try { await api("/api/accounts/link", { method: "POST", body: JSON.stringify({ google_account_id: googleId, meta_account_id: metaId || null }) }); await refreshClients(); } catch (e: any) { setError(e?.message); await load(); } }
  async function sync(platform: "meta" | "google") { try { const r = await api("/api/accounts/sync", { method: "POST", body: JSON.stringify({ platform }) }); await load(); setError(r.added ? `${r.added} conta(s) nova(s).` : `Sincronização ${platform} concluída.`); } catch (e: any) { setError(e?.message); } }
  async function createDrive(client: ClientRecord) {
    setDriveBusy(client.id); setError(null);
    try {
      const r = await fetch(`/api/clients/${client.id}/drive`, { method: "POST" });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Falha ao criar a pasta no Drive.");
      setClients((prev) => prev.map((item) => item.id === client.id ? { ...item, drive_folder_url: d.client?.drive_folder_url || d.folder?.url } : item));
    } catch (e: any) { setError(e?.message || "Falha ao criar a pasta no Drive."); }
    finally { setDriveBusy(null); }
  }
  async function updateClient(id: string, patch: Partial<ClientRecord>) { setClients((prev) => prev.map((c) => c.id === id ? { ...c, ...patch } : c)); try { const r = await api(`/api/clients/${id}`, { method: "PATCH", body: JSON.stringify(patch) }); const confirmed = Object.keys(patch).reduce((n, k) => { const f = k as keyof ClientRecord; (n as any)[f] = r.client?.[f] ?? patch[f]; return n; }, {} as Partial<ClientRecord>); setClients((prev) => prev.map((c) => c.id === id ? { ...c, ...confirmed } : c)); } catch (e: any) { await load(); setError(e?.message); } }
  async function linkClientAccount(client: ClientRecord, accountId: string) { if (!accountId) return; setAccountBusy(`${client.id}:${accountId}`); try { const d = await api(`/api/clients/${client.id}/accounts`, { method: "POST", body: JSON.stringify({ account_id: accountId }) }); setClients((prev) => prev.map((item) => item.id === client.id ? { ...item, ...d.client } : item)); } catch (e: any) { setError(e?.message); } finally { setAccountBusy(null); } }
  async function unlinkClientAccount(client: ClientRecord, accountId: string) { setAccountBusy(`${client.id}:${accountId}`); try { const d = await api(`/api/clients/${client.id}/accounts?account_id=${encodeURIComponent(accountId)}`, { method: "DELETE" }); setClients((prev) => prev.map((item) => item.id === client.id ? { ...item, ...d.client } : item)); } catch (e: any) { setError(e?.message); } finally { setAccountBusy(null); } }
  function updateClientField(client: ClientRecord, field: string, value: any) { const patch: any = {}; patch[field] = value; updateClient(client.id, patch); }
  function openClientModal(client?: ClientRecord) { const fields = ["name", "legal_name", "cnpj", "contact_name", "contact_email", "whatsapp_phone", "monthly_budget", "contract_start_date", "contract_end_date", "address_zip_code", "address_street", "address_number", "address_city", "address_state"]; const next: Record<string, string> = {}; for (const field of fields) next[field] = client ? String((client as any)[field] ?? "") : field === "contract_notice_days" ? "30" : ""; setClientForm(next); setClientModal(client || null); }
  async function saveClientModal() { setBusy(true); try { const payload = { ...clientForm, monthly_budget: clientForm.monthly_budget ? Number(clientForm.monthly_budget) : null }; const editing = Boolean(clientModal); const result = await api(editing ? `/api/clients/${(clientModal as ClientRecord).id}` : "/api/clients", { method: editing ? "PATCH" : "POST", body: JSON.stringify(payload) }); if (editing) setClients((previous) => previous.map((client) => client.id === (clientModal as ClientRecord).id ? { ...client, ...result.client } : client)); else setClients((previous) => [...previous, result.client]); setClientModal(false); } catch (e: any) { setError(e?.message); } finally { setBusy(false); } }

  if (loading) return <div className="p-4 md:p-6 md:ml-56 pb-20 md:pb-6 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-14 rounded-lg" /><Skeleton className="h-32 rounded-lg" /></div>;

  return (
    <div className="p-4 md:p-6 md:ml-56 pb-20 md:pb-6 space-y-4 animate-fade-in">
      <PageHeader
        title="Clientes"
        subtitle={`${clients.length} cliente${clients.length === 1 ? "" : "s"} ativo${clients.length === 1 ? "" : "s"} · ${accounts.length} contas no catálogo.`}
        actions={<div className="flex items-center gap-2"><input value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} placeholder="Buscar cliente, CNPJ ou contato…" className="h-9 w-64 rounded-lg border border-border bg-transparent px-3 text-xs outline-none focus:ring-1 focus:ring-ring" /><Button size="sm" onClick={() => openClientModal()}><Plus className="mr-1 h-3.5 w-3.5" /> Novo cliente</Button><Link href="/relatorios"><Button variant="ghost" size="sm"><Mail className="h-3.5 w-3.5 mr-1" /> Relatórios e painéis</Button></Link></div>}
      />

      <WideScreenHint>A tabela de metas é larga; no computador fica mais confortável.</WideScreenHint>

      {error && <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/20 bg-red-500/10 text-sm text-red-500"><AlertTriangle className="h-4 w-4 shrink-0" />{error}<button onClick={() => setError(null)} className="ml-auto bg-transparent border-none cursor-pointer text-xs font-semibold hover:underline">✕</button></div>}

      <div className="space-y-4">
        {/* Metas por cliente */}
        <Collapsible id="clients" storageKey="clientes:metas" defaultOpen
          summary={<SectionHead icon="◎" title="Metas e orçamento por cliente" hint="Objetivo, orçamento, KPI e ciclo." meta={`${clients.length} cliente${clients.length === 1 ? "" : "s"}`} />}>
          {clientsUnavailable ? <Notice tone="warn">{clientsUnavailable}</Notice> : (
            <div className="overflow-x-auto">
              <div className="min-w-[1040px] space-y-2">
                <div className="grid gap-2 px-3 py-2 rounded-lg border border-border/50 bg-muted/30 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider items-center" style={{ gridTemplateColumns: CLIENT_GRID }}>
                  <SortButton column="name" sort={clientSort} onSort={setClientSort} align="left">Cliente</SortButton>
                  <SortButton column="objective" sort={clientSort} onSort={setClientSort} align="left">Objetivo</SortButton>
                  <SortButton column="budget" sort={clientSort} onSort={setClientSort} align="left" initialDirection="desc">Orçamento</SortButton>
                  <SortButton column="result" sort={clientSort} onSort={setClientSort} align="left">Resultado</SortButton>
                  <SortButton column="kpi" sort={clientSort} onSort={setClientSort} align="left">KPI</SortButton>
                  <SortButton column="target" sort={clientSort} onSort={setClientSort} align="left" initialDirection="desc">Meta</SortButton>
                  <SortButton column="cycle" sort={clientSort} onSort={setClientSort} align="left">Ciclo</SortButton>
                  <span>Vendas reais</span>
                </div>
                {visibleClients.map((client) => {
                  const los = (client.primary_kpi || "").toLowerCase();
                  return (
                    <div key={client.id} className="grid gap-2 p-3 rounded-lg border border-border/50 bg-card items-end" style={{ gridTemplateColumns: CLIENT_GRID }}>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{client.name}</div>
                        <ClientAccounts client={client} accounts={accounts} busyAccount={accountBusy} onLink={linkClientAccount} onUnlink={unlinkClientAccount} />
                      </div>
                       <Field label="Objetivo"><select value={client.objective || ""} onChange={(e) => updateClientField(client, "objective", e.target.value || null)} style={compactInput}><option value="">—</option><option value="leads">Leads</option><option value="messages">Mensagens</option><option value="profile">Crescer perfil</option><option value="sales">Vendas</option><option value="traffic">Tráfego</option><option value="engagement">Engajamento</option><option value="awareness">Brand / Reconhecimento</option><option value="app">Aplicativo</option><option value="other">Outro</option></select></Field>
                      <Field label={`Orçamento · ${client.currency}`}><input key={`${client.id}-b-${loadRevision}`} type="number" min="0" step="10" defaultValue={client.monthly_budget ?? ""} placeholder="0" onBlur={(e) => updateClientField(client, "monthly_budget", e.target.value ? Number(e.target.value) : null)} style={compactInput} /></Field>
                      <Field label="Resultado"><select value={client.result_family || ""} onChange={(e) => updateClientField(client, "result_family", e.target.value || null)} style={compactInput}><option value="">Automático</option><option value="conversoes">Conversões</option><option value="vendas">Vendas</option><option value="leads">Leads</option><option value="mensagens">Mensagens</option><option value="cadastros">Cadastros</option><option value="cliques">Cliques</option><option value="lpv">LPV</option><option value="engajamento">Engajamento</option></select></Field>
                      <Field label="KPI"><select value={client.primary_kpi || ""} onChange={(e) => updateClient(client.id, { primary_kpi: e.target.value || null, target_value: null })} style={compactInput}><option value="">—</option><option value="cpl">CPL</option><option value="cpa">CPA</option><option value="roas">ROAS</option><option value="revenue">Receita</option><option value="conversions">Conversões</option><option value="ctr">CTR</option><option value="cpc">CPC</option><option value="cpm">CPM</option><option value="custom">Custo / resultado</option></select></Field>
                      <Field label={`Meta${MONETARY_CLIENT_KPIS.has(los) ? ` · ${client.currency}` : los === "ctr" ? " · %" : los === "roas" ? " · x" : ""}`}><input key={`${client.id}-t-${loadRevision}`} type="number" min="0" step="any" defaultValue={client.target_value ?? ""} placeholder="—" onBlur={(e) => updateClientField(client, "target_value", e.target.value ? Number(e.target.value) : null)} style={compactInput} /></Field>
                      <Field label="Dia início"><select value={client.budget_start_day} onChange={(e) => updateClientField(client, "budget_start_day", Number(e.target.value))} style={compactInput}>{Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}º</option>)}</select></Field>
                      {/* A plataforma reporta conversão, não venda: campanha de mensagem
                          fecha no WhatsApp e nunca volta. Marcar aqui põe o cliente na
                          tela de ROI para o valor ser informado à mão. */}
                      <Field label="Acompanhar">
                        <button
                          onClick={() => updateClientField(client, "track_sales", !client.track_sales)}
                          title="Coloca este cliente na tela de ROI por Cliente, para informar o valor vendido em cada mês"
                          className={cn("h-[30px] w-full rounded-lg text-[11px] font-semibold border cursor-pointer transition-colors",
                            client.track_sales ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" : "border-border bg-transparent text-muted-foreground hover:text-foreground")}
                        >
                          {client.track_sales ? "✓ na tela de ROI" : "não acompanha"}
                        </button>
                      </Field>
                    </div>
                  );
                })}
                {!visibleClients.length && <div className="text-sm text-muted-foreground px-1">Nenhum cliente encontrado.</div>}
              </div>
            </div>
          )}
        </Collapsible>

        {/* Perfil operacional: dados que conectam o cliente à comunicação,
            aos documentos e ao contrato. O Drive ainda pode ser colado
            manualmente; a criação automática entra na próxima integração. */}
        <Collapsible id="profile" storageKey="clientes:perfil-operacional"
          summary={<SectionHead icon="◎" title="Perfil operacional" hint="Contato, WhatsApp, Drive e vigência do contrato." meta={`${clients.filter((c) => c.contract_end_date).length} contrato(s) com data`} />}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-xs">
              <FolderOpen className="h-4 w-4 text-sky-600" />
              <span className="text-muted-foreground">Para criar pastas automaticamente, conecte o Google Drive da agência.</span>
              <a href="/api/integrations/google-drive/connect" className="ml-auto rounded-md border border-sky-500/30 px-2 py-1 text-[11px] font-semibold text-sky-600 hover:bg-sky-500/10">Conectar Drive</a>
            </div>
            {visibleClients.map((client) => {
              const phone = (client.whatsapp_phone || client.contact_phone || "").replace(/\D/g, "");
              const profileExpanded = expandedProfiles.has(client.id);
              const contractDays = client.contract_end_date ? Math.ceil((Date.parse(`${client.contract_end_date}T23:59:59`) - Date.now()) / 86400000) : null;
              const contractTone = contractDays != null && contractDays < 0 ? "text-red-500" : contractDays != null && contractDays <= (client.contract_notice_days ?? 30) ? "text-amber-500" : "text-muted-foreground";
              return (
                <div key={client.id} className="rounded-lg border border-border/50 bg-card p-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      aria-expanded={profileExpanded}
                      aria-label={`${profileExpanded ? "Recolher" : "Expandir"} dados de ${client.name}`}
                      onClick={() => setExpandedProfiles((previous) => {
                        const next = new Set(previous);
                        if (next.has(client.id)) next.delete(client.id); else next.add(client.id);
                        return next;
                      })}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {profileExpanded ? "−" : "+"}
                    </button>
                    <span className="font-semibold text-sm">{client.name}</span>
                    {client.contact_name && <span className="text-xs text-muted-foreground">· {client.contact_name}</span>}
                    {!profileExpanded && <span className="text-[11px] text-muted-foreground">Clique em + para abrir os dados</span>}
                    <div className="ml-auto flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => openClientModal(client)} className="rounded-md border border-input px-2 py-1 text-[11px] font-semibold hover:bg-muted">Editar cadastro</button>
                      {phone && <a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-600"><Phone className="h-3 w-3" /> WhatsApp</a>}
                      {client.drive_folder_url && <a href={client.drive_folder_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-sky-500/25 bg-sky-500/10 px-2 py-1 text-[11px] font-semibold text-sky-600"><FolderOpen className="h-3 w-3" /> Drive</a>}
                    </div>
                  </div>
                  {profileExpanded && <div className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-4">
                    <Field label="Razão social"><input key={`${client.id}-legal-${loadRevision}`} defaultValue={client.legal_name ?? ""} placeholder="Razão social" onBlur={(e) => updateClientField(client, "legal_name", e.target.value || null)} style={compactInput} /></Field>
                    <Field label="CNPJ"><input key={`${client.id}-cnpj-${loadRevision}`} defaultValue={client.cnpj ?? ""} placeholder="00.000.000/0000-00" onBlur={(e) => updateClientField(client, "cnpj", e.target.value || null)} style={compactInput} /></Field>
                    <Field label="Contato"><input key={`${client.id}-contact-${loadRevision}`} defaultValue={client.contact_name ?? ""} placeholder="Nome do contato" onBlur={(e) => updateClientField(client, "contact_name", e.target.value || null)} style={compactInput} /></Field>
                    <Field label="E-mail"><input key={`${client.id}-email-${loadRevision}`} type="email" defaultValue={client.contact_email ?? ""} placeholder="contato@empresa.com" onBlur={(e) => updateClientField(client, "contact_email", e.target.value || null)} style={compactInput} /></Field>
                    <Field label="WhatsApp"><input key={`${client.id}-wa-${loadRevision}`} defaultValue={client.whatsapp_phone ?? ""} placeholder="5511999999999" onBlur={(e) => updateClientField(client, "whatsapp_phone", e.target.value || null)} style={compactInput} /></Field>
                    <Field label="Telefone"><input key={`${client.id}-phone-${loadRevision}`} defaultValue={client.contact_phone ?? ""} placeholder="Telefone alternativo" onBlur={(e) => updateClientField(client, "contact_phone", e.target.value || null)} style={compactInput} /></Field>
                    <Field label="Pasta do Drive"><div className="flex gap-1"><input key={`${client.id}-drive-${loadRevision}`} type="url" defaultValue={client.drive_folder_url ?? ""} placeholder="Cole o link da pasta" onBlur={(e) => updateClientField(client, "drive_folder_url", e.target.value || null)} style={{ ...compactInput, minWidth: 0 }} />{client.drive_folder_url ? <a href={client.drive_folder_url} target="_blank" rel="noreferrer" className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded border border-input text-muted-foreground hover:text-foreground"><ExternalLink className="h-3 w-3" /></a> : <button onClick={() => createDrive(client)} disabled={driveBusy === client.id} title="Cria a pasta e as subpastas padrão no Google Drive conectado" className="h-[30px] shrink-0 rounded border border-sky-500/30 px-2 text-[10px] font-semibold text-sky-600 hover:bg-sky-500/10 disabled:opacity-50">{driveBusy === client.id ? "…" : "Criar"}</button>}</div></Field>
                    <Field label="Avisar antes (dias)"><input key={`${client.id}-notice-${loadRevision}`} type="number" min="0" max="365" defaultValue={client.contract_notice_days ?? 30} onBlur={(e) => updateClientField(client, "contract_notice_days", e.target.value ? Number(e.target.value) : 30)} style={compactInput} /></Field>
                    <Field label="Início do contrato"><BrDateInput value={client.contract_start_date} onChange={(value) => updateClientField(client, "contract_start_date", value || null)} style={compactInput} /></Field>
                    <Field label="Fim do contrato"><BrDateInput value={client.contract_end_date} onChange={(value) => updateClientField(client, "contract_end_date", value || null)} style={compactInput} /></Field>
                    <div className="md:col-span-2 flex items-end gap-2 text-xs"><CalendarClock className={cn("h-4 w-4 mb-1", contractTone)} /><span className={contractTone}>{contractDays == null ? "Vigência ainda não configurada" : contractDays < 0 ? `Contrato vencido há ${Math.abs(contractDays)} dia(s)` : contractDays === 0 ? "Contrato vence hoje" : `Contrato vence em ${contractDays} dia(s)`}</span></div>
                   </div>
                   <ClientGuardrails client={client} loadRevision={loadRevision} onUpdate={updateClient} />
                   <div className="border-t border-border/40 pt-3 space-y-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Dados para contrato e faturamento</div>
                    <div className="grid gap-3 md:grid-cols-5">
                      <Field label="Tipo"><select value={client.person_type ?? "juridica"} onChange={(e) => updateClientField(client, "person_type", e.target.value)} style={compactInput}><option value="juridica">Pessoa jurídica</option><option value="fisica">Pessoa física</option></select></Field>
                      <Field label={client.person_type === "fisica" ? "CPF" : "CPF do responsável"}><input key={`${client.id}-cpf-${loadRevision}`} defaultValue={client.cpf ?? ""} placeholder="000.000.000-00" onBlur={(e) => updateClientField(client, "cpf", e.target.value || null)} style={compactInput} /></Field>
                      <Field label="Inscrição estadual"><input key={`${client.id}-ie-${loadRevision}`} defaultValue={client.state_registration ?? ""} placeholder="Opcional" onBlur={(e) => updateClientField(client, "state_registration", e.target.value || null)} style={compactInput} /></Field>
                      <Field label="Inscrição municipal"><input key={`${client.id}-im-${loadRevision}`} defaultValue={client.municipal_registration ?? ""} placeholder="Opcional" onBlur={(e) => updateClientField(client, "municipal_registration", e.target.value || null)} style={compactInput} /></Field>
                      <Field label="País"><input key={`${client.id}-country-${loadRevision}`} defaultValue={client.address_country ?? "Brasil"} onBlur={(e) => updateClientField(client, "address_country", e.target.value || null)} style={compactInput} /></Field>
                      <Field label="Representante legal"><input key={`${client.id}-rep-${loadRevision}`} defaultValue={client.legal_representative_name ?? ""} placeholder="Nome completo" onBlur={(e) => updateClientField(client, "legal_representative_name", e.target.value || null)} style={compactInput} /></Field>
                      <Field label="CPF do representante"><input key={`${client.id}-repcpf-${loadRevision}`} defaultValue={client.legal_representative_cpf ?? ""} placeholder="000.000.000-00" onBlur={(e) => updateClientField(client, "legal_representative_cpf", e.target.value || null)} style={compactInput} /></Field>
                      <Field label="Cargo"><input key={`${client.id}-reprule-${loadRevision}`} defaultValue={client.legal_representative_role ?? ""} placeholder="Sócio, diretor..." onBlur={(e) => updateClientField(client, "legal_representative_role", e.target.value || null)} style={compactInput} /></Field>
                      <Field label="E-mail financeiro"><input key={`${client.id}-billingemail-${loadRevision}`} type="email" defaultValue={client.billing_email ?? ""} placeholder="financeiro@empresa.com" onBlur={(e) => updateClientField(client, "billing_email", e.target.value || null)} style={compactInput} /></Field>
                      <Field label="Telefone financeiro"><input key={`${client.id}-billingphone-${loadRevision}`} defaultValue={client.billing_phone ?? ""} placeholder="Telefone" onBlur={(e) => updateClientField(client, "billing_phone", e.target.value || null)} style={compactInput} /></Field>
                    </div>
                    <div className="grid gap-3 md:grid-cols-6">
                      <Field label="CEP"><input key={`${client.id}-cep-${loadRevision}`} defaultValue={client.address_zip_code ?? ""} placeholder="00000-000" onBlur={(e) => updateClientField(client, "address_zip_code", e.target.value || null)} style={compactInput} /></Field>
                      <Field label="Logradouro"><input key={`${client.id}-street-${loadRevision}`} defaultValue={client.address_street ?? ""} placeholder="Rua, avenida..." onBlur={(e) => updateClientField(client, "address_street", e.target.value || null)} style={compactInput} /></Field>
                      <Field label="Número"><input key={`${client.id}-number-${loadRevision}`} defaultValue={client.address_number ?? ""} placeholder="123" onBlur={(e) => updateClientField(client, "address_number", e.target.value || null)} style={compactInput} /></Field>
                      <Field label="Complemento"><input key={`${client.id}-complement-${loadRevision}`} defaultValue={client.address_complement ?? ""} placeholder="Sala, conjunto..." onBlur={(e) => updateClientField(client, "address_complement", e.target.value || null)} style={compactInput} /></Field>
                      <Field label="Bairro"><input key={`${client.id}-neighborhood-${loadRevision}`} defaultValue={client.address_neighborhood ?? ""} onBlur={(e) => updateClientField(client, "address_neighborhood", e.target.value || null)} style={compactInput} /></Field>
                      <Field label="Cidade / UF"><div className="flex gap-1"><input key={`${client.id}-city-${loadRevision}`} defaultValue={client.address_city ?? ""} placeholder="Cidade" onBlur={(e) => updateClientField(client, "address_city", e.target.value || null)} style={{ ...compactInput, minWidth: 0 }} /><input key={`${client.id}-state-${loadRevision}`} defaultValue={client.address_state ?? ""} placeholder="UF" maxLength={2} onBlur={(e) => updateClientField(client, "address_state", e.target.value.toUpperCase() || null)} style={{ ...compactInput, width: 52 }} /></div></Field>
                    </div>
                  </div>
                  <ClientOnboarding clientId={client.id} />
                  <ClientApprovals clientId={client.id} />
                  <ClientBilling clientId={client.id} defaultValue={client.monthly_budget} />
                  <ClientDocuments clientId={client.id} />
                  </div>}
                </div>
              );
            })}
            {!visibleClients.length && <div className="text-sm text-muted-foreground">Nenhum cliente encontrado.</div>}
          </div>
        </Collapsible>

        {/* Orgânico: alimenta a seção de Facebook/Instagram no relatório.
            O dropdown só lista o que o token de sistema já enxerga — fica
            vazio até a Página ser atribuída na Business Manager. Escolher a
            Página já traz o Instagram vinculado a ela de brinde. */}
        <Collapsible id="social" storageKey="clientes:organico"
          summary={<SectionHead icon="◑" title="Orgânico (Facebook/Instagram)" hint="Página e conta comercial, para o relatório trazer alcance e seguidores." meta={`${clients.filter((c) => c.facebook_page_id || c.instagram_business_id).length} configurado(s)`} />}>
          <SocialPagesPanel
            clients={visibleClients}
            loadRevision={loadRevision}
            onUpdate={updateClient}
            onError={setError}
          />
        </Collapsible>

        {/* Grupos */}
        <Collapsible id="groups" storageKey="clientes:grupos" summary={<SectionHead icon="◈" title="Grupos" hint="Agrupam contas e clientes." meta={`${groups.length} grupo${groups.length === 1 ? "" : "s"}`} />}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input value={newName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)} placeholder="Nome do grupo" className="flex-[1_1_200px]" />
              <div className="flex gap-1">{PALETTE.map((c) => <button key={c} onClick={() => setNewColor(c)} className={cn("w-6 h-6 rounded-full border-2 transition-all cursor-pointer", newColor === c ? "border-foreground scale-110" : "border-transparent")} style={{ backgroundColor: c }} />)}</div>
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

        {/* Contas */}
        <Collapsible id="accounts" storageKey="clientes:contas" summary={<SectionHead icon="◫" title="Contas" hint="Ativar/ocultar, vincular Google a Meta e definir grupo." meta={`${collectingCount} ativa${collectingCount === 1 ? "" : "s"} de ${accounts.length}`} />}>
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
                  <span className="text-muted-foreground truncate">{clients.flatMap((client) => client.accounts || []).find((account) => account.account_id === a.account_id) ? clients.find((client) => (client.accounts || []).some((account) => account.account_id === a.account_id))?.name || "—" : "—"}</span>
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
      {clientModal !== false && <Modal title={clientModal ? `Editar cliente: ${clientModal.name}` : "Novo cliente"} onClose={() => setClientModal(false)} wide>
        <div className="space-y-4"><p className="text-xs text-muted-foreground">Cadastre os dados principais do cliente. O restante do perfil operacional continua disponível ao expandir o cartão.</p><div className="grid gap-3 md:grid-cols-3"><Field label="Nome do cliente"><input value={clientForm.name || ""} onChange={(e) => setClientForm((old) => ({ ...old, name: e.target.value }))} placeholder="Nome fantasia" className={inputClass} /></Field><Field label="Razão social"><input value={clientForm.legal_name || ""} onChange={(e) => setClientForm((old) => ({ ...old, legal_name: e.target.value }))} placeholder="Razão social" className={inputClass} /></Field><Field label="CNPJ"><input value={clientForm.cnpj || ""} onChange={(e) => setClientForm((old) => ({ ...old, cnpj: e.target.value }))} placeholder="00.000.000/0000-00" className={inputClass} /></Field><Field label="Contato"><input value={clientForm.contact_name || ""} onChange={(e) => setClientForm((old) => ({ ...old, contact_name: e.target.value }))} placeholder="Nome do responsável" className={inputClass} /></Field><Field label="E-mail"><input type="email" value={clientForm.contact_email || ""} onChange={(e) => setClientForm((old) => ({ ...old, contact_email: e.target.value }))} placeholder="contato@empresa.com" className={inputClass} /></Field><Field label="WhatsApp"><input value={clientForm.whatsapp_phone || ""} onChange={(e) => setClientForm((old) => ({ ...old, whatsapp_phone: e.target.value }))} placeholder="5511999999999" className={inputClass} /></Field><Field label="Mensalidade / orçamento"><input type="number" min="0" step="0.01" value={clientForm.monthly_budget || ""} onChange={(e) => setClientForm((old) => ({ ...old, monthly_budget: e.target.value }))} placeholder="R$ 0,00" className={inputClass} /></Field><Field label="Início do contrato"><BrDateInput value={clientForm.contract_start_date} onChange={(value) => setClientForm((old) => ({ ...old, contract_start_date: value }))} className={inputClass} /></Field><Field label="Fim do contrato"><BrDateInput value={clientForm.contract_end_date} onChange={(value) => setClientForm((old) => ({ ...old, contract_end_date: value }))} className={inputClass} /></Field><Field label="CEP"><input value={clientForm.address_zip_code || ""} onChange={(e) => setClientForm((old) => ({ ...old, address_zip_code: e.target.value }))} placeholder="00000-000" className={inputClass} /></Field><Field label="Endereço"><input value={clientForm.address_street || ""} onChange={(e) => setClientForm((old) => ({ ...old, address_street: e.target.value }))} placeholder="Rua, avenida..." className={inputClass} /></Field><Field label="Número"><input value={clientForm.address_number || ""} onChange={(e) => setClientForm((old) => ({ ...old, address_number: e.target.value }))} placeholder="123" className={inputClass} /></Field><Field label="Cidade"><input value={clientForm.address_city || ""} onChange={(e) => setClientForm((old) => ({ ...old, address_city: e.target.value }))} placeholder="Cidade" className={inputClass} /></Field><Field label="UF"><input maxLength={2} value={clientForm.address_state || ""} onChange={(e) => setClientForm((old) => ({ ...old, address_state: e.target.value.toUpperCase() }))} placeholder="SP" className={inputClass} /></Field></div><div className="flex justify-end gap-2"><Button variant="secondary" size="sm" onClick={() => setClientModal(false)}>Cancelar</Button><Button size="sm" onClick={saveClientModal} disabled={busy || !clientForm.name?.trim()}>{busy ? "Salvando…" : clientModal ? "Salvar alterações" : "Cadastrar cliente"}</Button></div></div>
      </Modal>}
    </div>
  );
}

function ClientGuardrails({ client, loadRevision, onUpdate }: { client: ClientRecord; loadRevision: number; onUpdate: (id: string, patch: Partial<ClientRecord>) => void }) {
  return <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">Metas e travas da operação</div>
      <div className="text-[11px] text-muted-foreground">Servem para o monitoramento sugerir ações e impedir mudanças fora do combinado.</div>
    </div>
    <div className="grid gap-3 md:grid-cols-5">
      <Field label="ROAS alvo"><input key={`${client.id}-guard-roas-${loadRevision}`} type="number" min="0" step="0.1" defaultValue={client.target_roas ?? ""} placeholder="ex.: 3" onBlur={(e) => onUpdate(client.id, { target_roas: e.target.value ? Number(e.target.value) : null })} style={compactInput} /></Field>
      <Field label={`CPA máximo · ${client.currency}`}><input key={`${client.id}-guard-cpa-${loadRevision}`} type="number" min="0" step="0.01" defaultValue={client.max_cpa ?? ""} placeholder="sem limite" onBlur={(e) => onUpdate(client.id, { max_cpa: e.target.value ? Number(e.target.value) : null })} style={compactInput} /></Field>
      <Field label={`Gasto diário máximo · ${client.currency}`}><input key={`${client.id}-guard-spend-${loadRevision}`} type="number" min="0" step="0.01" defaultValue={client.max_daily_spend ?? ""} placeholder="sem limite" onBlur={(e) => onUpdate(client.id, { max_daily_spend: e.target.value ? Number(e.target.value) : null })} style={compactInput} /></Field>
      <Field label="Variação de orçamento"><div className="flex items-center gap-1"><input key={`${client.id}-guard-change-${loadRevision}`} type="number" min="0" max="100" step="1" defaultValue={client.max_budget_change_percent ?? 20} onBlur={(e) => onUpdate(client.id, { max_budget_change_percent: Number(e.target.value || 20) })} style={compactInput} /><span className="text-xs text-muted-foreground">%</span></div></Field>
      <Field label="Modo de automação"><select value={client.automation_mode ?? "approval"} onChange={(e) => onUpdate(client.id, { automation_mode: e.target.value as ClientRecord["automation_mode"] })} style={compactInput}><option value="observe">Observar</option><option value="approval">Exigir aprovação</option><option value="autonomous">Autônomo</option></select></Field>
    </div>
  </div>;
}

interface AvailablePage { page_id: string; page_name: string; instagram_business_id: string | null; instagram_username: string | null; token_index: number; }

// Dropdown de Página + Instagram vinculado, em vez de colar ID na mão.
// Escolher a Página já grava o Instagram junto (quando ela tem um vinculado);
// o campo de Instagram continua editável por baixo pra quando a conta comercial
// não é a vinculada àquela Página no Graph, ou pra apagar sem trocar a Página.
function ClientAccounts({ client, accounts, busyAccount, onLink, onUnlink }: { client: ClientRecord; accounts: Account[]; busyAccount: string | null; onLink: (client: ClientRecord, accountId: string) => void; onUnlink: (client: ClientRecord, accountId: string) => void }) {
  const linked = client.accounts || [];
  const linkedIds = new Set(linked.map((account) => account.account_id));
  const available = accounts.filter((account) => !linkedIds.has(account.account_id) && !account.hidden);
  return <div className="mt-1.5 space-y-1.5"><div className="text-[10px] font-semibold text-muted-foreground">Contas vinculadas ({linked.length})</div><div className="flex gap-1 flex-wrap">{linked.map((account) => <span key={account.account_id} title={account.name} className={cn("inline-flex max-w-[150px] items-center gap-1 truncate rounded px-1.5 py-0.5 text-[9px] font-bold", account.platform === "google" ? "bg-sky-500/10 text-sky-600" : "bg-blue-500/10 text-blue-600")}><span className="truncate">{account.name}</span><button type="button" onClick={() => onUnlink(client, account.account_id)} disabled={busyAccount === `${client.id}:${account.account_id}`} className="text-current opacity-60 hover:opacity-100" title="Desvincular conta">×</button></span>)}{!linked.length && <span className="text-[10px] text-muted-foreground">Nenhuma conta vinculada</span>}</div>{available.length > 0 && <select value="" onChange={(event) => onLink(client, event.target.value)} disabled={Boolean(busyAccount)} className="h-7 max-w-full rounded border border-input bg-transparent px-1 text-[10px]"><option value="">+ Vincular conta de anúncio</option>{available.map((account) => <option key={account.account_id} value={account.account_id}>{account.platform} · {account.name}</option>)}</select>}</div>;
}

function SocialPagesPanel({
  clients, loadRevision, onUpdate, onError,
}: {
  clients: ClientRecord[];
  loadRevision: number;
  onUpdate: (id: string, patch: Partial<ClientRecord>) => void;
  onError: (message: string) => void;
}) {
  const [pages, setPages] = useState<AvailablePage[] | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [loadingPages, setLoadingPages] = useState(true);

  async function loadPages() {
    setLoadingPages(true);
    try {
      const r = await fetch("/api/meta/pages", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao listar Páginas.");
      setPages(d.pages || []);
      setIssues(d.issues || []);
    } catch (e: any) {
      setPages([]);
      onError(e?.message || "Falha ao listar Páginas do Facebook.");
    } finally {
      setLoadingPages(false);
    }
  }
  useEffect(() => { loadPages(); }, []);

  function selectPage(client: ClientRecord, pageId: string) {
    if (!pageId) { onUpdate(client.id, { facebook_page_id: null }); return; }
    const page = (pages || []).find((p) => p.page_id === pageId);
    onUpdate(client.id, {
      facebook_page_id: pageId,
      // Só sobrescreve o Instagram se a Página escolhida tiver um vinculado
      // — assim trocar de Página não apaga um Instagram digitado à mão.
      ...(page?.instagram_business_id ? { instagram_business_id: page.instagram_business_id } : {}),
    });
  }

  const hasPages = Boolean(pages && pages.length > 0);

  return (
    <div className="space-y-3">
      {!loadingPages && !hasPages && (
        <Notice tone="warn">
          Nenhuma Página encontrada no token de sistema. Atribua as Páginas dos clientes ao usuário de
          sistema na Business Manager (Configurações do negócio › Páginas › Atribuir pessoas/sistemas) —
          assim que aparecerem lá, elas aparecem aqui, sem precisar copiar ID nenhum.
          {issues.length > 0 && <div className="mt-1 text-[11px] opacity-80">{issues.join(" · ")}</div>}
        </Notice>
      )}
      <div className="space-y-2">
        {clients.map((client) => {
          const linkedPage = (pages || []).find((p) => p.page_id === client.facebook_page_id);
          return (
            <div key={client.id} className="grid gap-2 p-3 rounded-lg border border-border/50 bg-card items-end" style={{ gridTemplateColumns: "minmax(160px,1fr) 1fr 1fr" }}>
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{client.name}</div>
                {linkedPage?.instagram_username && (
                  <div className="text-[11px] text-muted-foreground truncate">@{linkedPage.instagram_username}</div>
                )}
              </div>
              <Field label="Página (Facebook)">
                {hasPages ? (
                  <select value={client.facebook_page_id ?? ""} onChange={(e) => selectPage(client, e.target.value)} style={compactInput}>
                    <option value="">— não vinculada —</option>
                    {pages!.map((p) => (
                      <option key={p.page_id} value={p.page_id}>
                        {p.page_name}{p.instagram_username ? ` (@${p.instagram_username})` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    key={`${client.id}-fb-${loadRevision}`}
                    defaultValue={client.facebook_page_id ?? ""}
                    placeholder={loadingPages ? "carregando…" : "ID manual (ex.: 102938475600)"}
                    disabled={loadingPages}
                    onBlur={(e) => {
                      const value = e.target.value.trim();
                      if (value === (client.facebook_page_id ?? "")) return;
                      onUpdate(client.id, { facebook_page_id: value || null });
                    }}
                    style={compactInput}
                  />
                )}
              </Field>
              <Field label="Instagram (ID, se precisar ajustar)">
                <input
                  key={`${client.id}-ig-${loadRevision}`}
                  defaultValue={client.instagram_business_id ?? ""}
                  placeholder="preenchido pela Página"
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    if (value === (client.instagram_business_id ?? "")) return;
                    onUpdate(client.id, { instagram_business_id: value || null });
                  }}
                  style={compactInput}
                />
              </Field>
            </div>
          );
        })}
        {!clients.length && <div className="text-sm text-muted-foreground px-1">Nenhum cliente ativo.</div>}
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

function ClientDocuments({ clientId }: { clientId: string }) {
  const [data, setData] = useState<{ contracts: any[]; documents: any[] }>({ contracts: [], documents: [] });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"contract" | "document">("contract");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [endDate, setEndDate] = useState("");
  const [category, setCategory] = useState("other");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const r = await fetch(`/api/clients/${clientId}/documents`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao carregar documentos.");
      setData({ contracts: d.contracts || [], documents: d.documents || [] });
    } catch (e: any) { setError(e?.message || "Falha ao carregar documentos."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [clientId]);

  async function add() {
    if (!name.trim()) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/clients/${clientId}/documents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, name, drive_file_url: url || null, end_date: kind === "contract" ? endDate || null : null, expires_at: kind === "document" ? endDate || null : null, category }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao salvar.");
      setName(""); setUrl(""); setEndDate(""); setOpen(false); await load();
    } catch (e: any) { setError(e?.message || "Falha ao salvar."); }
    finally { setBusy(false); }
  }

  async function upload() {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("category", kind === "contract" ? "contract" : category);
      const r = await fetch(`/api/clients/${clientId}/drive/upload`, { method: "POST", body: form });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao enviar arquivo.");
      setFile(null); setOpen(false); await load();
    } catch (e: any) { setError(e?.message || "Falha ao enviar arquivo."); }
    finally { setBusy(false); }
  }

  async function renew() {
    if (!latestContract) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/clients/${clientId}/documents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "renewal", contract_id: latestContract.id }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao criar renovação.");
      await load();
    } catch (e: any) { setError(e?.message || "Falha ao criar renovação."); }
    finally { setBusy(false); }
  }

  const latestContract = data.contracts[0];
  return (
    <div className="border-t border-border/40 pt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><FileText className="inline h-3.5 w-3.5 mr-1" />Contratos e documentos</span>
        {latestContract && <span className="text-[11px] text-muted-foreground">· contrato: {latestContract.title}{latestContract.end_date ? ` até ${brDate(latestContract.end_date)}` : ""}</span>}
        {latestContract && <button onClick={renew} disabled={busy} className="rounded-md border border-amber-500/30 px-2 py-1 text-[11px] font-semibold text-amber-600 hover:bg-amber-500/10 disabled:opacity-50">Renovar</button>}
        <Link href={`/contratos/${clientId}`} className="rounded-md border border-primary/30 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10">Gerar minuta</Link>
        <button onClick={() => setOpen((v) => !v)} className="ml-auto inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-[11px] font-semibold hover:bg-muted"><Plus className="h-3 w-3" /> Adicionar</button>
      </div>
      {data.documents.length > 0 && <div className="flex flex-wrap gap-1.5">{data.documents.slice(0, 5).map((doc) => doc.drive_file_url ? <a key={doc.id} href={doc.drive_file_url} target="_blank" rel="noreferrer" className="rounded-md bg-muted px-2 py-1 text-[11px] hover:text-primary">{doc.name}</a> : <span key={doc.id} className="rounded-md bg-muted px-2 py-1 text-[11px]">{doc.name}</span>)}</div>}
      {loading && <span className="text-[11px] text-muted-foreground">Carregando acervo…</span>}
      {error && <div className="text-[11px] text-red-500">{error}</div>}
      {open && <div className="grid gap-2 rounded-md border border-border/50 bg-muted/20 p-2 md:grid-cols-6">
        <select value={kind} onChange={(e) => setKind(e.target.value as "contract" | "document")} style={compactInput}><option value="contract">Contrato</option><option value="document">Documento</option></select>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "contract" ? "Contrato de prestação de serviços" : "Nome do documento"} style={compactInput} />
        <input value={url} onChange={(e) => setUrl(e.target.value)} type="url" placeholder="Link do arquivo no Drive" style={compactInput} />
        <input value={endDate} onChange={(e) => setEndDate(e.target.value)} type="date" title={kind === "contract" ? "Vencimento do contrato" : "Validade do documento"} style={compactInput} />
        {kind === "document" && <select value={category} onChange={(e) => setCategory(e.target.value)} style={compactInput}><option value="other">Outro</option><option value="invoice">Nota fiscal</option><option value="briefing">Briefing</option><option value="addendum">Aditivo</option><option value="proof">Comprovante</option></select>}
        <button onClick={add} disabled={busy || !name.trim()} className="rounded-md bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Salvando…" : "Salvar"}</button>
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-[11px] file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-[11px]" />
        <button onClick={upload} disabled={busy || !file} className="rounded-md border border-sky-500/30 px-3 py-1 text-[11px] font-semibold text-sky-600 disabled:opacity-50">{busy ? "Enviando…" : "Enviar ao Drive"}</button>
      </div>}
    </div>
  );
}

function ClientBilling({ clientId, defaultValue }: { clientId: string; defaultValue: number | null }) {
  const [data, setData] = useState<{ configured: boolean; subscriptions: any[]; charges: any[]; invoices: any[] }>({ configured: false, subscriptions: [], charges: [], invoices: [] });
  const [value, setValue] = useState(defaultValue ? String(defaultValue) : "");
  const [dueDate, setDueDate] = useState("");
  const [billingType, setBillingType] = useState("UNDEFINED");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [invoiceDescription, setInvoiceDescription] = useState("Gestão de tráfego pago");
  const [invoiceValue, setInvoiceValue] = useState(defaultValue ? String(defaultValue) : "");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [invoiceBusy, setInvoiceBusy] = useState(false);

  async function load() {
    try { const [billingResponse, invoicesResponse] = await Promise.all([fetch(`/api/clients/${clientId}/billing`, { cache: "no-store" }), fetch(`/api/clients/${clientId}/billing/invoices`, { cache: "no-store" })]); const d = await billingResponse.json(); const invoiceData = await invoicesResponse.json(); if (!billingResponse.ok) throw new Error(d.error || "Falha ao consultar cobrança."); setData({ ...d, invoices: invoiceData.invoices || [] }); }
    catch (e: any) { setMessage(e?.message || "Falha ao consultar cobrança."); }
  }
  useEffect(() => { load(); }, [clientId]);

  async function createSubscription() {
    setBusy(true); setMessage(null);
    try { const r = await fetch(`/api/clients/${clientId}/billing`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: Number(value), next_due_date: dueDate || undefined, billing_type: billingType }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Falha ao criar cobrança."); setMessage("Assinatura criada no Asaas."); await load(); }
    catch (e: any) { setMessage(e?.message || "Falha ao criar assinatura."); }
    finally { setBusy(false); }
  }

  async function scheduleInvoice() {
    setInvoiceBusy(true); setMessage(null);
    try { const r = await fetch(`/api/clients/${clientId}/billing/invoices`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ service_description: invoiceDescription, value: Number(invoiceValue || value), effective_date: invoiceDate || undefined, payment_id: latest?.asaas_payment_id || undefined }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Falha ao agendar NFS-e."); setMessage("NFS-e agendada no Asaas."); await load(); }
    catch (e: any) { setMessage(e?.message || "Falha ao agendar NFS-e."); }
    finally { setInvoiceBusy(false); }
  }

  const active = data.subscriptions.find((item) => item.status === "ACTIVE") || data.subscriptions[0];
  const latest = data.charges[0];
  return <div className="border-t border-border/40 pt-3 space-y-2">
    <div className="flex flex-wrap items-center gap-2"><span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Financeiro / Asaas</span>{active && <span className="text-[11px] text-emerald-600">assinatura {active.status}</span>}{latest && <span className={cn("text-[11px]", latest.status === "OVERDUE" ? "text-red-500" : "text-muted-foreground")}>última cobrança: {latest.status}</span>}</div>
    {!active && <div className="grid gap-2 md:grid-cols-4"><input value={value} onChange={(e) => setValue(e.target.value)} type="number" min="1" step="0.01" placeholder="Mensalidade" style={compactInput} /><input value={dueDate} onChange={(e) => setDueDate(e.target.value)} type="date" title="Primeiro vencimento" style={compactInput} /><select value={billingType} onChange={(e) => setBillingType(e.target.value)} style={compactInput}><option value="UNDEFINED">Cliente escolhe</option><option value="PIX">Pix</option><option value="BOLETO">Boleto</option><option value="CREDIT_CARD">Cartão</option></select><button onClick={createSubscription} disabled={busy || !value} className="rounded-md border border-emerald-500/30 px-2 py-1 text-[11px] font-semibold text-emerald-600 disabled:opacity-50">{busy ? "Criando…" : "Criar cobrança recorrente"}</button></div>}
    {message && <div className="text-[11px] text-muted-foreground">{message}</div>}
    {data.configured && active && <div className="mt-2 grid gap-2 border-t border-border/40 pt-2 md:grid-cols-4"><input value={invoiceDescription} onChange={(e) => setInvoiceDescription(e.target.value)} placeholder="Descrição do serviço" style={compactInput} /><input value={invoiceValue} onChange={(e) => setInvoiceValue(e.target.value)} type="number" min="1" step="0.01" placeholder="Valor da NFS-e" style={compactInput} /><input value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} type="date" title="Data de emissão" style={compactInput} /><button onClick={scheduleInvoice} disabled={invoiceBusy || !invoiceValue} className="rounded-md border border-violet-500/30 px-2 py-1 text-[11px] font-semibold text-violet-600 disabled:opacity-50">{invoiceBusy ? "Agendando…" : "Agendar NFS-e"}</button></div>}
    {data.invoices[0] && <div className="text-[11px] text-muted-foreground">NFS-e: {data.invoices[0].status}{data.invoices[0].pdf_url ? <a className="ml-2 text-primary hover:underline" href={data.invoices[0].pdf_url} target="_blank" rel="noreferrer">Abrir PDF</a> : null}</div>}
    {!data.configured && <div className="text-[11px] text-amber-600">Configure ASAAS_API_KEY no ambiente para ativar este módulo.</div>}
  </div>;
}

function ClientOnboarding({ clientId }: { clientId: string }) {
  const [data, setData] = useState<{ items: any[]; progress: { done: number; total: number; percent: number } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function load() { try { const r = await fetch(`/api/clients/${clientId}/onboarding`, { cache: "no-store" }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Falha ao carregar onboarding."); setData(d); } catch (e: any) { setError(e?.message || "Falha ao carregar onboarding."); } }
  useEffect(() => { load(); }, [clientId]);
  async function setStatus(item: any, status: string) { try { const r = await fetch(`/api/clients/${clientId}/onboarding`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_id: item.id, status }) }); if (!r.ok) { const d = await r.json(); throw new Error(d.error || "Falha ao atualizar."); } await load(); } catch (e: any) { setError(e?.message || "Falha ao atualizar onboarding."); } }
  return <div className="border-t border-border/40 pt-3 space-y-2"><div className="flex flex-wrap items-center gap-2"><span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Onboarding</span>{data && <span className="text-[11px] text-muted-foreground">{data.progress.done}/{data.progress.total} concluídos · {data.progress.percent}%</span>}</div>{data && <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${data.progress.percent}%` }} /></div>}{data && <div className="grid gap-1 md:grid-cols-2">{data.items.map((item) => <div key={item.id} className="flex items-center gap-2 rounded border border-border/30 px-2 py-1.5"><select value={item.status} onChange={(e) => setStatus(item, e.target.value)} className={cn("w-[105px] rounded border border-input bg-transparent px-1 py-1 text-[10px] font-semibold", item.status === "done" ? "text-emerald-600" : item.status === "blocked" ? "text-red-500" : "text-muted-foreground")}><option value="pending">Pendente</option><option value="in_progress">Em andamento</option><option value="done">Concluído</option><option value="blocked">Bloqueado</option></select><span className={cn("text-[11px]", item.status === "done" && "line-through text-muted-foreground")}>{item.title}</span></div>)}</div>}{error && <div className="text-[11px] text-red-500">{error}</div>}</div>;
}

function ClientApprovals({ clientId }: { clientId: string }) {
  const [items, setItems] = useState<any[]>([]); const [open, setOpen] = useState(false); const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const [fileUrl, setFileUrl] = useState(""); const [message, setMessage] = useState<string | null>(null);
  async function load() { try { const r = await fetch(`/api/clients/${clientId}/approvals`, { cache: "no-store" }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Falha ao carregar aprovações."); setItems(d.approvals || []); } catch (e: any) { setMessage(e?.message || "Falha ao carregar aprovações."); } }
  useEffect(() => { load(); }, [clientId]);
  async function add() { if (!title.trim()) return; const r = await fetch(`/api/clients/${clientId}/approvals`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, description, file_url: fileUrl || null }) }); const d = await r.json(); if (!r.ok) { setMessage(d.error || "Falha ao criar solicitação."); return; } setTitle(""); setDescription(""); setFileUrl(""); setOpen(false); await load(); }
  async function status(item: any, value: string) { const r = await fetch(`/api/clients/${clientId}/approvals`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, status: value }) }); if (!r.ok) { const d = await r.json(); setMessage(d.error || "Falha ao atualizar."); return; } await load(); }
  const pending = items.filter((item) => item.status === "pending").length;
  return <div className="border-t border-border/40 pt-3 space-y-2"><div className="flex items-center gap-2"><span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Aprovações</span>{pending > 0 && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600">{pending} pendente(s)</span>}<button onClick={() => setOpen((v) => !v)} className="ml-auto rounded-md border border-input px-2 py-1 text-[11px] font-semibold hover:bg-muted">+ Solicitar</button></div>{items.slice(0, 5).map((item) => <div key={item.id} className="flex items-center gap-2 rounded border border-border/30 px-2 py-1.5"><span className="flex-1 text-[11px]">{item.title}</span>{item.file_url && <a href={item.file_url} target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline">arquivo</a>}<select value={item.status} onChange={(e) => status(item, e.target.value)} className={cn("rounded border border-input bg-transparent px-1 py-1 text-[10px]", item.status === "approved" ? "text-emerald-600" : item.status === "changes_requested" ? "text-amber-600" : "text-muted-foreground")}><option value="pending">Pendente</option><option value="approved">Aprovado</option><option value="changes_requested">Pedir alteração</option><option value="rejected">Rejeitado</option></select></div>)}{open && <div className="grid gap-2 rounded-md border border-border/50 bg-muted/20 p-2 md:grid-cols-4"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Aprovar criativo da campanha" style={compactInput} /><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Instruções" style={compactInput} /><input value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="Link do arquivo no Drive" style={compactInput} /><button onClick={add} disabled={!title.trim()} className="rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-50">Criar solicitação</button></div>}{message && <div className="text-[11px] text-red-500">{message}</div>}</div>;
}
