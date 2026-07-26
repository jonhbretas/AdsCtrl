"use client";

// components/AccountChanges.tsx
// "Últimas edições" de uma conta: painel separado e fechado por padrão.
// Só busca o log quando o usuário abre (a chamada é cara e nem sempre é o que
// ele quer ver). Serve para responder rápido: o resultado mudou — o que a
// gente mexeu? (campanhas pausadas, orçamentos ajustados, criativos trocados)

import { useEffect, useState } from "react";
import type { AdChangeEvent, ChangeCategory } from "@/lib/changes";
import DecisionImpact from "@/components/DecisionImpact";

const CATEGORY_LABELS: Record<ChangeCategory, string> = {
  status: "Status / pausas",
  budget: "Orçamento",
  bid: "Lances",
  creation: "Criações",
  deletion: "Exclusões",
  targeting: "Segmentação",
  creative: "Criativos",
  billing: "Cobrança",
  other: "Outros",
};

const CATEGORY_COLORS: Record<ChangeCategory, string> = {
  status: "#c2410c",
  budget: "#1768ca",
  bid: "#7c3aed",
  creation: "#16803d",
  deletion: "#b91c1c",
  targeting: "#0e7490",
  creative: "#a16207",
  billing: "#475569",
  other: "#6b7280",
};

// Ordem de exibição dos filtros (o que mais importa primeiro).
const CATEGORY_ORDER: ChangeCategory[] = [
  "status",
  "budget",
  "bid",
  "creative",
  "targeting",
  "creation",
  "deletion",
  "billing",
  "other",
];

interface Payload {
  events: AdChangeEvent[];
  truncated?: boolean;
  note?: string | null;
  error?: string;
}

type RangeMode = "panel" | 7 | 14 | 30 | "month";

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// Mês corrente até ontem (hoje ainda está incompleto e puxaria as médias para
// baixo) e o mês anterior inteiro, para a comparação mês a mês.
function monthRanges(): { current: { since: string; until: string }; previous: { since: string; until: string } } {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  // Se hoje é dia 1º, o "mês atual" ainda não tem dias fechados: usa o anterior.
  const currentSince = fmt(firstOfMonth);
  const currentUntil = fmt(yesterday) >= currentSince ? fmt(yesterday) : currentSince;
  const prevFirst = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prevLast = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return {
    current: { since: currentSince, until: currentUntil },
    previous: { since: fmt(prevFirst), until: fmt(prevLast) },
  };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toISOString().slice(0, 10);
}

