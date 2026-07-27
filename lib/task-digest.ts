// lib/task-digest.ts
// Lembrete de pendências por e-mail — para mim, não para o cliente.
//
// O quadro só resolve o que é lembrado, e o quadro só é lido por quem abre o
// app. Este arquivo inverte isso: o que passou do prazo (ou vence hoje) vai
// atrás de mim. Nada mais entra — nem "em 3 dias", nem "está tudo em ordem":
// e-mail que chega todo dia sem exigir nada deixa de ser lido, e aí o dia em
// que exige passa batido também.
//
// Alerta da coleta entra por consequência: tarefa automática nasce com prazo de
// hoje (ver openTasksForAlerts), então saldo acabando e criativo reprovado
// aparecem aqui no mesmo dia em que a coleta os encontrou.
//
// O disparo vive em app/api/tasks/digest/route.ts e no fim da coleta diária.

import { appBaseUrl } from "./report-token";
import { looksLikeEmail, resendIssues, sendEmail } from "./resend";
import { getServiceClient, supabaseEnvMissing } from "./supabase";

const INK = "#12161f";
const MUTED = "#6f7787";
const LINE = "#e6e8ee";
const RED = "#cf4a45";
const AMBER = "#8a6117";
const BLUE = "#2f6fe4";
const FONT = "Arial, Helvetica, sans-serif";

// O destinatário é fixo por natureza: este e-mail é o meu despertador. A env
// existe para trocar sem deploy, não para virar lista.
const DEFAULT_RECIPIENT = "jonathanbretas@gmail.com";

export function digestRecipient(): string {
  const configured = (process.env.TASK_ALERT_EMAIL || "").trim();
  return looksLikeEmail(configured) ? configured : DEFAULT_RECIPIENT;
}

export interface DigestTask {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  source: string;
  alert_type: string | null;
  account_id: string | null;
  clientName: string | null;
  projectName: string | null;
  late: boolean;
}

export interface DigestProject {
  id: string;
  name: string;
  due_date: string;
  clientName: string | null;
  openTasks: number;
  late: boolean;
}

export interface TaskDigest {
  date: string;
  tasks: DigestTask[];
  projects: DigestProject[];
  lateTasks: number;
  todayTasks: number;
}

const brDate = (iso: string) => iso.split("-").reverse().join("/");

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// O "hoje" do lembrete é o de São Paulo, não o do servidor: a coleta roda às
// 10h UTC, que ainda é o dia anterior em UTC-3 por sete horas.
export function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function buildTaskDigest(): Promise<TaskDigest> {
  const supabase = getServiceClient();
  const today = todayInSaoPaulo();

  const [tasksResult, clientsResult, projectsResult] = await Promise.all([
    supabase
      .from("tasks")
      .select("*")
      .neq("status", "done")
      .not("due_date", "is", null)
      .lte("due_date", today)
      .order("due_date", { ascending: true }),
    supabase.from("clients").select("id,name"),
    // Sem a migração de projetos o lembrete continua cobrando tarefas.
    supabase
      .from("projects")
      .select("id,name,client_id,due_date,status")
      .eq("status", "active")
      .not("due_date", "is", null)
      .lte("due_date", today)
      .order("due_date", { ascending: true }),
  ]);
  if (tasksResult.error) throw tasksResult.error;

  const clientName = new Map<string, string>(
    (clientsResult.data || []).map((client: any) => [client.id, client.name])
  );
  const projectRows = projectsResult.error ? [] : projectsResult.data || [];
  const projectName = new Map<string, string>(
    projectRows.map((project: any) => [project.id, project.name])
  );

  const rows = tasksResult.data || [];
  const tasks: DigestTask[] = rows.map((task: any) => ({
    id: task.id,
    title: task.title,
    notes: task.notes,
    status: task.status,
    priority: task.priority,
    due_date: task.due_date,
    source: task.source,
    alert_type: task.alert_type ?? null,
    account_id: task.account_id,
    clientName: task.client_id ? clientName.get(task.client_id) || null : null,
    projectName: task.project_id ? projectName.get(task.project_id) || null : null,
    late: Boolean(task.due_date && task.due_date < today),
  }));

  // Projeto vencido pesa mais que tarefa vencida: um projeto atrasado quase
  // sempre significa várias tarefas que ninguém abriu.
  const openByProject = new Map<string, number>();
  if (projectRows.length) {
    const { data: openTasks } = await supabase
      .from("tasks")
      .select("project_id")
      .neq("status", "done")
      .in("project_id", projectRows.map((project: any) => project.id));
    for (const row of openTasks || []) {
      const key = (row as any).project_id;
      if (key) openByProject.set(key, (openByProject.get(key) || 0) + 1);
    }
  }

  const projects: DigestProject[] = projectRows.map((project: any) => ({
    id: project.id,
    name: project.name,
    due_date: project.due_date,
    clientName: project.client_id ? clientName.get(project.client_id) || null : null,
    openTasks: openByProject.get(project.id) || 0,
    late: project.due_date < today,
  }));

  // Atrasado antes de "hoje", e urgente antes de normal dentro de cada grupo:
  // a ordem do e-mail é a ordem em que eu devo atacar.
  tasks.sort((left, right) => {
    if (left.late !== right.late) return left.late ? -1 : 1;
    if (left.priority !== right.priority) return left.priority === "high" ? -1 : 1;
    return (left.due_date || "").localeCompare(right.due_date || "");
  });

  return {
    date: today,
    tasks,
    projects,
    lateTasks: tasks.filter((task) => task.late).length,
    todayTasks: tasks.filter((task) => !task.late).length,
  };
}

