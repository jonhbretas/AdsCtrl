// lib/resend.ts
// Envio de e-mail pela API do Resend (HTTP direto, sem SDK).

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function resendConfigured(): boolean {
  return Boolean((process.env.RESEND_API_KEY || "").trim() && (process.env.REPORT_FROM_EMAIL || "").trim());
}

export function resendIssues(): string[] {
  const issues: string[] = [];
  if (!(process.env.RESEND_API_KEY || "").trim()) issues.push("RESEND_API_KEY não configurada");
  if (!(process.env.REPORT_FROM_EMAIL || "").trim()) {
    issues.push('REPORT_FROM_EMAIL não configurado (ex.: "Agência <relatorios@seudominio.com>")');
  }
  return issues;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<{ id: string }> {
  const issues = resendIssues();
  if (issues.length) throw new Error(issues.join(" · "));

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${(process.env.RESEND_API_KEY || "").trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: (process.env.REPORT_FROM_EMAIL || "").trim(),
      to: [input.to],
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
      ...(input.replyTo || process.env.REPORT_REPLY_TO
        ? { reply_to: input.replyTo || (process.env.REPORT_REPLY_TO || "").trim() }
        : {}),
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
