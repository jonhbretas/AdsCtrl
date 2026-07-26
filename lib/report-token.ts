// lib/report-token.ts
// Link assinado do relatório: o cliente abre sem senha, mas só aquele
// relatório e só até a data de expiração. O token carrega conta + período e
// é assinado com HMAC-SHA256 — quem não tem o segredo não consegue forjar
// nem trocar o período/conta de um link existente.
// Sem APIs de Node aqui: o middleware também importa este arquivo.

const encoder = new TextEncoder();
const TOKEN_VERSION = "r1";
export const REPORT_LINK_TTL_DAYS = 60;

export interface ReportTokenPayload {
  accountId: string;
  since: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD
  exp: number; // epoch em segundos
}

function secret(): string {
  // Segredo dedicado quando existir; senão reaproveita o da sessão.
  return (process.env.REPORT_LINK_SECRET || process.env.SESSION_SECRET || "").trim();
}

export function reportLinkConfigured(): boolean {
  return secret().length >= 32;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function textToBase64Url(value: string): string {
  return bytesToBase64Url(encoder.encode(value));
}

function base64UrlToText(value: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

async function sign(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return bytesToBase64Url(new Uint8Array(signature));
}

// Comparação sem retorno antecipado, para não vazar o ponto da diferença.
function equalStrings(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

export async function createReportToken(
  accountId: string,
  since: string,
  until: string,
  ttlDays = REPORT_LINK_TTL_DAYS
): Promise<string> {
  if (!reportLinkConfigured()) {
    throw new Error("REPORT_LINK_SECRET (ou SESSION_SECRET) precisa ter pelo menos 32 caracteres.");
  }
  const exp = Math.floor(Date.now() / 1000) + ttlDays * 86400;
  const body = textToBase64Url(JSON.stringify({ v: TOKEN_VERSION, a: accountId, s: since, u: until, e: exp }));
  return `${body}.${await sign(body)}`;
}

export async function verifyReportToken(token: string | undefined): Promise<ReportTokenPayload | null> {
  if (!token || !reportLinkConfigured()) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  if (!equalStrings(signature, await sign(body))) return null;

  const json = base64UrlToText(body);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (parsed?.v !== TOKEN_VERSION) return null;
    if (typeof parsed.a !== "string" || typeof parsed.s !== "string" || typeof parsed.u !== "string") return null;
    if (typeof parsed.e !== "number" || parsed.e < Math.floor(Date.now() / 1000)) return null;
    return { accountId: parsed.a, since: parsed.s, until: parsed.u, exp: parsed.e };
  } catch {
    return null;
  }
}

// URL pública do relatório. APP_URL cobre o cron (que não tem request para
// deduzir o host); em produção a Vercel também expõe VERCEL_PROJECT_PRODUCTION_URL.
export function appBaseUrl(): string {
  const explicit = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  const vercel = (process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "").trim();
  return vercel ? `https://${vercel.replace(/\/+$/, "")}` : "http://localhost:3000";
}

export async function reportLink(accountId: string, since: string, until: string): Promise<string> {
  return `${appBaseUrl()}/r/${await createReportToken(accountId, since, until)}`;
}
