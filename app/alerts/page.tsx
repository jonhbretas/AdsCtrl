"use client";

import { useEffect, useMemo, useState } from "react";
import {
  compareSortValues,
  SortButton,
  SortState,
  usePersistentSort,
} from "@/components/SortableHeader";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Notice,
  PageHeader,
  Segmented,
  Select,
  Skeleton,
} from "@/components/ui";

type AlertLevel = "critical" | "warning" | "info";
type AlertItem = {
  id: number;
  account_id: string;
  account_name: string;
  level: AlertLevel;
  type: string;
  title: string;
  detail: string;
  group?: { name: string; color: string } | null;
  acknowledged: boolean;
  acknowledged_at: string | null;
  resolved: boolean;
  resolved_at: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
};
type AlertSortKey = "level" | "account" | "alert" | "updated";
const ALERT_SORT_KEYS: readonly AlertSortKey[] = [
  "level",
  "account",
  "alert",
  "updated",
];

// A cor de cada nível vem do token (via Badge), não de literal aqui.
const LEVEL: Record<AlertLevel, { label: string; tone: "danger" | "warn" | "brand" }> = {
  critical: { label: "Crítico", tone: "danger" },
  warning: { label: "Atenção", tone: "warn" },
  info: { label: "Informativo", tone: "brand" },
};

// O tipo cru (snake_case que vem do banco) vira rótulo legível na tabela.
const TYPE_LABEL: Record<string, string> = {
  account_disabled: "status da conta",
  payment_issue: "pagamento",
  low_balance: "saldo baixo",
  spend_drop: "queda de gasto",
  spend_spike: "pico de gasto",
  rejected_creative: "criativo reprovado",
  creative_issue: "erro de veiculação",
  no_spend: "sem gasto",
};

