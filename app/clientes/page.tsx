"use client";

// Clientes — mestre-detalhe: lista de clientes na lateral, abas de edição no
// centro (Metas, Perfil, Contrato, ROI & Financeiro, Documentos, Orgânico).
// Grupos, Contas e a comparação de ROI entre todos os clientes são "Catálogo"
// — não são propriedade de um cliente só, então ganham uma visão própria.
//
// Saiu de /admin no redesenho: Config passou a guardar só o que é do sistema
// (marca, e-mail, integrações). Aqui fica o cadastro que muda por cliente.
// A entrega do relatório vive em /relatorios, ao lado do link do painel.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { compareSortValues, SortButton, usePersistentSort } from "@/components/SortableHeader";
import { Button } from "@/components/ui/button";
import { Input, Modal, Notice, PageHeader, Segmented, WideScreenHint, Field } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CampaignTemplateList } from "@/components/CampaignTemplates";
import { RoiPorCliente } from "@/components/RoiPorCliente";
import ClientAlertsTab from "@/components/ClientAlertsTab";
import { BrDateInput } from "@/components/BrDateInput";
import { brDate } from "@/lib/format";
import { RefreshCw, AlertTriangle, Plus, X, Mail, Phone, FolderOpen, ExternalLink, CalendarClock, FileText, Wallet, KeyRound, ClipboardList, Palette, Target, Rocket, BarChart3, Link2, Check, Clock } from "lucide-react";

interface Group { id: string; name: string; color: string; }
interface Account { account_id: string; name: string; status: string; group_id: string | null; platform: "meta" | "google"; hidden?: boolean; linked_meta_account_id?: string | null; is_primary?: boolean; }
interface ClientRecord { id: string; name: string; status: "active" | "paused" | "archived"; objective: string | null; result_family: string | null; brand_name?: string | null; primary_kpi: string | null; target_value: number | null; monthly_budget: number | null; monthly_conversion_goal: number | null; target_roas?: number | null; max_cpa?: number | null; max_daily_spend?: number | null; max_budget_change_percent?: number | null; automation_mode?: "observe" | "approval" | "autonomous" | null; currency: string; timezone: string; budget_start_day: number; track_sales?: boolean; facebook_page_id?: string | null; instagram_business_id?: string | null; legal_name?: string | null; cnpj?: string | null; person_type?: "fisica" | "juridica"; cpf?: string | null; address_street?: string | null; address_number?: string | null; address_complement?: string | null; address_neighborhood?: string | null; address_city?: string | null; address_state?: string | null; address_zip_code?: string | null; address_country?: string | null; state_registration?: string | null; municipal_registration?: string | null; legal_representative_name?: string | null; legal_representative_cpf?: string | null; legal_representative_role?: string | null; billing_email?: string | null; billing_phone?: string | null; contact_name?: string | null; contact_email?: string | null; contact_phone?: string | null; whatsapp_phone?: string | null; drive_folder_url?: string | null; contract_start_date?: string | null; contract_end_date?: string | null; contract_notice_days?: number; accounts: Account[]; }
type GroupSortKey = "name" | "accounts";
type AccountAdminSortKey = "platform" | "name" | "status" | "client" | "group" | "visibility";
const GROUP_SORT_KEYS: readonly GroupSortKey[] = ["name", "accounts"];
const ACCOUNT_ADMIN_SORT_KEYS: readonly AccountAdminSortKey[] = ["platform", "name", "status", "client", "group", "visibility"];
const MONETARY_CLIENT_KPIS = new Set(["cpa", "cpl", "cpc", "cpm", "cost_per_result", "revenue", "custom"]);
const PALETTE = ["#3987e5", "#16a34a", "#db2777", "#f59e0b", "#7c3aed", "#0891b2", "#dc2626", "#4b5563"];
const compactInput: React.CSSProperties = { width: "100%", height: 30, fontSize: 12, borderRadius: 8, border: "1px solid var(--color-border)", background: "transparent", padding: "0 8px" };
const inputClass = "h-9 w-full rounded-lg border border-border bg-transparent px-3 text-sm outline-none focus:ring-1 focus:ring-ring";

type TabKey = "metas" | "perfil" | "onboarding" | "contrato" | "roi" | "documentos" | "aprovacoes" | "organico" | "alertas";
const TABS: { key: TabKey; label: string }[] = [
  { key: "metas", label: "Metas" },
  { key: "perfil", label: "Perfil" },
  { key: "onboarding", label: "Onboarding" },
  { key: "contrato", label: "Contrato" },
  { key: "roi", label: "ROI & Financeiro" },
  { key: "documentos", label: "Documentos" },
  { key: "aprovacoes", label: "Aprovações" },
  { key: "organico", label: "Orgânico" },
  { key: "alertas", label: "Alertas" },
];