// Para onde o e-mail manda quem clica. Mesma lógica do botão "resolver" no
// cartão: o tipo do alerta é que sabe onde o problema se resolve.
function taskLink(task: DigestTask, base: string): string {
  const account = task.account_id;
  if (!account) return `${base}/tarefas`;
  // Criativo reprovado é o único caso em que a tela do problema não é a do
  // cliente: os anúncios recusados vivem no diagnóstico de criativos.
  if (task.alert_type === "rejected_creative") {
    return `${base}/creatives?account=${encodeURIComponent(account)}&issue=rejected`;
  }
  return `${base}/?account=${encodeURIComponent(account)}`;
}

function taskRow(task: DigestTask, base: string): string {
  const tone = task.late ? RED : AMBER;
  const when = task.late ? `atrasada · ${brDate(task.due_date!)}` : "vence hoje";
  const context = [task.clientName, task.projectName].filter(Boolean).join(" · ");
  return `
  <tr>
    <td style="padding:0 0 8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="border:1px solid ${LINE};border-left:3px solid ${tone};border-radius:8px;background:#ffffff;">
        <tr><td style="padding:11px 13px;">
          <div style="font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;color:${tone};font-family:${FONT};">
            ${escapeHtml(when)}${task.priority === "high" ? " · urgente" : ""}${
              task.source === "auto" ? " · detectada pelo sistema" : ""
            }
          </div>
          <div style="font-size:14px;font-weight:bold;color:${INK};font-family:${FONT};padding:4px 0 0;">
            ${escapeHtml(task.title)}
          </div>
          ${context
            ? `<div style="font-size:11.5px;color:${MUTED};font-family:${FONT};padding-top:3px;">${escapeHtml(context)}</div>`
            : ""}
          ${task.notes
            ? `<div style="font-size:11.5px;color:${MUTED};font-family:${FONT};padding-top:5px;line-height:1.5;">${escapeHtml(
                task.notes.slice(0, 220)
              )}</div>`
            : ""}
          <div style="padding-top:7px;">
            <a href="${escapeHtml(taskLink(task, base))}"
               style="font-size:11.5px;font-weight:bold;color:${BLUE};text-decoration:none;font-family:${FONT};">
              Resolver &rarr;
            </a>
          </div>
        </td></tr>
      </table>
    </td>
  </tr>`;
}

function projectRow(project: DigestProject, base: string): string {
  const tone = project.late ? RED : AMBER;
  return `
  <tr>
    <td style="padding:0 0 8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="border:1px solid ${LINE};border-left:3px solid ${tone};border-radius:8px;background:#ffffff;">
        <tr><td style="padding:10px 13px;">
          <div style="font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;color:${tone};font-family:${FONT};">
            ${project.late ? `prazo estourado · ${escapeHtml(brDate(project.due_date))}` : "entrega hoje"}
          </div>
          <div style="font-size:13.5px;font-weight:bold;color:${INK};font-family:${FONT};padding:4px 0 0;">
            ${escapeHtml(project.name)}
          </div>
          <div style="font-size:11.5px;color:${MUTED};font-family:${FONT};padding-top:3px;">
            ${project.clientName ? `${escapeHtml(project.clientName)} · ` : ""}${
              project.openTasks === 0
                ? "nenhuma tarefa em aberto"
                : `${project.openTasks} tarefa${project.openTasks > 1 ? "s" : ""} em aberto`
            }
          </div>
        </td></tr>
      </table>
    </td>
  </tr>`;
}

