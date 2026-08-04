"use client";

// Relatórios e painéis — a entrega para o cliente, cliente a cliente.
//
// Reúne o que estava espalhado (e sumiu no redesenho): para quem vai o
// relatório semanal, com que marca, em que dia e hora, o botão de teste que
// nunca vai para o cliente, e o link permanente do painel.
//
// Duas travas de propósito: só dá para ativar o envio depois de cadastrar ao
// menos um e-mail (a lista separada por vírgula vale como um destino só), e o
// teste sempre vai para o endereço de teste da Config.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Notice, PageHeader, Field } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { RESULT_FAMILY_BY_SLUG, brDate } from "@/lib/format";
import { AlertTriangle, Users, Send, Link2, Check, ExternalLink, Search, Zap } from "lucide-react";

interface Account { account_id: string; name: string; platform: "meta" | "google"; }
interface ClientRecord {
  id: string; name: string; status: string; timezone: string;
  result_family: string | null; brand_name?: string | null;
  report_email?: string | null; report_cc?: string | null; report_enabled?: boolean;
  report_weekday?: number | null;
  report_last_sent_at?: string | null;
  accounts: Account[];
}

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const DEFAULT_WEEKDAY = 1;
const compactInput: React.CSSProperties = { width: "100%", height: 32, fontSize: 12.5, borderRadius: 8, border: "1px solid var(--color-border)", background: "transparent", padding: "0 8px" };

// O campo guarda um ou vários e-mails separados por vírgula (ex.: os sócios).
// "Tem e-mail" só vale se pelo menos um endereço da lista for válido.
function listHasEmail(value?: string | null): boolean {
  return Boolean((value || "").split(/[,;]/).some((part) => /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(part.trim())));
}