export default function AlertsPage() {
  const [active, setActive] = useState<AlertItem[]>([]);
  const [history, setHistory] = useState<AlertItem[]>([]);
  const [tab, setTab] = useState<"active" | "history">("active");
  const [level, setLevel] = useState<"all" | AlertLevel>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = usePersistentSort<AlertSortKey>(
    "adsctrl:sort:alerts",
    { key: "level", direction: "asc" },
    ALERT_SORT_KEYS
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [activeResponse, historyResponse] = await Promise.all([
        fetch("/api/alerts?scope=active", { cache: "no-store" }),
        fetch("/api/alerts?scope=history", { cache: "no-store" }),
      ]);
      const [activePayload, historyPayload] = await Promise.all([
        activeResponse.json(),
        historyResponse.json(),
      ]);
      if (!activeResponse.ok) throw new Error(activePayload.error || "Falha ao carregar alertas ativos.");
      if (!historyResponse.ok) throw new Error(historyPayload.error || "Falha ao carregar o histórico.");
      setActive(activePayload.alerts || []);
      setHistory(historyPayload.alerts || []);
    } catch (cause: any) {
      setError(cause?.message || "Falha ao carregar a central de alertas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function acknowledge(item: AlertItem, acknowledged: boolean) {
    setBusy(item.id);
    setError(null);
    try {
      const response = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, acknowledged }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || "Falha ao atualizar alerta.");
      await load();
    } catch (cause: any) {
      setError(cause?.message || "Falha ao atualizar alerta.");
    } finally {
      setBusy(null);
    }
  }

  const source = tab === "active" ? active : history;
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = source.filter((item) => {
      if (level !== "all" && item.level !== level) return false;
      if (!query) return true;
      return `${item.account_name} ${item.title} ${item.detail} ${item.type}`.toLowerCase().includes(query);
    });
    const itemDate = (item: AlertItem) =>
      tab === "active"
        ? item.last_seen_at
        : item.resolved_at || item.acknowledged_at || item.last_seen_at;
    const value = (item: AlertItem) => {
      switch (sort.key) {
        case "level":
          return { critical: 0, warning: 1, info: 2 }[item.level];
        case "account": return item.account_name;
        case "alert": return item.title;
        case "updated":
          return itemDate(item) ? new Date(itemDate(item)!).getTime() : null;
      }
    };
    return filtered.sort((left, right) =>
      compareSortValues(value(left), value(right), sort.direction) ||
      (sort.key === "level"
        ? compareSortValues(
            itemDate(left) ? new Date(itemDate(left)!).getTime() : null,
            itemDate(right) ? new Date(itemDate(right)!).getTime() : null,
            "desc"
          )
        : 0) ||
      compareSortValues(left.account_name, right.account_name, "asc")
    );
  }, [source, level, search, sort, tab]);

  const critical = active.filter((item) => item.level === "critical").length;
  const warning = active.filter((item) => item.level === "warning").length;
  const info = active.filter((item) => item.level === "info").length;

  return (
    <main className="ec-page" style={{ maxWidth: 1180 }}>
      <PageHeader
        title="Central de alertas"
        subtitle="Problemas de entrega, status, orçamento e performance que exigem atenção."
        actions={
          <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
            {loading ? "Atualizando…" : "↻ Atualizar"}
          </Button>
        }
      />

      <section className="ec-kpis" aria-label="Resumo dos alertas">
        <Summary label="Alertas ativos" value={active.length} />
        <Summary label="Críticos" value={critical} tone="danger" />
        <Summary label="Atenção" value={warning} tone="warn" />
        <Summary label="Informativos" value={info} tone="brand" />
      </section>

      {error && (
        <div style={{ marginBottom: "var(--sp-3)" }}>
          <Notice tone="danger" onDismiss={() => setError(null)}>{error}</Notice>
        </div>
      )}

      <section className="ec-card" style={{ overflow: "hidden" }}>
        <div className="ec-tablebar">
          <Segmented
            label="Escopo"
            value={tab}
            onChange={setTab}
            options={[
              { value: "active", label: `Ativos (${active.length})` },
              { value: "history", label: `Histórico (${history.length})` },
            ]}
          />
          <Select
            value={level}
            onChange={(event) => setLevel(event.target.value as typeof level)}
            aria-label="Severidade"
            style={{ flex: "0 1 190px" }}
          >
            <option value="all">Todas as severidades</option>
            <option value="critical">Críticos</option>
            <option value="warning">Atenção</option>
            <option value="info">Informativos</option>
          </Select>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar cliente ou alerta…"
            aria-label="Buscar"
            style={{ flex: "0 1 240px" }}
          />
          <span className="ec-tablebar__count">{rows.length} resultado(s)</span>
        </div>

        <div className="ec-scroll-x">
          <div className="ec-thead" style={{ minWidth: 980, gridTemplateColumns: ALERT_GRID }}>
            <SortButton column="level" sort={sort} onSort={setSort} align="left">Severidade</SortButton>
            <SortButton column="account" sort={sort} onSort={setSort} align="left">Conta / tipo</SortButton>
            <SortButton column="alert" sort={sort} onSort={setSort} align="left">Alerta</SortButton>
            <SortButton column="updated" sort={sort} onSort={setSort} align="left" initialDirection="desc">Atualização</SortButton>
            <span style={{ textAlign: "right" }}>Ação</span>
          </div>

          {loading ? (
            <div style={{ padding: "var(--sp-4)", display: "grid", gap: "var(--sp-3)", minWidth: 980 }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} h={48} radius={10} />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={tab === "active" ? "✓" : "—"}
              title={tab === "active" ? "Nenhum alerta ativo" : "Nenhum alerta no histórico"}
              hint={
                tab === "active"
                  ? "Com estes filtros, nada exige atenção agora. Saldo, pagamento, reprovação e queda de gasto são verificados na coleta diária."
                  : "Alertas resolvidos ou marcados como ciente aparecem aqui."
              }
            />
          ) : (
            <div style={{ minWidth: 980 }}>
              {rows.map((item) => {
                const appearance = LEVEL[item.level] || LEVEL.info;
                const date = tab === "active"
                  ? item.last_seen_at
                  : item.resolved_at || item.acknowledged_at || item.last_seen_at;
                return (
                <article
                  key={item.id}
                  className="ec-row"
                  data-urgent={item.level === "critical" && tab === "active" ? "true" : undefined}
                  style={{ gridTemplateColumns: ALERT_GRID }}
                >
                  <div>
                    <Badge tone={appearance.tone}>{appearance.label}</Badge>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="ec-row__strong">
                      {item.account_name}
                      {item.group && (
                        <span style={{ marginLeft: 6, fontSize: 10, padding: "0 6px", borderRadius: 8, background: item.group.color + "22", color: item.group.color, fontWeight: 600 }}>
                          {item.group.name}
                        </span>
                      )}
                    </div>
                    <div className="ec-row__faint">{TYPE_LABEL[item.type] || item.type || "monitoramento"}</div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="ec-row__title">{item.title}</div>
                    <div className="ec-row__detail">{item.detail}</div>
                  </div>
                  <div className="ec-row__faint" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {date ? new Date(date).toLocaleString("pt-BR") : "—"}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {tab === "active" ? (
                      <Button variant="secondary" size="sm" disabled={busy === item.id} onClick={() => acknowledge(item, true)}>
                        {busy === item.id ? "Salvando…" : "Marcar ciente"}
                      </Button>
                    ) : !item.resolved ? (
                      <Button variant="ghost" size="sm" disabled={busy === item.id} onClick={() => acknowledge(item, false)}>
                        {busy === item.id ? "Salvando…" : "Reabrir"}
                      </Button>
                    ) : (
                      <Badge tone="ok">✓ Resolvido</Badge>
                    )}
                  </div>
                </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

// Contadores por severidade. Zero fica em cinza: só o que tem volume merece cor.
function Summary({ label, value, tone }: { label: string; value: number; tone?: "danger" | "warn" | "brand" }) {
  return (
    <div className="ec-kpi">
      <div className="ec-kpi__label">{label}</div>
      <div className="ec-kpi__value" data-tone={value > 0 ? tone : undefined}>
        {value}
      </div>
    </div>
  );
}
const ALERT_GRID = "110px minmax(180px,.75fr) minmax(280px,1.5fr) 135px 150px";
