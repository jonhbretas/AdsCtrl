export const AI_NEEDS = ["auto", "fast", "analysis", "strategic", "creative"] as const;
export type AiNeed = (typeof AI_NEEDS)[number];
export type RoutedNeed = Exclude<AiNeed, "auto">;

export const AI_NEED_LABELS: Record<AiNeed, string> = {
  auto: "Automático",
  fast: "Resposta rápida",
  analysis: "Análise de performance",
  strategic: "Estratégia profunda",
  creative: "Criativos e copy",
};

const ZEN_MODELS: Record<RoutedNeed, string> = {
  fast: "gpt-5.6-luna",
  analysis: "gpt-5.6-terra",
  strategic: "gpt-5.6-sol",
  creative: "gpt-5.6-terra",
};

const GO_MODELS: Record<RoutedNeed, string> = {
  fast: "deepseek-v4-flash",
  analysis: "deepseek-v4-flash",
  strategic: "qwen3.7-plus",
  creative: "qwen3.7-plus",
};

const ENV_SUFFIX: Record<RoutedNeed, string> = {
  fast: "FAST",
  analysis: "ANALYSIS",
  strategic: "STRATEGIC",
  creative: "CREATIVE",
};

export function routeNeed(requested: AiNeed, message: string, pathname: string): { need: RoutedNeed; automatic: boolean } {
  if (requested !== "auto") return { need: requested, automatic: false };
  const text = `${pathname} ${message}`.toLocaleLowerCase("pt-BR");
  if (/criativ|copy|hook|roteiro|headline|anúncio|anuncio|fadiga|thumbnail|vídeo|video/.test(text)) return { need: "creative", automatic: true };
  if (/estrat|escala|escalar|orçamento|orcamento|previs|cenário|cenario|negócio|negocio|margem|lucro|dre|carteira/.test(text)) return { need: "strategic", automatic: true };
  if (/resum|rápid|rapid|status|agora|quantos|liste|alertas?/.test(text)) return { need: "fast", automatic: true };
  return { need: "analysis", automatic: true };
}

function responseText(payload: any): string | null {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  for (const item of payload?.output || []) for (const content of item?.content || []) if (typeof content?.text === "string" && content.text.trim()) return content.text.trim();
  return null;
}

function chatText(payload: any): string | null {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  if (Array.isArray(content)) return content.map((item) => item?.text || "").join("\n").trim() || null;
  return null;
}

function messageText(payload: any): string | null {
  const content = payload?.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  if (Array.isArray(content)) return content.map((item) => item?.text || "").join("\n").trim() || null;
  return null;
}

function openCodeEndpoint(base: string, model: string): { endpoint: string; shape: "responses" | "messages" | "chat" } {
  if (model.startsWith("gpt-")) return { endpoint: `${base}/responses`, shape: "responses" };
  if (model.startsWith("qwen") || model.startsWith("minimax")) return { endpoint: `${base}/messages`, shape: "messages" };
  return { endpoint: `${base}/chat/completions`, shape: "chat" };
}

async function askOpenCode(prompt: string, key: string, model: string, base: string) {
  const { endpoint, shape } = openCodeEndpoint(base, model);
  const body =
    shape === "responses"
      ? { model, input: prompt, store: false }
      : shape === "messages"
        ? { model, max_tokens: 1200, messages: [{ role: "user", content: prompt }] }
        : { model, messages: [{ role: "user", content: prompt }] };
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  if (shape === "responses") return responseText(payload);
  if (shape === "messages") return messageText(payload);
  return chatText(payload);
}

export type AiProviderResult = { answer: string; provider: "opencode-go" | "opencode-zen" | "openrouter" | "openai"; model: string };

export async function askAiProvider(prompt: string, need: RoutedNeed): Promise<AiProviderResult | null> {
  const goKey = process.env.OPENCODE_GO_API_KEY?.trim();
  if (goKey) {
    try {
      const model = process.env[`OPENCODE_GO_MODEL_${ENV_SUFFIX[need]}`]?.trim() || process.env[`OPENCODE_MODEL_${ENV_SUFFIX[need]}`]?.trim() || GO_MODELS[need];
      const answer = await askOpenCode(prompt, goKey, model, "https://opencode.ai/zen/go/v1");
      if (answer) return { answer, provider: "opencode-go", model };
    } catch {}
  }

  const zenKey = process.env.OPENCODE_ZEN_API_KEY?.trim();
  if (zenKey) {
    try {
      const model = process.env[`OPENCODE_MODEL_${ENV_SUFFIX[need]}`]?.trim() || ZEN_MODELS[need];
      const answer = await askOpenCode(prompt, zenKey, model, "https://opencode.ai/zen/v1");
      if (answer) return { answer, provider: "opencode-zen", model };
    } catch {}
  }

  const routerKey = process.env.OPENROUTER_API_KEY?.trim();
  if (routerKey) {
    try {
      const model = process.env[`OPENROUTER_MODEL_${ENV_SUFFIX[need]}`]?.trim() || "openrouter/auto";
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${routerKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.APP_URL?.trim() || "http://localhost:3000",
          "X-Title": "Assertivus Dash",
        },
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
        signal: AbortSignal.timeout(60_000),
      });
      const payload = await response.json().catch(() => ({}));
      const answer = response.ok ? chatText(payload) : null;
      if (answer) return { answer, provider: "openrouter", model: payload?.model || model };
    } catch {}
  }

  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  if (openAiKey) {
    try {
      const model = process.env.OPENAI_MODEL?.trim() || ZEN_MODELS[need];
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, input: prompt, store: false }),
        signal: AbortSignal.timeout(60_000),
      });
      const payload = await response.json().catch(() => ({}));
      const answer = response.ok ? responseText(payload) : null;
      if (answer) return { answer, provider: "openai", model };
    } catch {}
  }
  return null;
}
