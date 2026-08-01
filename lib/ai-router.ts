export const AI_NEEDS = ["auto", "fast", "analysis", "strategic", "creative"] as const;
export type AiNeed = (typeof AI_NEEDS)[number];
export type RoutedNeed = Exclude<AiNeed, "auto">;
export const ROUTED_NEEDS: readonly RoutedNeed[] = ["fast", "analysis", "strategic", "creative"];

export const AI_NEED_LABELS: Record<AiNeed, string> = {
  auto: "Automático",
  fast: "Resposta rápida",
  analysis: "Análise de performance",
  strategic: "Estratégia profunda",
  creative: "Criativos e copy",
};

// Especialidade de cada rota, para o seletor mostrar o que cada opção faz.
export const AI_NEED_SPECIALTY: Record<RoutedNeed, string> = {
  fast: "Respostas curtas e diretas — status, resumos, listas e contagens.",
  analysis: "Métricas, tendências, funil e diagnóstico de performance.",
  strategic: "Orçamento, cenários, escala, margem, lucro e visão de negócio.",
  creative: "Criativos, hook, copy, roteiro e análise de fadiga.",
};

export const AI_NEED_AUTO_HINT = "Roteia pela sua pergunta: criativos, estratégia, respostas rápidas ou análise de performance.";

// Fallback gratuito (Zen "-free"): só entra quando o Go pago falhar por
// qualquer motivo (quota do bloco, erro de região, etc).
const ZEN_MODELS: Record<RoutedNeed, string> = {
  fast: "deepseek-v4-flash-free",
  analysis: "nemotron-3-ultra-free",
  strategic: "nemotron-3-ultra-free",
  creative: "ling-3.0-flash-free",
};

// deepseek-v4-flash exige opt-in de hospedagem na China (RegionError) —
// aceito manualmente em opencode.ai/workspace/.../go antes de usar aqui.
const GO_MODELS: Record<RoutedNeed, string> = {
  fast: "deepseek-v4-flash",
  analysis: "qwen3.7-plus",
  strategic: "glm-5.2",
  creative: "qwen3.7-plus",
};

const ENV_SUFFIX: Record<RoutedNeed, string> = {
  fast: "FAST",
  analysis: "ANALYSIS",
  strategic: "STRATEGIC",
  creative: "CREATIVE",
};

export type AiUsage = { input: number; output: number; total: number };
export type ModelPlanStep = {
  provider: AiProviderId;
  label: string;
  model: string;
  tier: "pago" | "gratuito" | "variavel";
  maxOutputTokens: number | null;
};

// Só os modelos com formato Anthropic (/messages) têm teto explícito de saída.
function maxOutputFor(model: string): number | null {
  return model.startsWith("qwen") || model.startsWith("minimax") ? 1200 : null;
}

// Modelo resolvido por provedor para uma necessidade, respeitando os overrides
// de ambiente (OPENCODE_GO_MODEL_<NEED>, OPENCODE_MODEL_<NEED>, ...). O mesmo
// cálculo usado em askAiProvider — o status da UI mostra exatamente o que
// será chamado.
export function modelPlan(need: RoutedNeed): ModelPlanStep[] {
  const go = process.env[`OPENCODE_GO_MODEL_${ENV_SUFFIX[need]}`]?.trim() || process.env[`OPENCODE_MODEL_${ENV_SUFFIX[need]}`]?.trim() || GO_MODELS[need];
  const zen = process.env[`OPENCODE_MODEL_${ENV_SUFFIX[need]}`]?.trim() || ZEN_MODELS[need];
  const router = process.env[`OPENROUTER_MODEL_${ENV_SUFFIX[need]}`]?.trim() || "openrouter/auto";
  const openai = process.env.OPENAI_MODEL?.trim() || ZEN_MODELS[need];
  return [
    { provider: "opencode-go", label: "OpenCode Go", model: go, tier: "pago", maxOutputTokens: maxOutputFor(go) },
    { provider: "opencode-zen", label: "OpenCode Zen", model: zen, tier: "gratuito", maxOutputTokens: maxOutputFor(zen) },
    { provider: "openrouter", label: "OpenRouter", model: router, tier: "variavel", maxOutputTokens: maxOutputFor(router) },
    { provider: "openai", label: "OpenAI", model: openai, tier: "pago", maxOutputTokens: maxOutputFor(openai) },
  ];
}

export function extractUsage(payload: any, shape: "responses" | "messages" | "chat"): AiUsage | null {
  const usage = payload?.usage;
  if (!usage || typeof usage !== "object") return null;
  if (shape === "messages") {
    const input = Number(usage.input_tokens) || 0;
    const output = Number(usage.output_tokens) || 0;
    if (!input && !output) return null;
    return { input, output, total: input + output };
  }
  const input = Number(usage.input_tokens ?? usage.prompt_tokens) || 0;
  const output = Number(usage.output_tokens ?? usage.completion_tokens) || 0;
  if (!input && !output) return null;
  return { input, output, total: Number(usage.total_tokens) || input + output };
}

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