function dayHeading(key: string): string {
  const d = new Date(`${key}T12:00:00`);
  if (Number.isNaN(d.getTime())) return key;
  const today = todayIso();
  const yesterday = isoDaysAgo(1);
  const label = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  if (key === today) return `Hoje · ${label}`;
  if (key === yesterday) return `Ontem · ${label}`;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const IMPACT_MARK: Record<NonNullable<AdChangeEvent["impact"]>, { icon: string; color: string }> = {
  up: { icon: "▲", color: "#1768ca" },
  down: { icon: "▼", color: "#c2410c" },
  pause: { icon: "⏸", color: "#c2410c" },
  resume: { icon: "▶", color: "#16803d" },
};

export default function AccountChanges({
  accountId,
  platform,
  since,
  until,
  compact = false,
}: {
  accountId: string;
  platform: "meta" | "google";
  since: string;
  until: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rangeMode, setRangeMode] = useState<RangeMode>("panel");
  const [filter, setFilter] = useState<ChangeCategory | "all">("all");
  // Cobranças, aprovações e entregas automáticas poluem o log: ficam de fora
  // até o usuário pedir. O que interessa por padrão é o que a equipe mexeu.
  const [showSystem, setShowSystem] = useState(false);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Impacto é opcional: custa uma consulta de série diária, e nem toda visita
  // ao log quer a análise.
  const [showImpact, setShowImpact] = useState(false);

  const months = monthRanges();
  const activeSince =
    rangeMode === "panel" ? since : rangeMode === "month" ? months.current.since : isoDaysAgo(rangeMode);
  const activeUntil =
    rangeMode === "panel" ? until : rangeMode === "month" ? months.current.until : todayIso();
  // Só o modo mês tem comparação explícita; nos outros vale o período anterior
  // de mesma duração, que a API calcula.
  const compareRange = rangeMode === "month" ? months.previous : null;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError(null);
    const url =
      `/api/account/changes?account_id=${encodeURIComponent(accountId)}` +
      `&since=${activeSince}&until=${activeUntil}`;
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        const text = await r.text();
        const payload: Payload = text ? JSON.parse(text) : { events: [] };
        if (!r.ok || payload.error) throw new Error(payload.error || `Falha (HTTP ${r.status}).`);
        return payload;
      })
      .then((payload) => alive && setData(payload))
      .catch((e) => alive && setError(e?.message ?? "Erro ao carregar as edições."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, accountId, activeSince, activeUntil, reloadKey]);

  const all = data?.events ?? [];
  const systemCount = all.filter((e) => e.system).length;
  const events = showSystem ? all : all.filter((e) => !e.system);
  const counts = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + 1;
    return acc;
  }, {});
  const visible = filter === "all" ? events : events.filter((e) => e.category === filter);

  // Agrupa por dia mantendo a ordem (a API já devolve do mais recente ao mais antigo).
  const groups: { key: string; items: AdChangeEvent[] }[] = [];
  for (const event of visible) {
    const key = dayKey(event.time);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(event);
    else groups.push({ key, items: [event] });
  }

  return (
    <section
      style={{
        margin: compact ? "10px 0 0" : "10px 0 2px",
        border: "1px solid #e8e8e5",
        borderRadius: 11,
        background: "#fff",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        title="Ver o histórico de alterações desta conta no período"
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: compact ? "10px 11px" : "11px 13px",
          border: "none",
          background: open ? "#fafaf9" : "#fff",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 13, color: "#888" }}>🕘</span>
        <span style={{ fontSize: 10, color: "#888", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.35 }}>
          Últimas edições
        </span>
        <span style={{ fontSize: 11.5, color: "#999" }}>
          o que foi alterado na conta — pausas, orçamentos, lances e criativos
        </span>
        {data && !loading && (
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 750,
              padding: "2px 7px",
              borderRadius: 999,
              background: events.length ? "#eef5ff" : "#f4f4f2",
              color: events.length ? "#1768ca" : "#999",
            }}
          >
            {events.length} {events.length === 1 ? "edição" : "edições"}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "#bbb" }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ borderTop: "1px solid #f0f0ee", padding: "11px 13px 14px" }}>
          {/* período + recarregar */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: "#999" }}>Período:</span>
            {([["panel", "Do painel"], [7, "7 dias"], [14, "14 dias"], [30, "30 dias"], ["month", "Mês vs anterior"]] as const).map(
              ([mode, label]) => (
                <button
                  key={String(mode)}
                  onClick={() => setRangeMode(mode as RangeMode)}
                  style={{
                    padding: "4px 9px",
                    borderRadius: 8,
                    border: `1px solid ${rangeMode === mode ? "#b9d5fb" : "#e6e6e3"}`,
                    background: rangeMode === mode ? "#eef5ff" : "#fff",
                    color: rangeMode === mode ? "#1768ca" : "#666",
                    fontSize: 11,
                    fontWeight: 650,
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              )
            )}
            <span style={{ fontSize: 10.5, color: "#bbb" }}>
              {activeSince} → {activeUntil}
            </span>
            <span style={{ flex: 1 }} />
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              disabled={loading}
              style={{
                padding: "4px 9px",
                borderRadius: 8,
                border: "1px dashed #ddd",
                background: "#fff",
                color: "#888",
                fontSize: 11,
                cursor: loading ? "default" : "pointer",
              }}
            >
              {loading ? "Buscando…" : "Atualizar"}
            </button>
          </div>

          {/* impacto: a leitura de resultado ao lado das decisões */}
          {platform === "meta" && (
            <div style={{ marginBottom: 12 }}>
              <button
                onClick={() => setShowImpact((v) => !v)}
                title="Comparar o período com o anterior e ver o antes/depois de cada decisão"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "6px 11px",
                  borderRadius: 9,
                  border: `1px solid ${showImpact ? "#b9d5fb" : "#e6e6e3"}`,
                  background: showImpact ? "#eef5ff" : "#fff",
                  color: showImpact ? "#1768ca" : "#555",
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                <span>📈</span>
                Impacto das decisões
                <span style={{ fontSize: 10, color: "#9aa1ad", fontWeight: 500 }}>
                  investimento e resultado, antes e depois
                </span>
                <span style={{ fontSize: 10, color: "#bbb" }}>{showImpact ? "▲" : "▼"}</span>
              </button>
              {showImpact && (
                <DecisionImpact
                  accountId={accountId}
                  since={activeSince}
                  until={activeUntil}
                  compare={compareRange}
                />
              )}
            </div>
          )}

          {/* filtros por tipo de alteração */}
          {!loading && !error && all.length > 0 && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
              {events.length > 0 && (
                <FilterChip
                  label={`Tudo (${events.length})`}
                  color="#444"
                  active={filter === "all"}
                  onClick={() => setFilter("all")}
                />
              )}
              {CATEGORY_ORDER.filter((c) => counts[c]).map((c) => (
                <FilterChip
                  key={c}
                  label={`${CATEGORY_LABELS[c]} (${counts[c]})`}
                  color={CATEGORY_COLORS[c]}
                  active={filter === c}
                  onClick={() => setFilter(filter === c ? "all" : c)}
                />
              ))}
              {systemCount > 0 && (
                <FilterChip
                  label={`${showSystem ? "Ocultar" : "Incluir"} automáticos (${systemCount})`}
                  color="#8a8a85"
                  active={showSystem}
                  onClick={() => setShowSystem((v) => !v)}
                />
              )}
            </div>
          )}

          {loading && <div style={{ fontSize: 13, color: "#999", padding: "10px 2px" }}>Carregando o histórico…</div>}

          {error && (
            <div style={{ background: "#fceceb", color: "#a32d2d", padding: "9px 12px", borderRadius: 8, fontSize: 12.5 }}>
              {error}
            </div>
          )}

          {!loading && !error && data?.note && (
            <div style={{ fontSize: 11.5, color: "#8a6117", background: "#fff8e9", border: "1px solid #edd49f", borderRadius: 8, padding: "7px 10px", marginBottom: 10 }}>
              {data.note}
            </div>
          )}

          {!loading && !error && events.length === 0 && (
            <div style={{ fontSize: 13, color: "#aaa", padding: "10px 2px" }}>
              {systemCount > 0
                ? `Nenhuma edição manual neste período — só ${systemCount} ${
                    systemCount === 1 ? "evento automático" : "eventos automáticos"
                  } (cobranças, aprovações, início de veiculação).`
                : `Nenhuma alteração registrada neste período${
                    platform === "google" ? " (o Google Ads guarda apenas 30 dias)" : ""
                  }.`}
            </div>
          )}

          {!loading && !error && events.length > 0 && visible.length === 0 && (
            <div style={{ fontSize: 13, color: "#aaa", padding: "10px 2px" }}>
              Nenhuma edição desse tipo no período.
            </div>
          )}

          {!loading && !error && visible.length > 0 && (
            <div style={{ display: "grid", gap: 14 }}>
              {groups.map((group) => (
                <div key={group.key}>
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 800,
                      color: "#999",
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                      marginBottom: 6,
                    }}
                  >
                    {dayHeading(group.key)} · {group.items.length}
                  </div>
                  <div style={{ display: "grid", gap: 2 }}>
                    {group.items.map((event) => (
                      <ChangeRow key={event.id} event={event} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function FilterChip({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 9px",
        borderRadius: 999,
        border: `1px solid ${active ? color : "#e6e6e3"}`,
        background: active ? `${color}14` : "#fff",
        color: active ? color : "#666",
        fontSize: 11,
        fontWeight: 650,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function ChangeRow({ event }: { event: AdChangeEvent }) {
  const color = CATEGORY_COLORS[event.category] || "#6b7280";
  const mark = event.impact ? IMPACT_MARK[event.impact] : null;
  const hasValues = Boolean(event.from || event.to);
  return (
    <div
      title={event.raw || undefined}
      style={{
        display: "grid",
        gridTemplateColumns: "46px 12px 1fr",
        alignItems: "start",
        gap: 8,
        padding: "7px 6px",
        borderRadius: 8,
        background: "#fcfcfb",
      }}
    >
      <span style={{ fontSize: 11, color: "#aaa", fontVariantNumeric: "tabular-nums", paddingTop: 2 }}>
        {timeLabel(event.time)}
      </span>
      <span
        title={CATEGORY_LABELS[event.category]}
        style={{ width: 7, height: 7, borderRadius: "50%", background: color, marginTop: 6 }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, fontWeight: 650, color: "#222" }}>{event.label}</span>
          {event.count > 1 && (
            <span
              title={`${event.count} eventos idênticos no mesmo minuto`}
              style={{ fontSize: 10, fontWeight: 700, color: "#888", background: "#f1f1ef", borderRadius: 999, padding: "1px 6px" }}
            >
              ×{event.count}
            </span>
          )}
          {(event.objectName || event.objectType) && (
            <span
              title={`${event.objectType || ""} ${event.objectName || ""}${event.objectId ? ` · ID ${event.objectId}` : ""}`}
              style={{
                fontSize: 11,
                color: "#666",
                maxWidth: 340,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {event.objectType ? `${event.objectType}${event.objectName ? " · " : ""}` : ""}
              {event.objectName}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: 2 }}>
          {hasValues && (
            <span style={{ fontSize: 11.5, color: "#444" }}>
              {event.from && (
                <>
                  <span style={{ color: "#999", textDecoration: "line-through" }}>{event.from}</span>
                  <span style={{ color: "#bbb", margin: "0 5px" }}>→</span>
                </>
              )}
              <strong style={{ color: mark?.color || "#222" }}>{event.to || "—"}</strong>
              {mark && <span style={{ color: mark.color, marginLeft: 5 }}>{mark.icon}</span>}
            </span>
          )}
          {event.detail && <span style={{ fontSize: 11, color: "#888" }}>{event.detail}</span>}
          {event.actor && <span style={{ fontSize: 11, color: "#bbb" }}>por {event.actor}</span>}
        </div>
      </div>
    </div>
  );
}
