// app/api/settings/route.ts
// Configurações do sistema editadas na tela de Config.
//
// O GET devolve três coisas de propósito: o valor gravado, o que o ambiente
// ofereceria e o efetivo. A tela precisa dos três para mostrar "herdado do
// .env" em vez de fingir que o campo está vazio.
//
// Chave de API não passa por aqui — segredo continua só no ambiente.

import { NextResponse } from "next/server";
import { getEnvDefaults, getSettings, getStoredSettings, saveSettings, SETTING_KEYS, type SettingKey } from "@/lib/settings";
import { looksLikeEmail } from "@/lib/resend";

export const dynamic = "force-dynamic";

// Remetente aceita "Nome <caixa@dominio>"; os demais são endereço puro.
function emailInsideAngleBrackets(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim();
}

const EMAIL_KEYS: SettingKey[] = ["report_from_email", "report_reply_to", "report_test_email", "task_alert_email"];

export async function GET() {
  try {
    return NextResponse.json({
      stored: await getStoredSettings(),
      env: getEnvDefaults(),
      effective: await getSettings(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Falha ao ler as configurações." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "O corpo precisa ser um objeto JSON." }, { status: 400 });
    }

    const patch: Partial<Record<SettingKey, string | null>> = {};
    for (const [key, raw] of Object.entries(body as Record<string, unknown>)) {
      if (!SETTING_KEYS.includes(key as SettingKey)) continue;
      if (raw !== null && typeof raw !== "string") {
        return NextResponse.json({ error: `${key} deve ser texto ou null.` }, { status: 400 });
      }
      const value = (raw ?? "").trim();
      if (value.length > 200) {
        return NextResponse.json({ error: `${key} deve ter no máximo 200 caracteres.` }, { status: 400 });
      }
      // Vazio significa "volta a herdar do ambiente", então não valida formato.
      if (value && EMAIL_KEYS.includes(key as SettingKey) && !looksLikeEmail(emailInsideAngleBrackets(value))) {
        return NextResponse.json({ error: `${key} precisa conter um e-mail válido.` }, { status: 400 });
      }
      patch[key as SettingKey] = value || null;
    }

    const effective = await saveSettings(patch);
    return NextResponse.json({
      stored: await getStoredSettings(),
      env: getEnvDefaults(),
      effective,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Falha ao salvar as configurações." }, { status: 500 });
  }
}
