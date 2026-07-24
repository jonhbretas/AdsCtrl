import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  createSessionToken,
  getAuthConfiguration,
  sessionCookieOptions,
  verifyDashboardPassword,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

function noStoreJson(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  const configuration = getAuthConfiguration();
  if (!configuration.configured) {
    return noStoreJson(
      {
        error: "Autenticação não configurada no servidor.",
        required: configuration.issues,
      },
      503
    );
  }

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > 4096) {
    return noStoreJson({ error: "Requisição inválida." }, 413);
  }

  let password = "";
  try {
    const body = await request.json();
    if (typeof body?.password === "string") password = body.password;
  } catch {
    return noStoreJson({ error: "Requisição inválida." }, 400);
  }

  if (!password || !(await verifyDashboardPassword(password))) {
    // Uma pequena espera reduz tentativas automatizadas sem penalizar o uso normal.
    await new Promise((resolve) => setTimeout(resolve, 400));
    return noStoreJson({ error: "Senha incorreta." }, 401);
  }

  const response = noStoreJson({ ok: true }, 200);
  response.cookies.set(AUTH_COOKIE_NAME, await createSessionToken(), sessionCookieOptions());
  return response;
}
