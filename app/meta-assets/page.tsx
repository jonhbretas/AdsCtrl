"use client";

import { useEffect, useMemo, useState } from "react";
import {
  compareSortValues,
  SortButton,
  SortState,
  usePersistentSort,
} from "@/components/SortableHeader";

type Connection = {
  index: number;
  user_id: string | null;
  name: string;
  status: "ok" | "partial" | "error";
  error: string | null;
  account_count: number;
  business_count: number;
};

type Business = {
  id: string;
  name: string;
  verification_status?: string;
  created_time?: string;
  connection_indexes: number[];
};

type MetaAccount = {
  account_id: string;
  name: string;
  status: string;
  status_code: number;
  disable_reason: number | null;
  currency: string;
  timezone: string | null;
  business: { id: string | null; name: string | null } | null;
  connection_indexes: number[];
  is_prepaid: boolean;
  available_balance: number | null;
  billing_balance: number;
  payment_summary: string | null;
  spend_today: number;
  spend_7d: number;
  metrics_available: boolean;
  metric_range: { since: string; until: string };
  amount_spent: number;
  spend_cap: number | null;
  spend_cap_remaining: number | null;
  min_daily_budget: number | null;
  permissions: string[];
  catalog: { synced: boolean; hidden: boolean | null; status: string | null };
};

type Payload = {
  generated_at: string;
  scope: "account" | "all";
  requested_account_id: string | null;
  range: { since: string; until: string };
  range_uses_account_timezone: boolean;
  limitations: { daily_spend_limit: string; secrets: string };
  connections: Connection[];
  businesses: Business[];
  accounts: MetaAccount[];
  error?: string;
};

type CatalogAccount = {
  account_id: string;
  name: string;
  status: string;
  hidden: boolean;
  currency: string;
};
type MetaSortKey =
  | "account"
  | "status"
  | "today"
  | "spend7d"
  | "prepaidAvailable"
  | "postpaidOutstanding"
  | "amountSpent"
  | "spendCap"
  | "payment"
  | "connection";

const DEFAULT_SORT: SortState<MetaSortKey> = {
  key: "account",
  direction: "asc",
};
const META_SORT_KEYS: readonly MetaSortKey[] = [
  "account",
  "status",
  "today",
  "spend7d",
  "prepaidAvailable",
  "postpaidOutstanding",
  "amountSpent",
  "spendCap",
  "payment",
  "connection",
];

const statusLabel: Record<string, string> = {
  ACTIVE: "Ativa",
  DISABLED: "Desativada",
  UNSETTLED: "Pagamento pendente",
  PENDING_RISK_REVIEW: "Em análise de risco",
  PENDING_SETTLEMENT: "Liquidação pendente",
  IN_GRACE_PERIOD: "Período de tolerância",
  PENDING_CLOSURE: "Fechamento pendente",
  CLOSED: "Fechada",
  UNKNOWN: "Status desconhecido",
};

const money = (value: number | null, currency: string) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: currency || "BRL",
        maximumFractionDigits: 2,
      }).format(value);