export default function ClientesPage() {
  const router = useRouter();
  const [view, setViewState] = useState<"clients" | "catalog">("clients");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [activeTab, setActiveTabState] = useState<TabKey>("metas");
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
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [clientModal, setClientModal] = useState<ClientRecord | null | false>(false);
  const [clientForm, setClientForm] = useState<Record<string, string>>({});
  const [cnpjLookup, setCnpjLookup] = useState<{ status: "idle" | "loading" | "error" | "done"; data?: any; error?: string }>({ status: "idle" });
  const [cnpjConfirmed, setCnpjConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accountBusy, setAccountBusy] = useState<string | null>(null);
  const [driveBusy, setDriveBusy] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState<string | null>(null);
  const [groupSort, setGroupSort] = usePersistentSort<GroupSortKey>("adsctrl:sort:admin-groups", { key: "name", direction: "asc" }, GROUP_SORT_KEYS);
  const [accountSort, setAccountSort] = usePersistentSort<AccountAdminSortKey>("adsctrl:sort:admin-accounts", { key: "name", direction: "asc" }, ACCOUNT_ADMIN_SORT_KEYS);

  async function load() { setError(null); try { const [r, cr] = await Promise.all([fetch("/api/accounts"), fetch("/api/clients?status=active")]); const d = JSON.parse(await r.text()); if (!r.ok || d.error) throw new Error(d.error || "Falha."); setAccounts(d.accounts || []); setGroups(d.groups || []); const cd = JSON.parse(await cr.text()); if (cr.ok && !cd.error) { setClients(cd.clients || []); setClientsUnavailable(null); } else { setClients([]); setClientsUnavailable(cd.error || "Migração necessária."); } } catch (e: any) { setError(e?.message); } finally { setLoadRevision((r) => r + 1); setLoading(false); } }
  async function refreshClients() { try { const r = await fetch("/api/clients?status=active", { cache: "no-store" }); const d = JSON.parse(await r.text()); if (!r.ok || d.error) throw new Error(d.error || "Falha."); setClients(d.clients || []); setClientsUnavailable(null); } catch (e: any) { setError(e?.message); } }
  useEffect(() => { load(); }, []);

  // Estado de seleção (cliente + aba + visão) espelha a URL pra virar link
  // compartilhável, sem depender de useSearchParams (evita boundary de Suspense).
  function updateUrl(patch: Record<string, string | null>) {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) { if (value == null) params.delete(key); else params.set(key, value); }
    const qs = params.toString();
    router.replace(qs ? `/clientes?${qs}` : "/clientes", { scroll: false });
  }
  function selectClient(id: string) { setSelectedClientId(id); setViewState("clients"); updateUrl({ client: id, view: null }); }
  function selectTab(tab: TabKey) { setActiveTabState(tab); updateUrl({ tab }); }
  function selectView(next: "clients" | "catalog") { setViewState(next); updateUrl({ view: next === "catalog" ? "catalog" : null }); }

  useEffect(() => {
    if (!clients.length) return;
    const params = new URLSearchParams(window.location.search);
    const urlView = params.get("view");
    const urlTab = params.get("tab") as TabKey | null;
    const urlClient = params.get("client");
    if (urlView === "catalog") setViewState("catalog");
    if (urlTab && TABS.some((tab) => tab.key === urlTab)) setActiveTabState(urlTab);
    if (urlClient && clients.some((client) => client.id === urlClient)) setSelectedClientId(urlClient);
    else if (!selectedClientId) setSelectedClientId(clients[0].id);
  }, [clients.length]);

  const countByGroup = useMemo(() => { const m: Record<string, number> = {}; for (const a of accounts) if (a.group_id) m[a.group_id] = (m[a.group_id] || 0) + 1; return m; }, [accounts]);
  const metaAccounts = useMemo(() => accounts.filter((a) => a.platform === "meta" && !a.hidden && a.status === "ACTIVE").sort((a, b) => a.name.localeCompare(b.name)), [accounts]);

  const sortedClients = useMemo(() => [...clients].sort((a, b) => a.name.localeCompare(b.name)), [clients]);
  const visibleClients = useMemo(() => { const query = clientQuery.trim().toLocaleLowerCase(); return query ? sortedClients.filter((client) => [client.name, client.legal_name, client.cnpj, client.contact_name, client.contact_email].filter(Boolean).join(" ").toLocaleLowerCase().includes(query)) : sortedClients; }, [sortedClients, clientQuery]);
  const selectedClient = clients.find((client) => client.id === selectedClientId) || null;
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
  async function deleteClient(client: ClientRecord) {
    if (!window.confirm(`Excluir o cliente “${client.name}”? As contas serão desvinculadas, mas não serão apagadas. O histórico financeiro será preservado.`)) return;
    setDeleteBusy(client.id); setError(null);
    try {
      await api(`/api/clients/${client.id}`, { method: "DELETE" });
      setClients((previous) => previous.filter((item) => item.id !== client.id));
      if (selectedClientId === client.id) setSelectedClientId("");
      if (clientModal && clientModal.id === client.id) setClientModal(false);
    } catch (e: any) { setError(e?.message || "Falha ao excluir cliente."); }
    finally { setDeleteBusy(null); }
  }
  async function linkClientAccount(client: ClientRecord, accountId: string) { if (!accountId) return; setAccountBusy(`${client.id}:${accountId}`); try { const d = await api(`/api/clients/${client.id}/accounts`, { method: "POST", body: JSON.stringify({ account_id: accountId }) }); setClients((prev) => prev.map((item) => item.id === client.id ? { ...item, ...d.client } : item)); } catch (e: any) { setError(e?.message); } finally { setAccountBusy(null); } }
  async function unlinkClientAccount(client: ClientRecord, accountId: string) { setAccountBusy(`${client.id}:${accountId}`); try { const d = await api(`/api/clients/${client.id}/accounts?account_id=${encodeURIComponent(accountId)}`, { method: "DELETE" }); setClients((prev) => prev.map((item) => item.id === client.id ? { ...item, ...d.client } : item)); } catch (e: any) { setError(e?.message); } finally { setAccountBusy(null); } }
  function updateClientField(client: ClientRecord, field: string, value: any) { const patch: any = {}; patch[field] = value; updateClient(client.id, patch); }
  function openClientModal(client?: ClientRecord) {
    const fields = [
      "name", "legal_name", "person_type", "cnpj", "cpf", "contact_name", "contact_email", "contact_phone", "whatsapp_phone",
      "legal_representative_name", "legal_representative_cpf", "legal_representative_role", "billing_email", "billing_phone",
      "monthly_budget", "contract_start_date", "contract_end_date", "contract_notice_days", "address_country", "address_zip_code",
      "address_street", "address_number", "address_complement", "address_neighborhood", "address_city", "address_state",
    ];
    const next: Record<string, string> = {};
    for (const field of fields) next[field] = client ? String((client as any)[field] ?? "") : field === "person_type" ? "juridica" : field === "address_country" ? "Brasil" : field === "contract_notice_days" ? "30" : "";
    setClientForm(next); setClientModal(client || null);
    setCnpjLookup({ status: "idle" }); setCnpjConfirmed(Boolean(client));
  }
  async function lookupCnpj() {
    const digits = (clientForm.cnpj || "").replace(/\D/g, "");
    if (digits.length !== 14) { setCnpjLookup({ status: "error", error: "CNPJ precisa ter 14 dígitos." }); return; }
    setCnpjLookup({ status: "loading" });
    try {
      const r = await fetch(`/api/cnpj/${digits}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "CNPJ não encontrado.");
      setCnpjLookup({ status: "done", data: d });
    } catch (e: any) { setCnpjLookup({ status: "error", error: e?.message || "Falha ao consultar CNPJ." }); }
  }
  function confirmCnpjData() {
    const d = cnpjLookup.data; if (!d) return;
    const phoneDigits = String(d.ddd_telefone_1 || "").replace(/\D/g, "");
    const phoneFormatted = phoneDigits.length === 10 ? `(${phoneDigits.slice(0, 2)}) ${phoneDigits.slice(2, 6)}-${phoneDigits.slice(6)}` : phoneDigits.length === 11 ? `(${phoneDigits.slice(0, 2)}) ${phoneDigits.slice(2, 7)}-${phoneDigits.slice(7)}` : phoneDigits;
    setClientForm((old) => ({
      ...old,
      name: old.name || d.nome_fantasia || d.razao_social || "",
      legal_name: d.razao_social || old.legal_name,
      address_zip_code: d.cep || old.address_zip_code,
      address_street: d.logradouro || old.address_street,
      address_number: d.numero || old.address_number,
      address_complement: d.complemento || old.address_complement,
      address_neighborhood: d.bairro || old.address_neighborhood,
      address_city: d.municipio || old.address_city,
      address_state: d.uf || old.address_state,
      address_country: "Brasil",
      // E-mail/telefone da Receita são do estabelecimento, não do signatário —
      // caem no financeiro, e o de assinatura/WhatsApp continuam manuais.
      billing_email: old.billing_email || d.email || "",
      billing_phone: old.billing_phone || phoneFormatted || "",
    }));
    setCnpjConfirmed(true);
  }
  async function saveClientModal(openContract = false) {
    setBusy(true);
    try {
      const payload = { ...clientForm, monthly_budget: clientForm.monthly_budget ? Number(clientForm.monthly_budget) : null, contract_notice_days: clientForm.contract_notice_days ? Number(clientForm.contract_notice_days) : 30 };
      const editing = Boolean(clientModal);
      const result = await api(editing ? `/api/clients/${(clientModal as ClientRecord).id}` : "/api/clients", { method: editing ? "PATCH" : "POST", body: JSON.stringify(payload) });
      const savedClient = result.client as ClientRecord;
      if (editing) setClients((previous) => previous.map((client) => client.id === (clientModal as ClientRecord).id ? { ...client, ...savedClient } : client)); else { setClients((previous) => [...previous, savedClient]); selectClient(savedClient.id); }
      setClientModal(false);
      if (openContract && savedClient?.id) router.push(`/contratos/${savedClient.id}`);
    } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
  }

  if (loading) return <div className="p-4 md:p-6 md:ml-56 pb-20 md:pb-6 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-14 rounded-lg" /><Skeleton className="h-32 rounded-lg" /></div>;

  const phone = selectedClient ? (selectedClient.whatsapp_phone || selectedClient.contact_phone || "").replace(/\D/g, "") : "";
  const los = (selectedClient?.primary_kpi || "").toLowerCase();

  return (
    <div className="p-4 md:p-6 md:ml-56 pb-20 md:pb-6 space-y-4 animate-fade-in">
      <PageHeader
        title="Clientes"
        subtitle={`${clients.length} cliente${clients.length === 1 ? "" : "s"} ativo${clients.length === 1 ? "" : "s"} · ${accounts.length} contas no catálogo.`}
        actions={<div className="flex flex-wrap items-center gap-2">
          <Segmented value={view} onChange={selectView} options={[{ value: "clients", label: "Clientes" }, { value: "catalog", label: "Catálogo" }]} />
          <Link href="/relatorios"><Button variant="ghost" size="sm"><Mail className="h-3.5 w-3.5 mr-1" /> Relatórios e painéis</Button></Link>
        </div>}
      />

      {error && <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/20 bg-red-500/10 text-sm text-red-500"><AlertTriangle className="h-4 w-4 shrink-0" />{error}<button onClick={() => setError(null)} className="ml-auto bg-transparent border-none cursor-pointer text-xs font-semibold hover:underline">✕</button></div>}

      {view === "clients" && (
        <div className="flex flex-col gap-4 lg:flex-row">
          <aside className="w-full shrink-0 space-y-2 lg:w-64">
            <div className="flex items-center gap-2">
              <input value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} placeholder="Buscar cliente…" className="h-9 flex-1 rounded-lg border border-border bg-transparent px-3 text-xs outline-none focus:ring-1 focus:ring-ring" />
              <Button size="sm" onClick={() => openClientModal()} title="Novo cliente"><Plus className="h-3.5 w-3.5" /></Button>
            </div>
            {clientsUnavailable ? <Notice tone="warn">{clientsUnavailable}</Notice> : (
              <div className="space-y-1 overflow-y-auto lg:max-h-[calc(100vh-220px)]">
                {visibleClients.map((client) => (
                  <button key={client.id} onClick={() => selectClient(client.id)} className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors", client.id === selectedClientId ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                    <span className="min-w-0 flex-1 truncate">{client.name}</span>
                    {client.track_sales && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" title="Acompanha vendas reais" />}
                  </button>
                ))}
                {!visibleClients.length && <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum cliente encontrado.</div>}
              </div>
            )}
          </aside>

          <section className="min-w-0 flex-1 space-y-3">
            {!selectedClient && <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Selecione um cliente na lista para ver e editar os dados dele.</div>}
            {selectedClient && <>
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 bg-card p-3">
                <h2 className="text-base font-semibold">{selectedClient.name}</h2>
                {selectedClient.contact_name && <span className="text-xs text-muted-foreground">· {selectedClient.contact_name}</span>}
                <div className="ml-auto flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => openClientModal(selectedClient)} className="rounded-md border border-input px-2 py-1 text-[11px] font-semibold hover:bg-muted">Editar cadastro</button>
                  <button type="button" onClick={() => deleteClient(selectedClient)} disabled={deleteBusy === selectedClient.id} className="rounded-md border border-red-500/30 px-2 py-1 text-[11px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/10 disabled:opacity-50">{deleteBusy === selectedClient.id ? "Excluindo…" : "Excluir cliente"}</button>
                  {phone && <a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"><Phone className="h-3 w-3" /> WhatsApp</a>}
                  {selectedClient.drive_folder_url && <a href={selectedClient.drive_folder_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-sky-500/25 bg-sky-500/10 px-2 py-1 text-[11px] font-semibold text-sky-600 dark:text-sky-400"><FolderOpen className="h-3 w-3" /> Drive</a>}
                </div>
              </div>

              <div className="flex gap-1 overflow-x-auto border-b border-border/50">
                {TABS.map((tab) => <button key={tab.key} onClick={() => selectTab(tab.key)} className={cn("whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors", activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>{tab.label}</button>)}
              </div>

              {activeTab === "metas" && <div className="space-y-3">
                <div className="grid gap-3 rounded-lg border border-border/50 bg-card p-4 md:grid-cols-4">
                  <Field label="Objetivo"><select value={selectedClient.objective || ""} onChange={(e) => updateClientField(selectedClient, "objective", e.target.value || null)} style={compactInput}><option value="">—</option><option value="leads">Leads</option><option value="messages">Mensagens</option><option value="profile">Crescer perfil</option><option value="sales">Vendas</option><option value="traffic">Tráfego</option><option value="engagement">Engajamento</option><option value="awareness">Brand / Reconhecimento</option><option value="app">Aplicativo</option><option value="other">Outro</option></select></Field>
                  <Field label={`Orçamento · ${selectedClient.currency}`}><input key={`${selectedClient.id}-b-${loadRevision}`} type="number" min="0" step="10" defaultValue={selectedClient.monthly_budget ?? ""} placeholder="0" onBlur={(e) => updateClientField(selectedClient, "monthly_budget", e.target.value ? Number(e.target.value) : null)} style={compactInput} /></Field>
                  <Field label="Resultado"><select value={selectedClient.result_family || ""} onChange={(e) => updateClientField(selectedClient, "result_family", e.target.value || null)} style={compactInput}><option value="">Automático</option><option value="conversoes">Conversões</option><option value="vendas">Vendas</option><option value="leads">Leads</option><option value="mensagens">Mensagens</option><option value="cadastros">Cadastros</option><option value="cliques">Cliques</option><option value="lpv">LPV</option><option value="engajamento">Engajamento</option></select></Field>
                  <Field label="KPI"><select value={selectedClient.primary_kpi || ""} onChange={(e) => updateClient(selectedClient.id, { primary_kpi: e.target.value || null, target_value: null })} style={compactInput}><option value="">—</option><option value="cpl">CPL</option><option value="cpa">CPA</option><option value="roas">ROAS</option><option value="revenue">Receita</option><option value="conversions">Conversões</option><option value="ctr">CTR</option><option value="cpc">CPC</option><option value="cpm">CPM</option><option value="custom">Custo / resultado</option></select></Field>
                  <Field label={`Meta${MONETARY_CLIENT_KPIS.has(los) ? ` · ${selectedClient.currency}` : los === "ctr" ? " · %" : los === "roas" ? " · x" : ""}`}><input key={`${selectedClient.id}-t-${loadRevision}`} type="number" min="0" step="any" defaultValue={selectedClient.target_value ?? ""} placeholder="—" onBlur={(e) => updateClientField(selectedClient, "target_value", e.target.value ? Number(e.target.value) : null)} style={compactInput} /></Field>
                  <Field label="Dia início do ciclo"><select value={selectedClient.budget_start_day} onChange={(e) => updateClientField(selectedClient, "budget_start_day", Number(e.target.value))} style={compactInput}>{Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}º</option>)}</select></Field>
                  <Field label="Acompanhar vendas reais" hint="Coloca este cliente na aba ROI & Financeiro, pra informar o valor vendido em cada mês.">
                    <button
                      onClick={() => updateClientField(selectedClient, "track_sales", !selectedClient.track_sales)}
                      className={cn("h-[30px] w-full rounded-lg text-[11px] font-semibold border cursor-pointer transition-colors",
                        selectedClient.track_sales ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-border bg-transparent text-muted-foreground hover:text-foreground")}
                    >
                      {selectedClient.track_sales ? "✓ acompanhando" : "não acompanha"}
                    </button>
                  </Field>
                </div>
                <div className="rounded-lg border border-border/50 bg-card p-4">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Contas de anúncio vinculadas</div>
                  <ClientAccounts client={selectedClient} accounts={accounts} busyAccount={accountBusy} onLink={linkClientAccount} onUnlink={unlinkClientAccount} />
                </div>
                <ClientGuardrails client={selectedClient} loadRevision={loadRevision} onUpdate={updateClient} />
              </div>}

              {activeTab === "perfil" && <div className="space-y-3 rounded-lg border border-border/50 bg-card p-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <Field label="Razão social"><input key={`${selectedClient.id}-legal-${loadRevision}`} defaultValue={selectedClient.legal_name ?? ""} placeholder="Razão social" onBlur={(e) => updateClientField(selectedClient, "legal_name", e.target.value || null)} style={compactInput} /></Field>
                  <Field label="CNPJ"><input key={`${selectedClient.id}-cnpj-${loadRevision}`} defaultValue={selectedClient.cnpj ?? ""} placeholder="00.000.000/0000-00" onBlur={(e) => updateClientField(selectedClient, "cnpj", e.target.value || null)} style={compactInput} /></Field>
                  <Field label="Contato"><input key={`${selectedClient.id}-contact-${loadRevision}`} defaultValue={selectedClient.contact_name ?? ""} placeholder="Nome do contato" onBlur={(e) => updateClientField(selectedClient, "contact_name", e.target.value || null)} style={compactInput} /></Field>
                  <Field label="E-mail"><input key={`${selectedClient.id}-email-${loadRevision}`} type="email" defaultValue={selectedClient.contact_email ?? ""} placeholder="contato@empresa.com" onBlur={(e) => updateClientField(selectedClient, "contact_email", e.target.value || null)} style={compactInput} /></Field>
                  <Field label="WhatsApp"><input key={`${selectedClient.id}-wa-${loadRevision}`} defaultValue={selectedClient.whatsapp_phone ?? ""} placeholder="5511999999999" onBlur={(e) => updateClientField(selectedClient, "whatsapp_phone", e.target.value || null)} style={compactInput} /></Field>
                  <Field label="Telefone"><input key={`${selectedClient.id}-phone-${loadRevision}`} defaultValue={selectedClient.contact_phone ?? ""} placeholder="Telefone alternativo" onBlur={(e) => updateClientField(selectedClient, "contact_phone", e.target.value || null)} style={compactInput} /></Field>
                </div>
                <div className="border-t border-border/40 pt-3 space-y-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Dados para contrato e faturamento</div>
                  <div className="grid gap-3 md:grid-cols-5">
                    <Field label="Tipo"><select value={selectedClient.person_type ?? "juridica"} onChange={(e) => updateClientField(selectedClient, "person_type", e.target.value)} style={compactInput}><option value="juridica">Pessoa jurídica</option><option value="fisica">Pessoa física</option></select></Field>
                    <Field label={selectedClient.person_type === "fisica" ? "CPF" : "CPF do responsável"}><input key={`${selectedClient.id}-cpf-${loadRevision}`} defaultValue={selectedClient.cpf ?? ""} placeholder="000.000.000-00" onBlur={(e) => updateClientField(selectedClient, "cpf", e.target.value || null)} style={compactInput} /></Field>
                    <Field label="Inscrição estadual"><input key={`${selectedClient.id}-ie-${loadRevision}`} defaultValue={selectedClient.state_registration ?? ""} placeholder="Opcional" onBlur={(e) => updateClientField(selectedClient, "state_registration", e.target.value || null)} style={compactInput} /></Field>
                    <Field label="Inscrição municipal"><input key={`${selectedClient.id}-im-${loadRevision}`} defaultValue={selectedClient.municipal_registration ?? ""} placeholder="Opcional" onBlur={(e) => updateClientField(selectedClient, "municipal_registration", e.target.value || null)} style={compactInput} /></Field>
                    <Field label="País"><input key={`${selectedClient.id}-country-${loadRevision}`} defaultValue={selectedClient.address_country ?? "Brasil"} onBlur={(e) => updateClientField(selectedClient, "address_country", e.target.value || null)} style={compactInput} /></Field>
                    <Field label="Representante legal"><input key={`${selectedClient.id}-rep-${loadRevision}`} defaultValue={selectedClient.legal_representative_name ?? ""} placeholder="Nome completo" onBlur={(e) => updateClientField(selectedClient, "legal_representative_name", e.target.value || null)} style={compactInput} /></Field>
                    <Field label="CPF do representante"><input key={`${selectedClient.id}-repcpf-${loadRevision}`} defaultValue={selectedClient.legal_representative_cpf ?? ""} placeholder="000.000.000-00" onBlur={(e) => updateClientField(selectedClient, "legal_representative_cpf", e.target.value || null)} style={compactInput} /></Field>
                    <Field label="Cargo"><input key={`${selectedClient.id}-reprule-${loadRevision}`} defaultValue={selectedClient.legal_representative_role ?? ""} placeholder="Sócio, diretor..." onBlur={(e) => updateClientField(selectedClient, "legal_representative_role", e.target.value || null)} style={compactInput} /></Field>
                    <Field label="E-mail financeiro"><input key={`${selectedClient.id}-billingemail-${loadRevision}`} type="email" defaultValue={selectedClient.billing_email ?? ""} placeholder="financeiro@empresa.com" onBlur={(e) => updateClientField(selectedClient, "billing_email", e.target.value || null)} style={compactInput} /></Field>
                    <Field label="Telefone financeiro"><input key={`${selectedClient.id}-billingphone-${loadRevision}`} defaultValue={selectedClient.billing_phone ?? ""} placeholder="Telefone" onBlur={(e) => updateClientField(selectedClient, "billing_phone", e.target.value || null)} style={compactInput} /></Field>
                  </div>
                  <div className="grid gap-3 md:grid-cols-6">
                    <Field label="CEP"><input key={`${selectedClient.id}-cep-${loadRevision}`} defaultValue={selectedClient.address_zip_code ?? ""} placeholder="00000-000" onBlur={(e) => updateClientField(selectedClient, "address_zip_code", e.target.value || null)} style={compactInput} /></Field>
                    <Field label="Logradouro"><input key={`${selectedClient.id}-street-${loadRevision}`} defaultValue={selectedClient.address_street ?? ""} placeholder="Rua, avenida..." onBlur={(e) => updateClientField(selectedClient, "address_street", e.target.value || null)} style={compactInput} /></Field>
                    <Field label="Número"><input key={`${selectedClient.id}-number-${loadRevision}`} defaultValue={selectedClient.address_number ?? ""} placeholder="123" onBlur={(e) => updateClientField(selectedClient, "address_number", e.target.value || null)} style={compactInput} /></Field>
                    <Field label="Complemento"><input key={`${selectedClient.id}-complement-${loadRevision}`} defaultValue={selectedClient.address_complement ?? ""} placeholder="Sala, conjunto..." onBlur={(e) => updateClientField(selectedClient, "address_complement", e.target.value || null)} style={compactInput} /></Field>
                    <Field label="Bairro"><input key={`${selectedClient.id}-neighborhood-${loadRevision}`} defaultValue={selectedClient.address_neighborhood ?? ""} onBlur={(e) => updateClientField(selectedClient, "address_neighborhood", e.target.value || null)} style={compactInput} /></Field>
                    <Field label="Cidade / UF"><div className="flex gap-1"><input key={`${selectedClient.id}-city-${loadRevision}`} defaultValue={selectedClient.address_city ?? ""} placeholder="Cidade" onBlur={(e) => updateClientField(selectedClient, "address_city", e.target.value || null)} style={{ ...compactInput, minWidth: 0 }} /><input key={`${selectedClient.id}-state-${loadRevision}`} defaultValue={selectedClient.address_state ?? ""} placeholder="UF" maxLength={2} onBlur={(e) => updateClientField(selectedClient, "address_state", e.target.value.toUpperCase() || null)} style={{ ...compactInput, width: 52 }} /></div></Field>
                  </div>
                </div>
              </div>}

              {activeTab === "onboarding" && <ClientOnboarding clientId={selectedClient.id} />}

              {activeTab === "alertas" && <ClientAlertsTab clientId={selectedClient.id} clientName={selectedClient.name} currency={selectedClient.currency} />}

              {activeTab === "aprovacoes" && <ClientApprovals clientId={selectedClient.id} dashboardLinkHref={`/api/clients/${selectedClient.id}/dashboard-link`} />}

              {activeTab === "contrato" && <div className="space-y-3 rounded-lg border border-border/50 bg-card p-4">
                {(() => {
                  const contractDays = selectedClient.contract_end_date ? Math.ceil((Date.parse(`${selectedClient.contract_end_date}T23:59:59`) - Date.now()) / 86400000) : null;
                  const contractTone = contractDays != null && contractDays < 0 ? "text-red-500" : contractDays != null && contractDays <= (selectedClient.contract_notice_days ?? 30) ? "text-amber-500" : "text-muted-foreground";
                  return <div className="grid gap-3 md:grid-cols-4">
                    <Field label="Início da vigência"><BrDateInput value={selectedClient.contract_start_date} onChange={(value) => updateClientField(selectedClient, "contract_start_date", value || null)} style={compactInput} /></Field>
                    <Field label="Fim da vigência"><BrDateInput value={selectedClient.contract_end_date} onChange={(value) => updateClientField(selectedClient, "contract_end_date", value || null)} style={compactInput} /></Field>
                    <Field label="Avisar antes (dias)"><input key={`${selectedClient.id}-notice-${loadRevision}`} type="number" min="0" max="365" defaultValue={selectedClient.contract_notice_days ?? 30} onBlur={(e) => updateClientField(selectedClient, "contract_notice_days", e.target.value ? Number(e.target.value) : 30)} style={compactInput} /></Field>
                    <div className="flex items-end gap-2 text-xs"><CalendarClock className={cn("h-4 w-4 mb-1.5", contractTone)} /><span className={contractTone}>{contractDays == null ? "Vigência ainda não configurada" : contractDays < 0 ? `Vencido há ${Math.abs(contractDays)} dia(s)` : contractDays === 0 ? "Vence hoje" : `Vence em ${contractDays} dia(s)`}</span></div>
                  </div>;
                })()}
                <ClientDocuments clientId={selectedClient.id} filterKind="contract" />
              </div>}

              {activeTab === "roi" && <div className="space-y-3">
                <ClientBilling clientId={selectedClient.id} defaultValue={selectedClient.monthly_budget} />
                <RoiPorCliente clientId={selectedClient.id} />
              </div>}

              {activeTab === "documentos" && <div className="space-y-3 rounded-lg border border-border/50 bg-card p-4">
                <div className="grid gap-3 md:grid-cols-1">
                  <Field label="Pasta do Drive"><div className="flex gap-1"><input key={`${selectedClient.id}-drive-${loadRevision}`} type="url" defaultValue={selectedClient.drive_folder_url ?? ""} placeholder="Cole o link da pasta" onBlur={(e) => updateClientField(selectedClient, "drive_folder_url", e.target.value || null)} style={{ ...compactInput, minWidth: 0 }} />{selectedClient.drive_folder_url ? <a href={selectedClient.drive_folder_url} target="_blank" rel="noreferrer" className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded border border-input text-muted-foreground hover:text-foreground"><ExternalLink className="h-3 w-3" /></a> : <button onClick={() => createDrive(selectedClient)} disabled={driveBusy === selectedClient.id} title="Cria a pasta e as subpastas padrão no Google Drive conectado" className="h-[30px] shrink-0 rounded border border-sky-500/30 px-2 text-[10px] font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-500/10 disabled:opacity-50">{driveBusy === selectedClient.id ? "…" : "Criar"}</button>}</div></Field>
                </div>
                <ClientDocuments clientId={selectedClient.id} filterKind="document" />
              </div>}

              {activeTab === "organico" && <div className="rounded-lg border border-border/50 bg-card p-4">
                <SocialPagesPanel clients={[selectedClient]} loadRevision={loadRevision} onUpdate={updateClient} onError={setError} />
              </div>}
            </>}
          </section>
        </div>
      )}

      {view === "catalog" && (
        <div className="space-y-4">
          <WideScreenHint>A tabela de contas é larga; no computador fica mais confortável.</WideScreenHint>

          <section className="rounded-lg border border-border/50 bg-card p-4">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">ROI por Cliente — comparação geral</h2></div>
            <RoiPorCliente />
          </section>

          <section className="rounded-lg border border-border/50 bg-card p-4">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Grupos</h2><span className="text-xs text-muted-foreground">{groups.length} grupo{groups.length === 1 ? "" : "s"}</span></div>
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
          </section>

          <section className="rounded-lg border border-border/50 bg-card p-4">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Contas</h2><span className="text-xs text-muted-foreground">{collectingCount} ativa{collectingCount === 1 ? "" : "s"} de {accounts.length}</span></div>
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
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded text-center", a.platform === "google" ? "bg-sky-500/10 text-sky-600 dark:text-sky-400" : "bg-blue-500/10 text-blue-600 dark:text-blue-400")}>{a.platform}</span>
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
          </section>
        </div>
      )}

      {clientModal !== false && <Modal title={clientModal ? `Editar cliente: ${clientModal.name}` : "Novo cliente"} onClose={() => setClientModal(false)} wide>
        {!clientModal && (clientForm.person_type || "juridica") === "juridica" && !cnpjConfirmed ? (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Informe o CNPJ pra puxar razão social e endereço direto da Receita Federal. Depois só falta confirmar, e-mail de assinatura e WhatsApp.</p>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="CNPJ"><input value={clientForm.cnpj || ""} onChange={(e) => setClientForm((old) => ({ ...old, cnpj: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookupCnpj(); } }} placeholder="00.000.000/0000-00" className={cn(inputClass, "w-56")} /></Field>
              <Button size="sm" onClick={lookupCnpj} disabled={cnpjLookup.status === "loading" || !clientForm.cnpj?.trim()}>{cnpjLookup.status === "loading" ? "Buscando…" : "Buscar dados"}</Button>
            </div>
            {cnpjLookup.status === "error" && <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-500">{cnpjLookup.error}</div>}
            {cnpjLookup.status === "done" && cnpjLookup.data && (() => {
              const d = cnpjLookup.data; const ativa = /ativa/i.test(d.descricao_situacao_cadastral || "");
              const phoneDigits = String(d.ddd_telefone_1 || "").replace(/\D/g, "");
              const phonePreview = phoneDigits.length === 10 ? `(${phoneDigits.slice(0, 2)}) ${phoneDigits.slice(2, 6)}-${phoneDigits.slice(6)}` : phoneDigits.length === 11 ? `(${phoneDigits.slice(0, 2)}) ${phoneDigits.slice(2, 7)}-${phoneDigits.slice(7)}` : phoneDigits;
              const row = (label: string, value: unknown) => <div><span className="text-muted-foreground">{label}:</span> {value ? <span>{String(value)}</span> : <span className="italic text-muted-foreground/70">não informado pela Receita</span>}</div>;
              return <div className="space-y-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4">
                <div className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /><span className="text-sm font-semibold">Dados encontrados na Receita Federal</span></div>
                <div className="grid gap-1 text-xs sm:grid-cols-2">
                  {row("Razão social", d.razao_social)}
                  {row("Nome fantasia", d.nome_fantasia)}
                  <div><span className="text-muted-foreground">Situação:</span> <span className={cn("font-semibold", ativa ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")}>{d.descricao_situacao_cadastral || "—"}</span></div>
                  {row("CEP", d.cep)}
                  {row("Logradouro", d.logradouro)}
                  {row("Número", d.numero)}
                  {row("Complemento", d.complemento)}
                  {row("Bairro", d.bairro)}
                  {row("Cidade / UF", d.municipio ? `${d.municipio} / ${d.uf || ""}` : null)}
                  {row("E-mail (Receita)", d.email)}
                  {row("Telefone (Receita)", phonePreview)}
                </div>
                {!ativa && <div className="text-[11px] font-semibold text-red-500">Situação cadastral não é ATIVA — confira antes de seguir.</div>}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setCnpjLookup({ status: "idle" })}>Buscar outro CNPJ</Button>
                  <Button size="sm" onClick={confirmCnpjData}>Dados confirmados, continuar</Button>
                </div>
              </div>;
            })()}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3">
              <Button variant="secondary" size="sm" onClick={() => setClientModal(false)}>Cancelar</Button>
              <div className="flex gap-3">
                <button type="button" onClick={() => setClientForm((old) => ({ ...old, person_type: "fisica" }))} className="text-[11px] text-muted-foreground underline decoration-dotted hover:text-foreground">É pessoa física?</button>
                <button type="button" onClick={() => setCnpjConfirmed(true)} className="text-[11px] text-muted-foreground underline decoration-dotted hover:text-foreground">Preencher manualmente</button>
              </div>
            </div>
          </div>
        ) : (
        <div className="space-y-5">
          <p className="text-xs text-muted-foreground">Preencha os dados uma única vez. Eles serão usados no cadastro, no faturamento e na geração da minuta contratual.</p>
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Parte contratante</div>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Nome do cliente"><input value={clientForm.name || ""} onChange={(e) => setClientForm((old) => ({ ...old, name: e.target.value }))} placeholder="Nome fantasia" className={inputClass} /></Field>
              <Field label="Tipo"><select value={clientForm.person_type || "juridica"} onChange={(e) => setClientForm((old) => ({ ...old, person_type: e.target.value }))} className={inputClass}><option value="juridica">Pessoa jurídica</option><option value="fisica">Pessoa física</option></select></Field>
              <Field label="Razão social / nome civil"><input value={clientForm.legal_name || ""} onChange={(e) => setClientForm((old) => ({ ...old, legal_name: e.target.value }))} placeholder="Nome que constará no contrato" className={inputClass} /></Field>
              <Field label={clientForm.person_type === "fisica" ? "CPF" : "CNPJ"}><input value={clientForm.person_type === "fisica" ? clientForm.cpf || "" : clientForm.cnpj || ""} onChange={(e) => setClientForm((old) => ({ ...old, [old.person_type === "fisica" ? "cpf" : "cnpj"]: e.target.value }))} placeholder={clientForm.person_type === "fisica" ? "000.000.000-00" : "00.000.000/0000-00"} className={inputClass} /></Field>
              <Field label="Representante legal"><input value={clientForm.legal_representative_name || ""} onChange={(e) => setClientForm((old) => ({ ...old, legal_representative_name: e.target.value }))} placeholder="Nome completo" className={inputClass} /></Field>
              <Field label="CPF do representante"><input value={clientForm.legal_representative_cpf || ""} onChange={(e) => setClientForm((old) => ({ ...old, legal_representative_cpf: e.target.value }))} placeholder="000.000.000-00" className={inputClass} /></Field>
              <Field label="Cargo"><input value={clientForm.legal_representative_role || ""} onChange={(e) => setClientForm((old) => ({ ...old, legal_representative_role: e.target.value }))} placeholder="Sócio, diretor…" className={inputClass} /></Field>
              <Field label="E-mail para assinatura"><input type="email" value={clientForm.contact_email || ""} onChange={(e) => setClientForm((old) => ({ ...old, contact_email: e.target.value }))} placeholder="responsavel@empresa.com" className={inputClass} /></Field>
              <Field label="WhatsApp / celular"><input value={clientForm.whatsapp_phone || ""} onChange={(e) => setClientForm((old) => ({ ...old, whatsapp_phone: e.target.value }))} placeholder="5511999999999" className={inputClass} /></Field>
            </div>
          </div>
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Endereço da parte contratante</div>
            <div className="grid gap-3 md:grid-cols-4">
              <Field label="CEP"><input value={clientForm.address_zip_code || ""} onChange={(e) => setClientForm((old) => ({ ...old, address_zip_code: e.target.value }))} placeholder="00000-000" className={inputClass} /></Field>
              <Field label="Logradouro"><input value={clientForm.address_street || ""} onChange={(e) => setClientForm((old) => ({ ...old, address_street: e.target.value }))} placeholder="Rua, avenida…" className={inputClass} /></Field>
              <Field label="Número"><input value={clientForm.address_number || ""} onChange={(e) => setClientForm((old) => ({ ...old, address_number: e.target.value }))} placeholder="123" className={inputClass} /></Field>
              <Field label="Complemento"><input value={clientForm.address_complement || ""} onChange={(e) => setClientForm((old) => ({ ...old, address_complement: e.target.value }))} placeholder="Sala, conjunto…" className={inputClass} /></Field>
              <Field label="Bairro"><input value={clientForm.address_neighborhood || ""} onChange={(e) => setClientForm((old) => ({ ...old, address_neighborhood: e.target.value }))} placeholder="Bairro" className={inputClass} /></Field>
              <Field label="Cidade"><input value={clientForm.address_city || ""} onChange={(e) => setClientForm((old) => ({ ...old, address_city: e.target.value }))} placeholder="Cidade" className={inputClass} /></Field>
              <Field label="UF"><input maxLength={2} value={clientForm.address_state || ""} onChange={(e) => setClientForm((old) => ({ ...old, address_state: e.target.value.toUpperCase() }))} placeholder="SP" className={inputClass} /></Field>
              <Field label="País"><input value={clientForm.address_country || "Brasil"} onChange={(e) => setClientForm((old) => ({ ...old, address_country: e.target.value }))} placeholder="Brasil" className={inputClass} /></Field>
            </div>
          </div>
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Condições comerciais do contrato</div>
            <div className="grid gap-3 md:grid-cols-4">
              <Field label="Mensalidade do serviço"><input type="number" min="0" step="0.01" value={clientForm.monthly_budget || ""} onChange={(e) => setClientForm((old) => ({ ...old, monthly_budget: e.target.value }))} placeholder="R$ 0,00" className={inputClass} /></Field>
              <Field label="Início da vigência"><BrDateInput value={clientForm.contract_start_date} onChange={(value) => setClientForm((old) => ({ ...old, contract_start_date: value }))} className={inputClass} /></Field>
              <Field label="Fim da vigência"><BrDateInput value={clientForm.contract_end_date} onChange={(value) => setClientForm((old) => ({ ...old, contract_end_date: value }))} className={inputClass} /></Field>
              <Field label="Aviso prévio (dias)"><input type="number" min="0" max="365" value={clientForm.contract_notice_days || "30"} onChange={(e) => setClientForm((old) => ({ ...old, contract_notice_days: e.target.value }))} className={inputClass} /></Field>
              <Field label="E-mail financeiro"><input type="email" value={clientForm.billing_email || ""} onChange={(e) => setClientForm((old) => ({ ...old, billing_email: e.target.value }))} placeholder="financeiro@empresa.com" className={inputClass} /></Field>
              <Field label="Telefone financeiro"><input value={clientForm.billing_phone || ""} onChange={(e) => setClientForm((old) => ({ ...old, billing_phone: e.target.value }))} placeholder="Telefone" className={inputClass} /></Field>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">A verba de mídia continua separada da mensalidade e não será tratada como receita do contrato.</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-border/40 pt-4">
            <Button variant="secondary" size="sm" onClick={() => setClientModal(false)}>Cancelar</Button>
            <Button variant="secondary" size="sm" onClick={() => saveClientModal(true)} disabled={busy || !clientForm.name?.trim()}>{busy ? "Salvando…" : "Salvar e gerar minuta"}</Button>
            <Button size="sm" onClick={() => saveClientModal(false)} disabled={busy || !clientForm.name?.trim()}>{busy ? "Salvando…" : clientModal ? "Salvar alterações" : "Cadastrar cliente"}</Button>
          </div>
        </div>
        )}
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
  return <div className="space-y-1.5"><div className="text-[10px] font-semibold text-muted-foreground">Contas vinculadas ({linked.length})</div><div className="flex gap-1 flex-wrap">{linked.map((account) => <span key={account.account_id} title={account.name} className={cn("inline-flex max-w-[150px] items-center gap-1 truncate rounded px-1.5 py-0.5 text-[9px] font-bold", account.platform === "google" ? "bg-sky-500/10 text-sky-600 dark:text-sky-400" : "bg-blue-500/10 text-blue-600 dark:text-blue-400")}><span className="truncate">{account.name}</span><button type="button" onClick={() => onUnlink(client, account.account_id)} disabled={busyAccount === `${client.id}:${account.account_id}`} className="text-current opacity-60 hover:opacity-100" title="Desvincular conta">×</button></span>)}{!linked.length && <span className="text-[10px] text-muted-foreground">Nenhuma conta vinculada</span>}</div>{available.length > 0 && <select value="" onChange={(event) => onLink(client, event.target.value)} disabled={Boolean(busyAccount)} className="h-7 max-w-full rounded border border-input bg-transparent px-1 text-[10px]"><option value="">+ Vincular conta de anúncio</option>{available.map((account) => <option key={account.account_id} value={account.account_id}>{account.platform} · {account.name}</option>)}</select>}</div>;
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
            <div key={client.id} className="grid gap-2 p-3 rounded-lg border border-border/50 bg-card items-end sm:grid-cols-[minmax(160px,1fr)_1fr_1fr]">
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

function ClientDocuments({ clientId, filterKind }: { clientId: string; filterKind: "contract" | "document" }) {
  const [data, setData] = useState<{ contracts: any[]; documents: any[] }>({ contracts: [], documents: [] });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
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
      const r = await fetch(`/api/clients/${clientId}/documents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: filterKind, name, drive_file_url: url || null, end_date: filterKind === "contract" ? endDate || null : null, expires_at: filterKind === "document" ? endDate || null : null, category }) });
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
      form.append("category", filterKind === "contract" ? "contract" : category);
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
  const documentList = filterKind === "document" ? data.documents : [];
  return (
    <div className="border-t border-border/40 pt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><FileText className="inline h-3.5 w-3.5 mr-1" />{filterKind === "contract" ? "Contratos" : "Documentos"}</span>
        {filterKind === "contract" && latestContract && <span className="text-[11px] text-muted-foreground">· contrato: {latestContract.title}{latestContract.end_date ? ` até ${brDate(latestContract.end_date)}` : ""}</span>}
        {filterKind === "contract" && latestContract && <button onClick={renew} disabled={busy} className="rounded-md border border-amber-500/30 px-2 py-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 disabled:opacity-50">Renovar</button>}
        {filterKind === "contract" && <Link href={`/contratos/${clientId}`} className="rounded-md border border-primary/30 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10">Gerar minuta</Link>}
        <button onClick={() => setOpen((v) => !v)} className="ml-auto inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-[11px] font-semibold hover:bg-muted"><Plus className="h-3 w-3" /> Adicionar</button>
      </div>
      {filterKind === "contract" && data.contracts.length > 0 && <div className="flex flex-wrap gap-1.5">{data.contracts.slice(0, 5).map((doc) => doc.drive_file_url ? <a key={doc.id} href={doc.drive_file_url} target="_blank" rel="noreferrer" className="rounded-md bg-muted px-2 py-1 text-[11px] hover:text-primary">{doc.title || doc.name}</a> : <span key={doc.id} className="rounded-md bg-muted px-2 py-1 text-[11px]">{doc.title || doc.name}</span>)}</div>}
      {filterKind === "document" && documentList.length > 0 && <div className="flex flex-wrap gap-1.5">{documentList.slice(0, 10).map((doc) => doc.drive_file_url ? <a key={doc.id} href={doc.drive_file_url} target="_blank" rel="noreferrer" className="rounded-md bg-muted px-2 py-1 text-[11px] hover:text-primary">{doc.name}</a> : <span key={doc.id} className="rounded-md bg-muted px-2 py-1 text-[11px]">{doc.name}</span>)}</div>}
      {loading && <span className="text-[11px] text-muted-foreground">Carregando acervo…</span>}
      {error && <div className="text-[11px] text-red-500">{error}</div>}
      {open && <div className="grid gap-2 rounded-md border border-border/50 bg-muted/20 p-2 md:grid-cols-5">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={filterKind === "contract" ? "Contrato de prestação de serviços" : "Nome do documento"} style={compactInput} />
        <input value={url} onChange={(e) => setUrl(e.target.value)} type="url" placeholder="Link do arquivo no Drive" style={compactInput} />
        <input value={endDate} onChange={(e) => setEndDate(e.target.value)} type="date" title={filterKind === "contract" ? "Vencimento do contrato" : "Validade do documento"} style={compactInput} />
        {filterKind === "document" && <select value={category} onChange={(e) => setCategory(e.target.value)} style={compactInput}><option value="other">Outro</option><option value="invoice">Nota fiscal</option><option value="briefing">Briefing</option><option value="addendum">Aditivo</option><option value="proof">Comprovante</option></select>}
        <button onClick={add} disabled={busy || !name.trim()} className="rounded-md bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Salvando…" : "Salvar"}</button>
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-[11px] file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-[11px]" />
        <button onClick={upload} disabled={busy || !file} className="rounded-md border border-sky-500/30 px-3 py-1 text-[11px] font-semibold text-sky-600 dark:text-sky-400 disabled:opacity-50">{busy ? "Enviando…" : "Enviar ao Drive"}</button>
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
  return <div className="rounded-lg border border-border/50 bg-card p-4 space-y-2">
    <div className="flex flex-wrap items-center gap-2"><span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Financeiro / Asaas</span>{active && <span className="text-[11px] text-emerald-600 dark:text-emerald-400">assinatura {active.status}</span>}{latest && <span className={cn("text-[11px]", latest.status === "OVERDUE" ? "text-red-500" : "text-muted-foreground")}>última cobrança: {latest.status}</span>}</div>
    {!active && <div className="grid gap-2 md:grid-cols-4"><input value={value} onChange={(e) => setValue(e.target.value)} type="number" min="1" step="0.01" placeholder="Mensalidade" style={compactInput} /><input value={dueDate} onChange={(e) => setDueDate(e.target.value)} type="date" title="Primeiro vencimento" style={compactInput} /><select value={billingType} onChange={(e) => setBillingType(e.target.value)} style={compactInput}><option value="UNDEFINED">Cliente escolhe</option><option value="PIX">Pix</option><option value="BOLETO">Boleto</option><option value="CREDIT_CARD">Cartão</option></select><button onClick={createSubscription} disabled={busy || !value} className="rounded-md border border-emerald-500/30 px-2 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 disabled:opacity-50">{busy ? "Criando…" : "Criar cobrança recorrente"}</button></div>}
    {message && <div className="text-[11px] text-muted-foreground">{message}</div>}
    {data.configured && active && <div className="mt-2 grid gap-2 border-t border-border/40 pt-2 md:grid-cols-4"><input value={invoiceDescription} onChange={(e) => setInvoiceDescription(e.target.value)} placeholder="Descrição do serviço" style={compactInput} /><input value={invoiceValue} onChange={(e) => setInvoiceValue(e.target.value)} type="number" min="1" step="0.01" placeholder="Valor da NFS-e" style={compactInput} /><input value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} type="date" title="Data de emissão" style={compactInput} /><button onClick={scheduleInvoice} disabled={invoiceBusy || !invoiceValue} className="rounded-md border border-violet-500/30 px-2 py-1 text-[11px] font-semibold text-violet-600 dark:text-violet-400 disabled:opacity-50">{invoiceBusy ? "Agendando…" : "Agendar NFS-e"}</button></div>}
    {data.invoices[0] && <div className="text-[11px] text-muted-foreground">NFS-e: {data.invoices[0].status}{data.invoices[0].pdf_url ? <a className="ml-2 text-primary hover:underline" href={data.invoices[0].pdf_url} target="_blank" rel="noreferrer">Abrir PDF</a> : null}</div>}
    {!data.configured && <div className="text-[11px] text-amber-600 dark:text-amber-400">Configure ASAAS_API_KEY no ambiente para ativar este módulo.</div>}
  </div>;
}

