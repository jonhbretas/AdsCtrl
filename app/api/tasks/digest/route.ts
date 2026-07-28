// app/api/tasks/digest/route.ts
// Lembrete de pendências: envio manual, teste e prévia.
//
// O envio automático NÃO passa por aqui — ele acontece no fim da coleta diária
// (app/api/collect/route.ts), que já roda de cron. O plano Hobby da Vercel
// limita os crons, e o horário da coleta (7h de Brasília) é exatamente quando o
// lembrete faz sentido: os alertas do dia acabaram de ser detectados.
//
// GET  /api/tasks/digest?preview=1   -> o que seria enviado, sem enviar
// POST /api/tasks/digest             -> envia agora (o botão das Configurações)
// GET  /api/tasks/digest?force=1     -> envia mesmo se o automático já saiu hoje

import { NextResponse } from "next/server";
import { buildTaskDigest, digestRecipient, renderTaskDigestEmail, sendTaskDigest } from "@/lib/task-digest";
import { supabaseEnvMissing } from "@/lib/supabase";
import { AUTH_COOKIE_NAME, constantTimeEqual, verifySessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Mesma porta do envio semanal: cron com Bearer, painel com a sessão.
async function authorize(req: Request): Promise<boolean> {
  const authorization = req.headers.get("authorization");
  const cronSecret = (process.env.CRON_SECRET || "").trim();
  if (cronSecret && authorization?.startsWith("Bearer ")) {
    if (await constantTimeEqual(authorization.slice(7), cronSecret)) return true;
  }
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|; )${AUTH_COOKIE_NAME}=([^;]+)`));
  return match ? verifySessionToken(decodeURIComponent(match[1])) : false;
}

async function handle(req: Request) {
  try {
    if (!(await authorize(req))) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }
    if (supabaseEnvMissing()) {
      return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    }

    const params = new URL(req.url).searchParams;

    // Prévia não envia nada e não registra nada: serve para conferir o texto.
    if (params.get("preview") === "1") {
      const digest = await buildTaskDigest();
      const email = renderTaskDigestEmail(digest);
      return NextResponse.json({
        preview: true,
        recipient: await digestRecipient(),
        date: digest.date,
        late_tasks: digest.lateTasks,
        today_tasks: digest.todayTasks,
        projects: digest.projects.length,
        would_send: digest.tasks.length > 0 || digest.projects.length > 0,
        subject: email.subject,
        html: email.html,
      });
    }

    const result = await sendTaskDigest({
      trigger: params.get("trigger") === "auto" ? "auto" : "manual",
      force: params.get("force") === "1",
    });

    return NextResponse.json({
      status: result.status,
      reason: result.reason,
      recipient: result.recipient,
      date: result.digest?.date,
      late_tasks: result.digest?.lateTasks ?? 0,
      today_tasks: result.digest?.todayTasks ?? 0,
      projects: result.digest?.projects.length ?? 0,
      message_id: result.messageId,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Falha ao enviar o lembrete." }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