export function renderTaskDigestEmail(digest: TaskDigest): {
  subject: string;
  html: string;
  text: string;
} {
  const base = appBaseUrl();
  const parts: string[] = [];
  if (digest.lateTasks) parts.push(`${digest.lateTasks} atrasada${digest.lateTasks > 1 ? "s" : ""}`);
  if (digest.todayTasks) parts.push(`${digest.todayTasks} para hoje`);
  if (digest.projects.length) {
    parts.push(`${digest.projects.length} projeto${digest.projects.length > 1 ? "s" : ""} no prazo final`);
  }
  const resumo = parts.join(" · ") || "nada pendente";
  const subject = `${digest.lateTasks ? "⚠ " : ""}Pendências · ${resumo}`;

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f5f7;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(resumo)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f5f7;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
           style="width:600px;max-width:100%;background:#ffffff;border-radius:12px;border:1px solid ${LINE};">
      <tr><td style="padding:22px 22px 4px;">
        <div style="font-size:10px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:${MUTED};font-family:${FONT};">
          Assertivus Dash · lembrete interno
        </div>
        <div style="font-size:22px;font-weight:bold;color:${INK};font-family:${FONT};padding:6px 0 2px;">
          O que precisa sair hoje
        </div>
        <div style="font-size:13px;color:${MUTED};font-family:${FONT};">
          ${escapeHtml(brDate(digest.date))} · ${escapeHtml(resumo)}
        </div>
      </td></tr>

      ${digest.projects.length
        ? `<tr><td style="padding:18px 22px 0;">
             <div style="font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:.6px;color:${MUTED};font-family:${FONT};padding-bottom:9px;">
               Projetos no prazo final
             </div>
             <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
               ${digest.projects.map((project) => projectRow(project, base)).join("")}
             </table>
           </td></tr>`
        : ""}

      ${digest.tasks.length
        ? `<tr><td style="padding:18px 22px 0;">
             <div style="font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:.6px;color:${MUTED};font-family:${FONT};padding-bottom:9px;">
               Tarefas atrasadas e de hoje
             </div>
             <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
               ${digest.tasks.map((task) => taskRow(task, base)).join("")}
             </table>
           </td></tr>`
        : ""}

      <tr><td align="center" style="padding:20px 22px 4px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" bgcolor="${INK}" style="border-radius:9px;">
            <a href="${escapeHtml(`${base}/tarefas`)}"
               style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;font-family:${FONT};">
              Abrir o quadro
            </a>
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:18px 22px 22px;">
        <div style="border-top:1px solid ${LINE};padding-top:12px;font-size:10.5px;color:${MUTED};font-family:${FONT};line-height:1.6;">
          Este lembrete sai junto da coleta diária e só lista o que está atrasado
          ou vence hoje. Tarefas com o selo “detectada pelo sistema” vieram de um
          alerta da coleta (saldo, pagamento, status da conta, criativo reprovado).
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  const text = [
    `Pendências — ${brDate(digest.date)}`,
    resumo,
    "",
    ...digest.projects.map(
      (project) =>
        `[projeto] ${project.name} — ${project.late ? `prazo estourado (${brDate(project.due_date)})` : "entrega hoje"}`
    ),
    ...digest.tasks.map(
      (task) => `[${task.late ? "atrasada" : "hoje"}] ${task.title}${task.clientName ? ` — ${task.clientName}` : ""}`
    ),
    "",
    `Quadro: ${base}/tarefas`,
  ].join("\n");

  return { subject, html, text };
}

export interface DigestSendResult {
  status: "sent" | "skipped" | "error";
  reason?: string;
  recipient?: string;
  digest: TaskDigest | null;
  messageId?: string;
}

// Envia o lembrete. `trigger: "auto"` é o da coleta e sai uma vez por dia;
// "manual" é o botão das Configurações e pode repetir à vontade.
export async function sendTaskDigest(options: {
  trigger: "auto" | "manual";
  force?: boolean;
}): Promise<DigestSendResult> {
  if (supabaseEnvMissing()) {
    return { status: "skipped", reason: "Supabase não configurado.", digest: null };
  }
  const issues = resendIssues();
  if (issues.length) {
    return { status: "skipped", reason: `Envio não configurado: ${issues.join(" · ")}`, digest: null };
  }

  const supabase = getServiceClient();
  const digest = await buildTaskDigest();
  const recipient = digestRecipient();

  const log = async (
    status: DigestSendResult["status"],
    reason?: string,
    messageId?: string
  ) => {
    await supabase
      .from("task_digests")
      .insert({
        digest_date: digest.date,
        trigger: options.trigger,
        recipient: status === "sent" ? recipient : null,
        status,
        tasks_count: digest.tasks.length,
        projects_count: digest.projects.length,
        reason: reason ?? null,
        provider_message_id: messageId ?? null,
      })
      // Sem a migração, o registro se perde mas o e-mail não deixa de sair.
      .then(() => undefined, () => undefined);
  };

  if (!digest.tasks.length && !digest.projects.length) {
    // Silêncio é a informação: e-mail diário de "nada pendente" treina a
    // ignorar a caixa justo no dia em que há algo.
    return { status: "skipped", reason: "nada atrasado nem vencendo hoje", digest };
  }

  // Uma cobrança automática por dia, mesmo que a coleta rode de novo.
  if (options.trigger === "auto" && !options.force) {
    const { data: previous } = await supabase
      .from("task_digests")
      .select("id")
      .eq("digest_date", digest.date)
      .eq("trigger", "auto")
      .eq("status", "sent")
      .limit(1)
      .maybeSingle();
    if (previous) {
      return { status: "skipped", reason: "já enviado hoje", digest };
    }
  }

  const email = renderTaskDigestEmail(digest);
  try {
    const sent = await sendEmail({
      to: recipient,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    await log("sent", undefined, sent.id);
    return { status: "sent", recipient, digest, messageId: sent.id };
  } catch (error: any) {
    const reason = error?.message?.slice(0, 300) || "falha desconhecida ao enviar";
    await log("error", reason);
    return { status: "error", reason, digest };
  }
}
