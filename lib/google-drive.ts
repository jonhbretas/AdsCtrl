import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getServiceClient, supabaseEnvMissing } from "./supabase";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const SECRET_KEY = "google_drive_refresh_token";

function clientId() { return process.env.GOOGLE_ADS_CLIENT_ID?.trim() || ""; }
function clientSecret() { return process.env.GOOGLE_ADS_CLIENT_SECRET?.trim() || ""; }

export function driveConfigured() {
  return Boolean(clientId() && clientSecret() && !supabaseEnvMissing());
}

export function driveRedirectUri(origin?: string) {
  const base = (process.env.APP_URL || origin || "").replace(/\/$/, "");
  return `${base}/api/integrations/google-drive/callback`;
}

export function makeDriveState() {
  const payload = `${Date.now()}.${randomBytes(18).toString("hex")}`;
  const secret = process.env.SESSION_SECRET || clientSecret();
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return `${Buffer.from(payload).toString("base64url")}.${signature}`;
}

export function verifyDriveState(state: string) {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) return false;
  const payload = Buffer.from(encoded, "base64url").toString("utf8");
  const secret = process.env.SESSION_SECRET || clientSecret();
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  if (signature.length !== expected.length) return false;
  try {
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  } catch { return false; }
  const createdAt = Number(payload.split(".")[0]);
  return Number.isFinite(createdAt) && Date.now() - createdAt < 10 * 60 * 1000;
}

export function driveAuthorizationUrl(origin?: string) {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: driveRedirectUri(origin),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: DRIVE_SCOPE,
    state: makeDriveState(),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function getRefreshToken() {
  if (!supabaseEnvMissing()) {
    const { data } = await getServiceClient().from("integration_secrets").select("value").eq("key", SECRET_KEY).maybeSingle();
    if (data?.value) return data.value;
  }
  return process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim() || "";
}

export async function saveDriveRefreshToken(value: string) {
  const { error } = await getServiceClient().from("integration_secrets").upsert({ key: SECRET_KEY, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
}

async function accessToken() {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) throw new Error("Google Drive ainda não está conectado.");
  const response = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), refresh_token: refreshToken, grant_type: "refresh_token" }) });
  const json = await response.json();
  if (!response.ok || !json.access_token) throw new Error("Não foi possível renovar o acesso ao Google Drive.");
  return json.access_token as string;
}

async function driveRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${DRIVE_API}${path}`, { ...init, headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", ...(init.headers || {}) } });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json?.error?.message || "Erro na API do Google Drive.");
  return json;
}

export async function createClientDriveFolder(clientName: string) {
  const root = await driveRequest("/files", { method: "POST", body: JSON.stringify({ name: `Cliente - ${clientName}`, mimeType: "application/vnd.google-apps.folder" }) });
  const subfolders = ["00 Administrativo", "01 Contratos", "02 Financeiro", "03 Briefing", "04 Criativos", "05 Relatórios", "06 Reuniões"];
  for (const name of subfolders) {
    await driveRequest("/files", { method: "POST", body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [root.id] }) });
  }
  return { id: root.id as string, url: `https://drive.google.com/drive/folders/${root.id}` };
}

function folderIdFromUrl(value: string) {
  const match = value.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match?.[1] || value;
}

async function findChildFolder(parentId: string, name: string) {
  const q = encodeURIComponent(`'${parentId}' in parents and name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const result = await driveRequest(`/files?q=${q}&pageSize=1&fields=files(id,name)`);
  return result.files?.[0]?.id as string | undefined;
}

export async function uploadClientDriveFile(folderUrl: string, category: string, file: File) {
  const rootId = folderIdFromUrl(folderUrl);
  const folderName = category === "contract" ? "01 Contratos" : category === "invoice" ? "02 Financeiro" : category === "briefing" ? "03 Briefing" : category === "creative" ? "04 Criativos" : category === "report" ? "05 Relatórios" : category === "meeting" ? "06 Reuniões" : "00 Administrativo";
  const parentId = await findChildFolder(rootId, folderName) || rootId;
  const token = await accessToken();
  const metadata = { name: file.name, parents: [parentId] };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", file, file.name);
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,mimeType,size", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json?.error?.message || "Não foi possível enviar o arquivo para o Drive.");
  return json as { id: string; name: string; webViewLink?: string; mimeType?: string; size?: string };
}