export default function RelatoriosPage() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadRevision, setLoadRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [onlyEnabled, setOnlyEnabled] = useState(false);
  // Horário é um só, da Config; aqui só se mostra qual é.
  const [globalHour, setGlobalHour] = useState<number | null>(null);

  async function load() {
    setError(null);
    try {
      const r = await fetch("/api/clients?status=active", { cache: "no-store" });
      const d = JSON.parse(await r.text());
      if (!r.ok || d.error) { setClients([]); setUnavailable(d.error || "Migração necessária."); return; }
      setClients(d.clients || []);
      setUnavailable(null);
    } catch (e: any) {
      setError(e?.message);
    } finally {
      setLoadRevision((n) => n + 1);
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (!d.error) setGlobalHour(Number(d.effective?.report_hour) || 8); })
      .catch(() => setGlobalHour(8));
  }, []);

  async function updateClient(id: string, patch: Partial<ClientRecord>) {
    setClients((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    try {
      const r = await fetch(`/api/clients/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Falha ao salvar.");
      setClients((prev) => prev.map((c) => (c.id === id ? { ...c, ...(d.client || {}) } : c)));
    } catch (e: any) {
      setError(e?.message);
      await load();
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients
      .filter((c) => (!onlyEnabled || c.report_enabled) && (!q || c.name.toLowerCase().includes(q) || (c.report_email || "").toLowerCase().includes(q)))
      .sort((a, b) => Number(Boolean(b.report_enabled)) - Number(Boolean(a.report_enabled)) || a.name.localeCompare(b.name));
  }, [clients, query, onlyEnabled]);

  const activeCount = clients.filter((c) => c.report_enabled).length;

  if (loading) {
    return <div className="p-4 md:p-6 md:ml-56 pb-20 md:pb-6 space-y-4"><Skeleton className="h-8 w-56" /><Skeleton className="h-24 rounded-lg" /><Skeleton className="h-24 rounded-lg" /></div>;
  }

  return (
    <div className="p-4 md:p-6 md:ml-56 pb-20 md:pb-6 space-y-4 animate-fade-in">
      <PageHeader
        title="Relatórios e painéis"
        subtitle={`${activeCount} de ${clients.length} cliente${clients.length === 1 ? "" : "s"} com envio semanal ativo.`}
        actions={<Link href="/clientes"><Button variant="ghost" size="sm"><Users className="h-3.5 w-3.5 mr-1" /> Clientes</Button></Link>}
      />

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/20 bg-red-500/10 text-sm text-red-500">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
          <button onClick={() => setError(null)} className="ml-auto bg-transparent border-none cursor-pointer text-xs font-semibold hover:underline">✕</button>
        </div>
      )}

      {unavailable ? <Notice tone="warn">{unavailable}</Notice> : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-[1_1_220px] max-w-sm">
              <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar cliente ou e-mail"
                className="w-full h-9 pl-9 pr-3 text-sm rounded-lg border border-border bg-transparent outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <button
              onClick={() => setOnlyEnabled((v) => !v)}
              className={cn("h-9 px-3 rounded-lg text-xs font-semibold border cursor-pointer transition-colors",
                onlyEnabled ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}
            >
              Só com envio ativo
            </button>
          </div>

          <div className="space-y-3">
            {visible.map((client) => (
              <DeliveryCard
                key={client.id}
                client={client}
                loadRevision={loadRevision}
                globalHour={globalHour}
                onUpdate={updateClient}
                onError={setError}
                onSent={load}
              />
            ))}
            {!visible.length && <div className="text-sm text-muted-foreground px-1">Nenhum cliente corresponde ao filtro.</div>}
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed max-w-3xl">
            O dia é de cada cliente; o horário é um só, definido em{" "}
            <Link href="/admin" className="underline underline-offset-2">Config › Envio</Link>
            {globalHour != null && ` (hoje ${String(globalHour).padStart(2, "0")}:00)`}, sempre na manhã do
            fuso do cliente. O horário só é cobrado quando o cron roda de hora em hora — no cron semanal
            ele fica como referência; o estado atual aparece em Config › Integrações. Período já enviado
            não repete no automático, e conta sem investimento é pulada em vez de virar e-mail vazio.
            O “Enviar agora” ignora essas travas de propósito: é o pedido avulso do cliente.
          </p>
        </>
      )}
    </div>
  );
}

function DeliveryCard({
  client, loadRevision, globalHour, onUpdate, onError, onSent,
}: {
  client: ClientRecord;
  loadRevision: number;
  globalHour: number | null;
  onUpdate: (id: string, patch: Partial<ClientRecord>) => void;
  onError: (message: string) => void;
  onSent: () => void;
}) {
  const [sending, setSending] = useState<"test" | "now" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [dashboardUrl, setDashboardUrl] = useState<string | null>(null);
  const hasEmail = listHasEmail(client.report_email);
  const weekday = client.report_weekday ?? DEFAULT_WEEKDAY;
  const hourLabel = globalHour != null ? `${String(globalHour).padStart(2, "0")}:00` : "—";

  function flash(message: string) {
    setFeedback(message);
    window.setTimeout(() => setFeedback(null), 8000);
  }

  // Link permanente do painel: acesso sem senha, então só é gerado quando pedido.
  async function loadDashboardLink(copy: boolean) {
    try {
      const r = await fetch(`/api/clients/${client.id}/dashboard-link`);
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Falha ao gerar o link.");
      setDashboardUrl(d.url);
      if (copy) {
        try {
          await navigator.clipboard.writeText(d.url);
          flash("Link do painel copiado.");
        } catch {
          window.prompt("Link do painel deste cliente:", d.url);
        }
      }
      return d.url as string;
    } catch (e: any) {
      onError(e?.message || "Falha ao gerar o link do painel.");
      return null;
    }
  }

  async function openDashboard() {
    const url = dashboardUrl || (await loadDashboardLink(false));
    if (url) window.open(url, "_blank", "noopener");
  }

  async function sendTest() {
    setSending("test");
    try {
      const r = await fetch(`/api/reports/send?client=${encodeURIComponent(client.id)}&dry=1`, { method: "POST" });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || `Falha (HTTP ${r.status}).`);
      const result = d.results?.[0];
      flash(result?.status === "sent" ? `Teste enviado para ${result.recipient}.` : `Não enviado: ${result?.reason || "sem retorno"}.`);
    } catch (e: any) {
      onError(e?.message || "Falha ao enviar o teste.");
    } finally {
      setSending(null);
    }
  }

  // Disparo avulso, quando o cliente pede o relatório fora da agenda. Vai
  // direto para os e-mails cadastrados (com cópia, se houver) e não tem
  // desfazer — daí a confirmação com o destino escrito por extenso.
  async function sendNow() {
    const recipient = (client.report_email || "").trim();
    const cc = (client.report_cc || "").trim();
    const destino = cc ? `para ${recipient}\ncom cópia para ${cc}` : `para ${recipient}`;
    if (!window.confirm(`Enviar agora o relatório da última semana fechada ${destino}?\n\nO e-mail vai direto para o cliente e não há como cancelar.`)) return;
    setSending("now");
    try {
      const r = await fetch(`/api/reports/send?client=${encodeURIComponent(client.id)}&force=1`, { method: "POST" });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || `Falha (HTTP ${r.status}).`);
      const result = d.results?.[0];
      if (result?.status === "sent") {
        flash(`Relatório enviado para ${result.recipient}.`);
        onSent();
      } else {
        flash(`Não enviado: ${result?.reason || "sem retorno"}.`);
      }
    } catch (e: any) {
      onError(e?.message || "Falha ao enviar o relatório.");
    } finally {
      setSending(null);
    }
  }

  return (
    <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold truncate">{client.name}</span>
            <FocusChip family={client.result_family} />
            {client.report_enabled
              ? <Badge variant="success">envio ativo</Badge>
              : <Badge variant="secondary">envio pausado</Badge>}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {client.report_enabled
              ? `Toda ${WEEKDAYS[weekday].toLowerCase()}, ${hourLabel} · fuso ${client.timezone || "America/Sao_Paulo"}`
              : "Sem envio automático."}
            {client.report_last_sent_at && ` · último envio ${brDate(client.report_last_sent_at)}`}
          </div>
        </div>
        <button
          onClick={() => hasEmail && onUpdate(client.id, { report_enabled: !client.report_enabled })}
          disabled={!hasEmail}
          title={hasEmail ? "Liga e desliga o envio automático" : "Cadastre ao menos um e-mail antes de ativar"}
          className={cn("h-8 px-3 rounded-lg text-xs font-semibold border cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            client.report_enabled ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-border text-muted-foreground hover:text-foreground")}
        >
          {client.report_enabled ? <><Check className="h-3.5 w-3.5 inline mr-1" />Ativo</> : "Ativar envio"}
        </button>
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <Field label="E-mails (para)" hint="Separe por vírgula para enviar a vários (ex.: os sócios).">
          <input
            key={`${client.id}-email-${loadRevision}`}
            type="text"
            defaultValue={client.report_email ?? ""}
            placeholder="cliente@empresa.com, socio@empresa.com"
            onBlur={(e) => {
              const value = e.target.value.trim();
              if (value === (client.report_email ?? "")) return;
              // Sem e-mail não existe envio: desligar junto evita cliente "ativo" sem destino.
              onUpdate(client.id, { report_email: value || null, ...(value ? {} : { report_enabled: false }) });
            }}
            style={compactInput}
          />
        </Field>
        <Field label="Cópia (CC)" hint="Opcional — quem fica sabendo sem ser destinatário.">
          <input
            key={`${client.id}-cc-${loadRevision}`}
            type="text"
            defaultValue={client.report_cc ?? ""}
            placeholder="contador@empresa.com"
            onBlur={(e) => {
              const value = e.target.value.trim();
              if (value === (client.report_cc ?? "")) return;
              onUpdate(client.id, { report_cc: value || null });
            }}
            style={compactInput}
          />
        </Field>
        <Field label="Marca no relatório">
          <input
            key={`${client.id}-brand-${loadRevision}`}
            defaultValue={client.brand_name ?? ""}
            placeholder="padrão da Config"
            title="Nome que assina o relatório, o painel e o e-mail deste cliente."
            onBlur={(e) => {
              const value = e.target.value.trim();
              if (value === (client.brand_name ?? "")) return;
              onUpdate(client.id, { brand_name: value || null });
            }}
            style={compactInput}
          />
        </Field>
        <Field label="Dia do envio">
          <select value={weekday} onChange={(e) => onUpdate(client.id, { report_weekday: Number(e.target.value) })} style={compactInput}>
            {WEEKDAYS.map((label, i) => <option key={i} value={i}>{label}</option>)}
          </select>
        </Field>
        {/* Horário não é por cliente: é um só, na Config. Mostrado aqui para
            a agenda ficar legível sem trocar de tela. */}
        <Field label="Horário (geral)">
          <div className="h-8 flex items-center px-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground">
            {hourLabel} <span className="ml-1 opacity-70">· definido em Config</span>
          </div>
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/40">
        <Button variant="secondary" size="sm" onClick={sendTest} disabled={sending !== null} title="Gera o relatório da semana passada e manda para o endereço de teste da Config — nunca para o cliente">
          <Send className="h-3.5 w-3.5 mr-1" /> {sending === "test" ? "Enviando…" : "Enviar teste para mim"}
        </Button>
        <Button
          size="sm"
          onClick={sendNow}
          disabled={sending !== null || !hasEmail}
          title={hasEmail
            ? "Envia agora o relatório da última semana fechada direto para os e-mails do cliente, fora da agenda"
            : "Cadastre ao menos um e-mail antes de enviar"}
        >
          <Zap className="h-3.5 w-3.5 mr-1" /> {sending === "now" ? "Enviando…" : "Enviar agora ao cliente"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => loadDashboardLink(true)} title="Link permanente do painel deste cliente — ele vê as métricas quando quiser, sem login">
          <Link2 className="h-3.5 w-3.5 mr-1" /> Copiar link do painel
        </Button>
        <Button variant="ghost" size="sm" onClick={openDashboard} title="Abre o painel como o cliente vê">
          <ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir painel
        </Button>
        {dashboardUrl && (
          <code className="text-[10px] text-muted-foreground truncate max-w-[280px]" title={dashboardUrl}>{dashboardUrl}</code>
        )}
        {feedback && <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">{feedback}</span>}
      </div>
    </div>
  );
}

// Em "Automático" o relatório escolhe o resultado pelo volume, e uma conta de
// conversas com leads avulsos do pixel acaba medida por leads. O aviso existe
// para essa troca não passar em branco.
function FocusChip({ family }: { family: string | null }) {
  const known = family ? RESULT_FAMILY_BY_SLUG[family] : null;
  if (known) return <Badge variant="info">foco: {known.label}</Badge>;
  return (
    <Badge variant="warning" title="Defina o Resultado do relatório em Clientes para o relatório medir o que importa">
      foco automático
    </Badge>
  );
}
