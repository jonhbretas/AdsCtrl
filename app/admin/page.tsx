"use client";

// Config — o que é do sistema, não de um cliente.
//
// Identidade da marca, endereços de e-mail do disparo, estado das integrações
// que puxam os dados e o lembrete interno de pendências. Cadastro de cliente,
// grupo e conta ficam em /clientes; entrega do relatório, em /relatorios.
//
// Campo vazio aqui significa "herda do .env" — a tela mostra qual valor o
// ambiente ofereceria, para ninguém achar que está sem configuração.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, PageHeader, Field } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AlertTriangle, RefreshCw, Users, Mail, Save, Activity } from "lucide-react";

type SettingKey = "brand_name" | "brand_description" | "report_from_email" | "report_reply_to" | "report_test_email" | "task_alert_email" | "report_hour" | "contractor_legal_name" | "contractor_document" | "contractor_representative_name" | "contractor_representative_cpf" | "contractor_address_street" | "contractor_address_number" | "contractor_address_complement" | "contractor_address_neighborhood" | "contractor_address_city" | "contractor_address_state" | "contractor_address_zip_code" | "contractor_email" | "contractor_phone" | "contractor_pix_key" | "contractor_bank" | "contractor_agency_account" | "contractor_forum" | "witness_one_name" | "witness_one_cpf" | "witness_two_name" | "witness_two_cpf";
// Um horário só para todos os relatórios, cedo na manhã do cliente. Vinte e
// quatro opções por cliente eram configuração demais para uma decisão que na
// prática é sempre "antes de o dia começar".
const REPORT_HOURS = [6, 7, 8, 9];
interface SettingsPayload { stored: Partial<Record<SettingKey, string>>; env: Record<SettingKey, string>; effective: Record<SettingKey, string>; }
interface Integration { key: string; label: string; state: "ok" | "warn" | "off" | "error"; detail: string; hint?: string; }

const IDENTITY_FIELDS: { key: SettingKey; label: string; placeholder: string; help: string }[] = [
  { key: "brand_name", label: "Nome do painel", placeholder: "Assertivus Dash", help: "Aparece na barra lateral, na aba do navegador e assina o que o cliente vê." },
  { key: "brand_description", label: "Descrição", placeholder: "Cockpit de performance em mídia paga", help: "Texto de apoio na aba do navegador e no login." },
];

const EMAIL_FIELDS: { key: SettingKey; label: string; placeholder: string; help: string }[] = [
  { key: "report_from_email", label: "Remetente", placeholder: "Agência <relatorios@seudominio.com>", help: "De onde saem os e-mails. O domínio precisa estar verificado no Resend." },
  { key: "report_reply_to", label: "Responder para", placeholder: "voce@seudominio.com", help: "Para onde vai a resposta do cliente. Útil quando o remetente é uma caixa sem entrada." },
  { key: "report_test_email", label: "E-mail de teste", placeholder: "voce@gmail.com", help: 'Destino do botão "Enviar teste para mim". Nunca vai para o cliente.' },
  { key: "task_alert_email", label: "Lembretes internos", placeholder: "voce@gmail.com", help: "Recebe o resumo diário de tarefas atrasadas e projetos no prazo final." },
];

