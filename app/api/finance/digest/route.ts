// app/api/finance/digest/route.ts
// Relatório financeiro mensal: envio manual, teste e prévia.
//
// O envio automático NÃO passa por aqui — ele acontece no fim da coleta diária
// (app/api/collect/route.ts), só no último dia do mês. O plano Hobby da Vercel
// limita os crons, e a coleta já roda todo dia.
//
// GET  /api/finance/digest?preview=1             -> o que sairia, sem enviar
// GET  /api/finance/digest?preview=1&month=2026-07
// POST /api/finance/digest                       -> envia agora (botão do painel)
// POST /api/finance/digest?month=2026-07         -> envia o mês pedido

import { NextResponse } from "next/server";
import { buildFinanceDigest, digestMonth, digestRecipient, renderFinanceDigestEmail, sendFinanceDigest } from "@/lib/finance-digest";
import { supabaseEnvMissing } from "@/lib/supabase";
import { AUTH_COOKIE_NAME, constantTimeEqual, verifySessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Mesma porta dos outros envios: cron com Bearer, painel com a sessão.
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
    const month = digestMonth(params.get("month"));

    // Prévia não envia nada e não registra nada: serve para conferir o texto.
    if (params.get("preview") === "1") {
      const [digest, recipient] = await Promise.all([buildFinanceDigest(month), digestRecipient().catch(() => "")]);
      const email = renderFinanceDigestEmail(digest);
      return NextResponse.json({
        preview: true,
        month: digest.month,
        recipient,
        summary: digest.summary,
        dre: digest.dre,
        entries: digest.entries.length,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    }

    const result = await sendFinanceDigest({
      trigger: "manual",
      force: true,
      month,
    });

    return NextResponse.json({
      status: result.status,
      reason: result.reason,
      recipient: result.recipient,
      month: result.digest?.month,
      summary: result.digest?.summary,
      entries: result.digest?.entries.length ?? 0,
      message_id: result.messageId,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Falha ao enviar o relatório financeiro." }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
