import { NextResponse } from "next/server";
import { driveAuthorizationUrl, driveConfigured } from "@/lib/google-drive";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!driveConfigured()) return NextResponse.json({ error: "Configure GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET e o Supabase antes de conectar o Drive." }, { status: 503 });
  return NextResponse.redirect(driveAuthorizationUrl(new URL(req.url).origin));
}
