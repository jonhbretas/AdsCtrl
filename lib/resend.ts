// lib/resend.ts
// Envio de e-mail pela API do Resend (HTTP direto, sem SDK).

import { getSettings } from "./settings";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

// A chave de API fica só no ambiente — segredo não vai para tabela que a tela
// lê. Remetente e reply-to vêm da Config (com o ambiente como reserva).
export async function resendConfigured(): Promise<boolean> {
  return (await resendIssues()).length === 0;
}

export async function resendIssues(): Promise<string[]> {
  const issues: string[] = [];
  const settings = await getSettings();
  if (!(process.env.RESEND_API_KEY || "").trim()) issues.push("RESEND_API_KEY não configurada");
  if (!settings.report_from_email) {
    issues.push('remetente não configurado em Config › E-mail (ex.: "Agência <relatorios@seudominio.com>")');
  }
  return issues;
}

export interface SendEmailInput {
  to: string | string[];
  cc?: string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<{ id: string }> {
  const issues = await resendIssues();
  if (issues.length) throw new Error(issues.join(" · "));
  const settings = await getSettings();
  const replyTo = input.replyTo || settings.report_reply_to;

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${(process.env.RESEND_API_KEY || "").trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: settings.report_from_email,
      to: Array.isArray(input.to) ? input.to : [input.to],
      ...(input.cc?.length ? { cc: input.cc } : {}),
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
    cache: "no-store",
  });

  const body = await response.text();
  let payload: any = {};
  try {
    payload = body ? JSON.parse(body) : {};
  } catch {
    payload = { raw: body };
  }
  if (!response.ok) {
    throw new Error(`Resend ${response.status}: ${payload?.message || payload?.error?.message || body.slice(0, 200)}`);
  }
  return { id: payload?.id || "" };
}

// Validação simples de endereço — evita chamar a API com lixo vindo do banco.
export function looksLikeEmail(value: string | null | undefined): boolean {
  return Boolean(value && /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(value.trim()));
}

// Divide uma lista separada por vírgula (ou ponto e vírgula) em endereços
// válidos e sem repetição — o relatório vai para os sócios, um de cada vez.
export function parseEmailList(value: string | null | undefined): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value.split(/[,;]/)) {
    const email = raw.trim();
    if (email && looksLikeEmail(email) && !seen.has(email)) {
      seen.add(email);
      out.push(email);
    }
  }
  return out;
}
