"use client";

// app/admin/page.tsx
// Administração de grupos: criar/editar/excluir grupos e atribuir contas a grupos.

import { useEffect, useMemo, useState } from "react";
import {
  compareSortValues,
  SortButton,
  SortState,
  usePersistentSort,
} from "@/components/SortableHeader";

interface Group {
  id: string;
  name: string;
  color: string;
}
interface Account {
  account_id: string;
  name: string;
  status: string;
  group_id: string | null;
  platform: "meta" | "google";
  hidden?: boolean;
  linked_meta_account_id?: string | null;
}
interface ClientRecord {
  id: string;
  name: string;
  status: "active" | "paused" | "archived";
  objective: string | null;
  result_family: string | null;
  primary_kpi: string | null;
  target_value: number | null;
  monthly_budget: number | null;
  monthly_conversion_goal: number | null;
  currency: string;
  timezone: string;
  budget_start_day: number;
  accounts: Account[];
}
type ClientAdminSortKey =
  | "name"
  | "objective"
  | "budget"
  | "result"
  | "kpi"
  | "target"
  | "cycle";
type GroupSortKey = "name" | "accounts";
type AccountAdminSortKey =
  | "platform"
  | "name"
  | "status"
  | "client"
  | "group"
  | "visibility";
const CLIENT_ADMIN_SORT_KEYS: readonly ClientAdminSortKey[] = [
  "name",
  "objective",
  "budget",
  "result",
  "kpi",
  "target",
  "cycle",
];
const GROUP_SORT_KEYS: readonly GroupSortKey[] = ["name", "accounts"];
const ACCOUNT_ADMIN_SORT_KEYS: readonly AccountAdminSortKey[] = [
  "platform",
  "name",
  "status",
  "client",
  "group",
  "visibility",
];
const MONETARY_CLIENT_KPIS = new Set([
  "cpa",
  "cpl",
  "cpc",
  "cpm",
  "cost_per_result",
  "revenue",
  "custom",
]);

const PALETTE = ["#3987e5", "#16a34a", "#db2777", "#f59e0b", "#7c3aed", "#0891b2", "#dc2626", "#4b5563"];