async function askOpenCode(prompt: string, key: string, model: string, base: string): Promise<{ answer: string | null; status: number; usage: AiUsage | null }> {
  const { endpoint, shape } = openCodeEndpoint(base, model);
  const body =
    shape === "responses"
      ? { model, input: prompt, store: false }
      : shape === "messages"
        ? { model, max_tokens: 1200, messages: [{ role: "user", content: prompt }] }
        : { model, messages: [{ role: "user", content: prompt }] };
  // /messages segue o formato nativo da Anthropic: autentica com x-api-key,
  // não com Authorization Bearer — usar Bearer aí devolve 401 silencioso.
  const headers: Record<string, string> = shape === "messages"
    ? { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }
    : { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const payload = await response.json().catch(() => ({}));
  const usage = extractUsage(payload, shape);
  if (!response.ok) return { answer: null, status: response.status, usage };
  if (shape === "responses") return { answer: responseText(payload), status: response.status, usage };
  if (shape === "messages") return { answer: messageText(payload), status: response.status, usage };
  return { answer: chatText(payload), status: response.status, usage };
}

export type AiProviderId = "opencode-go" | "opencode-zen" | "openrouter" | "openai";
export type AiProviderResult = { answer: string; provider: AiProviderId; model: string; usage: AiUsage | null };
export type AiProviderAttempt = { provider: AiProviderId; configured: boolean; ok: boolean; reason?: string };

function attemptError(error: any): string {
  if (error?.name === "TimeoutError" || error?.name === "AbortError") return "tempo limite excedido";
  return error?.message || "falha de rede";
}

export async function askAiProvider(prompt: string, need: RoutedNeed): Promise<{ result: AiProviderResult | null; attempts: AiProviderAttempt[] }> {
  const attempts: AiProviderAttempt[] = [];
  const plan = modelPlan(need);

  const goKey = process.env.OPENCODE_GO_API_KEY?.trim();
  if (goKey) {
    const model = plan.find((step) => step.provider === "opencode-go")?.model || GO_MODELS[need];
    try {
      const { answer, status, usage } = await askOpenCode(prompt, goKey, model, "https://opencode.ai/zen/go/v1");
      if (answer) { attempts.push({ provider: "opencode-go", configured: true, ok: true }); return { result: { answer, provider: "opencode-go", model, usage }, attempts }; }
      attempts.push({ provider: "opencode-go", configured: true, ok: false, reason: status ? `HTTP ${status}` : "resposta vazia" });
    } catch (error) { attempts.push({ provider: "opencode-go", configured: true, ok: false, reason: attemptError(error) }); }
  } else attempts.push({ provider: "opencode-go", configured: false, ok: false });

  const zenKey = process.env.OPENCODE_ZEN_API_KEY?.trim();
  if (zenKey) {
    const model = plan.find((step) => step.provider === "opencode-zen")?.model || ZEN_MODELS[need];
    try {
      const { answer, status, usage } = await askOpenCode(prompt, zenKey, model, "https://opencode.ai/zen/v1");
      if (answer) { attempts.push({ provider: "opencode-zen", configured: true, ok: true }); return { result: { answer, provider: "opencode-zen", model, usage }, attempts }; }
      attempts.push({ provider: "opencode-zen", configured: true, ok: false, reason: status ? `HTTP ${status}` : "resposta vazia" });
    } catch (error) { attempts.push({ provider: "opencode-zen", configured: true, ok: false, reason: attemptError(error) }); }
  } else attempts.push({ provider: "opencode-zen", configured: false, ok: false });

  const routerKey = process.env.OPENROUTER_API_KEY?.trim();
  if (routerKey) {
    const model = plan.find((step) => step.provider === "openrouter")?.model || "openrouter/auto";
    try {
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
      const usage = extractUsage(payload, "chat");
      if (answer) { attempts.push({ provider: "openrouter", configured: true, ok: true }); return { result: { answer, provider: "openrouter", model: payload?.model || model, usage }, attempts }; }
      attempts.push({ provider: "openrouter", configured: true, ok: false, reason: response.ok ? "resposta vazia" : `HTTP ${response.status}` });
    } catch (error) { attempts.push({ provider: "openrouter", configured: true, ok: false, reason: attemptError(error) }); }
  } else attempts.push({ provider: "openrouter", configured: false, ok: false });

  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  if (openAiKey) {
    const model = plan.find((step) => step.provider === "openai")?.model || ZEN_MODELS[need];
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, input: prompt, store: false }),
        signal: AbortSignal.timeout(60_000),
      });
      const payload = await response.json().catch(() => ({}));
      const answer = response.ok ? responseText(payload) : null;
      const usage = extractUsage(payload, "responses");
      if (answer) { attempts.push({ provider: "openai", configured: true, ok: true }); return { result: { answer, provider: "openai", model, usage }, attempts }; }
      attempts.push({ provider: "openai", configured: true, ok: false, reason: response.ok ? "resposta vazia" : `HTTP ${response.status}` });
    } catch (error) { attempts.push({ provider: "openai", configured: true, ok: false, reason: attemptError(error) }); }
  } else attempts.push({ provider: "openai", configured: false, ok: false });

  return { result: null, attempts };
}