const CONTRACTOR_FIELDS: { key: SettingKey; label: string; placeholder: string; help: string }[] = [
  { key: "contractor_legal_name", label: "Razão social / nome", placeholder: "Nome da agência ou empresa", help: "Parte que aparecerá como CONTRATADA." },
  { key: "contractor_document", label: "CNPJ ou CPF", placeholder: "00.000.000/0000-00", help: "Documento da agência ou do dono da plataforma." },
  { key: "contractor_representative_name", label: "Representante legal", placeholder: "Nome completo", help: "Pessoa que assina pela CONTRATADA." },
  { key: "contractor_representative_cpf", label: "CPF do representante", placeholder: "000.000.000-00", help: "CPF exibido no bloco de assinatura." },
  { key: "contractor_address_street", label: "Logradouro", placeholder: "Rua, avenida...", help: "Endereço da CONTRATADA." },
  { key: "contractor_address_number", label: "Número", placeholder: "473", help: "Número do endereço." },
  { key: "contractor_address_complement", label: "Complemento", placeholder: "Sala, conjunto...", help: "Opcional." },
  { key: "contractor_address_neighborhood", label: "Bairro", placeholder: "Centro", help: "Bairro do endereço." },
  { key: "contractor_address_city", label: "Cidade", placeholder: "Foz do Iguaçu", help: "Cidade da CONTRATADA." },
  { key: "contractor_address_state", label: "UF", placeholder: "PR", help: "Estado da CONTRATADA." },
  { key: "contractor_address_zip_code", label: "CEP", placeholder: "85856-480", help: "CEP da CONTRATADA." },
  { key: "contractor_email", label: "E-mail", placeholder: "contato@agencia.com", help: "Contato formal da CONTRATADA." },
  { key: "contractor_phone", label: "WhatsApp / telefone", placeholder: "+55 45 99999-9999", help: "Contato operacional no contrato." },
  { key: "contractor_pix_key", label: "Chave Pix", placeholder: "Chave para pagamentos", help: "Usada na cláusula de pagamentos." },
  { key: "contractor_bank", label: "Banco", placeholder: "Banco e titular", help: "Dados bancários opcionais." },
  { key: "contractor_agency_account", label: "Agência / conta", placeholder: "0001 / 000000-0", help: "Dados bancários opcionais." },
  { key: "contractor_forum", label: "Foro", placeholder: "Foz do Iguaçu/PR", help: "Foro padrão da minuta." },
  { key: "witness_one_name", label: "Testemunha I", placeholder: "Nome completo", help: "Opcional." },
  { key: "witness_one_cpf", label: "CPF testemunha I", placeholder: "000.000.000-00", help: "Opcional." },
  { key: "witness_two_name", label: "Testemunha II", placeholder: "Nome completo", help: "Opcional." },
  { key: "witness_two_cpf", label: "CPF testemunha II", placeholder: "000.000.000-00", help: "Opcional." },
];

const STATE_STYLE: Record<Integration["state"], { badge: "success" | "warning" | "secondary" | "destructive"; label: string }> = {
  ok: { badge: "success", label: "ok" },
  warn: { badge: "warning", label: "atenção" },
  off: { badge: "secondary", label: "desligado" },
  error: { badge: "destructive", label: "falha" },
};

