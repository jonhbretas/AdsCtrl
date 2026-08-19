// lib/finance-digest.ts
// Relatório financeiro mensal por e-mail — para mim, não para o cliente.
//
// Entradas, saídas, lucratividade e DRE do mês em um único e-mail, no último
// dia do mês junto da coleta diária (nada de cron novo: o plano Hobby limita
// os crons, e a coleta já roda todo dia). O botão do painel dispara a hora
// que quiser.
//
// Destinatário é o mesmo dos lembretes internos (task_alert_email): o e-mail
// do dono, não o de nenhum cliente.
//
// O disparo vive em app/api/finance/digest/route.ts e no fim da coleta.

import { money, brDate } from "./format";
import { looksLikeEmail, resendIssues, sendEmail } from "./resend";
import { getSettings } from "./settings";
import { getServiceClient, supabaseEnvMissing } from "./supabase";
import { appBrandName } from "./brand";

const INK = "#12161f";
const MUTED = "#6f7787";
const LINE = "#e6e8ee";
const GREEN = "#1f9254";
const RED = "#cf4a45";
const BLUE = "#2f6fe4";
const FONT = "Arial, Helvetica, sans-serif";

export interface FinanceDigest {
  month: string;
  monthLabel: string;
  entries: any[];
  summary: {
    revenue: number;
    expenses: number;
    received: number;
    paid: number;
    result: number;
    projected_result: number;
    receivable: number;
    payable: number;
    margin: number;
    projected_margin: number;
  };
  dre: { name: string; revenue: number; received: number; expenses: number; paid: number }[];
}

// O mês coberto por um relatório: "YYYY-MM" (o do calendário, no fuso de
// São Paulo — a agência inteira trabalha nele). Fora do formato ou vazio,
// cai no mês corrente.
export function digestMonth(value: string | null): string {
  if (value && /^\d{4}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7);
}

export function monthRange(month: string): { start: string; end: string } {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, monthNumber, 0));
  const end = `${year}-${String(monthNumber).padStart(2, "0")}-${String(endDate.getUTCDate()).padStart(2, "0")}`;
  return { start, end };
}

// Hoje é o último dia do mês em São Paulo? A coleta roda todo dia e só este
// dia dispara o relatório; o resto do mês cai fora sem virar registro.
export function isLastDayOfMonth(): boolean {
  const now = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());
  const [y, m, d] = now.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d === lastDay;
}

export async function digestRecipient(): Promise<string> {
  const configured = (await getSettings()).task_alert_email;
  if (!looksLikeEmail(configured)) {
    throw new Error("Defina o e-mail dos lembretes internos em Config › E-mail.");
  }
  return configured;
}

