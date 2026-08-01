// app/api/client-alert-rules/evaluate/route.ts
// Avalia as regras de alerta de UM cliente agora (botão "Testar regras").
// A coleta também avalia, mas aqui o resultado é imediato, para a tela
// mostrar o que cada regra encontrou antes de esperar o cron.

import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";
import { evaluateClientRules } from "@/lib/client-alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const body = await request.json().catch(() => null);
    const clientId = String(body?.client_id || "").trim();
    if (!clientId) return NextResponse.json({ error: "client_id é obrigatório." }, { status: 400 });

    const evaluations = await evaluateClientRules(getServiceClient(), clientId);
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
