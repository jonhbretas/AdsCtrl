"use client";

// components/AccountAlertsPanel.tsx
// Painel "Alertas personalizados" da Central de Alertas: regras por CONTA de
// anúncios (Meta e Google são mundos diferentes — cada conta tem as suas).
// Tipos: custo de lead, regiões obrigatórias (com opção de avisar tráfego
// fora das aprovadas) e frescor de criativos. Teste imediato + histórico dos
// alertas gerados pela coleta.

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Bell, Check, ChevronDown, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AccountAlertKind } from "@/lib/account-alerts";

interface Rule {
  id: string;
  account_id: string;
  kind: AccountAlertKind;
  name: string;
  config: Record<string, any>;
  enabled: boolean;
}
interface TriggeredAlert {
  id: string;
  rule_id: string;
  kind: AccountAlertKind;
  level: "warning" | "critical";
  title: string;
  detail: string;
  first_seen_at: string;
  last_seen_at: string;
  resolved: boolean;
  resolved_at: string | null;
}
interface AccountOption { account_id: string; name: string; platform: "meta" | "google"; hidden?: boolean }

const KIND_LABELS: Record<AccountAlertKind, string> = {
  cpl: "Custo de lead (CPL)",
  region: "Regiões obrigatórias",
  creative_age: "Novo criativo (idade)",
  strategy_review: "Revisão mensal da estratégia",
};

const KIND_HINTS: Record<AccountAlertKind, string> = {
  cpl: "Avisa quando o custo por lead passar do teto no período.",
  region: "Avisa quando uma região obrigatória ficar sem anúncio rodando (ex.: Búzios, Cabo Frio) — e, se quiser, quando houver tráfego fora das aprovadas.",
  creative_age: "Avisa quando nenhum criativo novo for criado há mais de X dias.",
  strategy_review: "Lembra de atualizar o resumo estratégico da conta (público alvo, regiões, ofertas) dentro do prazo — o norte do mês.",
};

const KIND_ICONS: Record<AccountAlertKind, string> = {
  cpl: "💸",
  region: "📍",
  creative_age: "🖼️",
  strategy_review: "📋",
};

function configSummary(rule: Rule, currency: string): string {
  if (rule.kind === "cpl") {
    const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL", maximumFractionDigits: 0 });
    return `Teto ${fmt.format(Number(rule.config.max_cpl) || 0)} por lead · últimos ${rule.config.period_days || 7} dias`;
  }
  if (rule.kind === "region") {
    const regions: string[] = rule.config.regions || [];
    const base = regions.length ? regions.join(" · ") : "sem regiões";
    return rule.config.warn_outside ? `${base} · avisar se rodar fora` : base;
  }
  if (rule.kind === "strategy_review") {
    return `Atualizar a cada ${rule.config.max_age_days || 30} dias`;
  }
  return `Sem criativo novo há mais de ${rule.config.max_age_days || 20} dias`;
}

function brDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function AccountAlertsPanel() {
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [accountId, setAccountId] = useState("");
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [alerts, setAlerts] = useState<TriggeredAlert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ open: boolean; editing: Rule | null }>({ open: false, editing: null });
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<{ id: string; name: string; kind: AccountAlertKind; ok: boolean; alert: { level: string; title: string; detail: string } | null }[] | null>(null);

  const load = useCallback(async () => {
    if (!accountId) return;
    try {
      const r = await fetch(`/api/account-alert-rules?account_id=${encodeURIComponent(accountId)}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Falha ao carregar.");
      setRules(d.rules || []);
      setAlerts(d.alerts || []);
    } catch (e: any) {
      setError(e?.message || "Falha ao carregar as regras.");
    }
  }, [accountId]);

  useEffect(() => {
    fetch("/api/accounts", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const list = (d.accounts || []).filter((account: AccountOption) => !account.hidden);
        setAccounts(list);
        if (list.length) {
          setAccountId((current) => (current && list.some((item: AccountOption) => item.account_id === current) ? current : list[0].account_id));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => { setRules(null); setAlerts([]); setTestResults(null); load(); }, [load, accountId]);

  async function toggleEnabled(rule: Rule, enabled: boolean) {
    setError(null);
    try {
      const r = await fetch("/api/account-alert-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, account_id: accountId, kind: rule.kind, name: rule.name, config: rule.config, enabled }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Falha.");
      setRules((current) => (current || []).map((item) => (item.id === rule.id ? { ...item, enabled } : item)));
    } catch (e: any) {
      setError(e?.message || "Falha ao alternar.");
    }
  }

  async function remove(rule: Rule) {
    if (!window.confirm(`Excluir a regra "${rule.name}"? Os alertas dela também somem.`)) return;
    try {
      const r = await fetch(`/api/account-alert-rules?id=${encodeURIComponent(rule.id)}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Falha ao excluir.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Falha ao excluir.");
    }
  }

  async function testNow() {
    setTesting(true); setError(null); setTestResults(null);
    try {
      const r = await fetch("/api/account-alert-rules/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Falha ao testar.");
      setTestResults(d.evaluated || []);
      await load();
    } catch (e: any) {
      setError(e?.message || "Falha ao testar.");
    } finally {
      setTesting(false);
    }
  }

  const account = accounts.find((item) => item.account_id === accountId);
  const isMeta = account?.platform === "meta";
  const activeAlerts = alerts.filter((alert) => !alert.resolved);
  const historyAlerts = alerts.filter((alert) => alert.resolved);

  return (
    <div className="rounded-xl border border-border/50 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Alertas personalizados por conta</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Regras próprias de cada conta (Meta e Google são mundos diferentes) — CPL, regiões e criativos.</p>
        </div>
        <div className="relative">
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="h-9 w-full min-w-[220px] max-w-[340px] appearance-none rounded-lg border border-border bg-background px-3 pr-8 text-xs outline-none focus:ring-1 focus:ring-ring sm:w-auto">
            {accounts.map((item) => <option key={item.account_id} value={item.account_id}>{item.platform === "google" ? "Google" : "Meta"} · {item.name}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      <div className="p-4">
        {!isMeta && account && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Conta do Google: a regra de CPL funciona; região e criativo ainda só existem na Meta.
          </div>
        )}

        {error && <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{error}</div>}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={testNow} disabled={testing || !rules?.length} title="Avalia as regras agora, sem esperar a coleta">
            <Play className="h-3.5 w-3.5 mr-1" /> {testing ? "Testando…" : "Testar regras"}
          </Button>
          <Button size="sm" onClick={() => setForm({ open: true, editing: null })}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Nova regra
          </Button>
        </div>

        {rules === null && <div className="mt-4 text-xs text-muted-foreground">Carregando…</div>}
        {rules !== null && rules.length === 0 && !error && (
          <div className="mt-4 rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
            <Bell className="mx-auto mb-1 h-4 w-4 opacity-50" />
            Nenhuma regra para esta conta. Ex.: teto de CPL, regiões obrigatórias (Búzios, Cabo Frio…) ou "avisar se não subir criativo novo há 20 dias".
          </div>
        )}

        {rules !== null && rules.length > 0 && (
          <div className="mt-4 space-y-2">
            {rules.map((rule) => {
              const result = testResults?.find((item) => item.id === rule.id);
              return (
                <div key={rule.id} className={cn("rounded-lg border px-3 py-2.5", rule.enabled ? "border-border/60 bg-muted/10" : "border-border/40 bg-muted/5 opacity-60")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base leading-none">{KIND_ICONS[rule.kind]}</span>
                    <span className="text-sm font-semibold">{rule.name}</span>
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">{KIND_LABELS[rule.kind]}</span>
                    <span className="hidden text-[10px] text-muted-foreground md:inline">{configSummary(rule, account?.platform === "google" ? "BRL" : "BRL")}</span>
                    <div className="ml-auto flex items-center gap-1">
                      {result && (
                        <span className={cn("mr-1 rounded-full px-2 py-0.5 text-[10px] font-bold", result.ok ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-red-500/15 text-red-600 dark:text-red-400")}>
                          {result.ok ? "✓ OK agora" : "⚠️ alerta"}
                        </span>
                      )}
                      <button type="button" onClick={() => setForm({ open: true, editing: rule })} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Editar"><Pencil className="h-3 w-3" /></button>
                      <button type="button" onClick={() => toggleEnabled(rule, !rule.enabled)} className={cn("relative h-4.5 w-8 rounded-full border p-0.5 transition-colors", rule.enabled ? "border-success bg-success" : "border-border bg-muted")} title={rule.enabled ? "Desativar" : "Ativar"}>
                        <span className={cn("block h-3.5 w-3.5 rounded-full transition-transform", rule.enabled ? "translate-x-3.5 bg-white" : "translate-x-0 bg-muted-foreground")} />
                      </button>
                      <button type="button" onClick={() => remove(rule)} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Excluir"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground md:hidden">{configSummary(rule, "BRL")}</div>
                  {result && !result.ok && result.alert && (
                    <div className="mt-2 rounded-md border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-[11px]">
                      <span className="font-bold text-red-600 dark:text-red-400">{result.alert.title}</span>
                      <span className="ml-1 text-red-600/80 dark:text-red-400/80">{result.alert.detail}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {(activeAlerts.length > 0 || historyAlerts.length > 0) && (
          <div className="mt-4">
            <div className="flex items-center gap-2">
              <Bell className="h-3.5 w-3.5 text-primary" />
              <h3 className="text-sm font-semibold">Alertas gerados</h3>
              <span className="text-[10px] text-muted-foreground">{activeAlerts.length} ativo(s) · {historyAlerts.length} resolvido(s)</span>
            </div>
            <div className="mt-2 space-y-2">
              {activeAlerts.map((alert) => (
                <div key={alert.id} className="rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", alert.level === "critical" ? "text-red-500" : "text-amber-500")} />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-foreground">{alert.title}</div>
                      <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{alert.detail}</div>
                      <div className="mt-1 text-[9.5px] text-muted-foreground/70">visto por último: {brDateTime(alert.last_seen_at)}</div>
                    </div>
                  </div>
                </div>
              ))}
              {historyAlerts.map((alert) => (
                <div key={alert.id} className="flex items-start gap-2 rounded-lg border border-border/40 bg-muted/10 px-3 py-2 opacity-70">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-foreground/80 line-through decoration-muted-foreground/40">{alert.title}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{alert.detail}</div>
                    <div className="mt-1 text-[9.5px] text-muted-foreground/70">resolvido: {brDateTime(alert.resolved_at || alert.last_seen_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="mt-3 text-[10px] text-muted-foreground">As regras são reavaliadas a cada coleta de dados (e pelo botão Testar).</div>
      </div>

      {form.open && <RuleFormModal accountId={accountId} isMeta={isMeta} initial={form.editing} onClose={() => setForm({ open: false, editing: null })} onSaved={() => { setForm({ open: false, editing: null }); load(); }} />}
    </div>
  );
}

/* ------------------------------ formulário -------------------------------- */

function RuleFormModal({ accountId, isMeta, initial, onClose, onSaved }: { accountId: string; isMeta: boolean; initial: Rule | null; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<AccountAlertKind>(initial?.kind || "cpl");
  const [name, setName] = useState(initial?.name || "");
  const [maxCpl, setMaxCpl] = useState(initial?.config.max_cpl != null ? String(initial.config.max_cpl) : "");
  const [periodDays, setPeriodDays] = useState(initial?.config.period_days || 7);
  const [regions, setRegions] = useState(initial?.config.regions?.join("\n") || "");
  const [warnOutside, setWarnOutside] = useState(initial?.config.warn_outside === true);
  const [maxAgeDays, setMaxAgeDays] = useState(initial?.config.max_age_days != null ? String(initial.config.max_age_days) : "20");
  const [enabled, setEnabled] = useState(initial?.enabled !== false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function configForKind(): Record<string, any> {
    if (kind === "cpl") return { max_cpl: Number(maxCpl), period_days: Number(periodDays) };
    if (kind === "region") return { regions: regions.split("\n").map((region: string) => region.trim()).filter(Boolean), warn_outside: warnOutside };
    return { max_age_days: Number(maxAgeDays) };
  }

  async function save() {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/account-alert-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: initial?.id || null, account_id: accountId, kind, name: name.trim() || null, config: configForKind(), enabled }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Falha ao salvar.");
      onSaved();
    } catch (e: any) {
      setError(e?.message || "Falha ao salvar.");
      setBusy(false);
    }
  }

  const inputClass = "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus:ring-1 focus:ring-ring";
  const labelClass = "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";
  const metaOnly = (kind === "region" || kind === "creative_age") && !isMeta;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border/50 bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold">{initial ? "Editar regra" : "Nova regra de alerta"}</h3>
        <div className="mt-4 space-y-3">
          <div className="grid gap-1.5">
            <label className={labelClass}>Tipo de regra</label>
            <select value={kind} onChange={(e) => { setKind(e.target.value as AccountAlertKind); setName(""); }} className={inputClass} disabled={!!initial}>
              {(Object.keys(KIND_LABELS) as AccountAlertKind[]).map((key) => <option key={key} value={key}>{KIND_LABELS[key]}</option>)}
            </select>
            <span className="text-[10.5px] text-muted-foreground">{KIND_HINTS[kind]}</span>
          </div>

          {metaOnly && (
            <div className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400">
              Esta regra só funciona em contas Meta (o Google não expõe segmentação/criativo por esta via).
            </div>
          )}

          {kind === "cpl" && (
            <>
              <div className="grid gap-1.5">
                <label className={labelClass}>Custo máximo por lead (R$)</label>
                <input value={maxCpl} onChange={(e) => setMaxCpl(e.target.value)} type="number" min="0.01" step="0.01" placeholder="Ex.: 25" className={inputClass} />
              </div>
              <div className="grid gap-1.5">
                <label className={labelClass}>Período avaliado</label>
                <select value={periodDays} onChange={(e) => setPeriodDays(Number(e.target.value))} className={inputClass}>
                  <option value={7}>Últimos 7 dias</option>
                  <option value={14}>Últimos 14 dias</option>
                  <option value={30}>Últimos 30 dias</option>
                </select>
              </div>
            </>
          )}

          {kind === "region" && (
            <>
              <div className="grid gap-1.5">
                <label className={labelClass}>Regiões que precisam receber anúncio (uma por linha)</label>
                <textarea value={regions} onChange={(e) => setRegions(e.target.value)} rows={4} placeholder={"Búzios\nCabo Frio\nArmação dos Búzios"} className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
                <span className="text-[10.5px] text-muted-foreground">Se qualquer uma delas ficar sem segmentação nos conjuntos ativos, você recebe o alerta.</span>
              </div>
              <label className="flex items-start gap-2 text-xs text-foreground">
                <input type="checkbox" checked={warnOutside} onChange={(e) => setWarnOutside(e.target.checked)} className="mt-0.5 rounded border-border accent-primary" />
                <span>
                  <span className="font-semibold">Avisar se estiver rodando para fora das aprovadas</span>
                  <span className="block text-[10.5px] text-muted-foreground">Se um conjunto segmentar outro estado ou região fora da lista (ex.: São Paulo em vez de Búzios/Cabo Frio), você é avisado. A lista funciona como whitelist.</span>
                </span>
              </label>
            </>
          )}

          {kind === "creative_age" && (
            <div className="grid gap-1.5">
              <label className={labelClass}>Avisar se não houver criativo novo há mais de (dias)</label>
              <input value={maxAgeDays} onChange={(e) => setMaxAgeDays(e.target.value)} type="number" min="1" max="365" placeholder="Ex.: 20" className={inputClass} />
              <span className="text-[10.5px] text-muted-foreground">Conta a partir da data de criação do anúncio mais recente da conta.</span>
            </div>
          )}

          {kind === "strategy_review" && (
            <div className="grid gap-1.5">
              <label className={labelClass}>Lembrar de atualizar a cada (dias)</label>
              <input value={maxAgeDays} onChange={(e) => setMaxAgeDays(e.target.value)} type="number" min="1" max="180" placeholder="Ex.: 30" className={inputClass} />
              <span className="text-[10.5px] text-muted-foreground">O resumo estratégico da conta (público alvo, regiões, cidades, melhores ofertas) é preenchido na tela de campanhas.</span>
            </div>
          )}

          <div className="grid gap-1.5">
            <label className={labelClass}>Nome (opcional)</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={KIND_LABELS[kind]} maxLength={120} className={inputClass} />
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="rounded border-border accent-primary" />
            Regra ativa
          </label>

          {error && <div className="rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</div>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
            <Button size="sm" onClick={save} disabled={busy || metaOnly || (kind === "cpl" && !Number(maxCpl)) || (kind === "creative_age" && !Number(maxAgeDays)) || (kind === "region" && !regions.trim())}>
              {busy ? "Salvando…" : initial ? "Salvar alterações" : "Criar regra"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