const ONBOARDING_ICONS: Record<string, typeof FileText> = {
  contract: FileText, billing: Wallet, access_meta: KeyRound, access_google: KeyRound,
  briefing: ClipboardList, brand: Palette, tracking: Target, campaign: Rocket, report: BarChart3,
};

function ClientOnboarding({ clientId }: { clientId: string }) {
  const [data, setData] = useState<{ items: any[]; progress: { done: number; total: number; percent: number } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  async function load() { try { const r = await fetch(`/api/clients/${clientId}/onboarding`, { cache: "no-store" }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Falha ao carregar onboarding."); setData(d); } catch (e: any) { setError(e?.message || "Falha ao carregar onboarding."); } }
  useEffect(() => { load(); }, [clientId]);
  async function patchItem(item: any, patch: Record<string, unknown>) { try { const r = await fetch(`/api/clients/${clientId}/onboarding`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_id: item.id, ...patch }) }); if (!r.ok) { const d = await r.json(); throw new Error(d.error || "Falha ao atualizar."); } await load(); } catch (e: any) { setError(e?.message || "Falha ao atualizar onboarding."); } }

  const overdue = data?.items.filter((item) => item.due_date && item.status !== "done" && item.due_date < new Date().toISOString().slice(0, 10)).length || 0;
  return <div className="space-y-3">
    <div className="rounded-lg border border-border/50 bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Checklist de entrada</h3>
        {data && <span className="text-[11px] text-muted-foreground">{data.progress.done}/{data.progress.total} concluídos</span>}
        {overdue > 0 && <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">{overdue} atrasado(s)</span>}
        {data && <span className="ml-auto text-sm font-bold text-emerald-600 dark:text-emerald-400">{data.progress.percent}%</span>}
      </div>
      {data && <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${data.progress.percent}%` }} /></div>}
      {error && <div className="text-[11px] text-red-500">{error}</div>}
    </div>
    {data && <div className="space-y-2">{data.items.map((item) => {
      const Icon = ONBOARDING_ICONS[item.code] || ClipboardList;
      const isOverdue = item.due_date && item.status !== "done" && item.due_date < new Date().toISOString().slice(0, 10);
      const notesKey = `${item.id}`;
      return <div key={item.id} className={cn("rounded-lg border bg-card p-3 space-y-2", item.status === "done" ? "border-emerald-500/25 bg-emerald-500/[0.03]" : isOverdue ? "border-red-500/30" : "border-border/50")}>
        <div className="flex items-start gap-2.5">
          <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg", item.status === "done" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : item.status === "blocked" ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-primary/10 text-primary")}><Icon className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <span className={cn("text-sm font-semibold", item.status === "done" && "text-muted-foreground line-through")}>{item.title}</span>
            {item.description && <div className="text-[11px] text-muted-foreground">{item.description}</div>}
          </div>
          <select value={item.status} onChange={(e) => patchItem(item, { status: e.target.value })} className={cn("w-[110px] shrink-0 rounded border border-input bg-transparent px-1 py-1 text-[10px] font-semibold", item.status === "done" ? "text-emerald-600 dark:text-emerald-400" : item.status === "blocked" ? "text-red-500" : "text-muted-foreground")}><option value="pending">Pendente</option><option value="in_progress">Em andamento</option><option value="done">Concluído</option><option value="blocked">Bloqueado</option></select>
        </div>
        <div className="grid gap-2 pl-[42px] sm:grid-cols-2">
          <Field label="Prazo"><BrDateInput value={item.due_date} onChange={(value) => patchItem(item, { due_date: value || null })} style={compactInput} /></Field>
          <Field label="Observações"><input value={notesDraft[notesKey] ?? (item.notes || "")} onChange={(e) => setNotesDraft((prev) => ({ ...prev, [notesKey]: e.target.value }))} onBlur={(e) => { if (e.target.value !== (item.notes || "")) patchItem(item, { notes: e.target.value }); }} placeholder="Nenhuma" style={compactInput} /></Field>
        </div>
        {item.status === "done" && item.completed_at && <div className="pl-[42px] text-[10px] text-emerald-600 dark:text-emerald-400">Concluído em {brDate(item.completed_at.slice(0, 10))}</div>}
        {isOverdue && <div className="pl-[42px] text-[10px] text-red-500">Prazo vencido em {brDate(item.due_date)}</div>}
      </div>;
    })}</div>}
  </div>;
}

const APPROVAL_KINDS = [
  { value: "request", label: "Solicitação geral" },
  { value: "creative", label: "Criativo" },
  { value: "copy", label: "Copy / texto" },
  { value: "budget", label: "Orçamento" },
  { value: "other", label: "Outro" },
];

function ClientApprovals({ clientId, dashboardLinkHref }: { clientId: string; dashboardLinkHref: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const [fileUrl, setFileUrl] = useState(""); const [dueDate, setDueDate] = useState(""); const [kind, setKind] = useState("request");
  const [message, setMessage] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseNote, setResponseNote] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  async function load() { try { const r = await fetch(`/api/clients/${clientId}/approvals`, { cache: "no-store" }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Falha ao carregar aprovações."); setItems(d.approvals || []); } catch (e: any) { setMessage(e?.message || "Falha ao carregar aprovações."); } }
  useEffect(() => { load(); }, [clientId]);
  async function add() { if (!title.trim()) return; const r = await fetch(`/api/clients/${clientId}/approvals`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, description, file_url: fileUrl || null, due_date: dueDate || null, kind }) }); const d = await r.json(); if (!r.ok) { setMessage(d.error || "Falha ao criar solicitação."); return; } setTitle(""); setDescription(""); setFileUrl(""); setDueDate(""); setKind("request"); setOpen(false); await load(); }
  async function setStatus(item: any, value: string, note?: string) { const r = await fetch(`/api/clients/${clientId}/approvals`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, status: value, response_note: note ?? undefined }) }); if (!r.ok) { const d = await r.json(); setMessage(d.error || "Falha ao atualizar."); return; } setRespondingId(null); setResponseNote(""); await load(); }
  async function copyClientLink() {
    setLinkBusy(true); setMessage(null);
    try {
      const r = await fetch(dashboardLinkHref); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Falha ao gerar o link.");
      await navigator.clipboard.writeText(d.url); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2500);
    } catch (e: any) { setMessage(e?.message || "Falha ao gerar o link do cliente."); }
    finally { setLinkBusy(false); }
  }

  const pending = items.filter((item) => item.status === "pending");
  const answered = items.filter((item) => item.status !== "pending");
  const statusTone: Record<string, string> = { pending: "text-amber-600 dark:text-amber-400", approved: "text-emerald-600 dark:text-emerald-400", changes_requested: "text-amber-600 dark:text-amber-400", rejected: "text-red-500" };
  const statusLabel: Record<string, string> = { pending: "Pendente", approved: "Aprovado", changes_requested: "Alteração pedida", rejected: "Rejeitado" };

  return <div className="space-y-3">
    <div className="rounded-lg border border-border/50 bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Aprovações</h3>
        {pending.length > 0 && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">{pending.length} pendente(s)</span>}
        <div className="ml-auto flex gap-1.5">
          <button onClick={copyClientLink} disabled={linkBusy} className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 px-2 py-1 text-[11px] font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-500/10 disabled:opacity-50">{linkCopied ? <Check className="h-3 w-3" /> : <Link2 className="h-3 w-3" />} {linkCopied ? "Copiado!" : linkBusy ? "Gerando…" : "Copiar link do cliente"}</button>
          <button onClick={() => setOpen((v) => !v)} className="rounded-md border border-input px-2 py-1 text-[11px] font-semibold hover:bg-muted"><Plus className="mr-1 inline h-3 w-3" /> Solicitar</button>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">O link do cliente abre o painel público onde ele aprova ou pede alteração direto, sem login.</p>
      {message && <div className="mt-2 text-[11px] text-red-500">{message}</div>}
      {open && <div className="mt-3 grid gap-2 rounded-md border border-border/50 bg-muted/20 p-2 md:grid-cols-3">
        <select value={kind} onChange={(e) => setKind(e.target.value)} style={compactInput}>{APPROVAL_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Aprovar criativo da campanha" style={compactInput} />
        <input value={dueDate} onChange={(e) => setDueDate(e.target.value)} type="date" title="Prazo de resposta" style={compactInput} />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Instruções" className="md:col-span-2" style={compactInput} />
        <input value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="Link do arquivo no Drive" style={compactInput} />
        <button onClick={add} disabled={!title.trim()} className="rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-50 md:col-span-3">Criar solicitação</button>
      </div>}
    </div>

    {pending.length > 0 && <div className="space-y-2">{pending.map((item) => {
      const isOverdue = item.due_date && item.due_date < new Date().toISOString().slice(0, 10);
      return <div key={item.id} className={cn("rounded-lg border bg-card p-3 space-y-2", isOverdue ? "border-red-500/30" : "border-amber-500/25")}>
        <div className="flex flex-wrap items-start gap-2">
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{APPROVAL_KINDS.find((k) => k.value === item.kind)?.label || item.kind}</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{item.title}</div>
            {item.description && <div className="text-[11px] text-muted-foreground">{item.description}</div>}
          </div>
          {item.file_url && <a href={item.file_url} target="_blank" rel="noreferrer" className="text-[10px] font-semibold text-primary hover:underline">ver arquivo</a>}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" /> pedido em {brDate(String(item.requested_at).slice(0, 10))}
          {item.due_date && <span className={isOverdue ? "font-semibold text-red-500" : ""}>· prazo {brDate(item.due_date)}{isOverdue ? " (vencido)" : ""}</span>}
        </div>
        {respondingId === item.id ? <div className="flex flex-wrap items-center gap-1.5">
          <input value={responseNote} onChange={(e) => setResponseNote(e.target.value)} placeholder="Nota da resposta (opcional)" style={{ ...compactInput, flex: "1 1 200px" }} />
          <button onClick={() => setStatus(item, "approved", responseNote || undefined)} className="rounded-md border border-emerald-500/30 px-2 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10">Aprovar</button>
          <button onClick={() => setStatus(item, "changes_requested", responseNote || undefined)} className="rounded-md border border-amber-500/30 px-2 py-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/10">Pedir alteração</button>
          <button onClick={() => setStatus(item, "rejected", responseNote || undefined)} className="rounded-md border border-red-500/30 px-2 py-1 text-[11px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/10">Rejeitar</button>
          <button onClick={() => { setRespondingId(null); setResponseNote(""); }} className="text-[11px] text-muted-foreground hover:text-foreground">cancelar</button>
        </div> : <button onClick={() => setRespondingId(item.id)} className="rounded-md border border-input px-2 py-1 text-[11px] font-semibold hover:bg-muted">Responder</button>}
      </div>;
    })}</div>}

    {answered.length > 0 && <div className="rounded-lg border border-border/50 bg-card p-4 space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Histórico</div>
      {answered.slice(0, 10).map((item) => <div key={item.id} className="flex flex-wrap items-center gap-2 rounded border border-border/30 px-2 py-1.5 text-[11px]">
        <span className="flex-1 min-w-0 truncate">{item.title}</span>
        {item.response_note && <span className="text-muted-foreground">· {item.response_note}</span>}
        {item.responded_at && <span className="text-muted-foreground">· {brDate(String(item.responded_at).slice(0, 10))}</span>}
        <span className={cn("font-semibold", statusTone[item.status])}>{statusLabel[item.status] || item.status}</span>
      </div>)}
    </div>}
    {!items.length && <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Nenhuma solicitação de aprovação ainda.</div>}
  </div>;
}