export default function Admin() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [clientsUnavailable, setClientsUnavailable] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadRevision, setLoadRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [clientSort, setClientSort] = usePersistentSort<ClientAdminSortKey>(
    "adsctrl:sort:admin-clients",
    { key: "name", direction: "asc" },
    CLIENT_ADMIN_SORT_KEYS
  );
  const [groupSort, setGroupSort] = usePersistentSort<GroupSortKey>(
    "adsctrl:sort:admin-groups",
    { key: "name", direction: "asc" },
    GROUP_SORT_KEYS
  );
  const [accountSort, setAccountSort] = usePersistentSort<AccountAdminSortKey>(
    "adsctrl:sort:admin-accounts",
    { key: "name", direction: "asc" },
    ACCOUNT_ADMIN_SORT_KEYS
  );

  async function load() {
    setError(null);
    try {
      const [r, clientsResponse] = await Promise.all([
        fetch("/api/accounts"),
        fetch("/api/clients?status=active"),
      ]);
      const text = await r.text();
      const d = text ? JSON.parse(text) : {};
      if (!r.ok || d.error) throw new Error(d.error || `Falha ao carregar (HTTP ${r.status}).`);
      setAccounts(d.accounts || []);
      setGroups(d.groups || []);
      const clientText = await clientsResponse.text();
      const clientData = clientText ? JSON.parse(clientText) : {};
      if (clientsResponse.ok && !clientData.error) {
        setClients(clientData.clients || []);
        setClientsUnavailable(null);
      } else {
        setClients([]);
        setClientsUnavailable(clientData.error || "Execute a migração de clientes.");
      }
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar.");
    } finally {
      setLoadRevision((revision) => revision + 1);
      setLoading(false);
    }
  }

  async function refreshClients() {
    try {
      const response = await fetch("/api/clients?status=active", {
        cache: "no-store",
      });
      const text = await response.text();
      const payload = text ? JSON.parse(text) : {};
      if (!response.ok || payload.error) {
        throw new Error(payload.error || `Falha (HTTP ${response.status}).`);
      }
      setClients(payload.clients || []);
      setClientsUnavailable(null);
    } catch (cause: any) {
      setError(
        `A conta foi atualizada, mas a lista de clientes não pôde ser sincronizada: ${
          cause?.message || "tente atualizar a página"
        }.`
      );
    }
  }

  useEffect(() => {
    load();
  }, []);

  const countByGroup = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of accounts) if (a.group_id) m[a.group_id] = (m[a.group_id] || 0) + 1;
    return m;
  }, [accounts]);
  const metaAccounts = useMemo(
    () => accounts
      .filter((a) => a.platform === "meta" && !a.hidden && a.status === "ACTIVE")
      .sort((a, b) => a.name.localeCompare(b.name)),
    [accounts]
  );
  const sortedClients = useMemo(() => {
    const objectiveLabel: Record<string, string> = {
      leads: "Leads",
      sales: "Vendas",
      traffic: "Tráfego",
      engagement: "Engajamento",
      awareness: "Reconhecimento",
      app: "Aplicativo",
      other: "Outro",
    };
    const resultLabel: Record<string, string> = {
      conversoes: "Conversões",
      vendas: "Vendas",
      leads: "Leads",
      mensagens: "Mensagens",
      cadastros: "Cadastros",
      cliques: "Cliques",
      lpv: "LPV",
      engajamento: "Engajamento",
    };
    const kpiLabel: Record<string, string> = {
      cpa: "CPA",
      cpl: "CPL",
      roas: "ROAS",
      revenue: "Receita",
      conversions: "Conversões",
      ctr: "CTR",
      cpc: "CPC",
      cpm: "CPM",
      custom: "Custo / resultado personalizado",
    };
    const value = (client: ClientRecord) => {
      switch (clientSort.key) {
        case "name": return client.name;
        case "objective":
          return client.objective
            ? objectiveLabel[client.objective] || client.objective
            : null;
        case "budget": return client.monthly_budget;
        case "result":
          return client.result_family
            ? resultLabel[client.result_family] || client.result_family
            : null;
        case "kpi":
          return client.primary_kpi
            ? kpiLabel[client.primary_kpi] || client.primary_kpi
            : null;
        case "target": return client.target_value;
        case "cycle": return client.budget_start_day;
      }
    };
    return [...clients].sort((left, right) => {
      const leftValue = value(left);
      const rightValue = value(right);
      if (
        clientSort.key === "budget" ||
        clientSort.key === "target"
      ) {
        const leftMissing =
          leftValue == null ||
          (typeof leftValue === "number" && Number.isNaN(leftValue));
        const rightMissing =
          rightValue == null ||
          (typeof rightValue === "number" && Number.isNaN(rightValue));
        if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
      }
      if (
        clientSort.key === "budget" &&
        left.currency !== right.currency
      ) {
        return compareSortValues(left.currency, right.currency, "asc");
      }
      if (
        clientSort.key === "target" &&
        left.primary_kpi !== right.primary_kpi
      ) {
        return compareSortValues(
          left.primary_kpi,
          right.primary_kpi,
          "asc"
        );
      }
      if (
        clientSort.key === "target" &&
        MONETARY_CLIENT_KPIS.has(left.primary_kpi || "") &&
        left.currency !== right.currency
      ) {
        return compareSortValues(left.currency, right.currency, "asc");
      }
      return (
        compareSortValues(
          leftValue,
          rightValue,
          clientSort.direction
        ) || compareSortValues(left.name, right.name, "asc")
      );
    });
  }, [clients, clientSort]);
  const sortedGroups = useMemo(() => {
    const value = (group: Group) =>
      groupSort.key === "name"
        ? group.name
        : countByGroup[group.id] || 0;
    return [...groups].sort((left, right) =>
      compareSortValues(value(left), value(right), groupSort.direction) ||
      compareSortValues(left.name, right.name, "asc")
    );
  }, [groups, countByGroup, groupSort]);
  const sortedAccounts = useMemo(() => {
    const groupName = (account: Account) =>
      groups.find((group) => group.id === account.group_id)?.name || null;
    const clientName = (account: Account) =>
      account.platform === "google"
        ? accounts.find(
            (candidate) =>
              candidate.account_id === account.linked_meta_account_id
          )?.name || null
        : "Conta principal";
    const value = (account: Account) => {
      switch (accountSort.key) {
        case "platform": return account.platform;
        case "name": return account.name;
        case "status":
          return `${account.status === "ACTIVE" ? "0" : "1"}-${account.status}`;
        case "client": return clientName(account);
        case "group": return groupName(account);
        case "visibility": return account.hidden ? 1 : 0;
      }
    };
    return [...accounts].sort((left, right) =>
      compareSortValues(
        value(left),
        value(right),
        accountSort.direction
      ) || compareSortValues(left.name, right.name, "asc")
    );
  }, [accounts, groups, accountSort]);

  async function api(url: string, opts: RequestInit): Promise<any> {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
      const text = await r.text();
      const d = text ? JSON.parse(text) : {};
      if (!r.ok || d.error) throw new Error(d.error || `Falha (HTTP ${r.status}).`);
      return d;
    } finally {
      setBusy(false);
    }
  }

  async function createGroup() {
    const name = newName.trim();
    if (!name) return;
    try {
      await api("/api/groups", { method: "POST", body: JSON.stringify({ name, color: newColor }) });
      setNewName("");
      await load();
    } catch (e: any) {
      setError(e?.message);
    }
  }

  async function updateGroup(id: string, patch: Partial<Group>) {
    try {
      await api("/api/groups", { method: "PATCH", body: JSON.stringify({ id, ...patch }) });
      await load();
    } catch (e: any) {
      await load();
      setError(e?.message);
    }
  }

  async function deleteGroup(id: string, name: string) {
    if (!confirm(`Excluir o grupo "${name}"? As contas ficarão sem grupo.`)) return;
    try {
      await api(`/api/groups?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setError(e?.message);
    }
  }

  async function assignAccount(account_id: string, group_id: string) {
    // otimista: atualiza local antes do refetch
    setAccounts((prev) =>
      prev.map((a) => (a.account_id === account_id ? { ...a, group_id: group_id || null } : a))
    );
    try {
      await api("/api/accounts/group", {
        method: "POST",
        body: JSON.stringify({ account_id, group_id: group_id || null }),
      });
    } catch (e: any) {
      setError(e?.message);
      await load(); // reverte em caso de erro
    }
  }

  async function toggleAccount(account_id: string, hidden: boolean) {
    setAccounts((prev) => prev.map((a) => a.account_id === account_id ? { ...a, hidden } : a));
    try {
      await api("/api/accounts/hidden", {
        method: "POST",
        body: JSON.stringify({ account_id, hidden }),
      });
      await refreshClients();
    } catch (e: any) {
      setError(e?.message);
      await load();
    }
  }

  async function linkGoogle(google_account_id: string, meta_account_id: string) {
    const linked = meta_account_id || null;
    setAccounts((prev) => prev.map((a) =>
      a.account_id === google_account_id ? { ...a, linked_meta_account_id: linked } : a
    ));
    try {
      await api("/api/accounts/link", {
        method: "POST",
        body: JSON.stringify({ google_account_id, meta_account_id: linked }),
      });
      await refreshClients();
    } catch (e: any) {
      setError(e?.message);
      await load();
    }
  }

  async function sync(platform: "meta" | "google") {
    try {
      const result = await api("/api/accounts/sync", {
        method: "POST",
        body: JSON.stringify({ platform }),
      });
      await load();
      setError(result.added
        ? `${result.added} conta(s) nova(s) encontrada(s). Ative abaixo as que deseja coletar.`
        : `Sincronização ${platform === "meta" ? "Meta" : "Google"} concluída sem contas novas.`);
    } catch (e: any) {
      setError(e?.message);
    }
  }

  async function updateClient(id: string, patch: Partial<ClientRecord>) {
    setClients((prev) => prev.map((client) => client.id === id ? { ...client, ...patch } : client));
    try {
      const result = await api(`/api/clients/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      const confirmed = Object.keys(patch).reduce((next, key) => {
        const field = key as keyof ClientRecord;
        (next as any)[field] = result.client?.[field] ?? patch[field];
        return next;
      }, {} as Partial<ClientRecord>);
      setClients((prev) =>
        prev.map((client) =>
          client.id === id ? { ...client, ...confirmed } : client
        )
      );
    } catch (e: any) {
      await load();
      setError(e?.message);
    }
  }

  if (loading) return <div style={{ padding: 40, fontFamily: "system-ui" }}>Carregando administração…</div>;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>Contas e grupos</h1>
          <p style={{ margin: "4px 0 0", color: "#6b6b6b", fontSize: 14 }}>
            Escolha quais contas coletar e organize as {accounts.length} contas em grupos.
          </p>
        </div>
        <a href="/" style={{ fontSize: 14, color: "#3987e5", textDecoration: "none" }}>
          ← Voltar ao overview
        </a>
      </header>

      {error && (
        <div style={{ background: "#fceceb", color: "#a32d2d", padding: "10px 14px", borderRadius: 8, marginBottom: 20, fontSize: 14 }}>
          {error}
        </div>
      )}

      <section id="clients" style={{ marginBottom: 36, scrollMarginTop: 80 }}>
        <h2 style={{ fontSize: 16, fontWeight: 650, margin: "0 0 6px" }}>Metas e orçamento por cliente</h2>
        <p style={{ color: "#777", fontSize: 13, margin: "0 0 14px" }}>
          Esses valores alimentam o pacing, a projeção mensal e os alertas do Cockpit Hoje.
        </p>
        {clientsUnavailable ? (
          <div style={{ background: "#fff8eb", border: "1px solid #f1dfbd", borderRadius: 10, padding: "12px 14px", color: "#8a5b16", fontSize: 13 }}>
            Fundação de clientes ainda não aplicada: {clientsUnavailable}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 940, display: "grid", gap: 9 }}>
              <div style={{ display: "grid", gridTemplateColumns: CLIENT_GRID, gap: 9, alignItems: "center", padding: "9px 14px", color: "#888", background: "#fafaf9", border: "1px solid #e9e9e6", borderRadius: 10, fontSize: 10, fontWeight: 750, textTransform: "uppercase", letterSpacing: 0.25 }}>
                <SortButton column="name" sort={clientSort} onSort={setClientSort} align="left">Cliente / canais</SortButton>
                <SortButton column="objective" sort={clientSort} onSort={setClientSort} align="left">Objetivo</SortButton>
                <SortButton column="budget" sort={clientSort} onSort={setClientSort} align="left" initialDirection="desc">Orçamento</SortButton>
                <SortButton column="result" sort={clientSort} onSort={setClientSort} align="left">Resultado</SortButton>
                <SortButton column="kpi" sort={clientSort} onSort={setClientSort} align="left">KPI</SortButton>
                <SortButton column="target" sort={clientSort} onSort={setClientSort} align="left" initialDirection="desc">Meta</SortButton>
                <SortButton column="cycle" sort={clientSort} onSort={setClientSort} align="left">Ciclo</SortButton>
              </div>
            {sortedClients.map((client) => (
              <div key={client.id} style={{ display: "grid", gridTemplateColumns: CLIENT_GRID, gap: 9, alignItems: "end", border: "1px solid #e9e9e6", borderRadius: 12, padding: "12px 14px", background: "#fff" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{client.name}</div>
                  <div style={{ display: "flex", gap: 5, marginTop: 5 }}>
                    {(client.accounts || []).map((account) => (
                      <span key={account.account_id} title={account.name} style={{ fontSize: 9, fontWeight: 750, textTransform: "uppercase", padding: "2px 6px", borderRadius: 6, color: account.platform === "google" ? "#2f6fcd" : "#176cd2", background: "#edf3fd" }}>{account.platform}</span>
                    ))}
                  </div>
                </div>
                <Field label="Objetivo">
                  <select value={client.objective || ""} onChange={(e) => updateClient(client.id, { objective: e.target.value || null })} style={compactInput}>
                    <option value="">— selecionar —</option>
                    <option value="leads">Leads</option>
                    <option value="sales">Vendas</option>
                    <option value="traffic">Tráfego</option>
                    <option value="engagement">Engajamento</option>
                    <option value="awareness">Reconhecimento</option>
                    <option value="app">Aplicativo</option>
                    <option value="other">Outro</option>
                  </select>
                </Field>
                <Field label={`Orçamento mensal · ${client.currency || "BRL"}`}>
                  <input key={`${client.id}-budget-${loadRevision}-${client.monthly_budget ?? ""}`} type="number" min="0" step="10" defaultValue={client.monthly_budget ?? ""} placeholder={`${client.currency || "BRL"} 0`} onBlur={(e) => updateClient(client.id, { monthly_budget: e.target.value ? Number(e.target.value) : null })} style={compactInput} />
                </Field>
                <Field label="Resultado">
                  <select value={client.result_family || ""} onChange={(e) => updateClient(client.id, { result_family: e.target.value || null })} style={compactInput}>
                    <option value="">Automático</option>
                    <option value="conversoes">Conversões</option>
                    <option value="vendas">Vendas</option>
                    <option value="leads">Leads</option>
                    <option value="mensagens">Mensagens</option>
                    <option value="cadastros">Cadastros</option>
                    <option value="cliques">Cliques</option>
                    <option value="lpv">LPV</option>
                    <option value="engajamento">Engajamento</option>
                  </select>
                </Field>
                <Field label="KPI principal">
                  <select
                    value={client.primary_kpi || ""}
                    onChange={(e) =>
                      updateClient(client.id, {
                        primary_kpi: e.target.value || null,
                        target_value: null,
                      })
                    }
                    title="Ao trocar o tipo de KPI, a meta anterior é limpa para evitar reinterpretar moeda como percentual ou ROAS."
                    style={compactInput}
                  >
                    <option value="">— selecionar —</option>
                    <option value="cpl">CPL</option>
                    <option value="cpa">CPA</option>
                    <option value="roas">ROAS</option>
                    <option value="revenue">Receita</option>
                    <option value="conversions">Conversões</option>
                    <option value="ctr">CTR</option>
                    <option value="cpc">CPC</option>
                    <option value="cpm">CPM</option>
                    <option value="custom">Custo / resultado personalizado</option>
                  </select>
                </Field>
                <Field
                  label={`Meta do KPI${
                    MONETARY_CLIENT_KPIS.has(
                      client.primary_kpi?.toLowerCase() || ""
                    )
                      ? ` · ${client.currency || "BRL"}`
                      : client.primary_kpi?.toLowerCase() === "ctr"
                        ? " · %"
                        : client.primary_kpi?.toLowerCase() === "roas"
                          ? " · x"
                          : ""
                  }`}
                >
                  <input
                    key={`${client.id}-target-${loadRevision}-${client.target_value ?? ""}`}
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={client.target_value ?? ""}
                    placeholder={
                      MONETARY_CLIENT_KPIS.has(
                        client.primary_kpi?.toLowerCase() || ""
                      )
                        ? `${client.currency || "BRL"} 0,00`
                        : client.primary_kpi?.toLowerCase() === "ctr"
                          ? "0,00%"
                          : client.primary_kpi?.toLowerCase() === "roas"
                            ? "0,00x"
                            : "0,00"
                    }
                    onBlur={(e) => updateClient(client.id, { target_value: e.target.value ? Number(e.target.value) : null })}
                    style={compactInput}
                  />
                </Field>
                <Field label="Início do ciclo">
                  <select value={client.budget_start_day || 1} onChange={(e) => updateClient(client.id, { budget_start_day: Number(e.target.value) })} style={compactInput}>
                    {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                      <option key={day} value={day}>Dia {day}</option>
                    ))}
                  </select>
                </Field>
              </div>
            ))}
            {!clients.length && <div style={{ color: "#999", fontSize: 13 }}>Nenhum cliente ativo.</div>}
            </div>
          </div>
        )}
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>Sincronizar plataformas</h2>
        <p style={{ color: "#777", fontSize: 13, margin: "0 0 12px" }}>
          Contas novas entram desativadas. Nenhuma métrica será consultada até você ativá-las.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button disabled={busy} onClick={() => sync("meta")} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #d8e6fb", background: "#f5f9ff", color: "#1877f2", cursor: "pointer" }}>
            Sincronizar Meta
          </button>
          <button disabled={busy} onClick={() => sync("google")} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #eee", background: "#fff", color: "#4285f4", cursor: "pointer" }}>
            Sincronizar Google
          </button>
        </div>
      </section>

      {/* CRIAR GRUPO */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 12px" }}>Novo grupo</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createGroup()}
            placeholder="Nome do grupo (ex: Cliente X)"
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, minWidth: 260 }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                aria-label={`cor ${c}`}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: c,
                  border: newColor === c ? "2px solid #111" : "2px solid transparent",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
          <button
            onClick={createGroup}
            disabled={busy || !newName.trim()}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: newName.trim() ? "#111" : "#ccc",
              color: "#fff",
              fontSize: 14,
              cursor: newName.trim() ? "pointer" : "default",
            }}
          >
            Criar
          </button>
        </div>
      </section>

      {/* LISTA DE GRUPOS */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 12px" }}>Grupos ({groups.length})</h2>
        {groups.length === 0 ? (
          <p style={{ color: "#888", fontSize: 14 }}>Nenhum grupo ainda. Crie o primeiro acima.</p>
        ) : (
          <div style={{ border: "1px solid #eee", borderRadius: 12, overflowX: "auto" }}>
            <div style={{ minWidth: 500 }}>
              <div style={{ display: "grid", gridTemplateColumns: GROUP_GRID, alignItems: "center", gap: 12, padding: "9px 16px", color: "#888", background: "#fafaf9", borderBottom: "1px solid #eee", fontSize: 10, fontWeight: 750, textTransform: "uppercase", letterSpacing: 0.25 }}>
              <span>Cor</span>
              <SortButton column="name" sort={groupSort} onSort={setGroupSort} align="left">Grupo</SortButton>
              <SortButton column="accounts" sort={groupSort} onSort={setGroupSort} initialDirection="desc">Contas</SortButton>
              <span style={{ textAlign: "right" }}>Ação</span>
              </div>
              {sortedGroups.map((g) => (
                <div
                  key={g.id}
                  style={{
                    padding: "12px 16px",
                    borderTop: "1px solid #f0f0f0",
                    display: "grid",
                    gridTemplateColumns: GROUP_GRID,
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <input
                    type="color"
                    value={g.color}
                    onChange={(e) => updateGroup(g.id, { color: e.target.value })}
                    style={{ width: 28, height: 28, border: "none", background: "none", cursor: "pointer", padding: 0 }}
                  />
                  <input
                    key={`${g.id}-name-${loadRevision}-${g.name}`}
                    defaultValue={g.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== g.name) updateGroup(g.id, { name: v });
                    }}
                    style={{ width: "100%", boxSizing: "border-box", padding: "6px 10px", borderRadius: 6, border: "1px solid #eee", fontSize: 14 }}
                  />
                  <span style={{ fontSize: 13, color: "#888", textAlign: "right" }}>
                    {countByGroup[g.id] || 0} conta(s)
                  </span>
                  <button
                    onClick={() => deleteGroup(g.id, g.name)}
                    disabled={busy}
                    style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #f0d0d0", background: "#fff", color: "#a32d2d", fontSize: 13, cursor: "pointer" }}
                  >
                    Excluir
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ATRIBUIR CONTAS */}
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 6px" }}>Contas: coleta, cliente e grupo</h2>
        <p style={{ color: "#777", fontSize: 13, margin: "0 0 12px" }}>
          Ativa = aparece no dashboard e tem dados coletados. Oculta = não gera chamadas à API.
        </p>
        <div style={{ border: "1px solid #eee", borderRadius: 12, overflowX: "auto" }}>
          <div style={{ minWidth: 1020 }}>
            <div style={{ display: "grid", gridTemplateColumns: ACCOUNT_GRID, alignItems: "center", gap: 12, padding: "9px 16px", color: "#888", background: "#fafaf9", borderBottom: "1px solid #eee", fontSize: 10, fontWeight: 750, textTransform: "uppercase", letterSpacing: 0.25 }}>
              <SortButton column="platform" sort={accountSort} onSort={setAccountSort} align="left">Plataforma</SortButton>
              <SortButton column="name" sort={accountSort} onSort={setAccountSort} align="left">Conta</SortButton>
              <SortButton column="status" sort={accountSort} onSort={setAccountSort} align="left">Status</SortButton>
              <SortButton column="client" sort={accountSort} onSort={setAccountSort} align="left">Cliente Meta</SortButton>
              <SortButton column="group" sort={accountSort} onSort={setAccountSort} align="left">Grupo</SortButton>
              <SortButton column="visibility" sort={accountSort} onSort={setAccountSort}>Coleta</SortButton>
            </div>
          {sortedAccounts.map((a) => (
              <div
                key={a.account_id}
                style={{
                  padding: "10px 16px",
                  borderTop: "1px solid #f0f0f0",
                  display: "grid",
                  gridTemplateColumns: ACCOUNT_GRID,
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: a.platform === "google" ? "#4285f4" : "#1877f2", textTransform: "uppercase" }}>
                  {a.platform}
                </span>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14 }} title={a.name}>{a.name}</span>
                <span style={{ fontSize: 11, color: a.status === "ACTIVE" ? "#27874e" : "#a32d2d" }}>
                  ● {a.status}
                </span>
                {a.platform === "google" ? (
                  <select
                    value={a.linked_meta_account_id || ""}
                    onChange={(e) => linkGoogle(a.account_id, e.target.value)}
                    title="Conta Meta que representa este cliente"
                    style={{ width: "100%", boxSizing: "border-box", padding: "6px 10px", borderRadius: 6, border: "1px solid #cfdcf1", fontSize: 13, color: "#315b91" }}
                  >
                    <option value="">— vincular ao cliente Meta —</option>
                    {metaAccounts.map((meta) => (
                      <option key={meta.account_id} value={meta.account_id}>{meta.name}</option>
                    ))}
                  </select>
                ) : (
                  <span style={{ color: "#999", fontSize: 12 }}>Conta principal</span>
                )}
                <select
                  value={a.group_id || ""}
                  onChange={(e) => assignAccount(a.account_id, e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", padding: "6px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 14 }}
                >
                  <option value="">— sem grupo —</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => toggleAccount(a.account_id, !a.hidden)}
                  disabled={busy}
                  style={{
                    width: "100%", padding: "6px 10px", borderRadius: 7,
                    border: a.hidden ? "1px solid #ddd" : "1px solid #b7e0c4",
                    background: a.hidden ? "#f7f7f7" : "#effaf2",
                    color: a.hidden ? "#777" : "#167a37", fontSize: 12, cursor: "pointer",
                  }}
                >
                  {a.hidden ? "Ativar" : "✓ Ativa"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={{ fontSize: 10, color: "#888", fontWeight: 650, textTransform: "uppercase", letterSpacing: 0.25 }}>{label}</span>
      {children}
    </label>
  );
}

const compactInput: React.CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  height: 34,
  padding: "0 9px",
  border: "1px solid #dededb",
  borderRadius: 7,
  background: "#fff",
  color: "#333",
  fontSize: 12,
};

const CLIENT_GRID =
  "minmax(160px,1.2fr) 110px 135px 130px 120px 100px 86px";
const GROUP_GRID = "40px minmax(180px,1fr) 110px 84px";
const ACCOUNT_GRID =
  "76px minmax(180px,1fr) 120px 230px 190px 92px";