export default function ConfigPage() {
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [draft, setDraft] = useState<Partial<Record<SettingKey, string>>>({});
  const [integrations, setIntegrations] = useState<Integration[] | null>(null);
  const [probing, setProbing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function loadSettings() {
    try {
      const r = await fetch("/api/settings", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Falha ao ler as configurações.");
      setSettings(d);
      setDraft({ ...d.stored });
    } catch (e: any) {
      setError(e?.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadIntegrations(probe: boolean) {
    setProbing(true);
    try {
      const r = await fetch(`/api/integrations/status${probe ? "?probe=1" : ""}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Falha ao checar as integrações.");
      setIntegrations(d.integrations || []);
    } catch (e: any) {
      setError(e?.message);
    } finally {
      setProbing(false);
    }
  }

  useEffect(() => { loadSettings(); loadIntegrations(false); }, []);

  const dirty = Boolean(settings) && (Object.keys({ ...settings!.stored, ...draft }) as SettingKey[])
    .some((key) => (draft[key] || "") !== (settings!.stored[key] || ""));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/settings", { method: "PATCH", body: JSON.stringify(draft) });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Falha ao salvar.");
      setSettings(d);
      setDraft({ ...d.stored });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 4000);
      // Marca e remetente aparecem em outras telas; recarregar mantém tudo coerente.
      loadIntegrations(false);
    } catch (e: any) {
      setError(e?.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-4 md:p-6 md:ml-56 pb-20 md:pb-6 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-32 rounded-lg" /><Skeleton className="h-32 rounded-lg" /></div>;
  }

  const renderField = (f: { key: SettingKey; label: string; placeholder: string; help: string }) => {
    const inherited = !(draft[f.key] || "").trim() && settings?.env[f.key];
    return (
      <div key={f.key} className="space-y-1">
        <Field label={f.label}>
          <input
            value={draft[f.key] ?? ""}
            onChange={(e) => setDraft((prev) => ({ ...prev, [f.key]: e.target.value }))}
            placeholder={settings?.env[f.key] || f.placeholder}
            className="w-full h-9 px-3 text-sm rounded-lg border border-border bg-transparent outline-none focus:ring-1 focus:ring-ring"
          />
        </Field>
        <p className="text-[11px] text-muted-foreground leading-snug">
          {f.help}
          {inherited && <span className="ml-1 text-muted-foreground/80">Herdando do ambiente: <code>{settings!.env[f.key]}</code>.</span>}
        </p>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 md:ml-56 pb-20 md:pb-6 space-y-4 animate-fade-in">
      <PageHeader
        title="Config"
        subtitle="Marca, e-mail e integrações do sistema."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/clientes"><Button variant="ghost" size="sm"><Users className="h-3.5 w-3.5 mr-1" /> Clientes</Button></Link>
            <Link href="/relatorios"><Button variant="ghost" size="sm"><Mail className="h-3.5 w-3.5 mr-1" /> Relatórios</Button></Link>
          </div>
        }
      />

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/20 bg-red-500/10 text-sm text-red-500">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
          <button onClick={() => setError(null)} className="ml-auto bg-transparent border-none cursor-pointer text-xs font-semibold hover:underline">✕</button>
        </div>
      )}

      <div className="space-y-4">
        <Collapsible id="identity" storageKey="config:identidade" defaultOpen
          summary={<SectionHead icon="◍" title="Identidade" hint="Como o painel se chama." meta={settings?.effective.brand_name || ""} />}>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            {IDENTITY_FIELDS.map(renderField)}
          </div>
        </Collapsible>

        <Collapsible id="email" storageKey="config:email" defaultOpen
          summary={<SectionHead icon="✉" title="E-mail" hint="De onde sai o disparo e para onde vão os testes." meta={settings?.effective.report_from_email ? "configurado" : "incompleto"} />}>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            {EMAIL_FIELDS.map(renderField)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
            A chave da API do Resend continua só no ambiente (<code>RESEND_API_KEY</code>) — segredo não entra
            em tabela que o painel lê.
          </p>
        </Collapsible>

        <Collapsible id="contractor" storageKey="config:contratada"
          summary={<SectionHead icon="§" title="Dados da CONTRATADA" hint="Dono da plataforma/agência para os contratos." meta={draft.contractor_legal_name || "não configurada"} />}>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            {CONTRACTOR_FIELDS.map(renderField)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">Esses dados ficam separados do cadastro dos clientes e serão usados como a parte CONTRATADA nas minutas.</p>
        </Collapsible>

        <Collapsible id="envio" storageKey="config:envio" defaultOpen
          summary={<SectionHead icon="🕗" title="Envio" hint="Quando os relatórios saem." meta={`${String(Number(draft.report_hour || settings?.env.report_hour || 8)).padStart(2, "0")}:00`} />}>
          <div className="space-y-3">
            <div className="max-w-xs">
              <Field label="Horário de envio">
                <select
                  value={String(Number(draft.report_hour || settings?.env.report_hour || 8))}
                  onChange={(e) => setDraft((prev) => ({ ...prev, report_hour: e.target.value }))}
                  className="w-full h-9 px-3 text-sm rounded-lg border border-border bg-transparent outline-none focus:ring-1 focus:ring-ring"
                >
                  {REPORT_HOURS.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                </select>
              </Field>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed max-w-3xl">
              Vale para todos os clientes, sempre no fuso de cada um — quem está em outro fuso recebe no
              mesmo horário local, não no seu. O <strong>dia</strong> continua sendo escolha por cliente,
              em <Link href="/relatorios" className="underline underline-offset-2">Relatórios</Link>.
              O horário só é respeitado quando o cron roda de hora em hora; veja Integrações abaixo.
            </p>
          </div>
        </Collapsible>

        <Collapsible id="integrations" storageKey="config:integracoes" defaultOpen
          summary={<SectionHead icon="⚡" title="Integrações" hint="Quem alimenta os dados do painel." meta={integrations ? `${integrations.filter((i) => i.state === "ok").length}/${integrations.length} ok` : "…"} />}>
          <div className="flex items-center gap-2 mb-3">
            <Button variant="secondary" size="sm" onClick={() => loadIntegrations(true)} disabled={probing}>
              <Activity className={cn("h-3.5 w-3.5 mr-1", probing && "animate-spin")} /> {probing ? "Testando…" : "Testar conexões agora"}
            </Button>
            <span className="text-[11px] text-muted-foreground">Chama Meta e Google de verdade — pega token vencido, que continua parecendo configurado.</span>
          </div>
          <div className="space-y-2">
            {(integrations || []).map((item) => (
              <div key={item.key} className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-card">
                <Badge variant={STATE_STYLE[item.state].badge} className="shrink-0 mt-0.5">{STATE_STYLE[item.state].label}</Badge>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{item.label}</div>
                  <div className="text-xs text-muted-foreground break-words">{item.detail}</div>
                  {item.hint && <div className="text-[11px] text-muted-foreground/80 mt-0.5">{item.hint}</div>}
                </div>
              </div>
            ))}
            {!integrations && <Skeleton className="h-16 rounded-lg" />}
          </div>
        </Collapsible>

        <Collapsible id="reminders" storageKey="config:lembretes"
          summary={<SectionHead icon="🔔" title="Lembrete diário de pendências" hint="Sai junto da coleta, para você." meta="interno" />}>
          <TaskReminders onError={setError} recipient={settings?.effective.task_alert_email || ""} />
        </Collapsible>
      </div>

      {/* Barra de salvar: fixa porque os campos ficam em seções que rolam. */}
      <div className="sticky bottom-[68px] md:bottom-3 flex flex-wrap items-center gap-2 justify-end">
        {saved && <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Configurações salvas.</span>}
        <Button onClick={save} disabled={!dirty || saving} className="shadow-lg">
          <Save className="h-3.5 w-3.5 mr-1" /> {saving ? "Salvando…" : dirty ? "Salvar alterações" : "Tudo salvo"}
        </Button>
      </div>
    </div>
  );
}

// O envio automático acontece no fim da coleta diária (app/api/collect).
// Aqui só se confere e se dispara na mão — o que faz falta ao mexer no texto.
function TaskReminders({ onError, recipient }: { onError: (message: string) => void; recipient: string }) {
  const [busy, setBusy] = useState<"preview" | "send" | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function call(kind: "preview" | "send") {
    setBusy(kind);
    setResult(null);
    try {
      const response = await fetch(kind === "preview" ? "/api/tasks/digest?preview=1" : "/api/tasks/digest", {
        method: kind === "preview" ? "GET" : "POST",
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || "Falha no lembrete.");
      const resumo = `${payload.late_tasks} atrasada(s) · ${payload.today_tasks} para hoje · ${payload.projects} projeto(s) no prazo final`;
      if (kind === "preview") {
        setResult(payload.would_send
          ? `Sairia para ${payload.recipient}: “${payload.subject}” — ${resumo}.`
          : `Nada sairia agora (${resumo}). O lembrete só é enviado quando há pendência.`);
        return;
      }
      setResult(payload.status === "sent"
        ? `Enviado para ${payload.recipient} — ${resumo}.`
        : `Não enviado: ${payload.reason || payload.status}.`);
    } catch (e: any) {
      onError(e?.message ?? "Falha ao acionar o lembrete.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground leading-relaxed max-w-3xl">
        Todo dia, junto da coleta, sai um e-mail com as tarefas atrasadas ou que vencem hoje e com os
        projetos no prazo final. Tarefa aberta por alerta (saldo, pagamento, status da conta, criativo
        reprovado) nasce com prazo de hoje, então entra no mesmo e-mail — com link direto para a tela
        onde o problema se resolve. Quando não há nada pendente, nada é enviado: e-mail diário que não
        exige ação deixa de ser lido.
      </p>
      <p className="text-[11px] text-muted-foreground">
        Destinatário: {recipient ? <code>{recipient}</code> : <span className="text-amber-600 dark:text-amber-400">defina em Config › E-mail</span>}.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => call("preview")} disabled={busy !== null}>
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1", busy === "preview" && "animate-spin")} />
          {busy === "preview" ? "Conferindo…" : "Ver o que sairia agora"}
        </Button>
        <Button size="sm" onClick={() => call("send")} disabled={busy !== null}>
          <Mail className="h-3.5 w-3.5 mr-1" /> {busy === "send" ? "Enviando…" : "Enviar agora"}
        </Button>
      </div>
      {result && <div className="text-xs px-3 py-2 rounded-lg border border-border/50 bg-muted/30">{result}</div>}
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
      <span className="ml-auto text-xs font-semibold text-muted-foreground shrink-0 truncate max-w-[220px]">{meta}</span>
    </div>
  );
}
