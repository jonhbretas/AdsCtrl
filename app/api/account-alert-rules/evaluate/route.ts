// app/api/account-alert-rules/evaluate/route.ts
// Avalia as regras de alerta de UMA conta agora (botão "Testar regras").
// A coleta também avalia, mas aqui o resultado é imediato, para a tela
// mostrar o que cada regra encontrou antes de esperar o cron.

import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";
import { evaluateAccountRules } from "@/lib/account-alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const body = await request.json().catch(() => null);
    const accountId = String(body?.account_id || "").trim().replace(/^act_/, "");
    if (!accountId) return NextResponse.json({ error: "account_id é obrigatório." }, { status: 400 });

    const evaluations = await evaluateAccountRules(getServiceClient(), accountId);
    return NextResponse.json({
      evaluated: evaluations.map((entry) => ({
        id: entry.rule.id,
        kind: entry.rule.kind,
        name: entry.rule.name,
        ok: entry.ok,
        alert: entry.alert,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao avaliar as regras." }, { status: 500 });
  }
}
