"use client";

// components/DecisionImpact.tsx
// "O que as minhas decisões fizeram?" — vive dentro de Últimas edições, porque
// a pergunta só aparece depois de ver o que foi mexido.
//
// Tudo é mostrado POR DIA. Comparar 25 dias de julho com 30 de junho pelo total
// faz junho parecer maior só por ser mais longo — é o erro mais fácil de
// cometer nesta tela, e o que ela existe para evitar.

import { useEffect, useState } from "react";
import { money } from "@/lib/format";
import { RESULT_FAMILY_BY_SLUG } from "@/lib/format";
import type { DecisionImpact as DecisionImpactData, ImpactSummary, ImpactWindow } from "@/lib/impact";

// Ordem de leitura por importância de negócio, não por volume: engajamento tem
// milhares e venda tem sete — ordenar por volume enterraria o que importa.
const FAMILY_ORDER = [
  "vendas",
  "mensagens",
  "leads",
  "cadastros",
  "conversoes",
  "lpv",
  "cliques",
  "engajamento",
];

function familyLabel(slug: string): string {
  return RESULT_FAMILY_BY_SLUG[slug]?.label || slug;
}

function sortFamilies(families: string[]): string[] {
  return [...families].sort((a, b) => {
    const ia = FAMILY_ORDER.indexOf(a);
    const ib = FAMILY_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

const dec = (v: number, digits = 2) => v.toFixed(digits).replace(".", ",");
const brDate = (iso: string) => iso.split("-").reverse().join("/");

// Variação relativa. `betterWhenUp` inverte o julgamento para custo.
function Delta({ from, to, betterWhenUp = true }: { from: number; to: number; betterWhenUp?: boolean }) {
  if (!from && !to) return <span style={{ color: "#c4c8ce", fontSize: 10.5 }}>—</span>;
  // Saindo do zero não existe porcentagem: o sinal já diz tudo, e "novo" ao
  // lado de "0 → 1" só repete o que o número mostra.
  if (!from) {
    return (
      <span style={{ color: betterWhenUp ? "#1f8a4c" : "#c2410c", fontSize: 10.5, fontWeight: 700 }}>▲</span>
    );
  }
  const pct = ((to - from) / from) * 100;
  if (Math.abs(pct) < 0.5) return <span style={{ color: "#8a919e", fontSize: 10.5 }}>igual</span>;
  const up = pct > 0;
  const good = betterWhenUp ? up : !up;
  return (
    <span style={{ color: good ? "#1f8a4c" : "#c2410c", fontSize: 10.5, fontWeight: 700 }}>
      {up ? "▲" : "▼"} {dec(Math.abs(pct), 0)}%
    </span>
  );
}

function WindowHead({ label, window: w, currency }: { label: string; window: ImpactWindow; currency: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase", color: "#8a919e" }}>
        {label}
      </div>
      <div style={{ fontSize: 10.5, color: "#a0a4ad" }}>
        {brDate(w.since)} a {brDate(w.until)} · {w.days} dias
      </div>
      <div style={{ fontSize: 13, fontWeight: 750, marginTop: 3 }}>
        {money(w.spendPerDay, currency)}
        <span style={{ fontSize: 10, fontWeight: 500, color: "#8a919e" }}> /dia</span>
      </div>
      <div style={{ fontSize: 10, color: "#a0a4ad" }}>{money(w.spend, currency)} no total</div>
    </div>
  );
}

export default function DecisionImpact({
  accountId,
  since,
  until,
  compare,
  currency: currencyProp = "BRL",
}: {
  accountId: string;
  since: string;
  until: string;
  compare?: { since: string; until: string } | null;
  currency?: string;
}) {
  const [data, setData] = useState<ImpactSummary | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // A moeda autoritativa é a do catálogo, que vem na resposta.
  const [currency, setCurrency] = useState(currencyProp);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ account_id: accountId, since, until });
    if (compare) {
      params.set("compare_since", compare.since);
      params.set("compare_until", compare.until);
    }
    fetch(`/api/account/impact?${params.toString()}`, { cache: "no-store" })
      .then(async (r) => {
        const text = await r.text();
        const payload = text ? JSON.parse(text) : {};
        if (!r.ok || payload.error) throw new Error(payload.error || `Falha (HTTP ${r.status}).`);
        return payload;
      })
      .then((payload) => {
        if (!alive) return;
        setData(payload.impact ?? null);
        setNote(payload.note ?? payload.impact?.note ?? null);
        if (payload.currency) setCurrency(payload.currency);
      })
      .catch((e) => alive && setError(e?.message ?? "Erro ao calcular o impacto."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [accountId, since, until, compare?.since, compare?.until]);

  if (loading) {
    return <div style={{ padding: "14px 2px", fontSize: 12, color: "#9aa1ad" }}>Calculando o impacto…</div>;
  }
  if (error) {
    return (
      <div style={{ margin: "8px 0", padding: "9px 11px", borderRadius: 8, background: "#fdf0ef", border: "1px solid #f0cfcc", color: "#a3372f", fontSize: 12 }}>
        {error}
      </div>
    );
  }
  if (!data) {
    return <div style={{ padding: "12px 2px", fontSize: 12, color: "#9aa1ad" }}>{note || "Sem dados de impacto."}</div>;
  }

  const families = sortFamilies(data.families);
  const { current, previous } = data;

  return (
    <div style={{ marginTop: 4 }}>
      {/* comparativo do período */}
      <div style={{ border: "1px solid #e7e9ef", borderRadius: 10, padding: "11px 12px", background: "#fcfcfd" }}>
        <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginBottom: 10 }}>
          <WindowHead label="Período" window={current} currency={currency} />
          <WindowHead label="Comparado com" window={previous} currency={currency} />
          <div style={{ flex: 1 }} />
          <div style={{ alignSelf: "flex-end", textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "#8a919e" }}>investimento por dia</div>
            <Delta from={previous.spendPerDay} to={current.spendPerDay} />
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5, minWidth: 460 }}>
            <thead>
              <tr style={{ color: "#8a919e", fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.3 }}>
                <th style={{ textAlign: "left", padding: "0 6px 6px", fontWeight: 800 }}>Resultado</th>
                <th style={{ textAlign: "right", padding: "0 6px 6px", fontWeight: 800 }}>Período</th>
                <th style={{ textAlign: "right", padding: "0 6px 6px", fontWeight: 800 }}>Anterior</th>
                <th style={{ textAlign: "right", padding: "0 6px 6px", fontWeight: 800 }}>Por dia</th>
                <th style={{ textAlign: "right", padding: "0 6px 6px", fontWeight: 800 }}>Custo</th>
              </tr>
            </thead>
            <tbody>
              {families.map((family) => {
                const now = current.results[family] || 0;
                const before = previous.results[family] || 0;
                const costNow = current.costPer[family];
                const costBefore = previous.costPer[family];
                return (
                  <tr key={family} style={{ borderTop: "1px solid #f0f1f5" }}>
                    <td style={{ padding: "7px 6px", fontWeight: 600 }}>{familyLabel(family)}</td>
                    <td style={{ padding: "7px 6px", textAlign: "right", fontWeight: 700 }}>{now}</td>
                    <td style={{ padding: "7px 6px", textAlign: "right", color: "#7c8493" }}>{before}</td>
                    <td style={{ padding: "7px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {dec(current.resultsPerDay[family] || 0)} <span style={{ color: "#c4c8ce" }}>vs</span>{" "}
                      {dec(previous.resultsPerDay[family] || 0)}{" "}
                      <Delta from={previous.resultsPerDay[family] || 0} to={current.resultsPerDay[family] || 0} />
                    </td>
                    <td style={{ padding: "7px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {costNow == null ? "—" : money(costNow, currency)}{" "}
                      {costNow != null && costBefore != null && (
                        <Delta from={costBefore} to={costNow} betterWhenUp={false} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* decisões, com antes/depois */}
      {data.decisions.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.35, textTransform: "uppercase", color: "#8a919e", marginBottom: 7 }}>
            Antes e depois de cada decisão
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {data.decisions.map((decision) => (
              <DecisionCard key={decision.date} decision={decision} currency={currency} />
            ))}
          </div>
        </div>
      )}

      {(note || data.note) && (
        <div style={{ marginTop: 10, fontSize: 11, color: "#8a919e" }}>{note || data.note}</div>
      )}

      <div style={{ marginTop: 10, fontSize: 10.5, color: "#a0a4ad", lineHeight: 1.5 }}>
        Comparação, não prova de causa: sazonalidade, concorrência, oferta e o aprendizado da
        plataforma mudam junto. Serve para levantar a pergunta certa, não para fechar a conclusão.
      </div>
    </div>
  );
}

function DecisionCard({ decision, currency }: { decision: DecisionImpactData; currency: string }) {
  const { before, after } = decision;
  // Só famílias com volume em algum dos lados; o resto seria linha de zeros.
  const families = sortFamilies(
    [...new Set([...Object.keys(before.results), ...Object.keys(after.results)])].filter(
      (f) => (before.results[f] || 0) > 0 || (after.results[f] || 0) > 0
    )
  ).slice(0, 4);

  return (
    <div style={{ border: "1px solid #e7e9ef", borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 7 }}>
        <span style={{ fontSize: 12, fontWeight: 750 }}>{brDate(decision.date)}</span>
        <span style={{ fontSize: 10.5, color: "#a0a4ad" }}>
          {decision.windowDays} dias antes vs {decision.windowDays} depois
        </span>
      </div>

      <div style={{ display: "grid", gap: 3, marginBottom: 9 }}>
        {decision.changes.map((change, i) => (
          <div key={i} style={{ fontSize: 11.5, color: "#4a5160" }}>
            <span style={{ fontWeight: 650 }}>{change.label}</span>
            {change.objectName && <span style={{ color: "#8a919e" }}> · {change.objectName}</span>}
            {change.to && (
              <span>
                {" — "}
                {/* from nulo = a coisa acabou de ser criada; "null → x" não diz nada */}
                {change.from ? `${change.from} → ` : "→ "}
                <strong>{change.to}</strong>
              </span>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 11.5 }}>
        <div>
          <div style={{ fontSize: 9.5, color: "#8a919e", textTransform: "uppercase", fontWeight: 800 }}>Investido/dia</div>
          <div style={{ whiteSpace: "nowrap" }}>
            {money(before.spendPerDay, currency)} <span style={{ color: "#c4c8ce" }}>→</span>{" "}
            <strong>{money(after.spendPerDay, currency)}</strong>{" "}
            <Delta from={before.spendPerDay} to={after.spendPerDay} />
          </div>
        </div>
        {families.map((family) => {
          const b = before.results[family] || 0;
          const a = after.results[family] || 0;
          const cb = before.costPer[family];
          const ca = after.costPer[family];
          return (
            <div key={family}>
              <div style={{ fontSize: 9.5, color: "#8a919e", textTransform: "uppercase", fontWeight: 800 }}>
                {familyLabel(family)}
              </div>
              <div style={{ whiteSpace: "nowrap" }}>
                {b} <span style={{ color: "#c4c8ce" }}>→</span> <strong>{a}</strong>{" "}
                <Delta from={b} to={a} />
              </div>
              <div style={{ fontSize: 10, color: "#a0a4ad", whiteSpace: "nowrap" }}>
                {cb == null ? "—" : money(cb, currency)} → {ca == null ? "—" : money(ca, currency)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
