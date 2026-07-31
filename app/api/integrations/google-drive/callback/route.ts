import { NextResponse } from "next/server";
import { driveRedirectUri, saveDriveRefreshToken, verifyDriveState } from "@/lib/google-drive";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  if (!verifyDriveState(state)) return NextResponse.json({ error: "Estado OAuth inválido ou expirado." }, { status: 400 });
  if (!code) return NextResponse.json({ error: url.searchParams.get("error_description") || "Autorização do Google cancelada." }, { status: 400 });
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_ADS_CLIENT_ID || "", client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET || "", redirect_uri: driveRedirectUri(url.origin), grant_type: "authorization_code" }) });
  const json = await response.json();
  if (!response.ok || !json.refresh_token) return NextResponse.json({ error: "O Google não devolveu um refresh token. Tente conectar novamente." }, { status: 502 });
  await saveDriveRefreshToken(json.refresh_token);
  return NextResponse.redirect(new URL("/admin?drive=connected", url.origin));
}
