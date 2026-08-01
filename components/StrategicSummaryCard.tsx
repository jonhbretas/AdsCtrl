"use client";

// components/StrategicSummaryCard.tsx
// Resumo estratégico da conta: o "caderno" mensal do que precisa estar
// alinhado — objetivo, público alvo, regiões, cidades, melhores ofertas e
// notas. Serve de norte rápido: esqueceu o plano? Abre a tela de campanhas e
// lê. Inclui o lembrete mensal (regra strategy_review): sem atualizar no
// prazo, a Central de Alertas avisa.

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Check, ChevronDown, ChevronRight, NotebookPen, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface StrategyContent {
  objective: string;
  audience: string;
  regions: string;
  cities: string;
  offers: string;
  notes: string;
}

const EMPTY: StrategyContent = { objective: "", audience: "", regions: "", cities: "", offers: "", notes: "" };

const FIELDS: { key: keyof StrategyContent; label: string; placeholder: string; rows: number }[] = [
  { key: "objective", label: "Objetivo do mês", placeholder: "Ex.: escalar vendas de ingressos na Região dos Lagos, priorizando Búzios e Cabo Frio.", rows: 2 },
  { key: "audience", label: "Público alvo", placeholder: "Ex.: turistas e veranistas 25-54 que buscam lazer, casais e famílias.", rows: 2 },
  { key: "regions", label: "Regiões", placeholder: "Ex.: Região dos Lagos (RJ), Serra Fluminense.", rows: 2 },
  { key: "cities", label: "Cidades", placeholder: "Ex.: Búzios, Cabo Frio, Armação dos Búzios, Arraial do Cabo.", rows: 2 },
  { key: "offers", label: "Melhores ofertas", placeholder: "Ex.: pacote casal com desconto de 20%, combo ingresso + estacionamento.", rows: 2 },
  { key: "notes", label: "Notas / alinhamentos", placeholder: "Ex.: aguardando novo lote de criativos; loja em manutenção no dia 15.", rows: 2 },
];

function brDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function filledCount(content: StrategyContent): number {
  return FIELDS.filter((field) => content[field.key].trim()).length;
}

export default function StrategicSummaryCard({ accountId }: { accountId: string }) {
  const [content, setContent] = useState<StrategyContent>(EMPTY);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [reminder, setReminder] = useState<{ id: string; enabled: boolean } | null>(null);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true); setError(null);
    try {
      const [strategyRes, rulesRes] = await Promise.all([
        fetch(`/api/account-strategies?account_id=${encodeURIComponent(accountId)}`, { cache: "no-store" }),
        fetch(`/api/account-alert-rules?account_id=${encodeURIComponent(accountId)}`, { cache: "no-store" }),
      ]);
      const [strategy, rules] = await Promise.all([strategyRes.json(), rulesRes.json()]);
      if (!strategyRes.ok || strategy.error) throw new Error(strategy.error || "Falha ao carregar.");
      setContent({ ...EMPTY, ...(strategy.content || {}) });
      setUpdatedAt(strategy.updated_at || null);
      const review = (rules.rules || []).find((rule: any) => rule.kind === "strategy_review");
      setReminder(review ? { id: review.id, enabled: review.enabled } : null);
    } catch (e: any) {
      setError(e?.message || "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { setEditing(false); setSaved(false); load(); }, [load]);

  async function save() {
    setSaving(true); setError(null); setSaved(false);
    try {
      const r = await fetch("/api/account-strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, content }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Falha ao salvar.");
      setUpdatedAt(d.updated_at || new Date().toISOString());
      setEditing(false);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2600);
    } catch (e: any) {
      setError(e?.message || "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleReminder() {
    setReminderBusy(true); setError(null);
    try {
      if (reminder?.id) {
        const r = await fetch(`/api/account-alert-rules?id=${encodeURIComponent(reminder.id)}`, { method: "DELETE" });
        const d = await r.json();
        if (!r.ok || d.error) throw new Error(d.error || "Falha.");
        setReminder(null);
      } else {
        const r = await fetch("/api/account-alert-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_id: accountId, kind: "strategy_review", name: "Revisão mensal da estratégia", config: { max_age_days: 30 }, enabled: true }),
        });
        const d = await r.json();
        if (!r.ok || d.error) throw new Error(d.error || "Falha.");
        setReminder({ id: d.rule.id, enabled: true });
      }
    } catch (e: any) {
      setError(e?.message || "Falha ao alternar o lembrete.");
    } finally {
      setReminderBusy(false);
    }
  }

  const filled = filledCount(content);
  const isFresh = updatedAt && (Date.now() - Date.parse(updatedAt)) / 86400000 <= 30;
  const hasContent = filled > 0;

  return (
    <div className="rounded-xl border border-border/50 bg-card">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2.5 px-4 py-3 text-left">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary"><NotebookPen className="h-3.5 w-3.5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Resumo estratégico da conta</span>
          <span className="block text-[10.5px] text-muted-foreground">
            {loading ? "Carregando…" : hasContent
              ? `${filled} de ${FIELDS.length} itens preenchidos · atualizado em ${brDate(updatedAt)}${isFresh ? "" : " · desatualizado"}`
              : "Público alvo, regiões, cidades, melhores ofertas — preencha para ter o norte do mês"}
          </span>
        </span>
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border/50 p-4">
          {error && <div className="mb-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</div>}

          {editing ? (
            <div className="space-y-3">
              {FIELDS.map((field) => (
                <div key={field.key} className="grid gap-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{field.label}</label>
                  <textarea
                    value={content[field.key]}
                    onChange={(e) => setContent((current) => ({ ...current, [field.key]: e.target.value }))}
                    rows={field.rows}
                    placeholder={field.placeholder}
                    maxLength={2000}
                    className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={() => { setEditing(false); load(); }} disabled={saving}>Cancelar</Button>
                <Button size="sm" onClick={save} disabled={saving}>
                  {saving ? "Salvando…" : "Salvar resumo"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {!hasContent && (
                <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
                  Nada preenchido ainda. Clique em "Editar" e registre o plano da conta para consultar rápido quando precisar.
                </div>
              )}
              {hasContent && (
                <div className="grid gap-3 md:grid-cols-2">
                  {FIELDS.filter((field) => content[field.key].trim()).map((field) => (
                    <div key={field.key} className={cn("rounded-lg border border-border/50 bg-muted/10 p-3", field.key === "notes" && "md:col-span-2")}>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{field.label}</div>
                      <div className="mt-1 whitespace-pre-wrap text-[12.5px] leading-5 text-foreground">{content[field.key]}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[10.5px] text-muted-foreground">
                  <CalendarClock className="h-3 w-3" />
                  Atualizado em {brDate(updatedAt)}
                  {!isFresh && hasContent && <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 font-bold text-amber-600 dark:text-amber-400">desatualizado</span>}
                  {saved && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 font-bold text-emerald-600 dark:text-emerald-400"><Check className="h-2.5 w-2.5" />salvo</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleReminder}
                    disabled={reminderBusy}
                    className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors disabled:opacity-50", reminder?.enabled ? "border-primary/30 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground")}
                    title={reminder?.enabled ? "Desativar lembrete mensal" : "Ativar lembrete mensal (avisa na Central de Alertas se o resumo ficar 30+ dias sem atualizar)"}
                  >
                    <CalendarClock className="h-3 w-3" />
                    {reminder?.enabled ? "Lembrete mensal ativo" : "Lembrar de atualizar todo mês"}
                  </button>
                  <Button variant="ghost" size="sm" onClick={() => { setEditing(true); setError(null); }}>
                    <Pencil className="h-3 w-3 mr-1" /> Editar
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