const number = (value: number) =>
  value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export default function MetaAssetsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [catalog, setCatalog] = useState<CatalogAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [loadedTarget, setLoadedTarget] = useState<string | "all" | null>(null);
  const [pendingTarget, setPendingTarget] = useState<string | "all" | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "issues">("all");
  const [connection, setConnection] = useState("all");
  const [sort, setSort] = usePersistentSort<MetaSortKey>(
    "adsctrl:sort:meta-assets",
    DEFAULT_SORT,
    META_SORT_KEYS
  );
  const [copied, setCopied] = useState<string | null>(null);

  async function load(target?: string | "all") {
    const requested = target || loadedTarget || selectedAccount;
    if (!requested) return;
    setLoading(true);
    setPendingTarget(requested);
    setError(null);
    setData(null);
    if (requested !== loadedTarget) {
      setSearch("");
      setStatus("all");
      setConnection("all");
    }
    setLoadedTarget(null);
    try {
      const url =
        requested === "all"
          ? "/api/meta/assets"
          : `/api/meta/assets?account_id=${encodeURIComponent(requested)}`;
      const response = await fetch(url, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || payload.error) {
        throw new Error(payload.error || "Falha ao carregar ativos Meta.");
      }
      setData(payload);
      setLoadedTarget(requested);
    } catch (loadError: any) {
      setError(loadError?.message || "Falha ao carregar ativos Meta.");
    } finally {
      setLoading(false);
      setPendingTarget(null);
    }
  }

  useEffect(() => {
    let alive = true;
    setCatalogLoading(true);
    fetch("/api/meta/assets?mode=catalog", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || payload.error) {
          throw new Error(payload.error || "Falha ao carregar catálogo Meta.");
        }
        return payload.accounts || [];
      })
      .then((rows: CatalogAccount[]) => {
        if (!alive) return;
        setCatalog(rows);
        const preferred =
          rows.find((account) => !account.hidden && account.status === "ACTIVE") ||
          rows[0];
        if (preferred) setSelectedAccount(preferred.account_id);
      })
      .catch((catalogError: any) => {
        if (alive) setError(catalogError?.message || "Falha ao carregar catálogo Meta.");
      })
      .finally(() => {
        if (alive) setCatalogLoading(false);
      });
    return () => { alive = false; };
  }, []);

  const accounts = useMemo(() => {
    let rows = [...(data?.accounts || [])];
    if (status === "active") rows = rows.filter((account) => account.status === "ACTIVE");
    if (status === "issues") rows = rows.filter((account) => account.status !== "ACTIVE");
    if (connection !== "all") {
      rows = rows.filter((account) =>
        account.connection_indexes.includes(Number(connection))
      );
    }
    if (search.trim()) {
      const query = search.trim().toLowerCase();
      rows = rows.filter((account) =>
        `${account.name} ${account.account_id} ${account.business?.name || ""}`
          .toLowerCase()
          .includes(query)
      );
    }
    const statusRank: Record<string, number> = {
      ACTIVE: 0,
      IN_GRACE_PERIOD: 1,
      PENDING_SETTLEMENT: 2,
      UNSETTLED: 3,
      PENDING_RISK_REVIEW: 4,
      DISABLED: 5,
      PENDING_CLOSURE: 6,
      CLOSED: 7,
      UNKNOWN: 8,
    };
    const value = (account: MetaAccount) => {
      switch (sort.key) {
        case "account": return account.name;
        case "status": return statusRank[account.status] ?? 99;
        case "today":
          return account.metrics_available ? account.spend_today : null;
        case "spend7d":
          return account.metrics_available ? account.spend_7d : null;
        case "prepaidAvailable":
          return account.is_prepaid ? account.available_balance : null;
        case "postpaidOutstanding":
          return account.is_prepaid ? null : account.billing_balance;
        case "amountSpent": return account.amount_spent;
        case "spendCap": return account.spend_cap;
        case "payment": return account.payment_summary;
        case "connection": return account.connection_indexes[0] ?? null;
      }
    };
    const monetary = new Set<MetaSortKey>([
      "today",
      "spend7d",
      "prepaidAvailable",
      "postpaidOutstanding",
      "amountSpent",
      "spendCap",
    ]);
    return rows.sort((left, right) => {
      const leftValue = value(left);
      const rightValue = value(right);
      if (monetary.has(sort.key)) {
        const leftMissing =
          leftValue == null ||
          (typeof leftValue === "number" && Number.isNaN(leftValue));
        const rightMissing =
          rightValue == null ||
          (typeof rightValue === "number" && Number.isNaN(rightValue));
        if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
        const currencyOrder = compareSortValues(
          left.currency,
          right.currency,
          "asc"
        );
        if (currencyOrder) return currencyOrder;
      }
      return (
        compareSortValues(leftValue, rightValue, sort.direction) ||
        compareSortValues(left.name, right.name, "asc")
      );
    });
  }, [data, status, connection, search, sort]);

  const totals = useMemo(() => {
    const rows = data?.accounts || [];
    return {
      active: rows.filter((account) => account.status === "ACTIVE").length,
      issues: rows.filter((account) => account.status !== "ACTIVE").length,
      today: rows.reduce((sum, account) => sum + account.spend_today, 0),
      spend7d: rows.reduce((sum, account) => sum + account.spend_7d, 0),
      prepaid: rows.filter((account) => account.is_prepaid).length,
      metricsUnavailable: rows.filter((account) => !account.metrics_available).length,
      currency:
        new Set(rows.map((account) => account.currency)).size === 1
          ? rows[0]?.currency || "BRL"
          : null,
    };
  }, [data]);

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1_600);
    } catch {
      window.prompt("Copie o valor:", value);
    }
  }

  function exportCsv() {
    const columns = [
      "Conta",
      "ID",
      "BM",
      "ID BM",
      "Status",
      "Moeda",
      "Gasto hoje",
      "Gasto 7d",
      "Saldo disponível",
      "Saldo em aberto",
      "Gasto acumulado",
      "Limite total",
      "Restante do limite",
      "Pré-paga",
      "Forma de pagamento",
      "Conexões",
    ];
    const escape = (value: unknown) => {
      const raw = String(value ?? "");
      const safe =
        typeof value === "string" && /^[=+\-@]/.test(raw.trimStart())
          ? `'${raw}`
          : raw;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const lines = accounts.map((account) =>
      [
        account.name,
        account.account_id,
        account.business?.name,
        account.business?.id,
        statusLabel[account.status] || account.status,
        account.currency,
        account.metrics_available ? account.spend_today : "",
        account.metrics_available ? account.spend_7d : "",
        account.is_prepaid ? account.available_balance : "",
        account.is_prepaid ? "" : account.billing_balance,
        account.amount_spent,
        account.spend_cap,
        account.spend_cap_remaining,
        account.is_prepaid ? "sim" : "não",
        account.payment_summary,
        account.connection_indexes.map((index) => index + 1).join(", "),
      ]
        .map(escape)
        .join(";")
    );
    const blob = new Blob(["\uFEFF", columns.map(escape).join(";"), "\n", lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `adsctrl-raio-x-meta-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ maxWidth: 1540, margin: "0 auto", padding: "26px 22px 60px", fontFamily: "system-ui, -apple-system, sans-serif", color: "#171716" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 18, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#777", letterSpacing: 0.7, textTransform: "uppercase" }}>Central de ativos</div>
          <h1 style={{ fontSize: 29, margin: "4px 0 0", letterSpacing: -0.8 }}>Raio-X Meta</h1>
          <p style={{ margin: "6px 0 0", color: "#777", fontSize: 13 }}>
            Perfis conectados, BMs, contas, cobrança e performance operacional em uma tela.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 9.5, fontWeight: 750, color: "#888", textTransform: "uppercase" }}>Conta Meta</span>
            <select
              value={selectedAccount}
              onChange={(event) => setSelectedAccount(event.target.value)}
              disabled={catalogLoading || !catalog.length}
              style={{ ...inputStyle, minWidth: 245 }}
            >
              {catalogLoading && <option>Carregando catálogo…</option>}
              {!catalogLoading && !catalog.length && <option>Nenhuma conta visível sincronizada</option>}
              {catalog.map((account) => (
                <option key={account.account_id} value={account.account_id}>
                  {account.name} · {statusLabel[account.status] || account.status} · {account.account_id}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => load(selectedAccount)} disabled={loading || !selectedAccount} style={{ ...buttonStyle, background: "#111", color: "#fff", borderColor: "#111" }}>
            {loading && pendingTarget !== "all" ? "Consultando…" : "Consultar conta"}
          </button>
          <button onClick={() => load("all")} disabled={loading} style={buttonStyle}>
            {loading && pendingTarget === "all" ? "Consultando todas…" : "Consultar todas"}
          </button>
          <button onClick={exportCsv} disabled={!accounts.length} style={buttonStyle}>Exportar CSV</button>
          {loadedTarget && <button onClick={() => load(loadedTarget)} disabled={loading} style={buttonStyle}>↻ Atualizar resultado</button>}
        </div>
      </header>

      {error && <div style={{ padding: "12px 14px", background: "#fff4f2", color: "#a33f37", border: "1px solid #efcbc6", borderRadius: 11, marginBottom: 14 }}>{error}</div>}
      {loading && !data && <div style={{ padding: 70, color: "#999", textAlign: "center" }}>Consultando conexões, BM e dados da conta pela API oficial da Meta…</div>}
      {!loading && !data && !error && (
        <div style={{ padding: "70px 24px", border: "1px dashed #dededb", borderRadius: 14, color: "#777", textAlign: "center", background: "#fbfbfa" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#333" }}>Escolha como consultar</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>Selecione uma conta para um diagnóstico rápido ou use “Consultar todas” para uma auditoria geral.</div>
        </div>
      )}

      {data && (
        <>
          <div style={{ padding: "9px 12px", borderRadius: 10, background: "#f7f7f5", border: "1px solid #e8e8e5", color: "#666", fontSize: 11, marginBottom: 12 }}>
            Resultado atual: <strong style={{ color: "#333" }}>{data.scope === "all" ? "todas as contas visíveis" : data.accounts[0]?.name || "conta selecionada"}</strong>
            {" · "}atualizado em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(data.generated_at))}
          </div>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", gap: 9, marginBottom: 14 }}>
            <Summary label="Conexões" value={String(data.connections.length)} />
            <Summary label="Business Managers" value={String(data.businesses.length)} />
            <Summary label="Contas ativas" value={`${totals.active}/${data.accounts.length}`} tone="good" />
            <Summary label="Com problema" value={String(totals.issues)} tone={totals.issues ? "bad" : "good"} />
            <Summary label="Gasto hoje" value={totals.currency ? money(totals.today, totals.currency) : "Moedas mistas"} />
            <Summary label="Gasto 7d" value={totals.currency ? money(totals.spend7d, totals.currency) : "Moedas mistas"} />
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "minmax(280px,.72fr) minmax(420px,1.28fr)", gap: 12, marginBottom: 14 }}>
            <div style={panelStyle}>
              <PanelTitle title="Conexões autorizadas" subtitle="Identidade e alcance de cada token, sem expor a credencial" />
              <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                {data.connections.map((item) => (
                  <div key={item.index} title={item.error || ""} style={{ display: "grid", gridTemplateColumns: "32px 1fr auto", gap: 10, alignItems: "center", border: "1px solid #ececea", borderRadius: 10, padding: 10 }}>
                    <span style={{ width: 30, height: 30, borderRadius: 9, background: "#eaf2fd", color: "#176bd0", display: "grid", placeItems: "center", fontWeight: 800 }}>{item.index + 1}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                      <div style={{ fontSize: 10.5, color: "#999", marginTop: 2 }}>{item.account_count} contas · {item.business_count} BMs</div>
                    </div>
                    <StatusPill status={item.status} />
                  </div>
                ))}
              </div>
            </div>
            <div style={panelStyle}>
              <PanelTitle title="Business Managers" subtitle="Portfólios acessíveis pelas conexões configuradas" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 8, marginTop: 12, maxHeight: 180, overflowY: "auto" }}>
                {data.businesses.map((business) => (
                  <a
                    key={business.id}
                    href={`https://business.facebook.com/settings?business_id=${encodeURIComponent(business.id)}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ border: "1px solid #ececea", borderRadius: 10, padding: 10, color: "#222", textDecoration: "none" }}
                  >
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{business.name}</div>
                    <div style={{ display: "flex", gap: 7, marginTop: 4, fontSize: 10, color: "#999" }}>
                      <span>ID {business.id}</span>
                      {business.verification_status && <span>· {business.verification_status.replace(/_/g, " ")}</span>}
                    </div>
                  </a>
                ))}
                {!data.businesses.length && <span style={{ color: "#999", fontSize: 12 }}>Nenhuma BM retornada. A conexão pode não ter permissão business_management.</span>}
              </div>
            </div>
          </section>

          <div style={{ padding: "10px 12px", borderRadius: 10, background: "#f6f8fb", border: "1px solid #e4e9f0", color: "#657080", fontSize: 11, lineHeight: 1.45, marginBottom: 12 }}>
            <strong>Leitura correta:</strong> saldo disponível aparece somente para contas pré-pagas; saldo em aberto aparece somente para contas pós-pagas. O limite exibido abaixo é o limite total de gastos da conta (`spend_cap`). O limite diário interno definido pela Meta não é disponibilizado pela API oficial. Tokens e cookies nunca saem do servidor.
            {totals.metricsUnavailable > 0 && <> {totals.metricsUnavailable} conta(s) ficaram com métricas indisponíveis nesta consulta; elas não foram convertidas em zero.</>}
          </div>

          <section style={{ ...panelStyle, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", display: "flex", alignItems: "end", gap: 8, flexWrap: "wrap", borderBottom: "1px solid #ececea" }}>
              <div style={{ marginRight: 6 }}><PanelTitle title="Contas de anúncios" subtitle={`${accounts.length} contas no filtro · ${data.scope === "account" ? "consulta específica" : "auditoria geral"} · ${data.scope === "account" ? `${data.range.since} → ${data.range.until}` : "últimos 7 dias no fuso de cada conta"}`} /></div>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Conta, ID ou BM…" style={{ ...inputStyle, minWidth: 200 }} />
              <select value={status} onChange={(event) => setStatus(event.target.value as any)} style={inputStyle}>
                <option value="all">Todos os status</option><option value="active">Somente ativas</option><option value="issues">Com problema</option>
              </select>
              <select value={connection} onChange={(event) => setConnection(event.target.value)} style={inputStyle}>
                <option value="all">Todas as conexões</option>
                {data.connections.map((item) => <option key={item.index} value={item.index}>Conexão {item.index + 1} · {item.name}</option>)}
              </select>
              <button
                type="button"
                onClick={() => setSort(DEFAULT_SORT)}
                disabled={sort.key === DEFAULT_SORT.key && sort.direction === DEFAULT_SORT.direction}
                title="Restaurar ordenação por nome da conta"
                style={{
                  ...buttonStyle,
                  height: 34,
                  marginLeft: "auto",
                  opacity: sort.key === DEFAULT_SORT.key && sort.direction === DEFAULT_SORT.direction ? 0.5 : 1,
                  cursor: sort.key === DEFAULT_SORT.key && sort.direction === DEFAULT_SORT.direction ? "default" : "pointer",
                }}
              >
                ↺ Ordem padrão
              </button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1580 }}>
                <thead>
                  <tr style={{ background: "#fafaf9", color: "#888", fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.3 }}>
                    <Th sortKey="account" sort={sort} onSort={setSort} align="left">Conta / BM</Th>
                    <Th sortKey="status" sort={sort} onSort={setSort}>Status</Th>
                    <Th sortKey="today" sort={sort} onSort={setSort} initialDirection="desc">Hoje</Th>
                    <Th sortKey="spend7d" sort={sort} onSort={setSort} initialDirection="desc">7 dias</Th>
                    <Th sortKey="prepaidAvailable" sort={sort} onSort={setSort} initialDirection="desc">Disponível pré-pago</Th>
                    <Th sortKey="postpaidOutstanding" sort={sort} onSort={setSort} initialDirection="desc">Em aberto pós-pago</Th>
                    <Th sortKey="amountSpent" sort={sort} onSort={setSort} initialDirection="desc">Gasto acumulado</Th>
                    <Th sortKey="spendCap" sort={sort} onSort={setSort} initialDirection="desc">Limite total</Th>
                    <Th sortKey="payment" sort={sort} onSort={setSort}>Pagamento</Th>
                    <Th sortKey="connection" sort={sort} onSort={setSort}>Conexão</Th>
                    <Th align="left">Abrir</Th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => {
                    const businessId = account.business?.id;
                    const businessParam = businessId ? `&business_id=${encodeURIComponent(businessId)}` : "";
                    const accountSettings = `https://business.facebook.com/settings/ad-accounts/${encodeURIComponent(account.account_id)}${businessId ? `?business_id=${encodeURIComponent(businessId)}` : ""}`;
                    return (
                      <tr key={account.account_id} style={{ borderTop: "1px solid #efefed", opacity: account.catalog.hidden ? 0.58 : 1 }}>
                        <td style={{ padding: "10px 12px", minWidth: 250 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700 }}>{account.name}</div>
                          <button onClick={() => copy(account.account_id, account.account_id)} style={copyStyle} title="Copiar ID">
                            {copied === account.account_id ? "ID copiado ✓" : `ID ${account.account_id}`}
                          </button>
                          <div style={{ fontSize: 10, color: "#888", marginTop: 3 }}>{account.business?.name || "Sem BM retornada"}{account.catalog.hidden ? " · oculta" : !account.catalog.synced ? " · não sincronizada" : ""}</div>
                        </td>
                        <Td><AccountStatus account={account} /></Td>
                        <Td strong>{account.metrics_available ? money(account.spend_today, account.currency) : "Indisponível"}</Td>
                        <Td>{account.metrics_available ? money(account.spend_7d, account.currency) : "Indisponível"}</Td>
                        <Td>
                          {account.is_prepaid ? (
                            <>
                              <div style={{ fontWeight: 700 }}>{money(account.available_balance, account.currency)}</div>
                              <div style={{ fontSize: 9.5, color: "#999", marginTop: 2 }}>crédito disponível</div>
                            </>
                          ) : <span style={{ color: "#aaa" }}>Não se aplica</span>}
                        </Td>
                        <Td>
                          {!account.is_prepaid ? (
                            <>
                              <div style={{ fontWeight: 700 }}>{money(account.billing_balance, account.currency)}</div>
                              <div style={{ fontSize: 9.5, color: "#999", marginTop: 2 }}>saldo em aberto</div>
                            </>
                          ) : <span style={{ color: "#aaa" }}>Não se aplica</span>}
                        </Td>
                        <Td>{money(account.amount_spent, account.currency)}</Td>
                        <Td>
                          <div>{account.spend_cap == null ? "Sem limite" : money(account.spend_cap, account.currency)}</div>
                          {account.spend_cap_remaining != null && <div style={{ fontSize: 9.5, color: "#999", marginTop: 2 }}>{money(account.spend_cap_remaining, account.currency)} restantes</div>}
                        </Td>
                        <td title={account.payment_summary || ""} style={{ padding: "10px 8px", textAlign: "right", fontSize: 10.5, color: "#666", maxWidth: 180 }}>
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{account.payment_summary || "Não informado"}</div>
                          <div style={{ fontSize: 9.5, color: "#aaa", marginTop: 2 }}>{account.is_prepaid ? "pré-paga" : account.currency}</div>
                        </td>
                        <Td>{account.connection_indexes.map((index) => index + 1).join(", ")}</Td>
                        <td style={{ padding: "8px 10px", minWidth: 245 }}>
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                            <QuickLink label="Ads" href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent(account.account_id)}`} />
                            <QuickLink label="Saldo" href={`https://business.facebook.com/billing_hub/payment_settings?asset_id=${encodeURIComponent(account.account_id)}${businessParam}&placement=standalone`} accent />
                            <QuickLink label="Qualidade" href={`https://business.facebook.com/accountquality?asset_id=${encodeURIComponent(account.account_id)}${businessParam}`} />
                            <QuickLink label="Conta" href={accountSettings} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!accounts.length && <div style={{ padding: 34, color: "#999", textAlign: "center" }}>Nenhuma conta encontrada com esses filtros.</div>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function AccountStatus({ account }: { account: MetaAccount }) {
  const good = account.status === "ACTIVE";
  return (
    <div>
      <span style={{ display: "inline-flex", padding: "4px 7px", borderRadius: 999, background: good ? "#eaf7ee" : "#fff0ee", color: good ? "#287746" : "#ad4039", fontSize: 10, fontWeight: 750 }}>
        {statusLabel[account.status] || account.status}
      </span>
      {account.disable_reason != null && <div style={{ fontSize: 9.5, color: "#a75a53", marginTop: 3 }}>motivo #{account.disable_reason}</div>}
    </div>
  );
}

function StatusPill({ status }: { status: Connection["status"] }) {
  const config = status === "ok"
    ? ["#eaf7ee", "#287746", "Saudável"]
    : status === "partial"
      ? ["#fff7e7", "#936619", "Parcial"]
      : ["#fff0ee", "#ad4039", "Erro"];
  return <span style={{ background: config[0], color: config[1], fontSize: 9.5, fontWeight: 750, borderRadius: 999, padding: "4px 7px" }}>{config[2]}</span>;
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div style={{ ...panelStyle, padding: "13px 14px" }}>
      <div style={{ fontSize: 9.5, color: "#888", textTransform: "uppercase", fontWeight: 750, letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 760, marginTop: 6, color: tone === "good" ? "#287746" : tone === "bad" ? "#ad4039" : "#191918" }}>{value}</div>
    </div>
  );
}

function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <div><div style={{ fontSize: 13, fontWeight: 720 }}>{title}</div><div style={{ fontSize: 10.5, color: "#999", marginTop: 2 }}>{subtitle}</div></div>;
}

function QuickLink({ label, href, accent }: { label: string; href: string; accent?: boolean }) {
  return <a href={href} target="_blank" rel="noreferrer" style={{ padding: "5px 7px", borderRadius: 7, border: `1px solid ${accent ? "#b8d5fa" : "#e1e1de"}`, background: accent ? "#eef5ff" : "#fafaf9", color: accent ? "#1768ca" : "#555", fontSize: 10, fontWeight: 700, textDecoration: "none" }}>{label} ↗</a>;
}

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
  sortKey?: MetaSortKey;
  sort?: SortState<MetaSortKey>;
  onSort?: (next: SortState<MetaSortKey>) => void;
  initialDirection?: "asc" | "desc";
}) {
  const active = Boolean(sortKey && sort?.key === sortKey);
  return (
    <th
      aria-sort={active ? (sort?.direction === "asc" ? "ascending" : "descending") : undefined}
      style={{ padding: "9px 8px", textAlign: align, fontWeight: 750 }}
    >
      {sortKey && sort && onSort ? (
        <SortButton
          column={sortKey}
          sort={sort}
          onSort={onSort}
          align={align}
          initialDirection={initialDirection}
        >
          {children}
        </SortButton>
      ) : children}
    </th>
  );
}

function Td({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return <td style={{ padding: "10px 8px", textAlign: "right", fontSize: 11, color: "#444", whiteSpace: "nowrap", fontWeight: strong ? 700 : 500 }}>{children}</td>;
}

const panelStyle: React.CSSProperties = { border: "1px solid #e8e8e5", borderRadius: 13, background: "#fff", padding: 14 };
const inputStyle: React.CSSProperties = { height: 34, boxSizing: "border-box", border: "1px solid #dededb", borderRadius: 8, background: "#fff", padding: "0 9px", color: "#333", fontSize: 11.5 };
const buttonStyle: React.CSSProperties = { height: 36, border: "1px solid #dededb", borderRadius: 9, background: "#fff", color: "#333", padding: "0 12px", fontSize: 11.5, fontWeight: 650, cursor: "pointer" };
const copyStyle: React.CSSProperties = { border: 0, background: "transparent", color: "#7d94b0", fontSize: 9.5, padding: 0, marginTop: 3, cursor: "pointer" };
