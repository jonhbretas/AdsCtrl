import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  constantTimeEqual,
  getAuthConfiguration,
  mayBypassAuthInDevelopment,
  safeInternalPath,
  verifySessionToken,
} from "@/lib/auth";

const LOGIN_PAGE = "/login";
const LOGIN_API = "/api/auth/login";
const COLLECT_API = "/api/collect";

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function configurationError() {
  return NextResponse.json(
    {
      error: "Autenticação não configurada.",
      required: [
        "DASHBOARD_PASSWORD com pelo menos 12 caracteres",
        "SESSION_SECRET aleatório com pelo menos 32 caracteres",
      ],
    },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

async function hasValidCronAuthorization(request: NextRequest): Promise<boolean> {
  if (request.nextUrl.pathname !== COLLECT_API) return false;
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!cronSecret || !authorization?.startsWith("Bearer ")) return false;
  return constantTimeEqual(authorization.slice(7), cronSecret);
}

export async function proxy(request: NextRequest) {
  const { pathname, hostname } = request.nextUrl;
  const isLoginPage = pathname === LOGIN_PAGE;
  const isLoginApi = pathname === LOGIN_API;

  // O formulário e a API de login precisam permanecer acessíveis sem sessão.
  if (isLoginApi) return NextResponse.next();

  // O cron é independente da sessão do dashboard e continua operacional
  // durante uma eventual configuração inicial das variáveis de autenticação.
  if (await hasValidCronAuthorization(request)) return NextResponse.next();

  const authConfiguration = getAuthConfiguration();
  if (!authConfiguration.configured) {
    if (mayBypassAuthInDevelopment(hostname)) return NextResponse.next();
    if (isLoginPage) return NextResponse.next();
    if (isApiPath(pathname)) return configurationError();

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = LOGIN_PAGE;
    loginUrl.search = "";
    loginUrl.searchParams.set("error", "config");
    return NextResponse.redirect(loginUrl);
  }

  const authenticated = await verifySessionToken(request.cookies.get(AUTH_COOKIE_NAME)?.value);
  if (authenticated) {
    if (isLoginPage) {
      const requestedNext = request.nextUrl.searchParams.get("next");
      const destination = safeInternalPath(requestedNext);
      return NextResponse.redirect(new URL(destination, request.url));
    }
    return NextResponse.next();
  }

  if (isLoginPage) return NextResponse.next();
  if (isApiPath(pathname)) {
    return NextResponse.json(
      { error: "Sessão ausente ou expirada.", login: LOGIN_PAGE },
      {
        status: 401,
        headers: {
          "Cache-Control": "no-store",
          "WWW-Authenticate": 'Cookie realm="AdsCtrl"',
        },
      }
    );
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = LOGIN_PAGE;
  loginUrl.search = "";
  loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff|woff2|ttf)$).*)",
  ],
};
