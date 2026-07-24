/**
 * Autenticação pessoal stateless e compatível com o Edge Runtime.
 *
 * A sessão contém apenas datas e um nonce. O conteúdo é assinado com
 * HMAC-SHA256 usando SESSION_SECRET e armazenado em cookie httpOnly.
 * Não importe APIs de Node neste arquivo: ele também é usado pelo middleware.
 */

export const AUTH_COOKIE_NAME = "adsctrl_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

const SESSION_VERSION = 1;
const MIN_PASSWORD_LENGTH = 12;
const MIN_SESSION_SECRET_LENGTH = 32;
const encoder = new TextEncoder();

type SessionPayload = {
  v: number;
  iat: number;
  exp: number;
  nonce: string;
};

export type AuthConfiguration = {
  configured: boolean;
  issues: string[];
};

export function safeInternalPath(value: string | null | undefined, fallback = "/"): string {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\r\n]/.test(value)) {
    return fallback;
  }
  try {
    const base = "https://adsctrl.invalid";
    const parsed = new URL(value, base);
    return parsed.origin === base
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/")
      + "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export function getAuthConfiguration(): AuthConfiguration {
  const password = process.env.DASHBOARD_PASSWORD || "";
  const sessionSecret = process.env.SESSION_SECRET || "";
  const issues: string[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    issues.push(`DASHBOARD_PASSWORD deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`);
  }
  if (sessionSecret.length < MIN_SESSION_SECRET_LENGTH) {
    issues.push(`SESSION_SECRET deve ter pelo menos ${MIN_SESSION_SECRET_LENGTH} caracteres`);
  }

  return { configured: issues.length === 0, issues };
}

export function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost"
    || normalized === "::1"
    || normalized === "0.0.0.0"
    || normalized.startsWith("127.");
}

export function mayBypassAuthInDevelopment(hostname: string): boolean {
  return process.env.NODE_ENV !== "production" && isLocalHostname(hostname);
}

/**
 * Compara dois segredos sem retornar antes na primeira diferença.
 * Os digests têm sempre o mesmo tamanho, evitando vazamento de comprimento.
 */
export async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index++) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

export async function verifyDashboardPassword(candidate: string): Promise<boolean> {
  const configured = process.env.DASHBOARD_PASSWORD;
  if (!configured || candidate.length > 1024) return false;
  return constantTimeEqual(candidate, configured);
}

export async function createSessionToken(now = Date.now()): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET não configurado.");

  const issuedAt = Math.floor(now / 1000);
  const random = new Uint8Array(18);
  crypto.getRandomValues(random);
  const payload: SessionPayload = {
    v: SESSION_VERSION,
    iat: issuedAt,
    exp: issuedAt + SESSION_TTL_SECONDS,
    nonce: bytesToBase64Url(random),
  };
  const encodedPayload = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importHmacKey(secret),
    encoder.encode(encodedPayload)
  );
  return `${encodedPayload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifySessionToken(token: string | undefined | null, now = Date.now()): Promise<boolean> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || !token || token.length > 2048) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [encodedPayload, encodedSignature] = parts;
  const payloadBytes = base64UrlToBytes(encodedPayload);
  const signatureBytes = base64UrlToBytes(encodedSignature);
  if (!payloadBytes || !signatureBytes) return false;

  try {
    const validSignature = await crypto.subtle.verify(
      "HMAC",
      await importHmacKey(secret),
      signatureBytes,
      encoder.encode(encodedPayload)
    );
    if (!validSignature) return false;

    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as Partial<SessionPayload>;
    const currentTime = Math.floor(now / 1000);
    return payload.v === SESSION_VERSION
      && typeof payload.iat === "number"
      && typeof payload.exp === "number"
      && typeof payload.nonce === "string"
      && payload.nonce.length >= 16
      && payload.iat <= currentTime + 60
      && payload.exp > currentTime
      && payload.exp <= payload.iat + SESSION_TTL_SECONDS;
  } catch {
    return false;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
    priority: "high" as const,
  };
}

export function expiredSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: 0,
    expires: new Date(0),
    priority: "high" as const,
  };
}
