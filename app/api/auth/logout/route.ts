import { NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  expiredSessionCookieOptions,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );
  response.cookies.set(AUTH_COOKIE_NAME, "", expiredSessionCookieOptions());
  return response;
}