// Resumo do mês a partir dos lançamentos — o mesmo cálculo da tela Financeiro
// (mesma deduplicação de recorrência, para o e-mail não contar duas vezes).
export async function buildFinanceDigest(month: string): Promise<FinanceDigest> {
  const range = monthRange(month);
  const sb = getServiceClient();
  const { data: rawEntries, error: entriesError } = await sb
    .from("financial_entries")
    .select("*, clients(id,name), financial_categories(id,name,kind)")
    .gte("due_date", range.start)
    .lte("due_date", range.end)
    .order("due_date", { ascending: false });
  if (entriesError) throw entriesError;

  const unique = new Map<string, any>();
  for (const row of rawEntries || []) {
    const key = [row.client_id || "agency", row.kind, row.description.trim().toLowerCase(), row.amount, row.due_date].join("|");
    const previous = unique.get(key);
    if (!previous || (row.source === "recurring" && previous.source !== "recurring")) unique.set(key, row);
  }
  const entries = [...unique.values()];
  const sum = (predicate: (row: any) => boolean) => entries.filter(predicate).reduce((total, row) => total + Number(row.amount || 0), 0);

  const revenue = sum((row) => row.kind === "revenue");
  const expenses = sum((row) => row.kind === "expense");
  const received = sum((row) => row.kind === "revenue" && row.status === "confirmed");
  const paid = sum((row) => row.kind === "expense" && row.status === "confirmed");
  const receivable = sum((row) => row.kind === "revenue" && row.status === "planned");
  const payable = sum((row) => row.kind === "expense" && row.status === "planned");

  const dre = [...new Set(entries.map((row) => row.financial_categories?.name || "Sem categoria"))].map((name) => ({
    name,
    revenue: sum((row) => row.kind === "revenue" && (row.financial_categories?.name || "Sem categoria") === name),
    received: sum((row) => row.kind === "revenue" && row.status === "confirmed" && (row.financial_categories?.name || "Sem categoria") === name),
    expenses: sum((row) => row.kind === "expense" && (row.financial_categories?.name || "Sem categoria") === name),
    paid: sum((row) => row.kind === "expense" && row.status === "confirmed" && (row.financial_categories?.name || "Sem categoria") === name),
  }));

  const [y, m] = month.split("-").map(Number);
  return {
    month,
    monthLabel: `${m}/${y}`,
    entries,
    summary: {
      revenue,
      expenses,
      received,
      paid,
      result: received - paid,
      projected_result: revenue - expenses,
      receivable,
      payable,
      margin: received ? ((received - paid) / received) * 100 : 0,
      projected_margin: revenue ? ((revenue - expenses) / revenue) * 100 : 0,
    },
    dre,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function metricCell(label: string, value: string, color = INK): string {
  return `
    <td width="33%" valign="top" style="padding:0 5px 10px 5px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="border:1px solid ${LINE};border-radius:8px;background:#ffffff;">
        <tr><td style="padding:11px 12px;">
          <div style="font-size:10px;font-weight:bold;letter-spacing:.4px;text-transform:uppercase;color:${MUTED};font-family:${FONT};">${escapeHtml(label)}</div>
          <div style="font-size:19px;font-weight:bold;color:${color};font-family:${FONT};padding:4px 0 0;">${escapeHtml(value)}</div>
        </td></tr>
      </table>
    </td>`;
}

function metricRows(cells: string[]): string {
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += 3) {
    const group = cells.slice(i, i + 3);
    const filler = group.length < 3 ? `<td width="33%">&nbsp;</td>`.repeat(3 - group.length) : "";
    rows.push(`<tr>${group.join("")}${filler}</tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 -5px;">${rows.join("")}</table>`;
}

// Barras horizontais em tabela — a única forma de "gráfico" que sobrevive ao
// Gmail (mesma técnica do relatório semanal).
function barChart(rows: { label: string; right: string }[], color: string): string {
  const body = rows
    .map(
      (r) => `
      <tr>
        <td width="52%" style="padding:3px 8px 3px 0;font-size:11px;color:#4a5160;font-family:${FONT};white-space:nowrap;">${escapeHtml(r.label)}</td>
        <td width="26%" style="padding:3px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f3f7;border-radius:3px;">
            <tr><td width="100%" style="background:${color};border-radius:3px;font-size:0;line-height:0;height:9px;">&nbsp;</td><td>&nbsp;</td></tr>
          </table>
        </td>
        <td width="22%" align="right" style="padding:3px 0 3px 8px;font-size:11px;font-weight:bold;color:${INK};font-family:${FONT};white-space:nowrap;">${escapeHtml(r.right)}</td>
      </tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table>`;
}

function section(title: string, body: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="padding:6px 0 8px;">
        <div style="font-size:12px;font-weight:bold;color:${INK};font-family:${FONT};margin-bottom:8px;">${escapeHtml(title)}</div>
        ${body}
      </td></tr>
    </table>`;
}

export function renderFinanceDigestEmail(digest: FinanceDigest): { subject: string; html: string; text: string } {
  const s = digest.summary;
  const monthLabel = digest.monthLabel;
  const resultColor = s.result >= 0 ? GREEN : RED;
  const marginLabel = s.margin.toFixed(1).replace(".", ",");
  const marginColor = s.margin >= 0 ? GREEN : RED;

  // Maiores receitas e despesas do mês, para o e-mail não virar um balanço sem rosto.
  const byAmount = (a: any, b: any) => Number(b.amount || 0) - Number(a.amount || 0);
  const topRevenue = digest.entries.filter((row) => row.kind === "revenue").sort(byAmount).slice(0, 5);
  const topExpenses = digest.entries.filter((row) => row.kind === "expense").sort(byAmount).slice(0, 5);

  const dreRows = digest.dre.length
    ? digest.dre.map(
        (row) => `
        <tr>
          <td style="padding:7px 8px;font-size:12px;color:#4a5160;font-family:${FONT};border-bottom:1px solid ${LINE};">${escapeHtml(row.name)}</td>
          <td align="right" style="padding:7px 8px;font-size:12px;color:${row.revenue ? GREEN : MUTED};font-family:${FONT};border-bottom:1px solid ${LINE};">${money(row.revenue)}</td>
          <td align="right" style="padding:7px 8px;font-size:12px;color:${row.expenses ? RED : MUTED};font-family:${FONT};border-bottom:1px solid ${LINE};">${money(row.expenses)}</td>
          <td align="right" style="padding:7px 8px;font-size:12px;font-weight:bold;color:${INK};font-family:${FONT};border-bottom:1px solid ${LINE};">${money(row.revenue - row.expenses)}</td>
        </tr>`
      ).join("")
    : `<tr><td style="padding:7px 8px;font-size:12px;color:${MUTED};font-family:${FONT};">Sem lançamentos por categoria neste mês.</td></tr>`;

  const receivable = s.receivable > 0 ? `<tr><td style="padding:6px 8px;font-size:12px;color:#4a5160;font-family:${FONT};">A receber (confirmadas pendentes + previstas)</td><td align="right" style="padding:6px 8px;font-size:12px;font-weight:bold;color:${INK};font-family:${FONT};">${money(s.receivable)}</td></tr>` : "";
  const payable = s.payable > 0 ? `<tr><td style="padding:6px 8px;font-size:12px;color:#4a5160;font-family:${FONT};">A pagar (pagas pendentes + previstas)</td><td align="right" style="padding:6px 8px;font-size:12px;font-weight:bold;color:${INK};font-family:${FONT};">${money(s.payable)}</td></tr>` : "";

  const topRevenueRows = topRevenue.length
    ? barChart(topRevenue.map((row) => ({ label: `${brDate(row.due_date)} · ${row.description}`, right: money(row.amount) })), GREEN)
    : `<div style="font-size:12px;color:${MUTED};font-family:${FONT};">Nenhuma receita lançada no mês.</div>`;
  const topExpenseRows = topExpenses.length
    ? barChart(topExpenses.map((row) => ({ label: `${brDate(row.due_date)} · ${row.description}`, right: money(row.amount) })), RED)
    : `<div style="font-size:12px;color:${MUTED};font-family:${FONT};">Nenhuma despesa lançada no mês.</div>`;

  const html = `
  <div style="background:#f6f7f9;padding:24px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;">
      <tr><td style="text-align:center;padding:0 0 14px;">
        <div style="font-size:17px;font-weight:bold;color:${INK};font-family:${FONT};">${escapeHtml(appBrandName())}</div>
        <div style="font-size:12px;color:${MUTED};font-family:${FONT};">Relatório financeiro mensal · ${monthLabel}</div>
      </td></tr>
      <tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:12px;padding:20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="middle" style="padding:0 0 16px;">
              <div style="font-size:11px;font-weight:bold;letter-spacing:.4px;text-transform:uppercase;color:${MUTED};font-family:${FONT};">Resultado do mês</div>
              <div style="font-size:28px;font-weight:bold;color:${resultColor};font-family:${FONT};">${money(s.result)}</div>
              <div style="font-size:12px;color:${MUTED};font-family:${FONT};padding-top:2px;">Lucratividade de <strong style="color:${marginColor};">${marginLabel}%</strong> sobre o que foi recebido (recebido ${money(s.received)} − pagas ${money(s.paid)}).</div>
            </td>
          </tr>
        </table>
        ${metricRows([
          metricCell("Receita prevista", money(s.revenue)),
          metricCell("Receita recebida", money(s.received), GREEN),
          metricCell("A receber", money(s.receivable), s.receivable > 0 ? BLUE : MUTED),
          metricCell("Despesas previstas", money(s.expenses)),
          metricCell("Despesas pagas", money(s.paid), RED),
          metricCell("A pagar", money(s.payable), s.payable > 0 ? BLUE : MUTED),
        ])}
        ${section(
          "DRE por categoria",
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:8px;">
            <tr style="background:#f6f7f9;">
              <td style="padding:7px 8px;font-size:10px;font-weight:bold;text-transform:uppercase;color:${MUTED};font-family:${FONT};border-bottom:1px solid ${LINE};">Categoria</td>
              <td align="right" style="padding:7px 8px;font-size:10px;font-weight:bold;text-transform:uppercase;color:${MUTED};font-family:${FONT};border-bottom:1px solid ${LINE};">Receita</td>
              <td align="right" style="padding:7px 8px;font-size:10px;font-weight:bold;text-transform:uppercase;color:${MUTED};font-family:${FONT};border-bottom:1px solid ${LINE};">Despesa</td>
              <td align="right" style="padding:7px 8px;font-size:10px;font-weight:bold;text-transform:uppercase;color:${MUTED};font-family:${FONT};border-bottom:1px solid ${LINE};">Saldo</td>
            </tr>
            ${dreRows}
          </table>`
        )}
        ${section("A receber / a pagar", `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:8px;">
            <tr><td style="padding:6px 8px;font-size:12px;color:${MUTED};font-family:${FONT};">Resultado previsto no fim do mês (receita − despesa)</td><td align="right" style="padding:6px 8px;font-size:12px;font-weight:bold;color:${s.projected_result >= 0 ? GREEN : RED};font-family:${FONT};">${money(s.projected_result)}</td></tr>
            ${receivable}
            ${payable}
            ${!receivable && !payable && s.projected_result === 0 ? `<tr><td style="padding:6px 8px;font-size:12px;color:${MUTED};font-family:${FONT};">Nada em aberto além do previsto.</td></tr>` : ""}
          </table>
        `)}
        ${section("Maiores receitas do mês", topRevenueRows)}
        ${section("Maiores despesas do mês", topExpenseRows)}
        <div style="border-top:1px solid ${LINE};margin-top:18px;padding-top:12px;font-size:11px;color:${MUTED};font-family:${FONT};line-height:1.5;">
          E-mail interno da agência. Valores de ${monthLabel} com base nos lançamentos do Financeiro (confirmados e previstos).
        </div>
      </td></tr>
    </table>
  </div>`;

  const text = [
    `Relatório financeiro mensal · ${monthLabel}`,
    ``,
    `Resultado do mês: ${money(s.result)} (lucratividade ${marginLabel}%)`,
    ``,
    `Receita prevista: ${money(s.revenue)} · recebida: ${money(s.received)} · a receber: ${money(s.receivable)}`,
    `Despesas previstas: ${money(s.expenses)} · pagas: ${money(s.paid)} · a pagar: ${money(s.payable)}`,
    `Resultado previsto: ${money(s.projected_result)}`,
  ].join("\n");

  return {
    subject: `Relatório financeiro · ${monthLabel}`,
    html,
    text,
  };
}

export interface FinanceDigestSendResult {
  status: "sent" | "skipped" | "error";
  reason?: string;
  recipient?: string;
  digest: FinanceDigest | null;
  messageId?: string;
}

// Envia o relatório do mês. `trigger: "auto"` é o da coleta e só sai no último
// dia do mês, uma vez por mês; "manual" é o botão do painel e pode repetir.
export async function sendFinanceDigest(options: {
  trigger: "auto" | "manual";
  force?: boolean;
  month?: string;
}): Promise<FinanceDigestSendResult> {
  if (supabaseEnvMissing()) {
    return { status: "skipped", reason: "Supabase não configurado.", digest: null };
  }
  const issues = await resendIssues();
  if (issues.length) {
    return { status: "skipped", reason: `Envio não configurado: ${issues.join(" · ")}`, digest: null };
  }

  const month = digestMonth(options.month || null);
  const supabase = getServiceClient();
  const digest = await buildFinanceDigest(month);
  const recipient = await digestRecipient();

  const log = async (
    status: FinanceDigestSendResult["status"],
    reason?: string,
    messageId?: string
  ) => {
    await supabase
      .from("finance_digest_sends")
      .insert({
        period: month,
        trigger: options.trigger,
        recipient: status === "sent" ? recipient : null,
        status,
        reason: reason ?? null,
        provider_message_id: messageId ?? null,
      })
      // Sem a migração, o registro se perde mas o e-mail não deixa de sair.
      .then(() => undefined, () => undefined);
  };

  // O automático só dispara no último dia do mês, no fuso de São Paulo. Um
  // teste manual pode pedir qualquer mês a qualquer momento.
  if (options.trigger === "auto" && !options.force && !isLastDayOfMonth()) {
    return { status: "skipped", reason: "ainda não é o último dia do mês", digest };
  }

  // Uma cobrança automática por mês, mesmo que a coleta rode de novo no dia.
  if (options.trigger === "auto" && !options.force) {
    const { data: previous } = await supabase
      .from("finance_digest_sends")
      .select("id")
      .eq("period", month)
      .eq("trigger", "auto")
      .eq("status", "sent")
      .limit(1)
      .maybeSingle();
    if (previous) {
      return { status: "skipped", reason: "já enviado neste mês", digest };
    }
  }

  const email = renderFinanceDigestEmail(digest);
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
