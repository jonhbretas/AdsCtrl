// app/api/ai/status/route.ts
// Status de configuração dos provedores de IA (Assertivus IA), pra UI mostrar
// antes de qualquer pergunta. Não chama os provedores — só confere se a
// variável de ambiente da chave está presente. Segredo continua só no
// ambiente (mesma regra do /api/settings).
// Também devolve o PLANO de roteamento: modelo exato (com overrides de env)
// que cada necessidade usaria em cada provedor configurado.

import { NextResponse } from "next/server";
import {
  AI_NEED_AUTO_HINT,
  AI_NEED_LABELS,
  AI_NEED_SPECIALTY,
  ROUTED_NEEDS,
  modelPlan,
  type AiProviderId,
} from "@/lib/ai-router";

const PROVIDER_ENV: Record<AiProviderId, { label: string; envKey: string }> = {
  "opencode-go": { label: "OpenCode Go", envKey: "OPENCODE_GO_API_KEY" },
  "opencode-zen": { label: "OpenCode Zen", envKey: "OPENCODE_ZEN_API_KEY" },
  openrouter: { label: "OpenRouter", envKey: "OPENROUTER_API_KEY" },
  openai: { label: "OpenAI", envKey: "OPENAI_API_KEY" },
};

const PRIORITY: AiProviderId[] = ["opencode-go", "opencode-zen", "openrouter", "openai"];

export async function GET() {
  const providers = PRIORITY.map((id) => ({ id, label: PROVIDER_ENV[id].label, configured: Boolean(process.env[PROVIDER_ENV[id].envKey]?.trim()) }));
  const active = providers.find((provider) => provider.configured) || null;

  const plan = ROUTED_NEEDS.map((need) => ({
    need,
    label: AI_NEED_LABELS[need],
    specialty: AI_NEED_SPECIALTY[need],
    steps: modelPlan(need)
      .filter((step) => Boolean(process.env[PROVIDER_ENV[step.provider].envKey]?.trim()))
      .map((step) => ({ provider: step.provider, label: step.label, model: step.model, tier: step.tier, maxOutputTokens: step.maxOutputTokens })),
  }));

  return NextResponse.json({
    providers,
    active: active?.id || null,
    activeLabel: active?.label || null,
    plan,
    auto: AI_NEED_AUTO_HINT,
  });
}
