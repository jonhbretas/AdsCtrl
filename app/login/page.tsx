import type { Metadata } from "next";
import { headers } from "next/headers";
import LoginForm from "./LoginForm";
import { getAuthConfiguration, mayBypassAuthInDevelopment, safeInternalPath } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Entrar | AdsCtrl",
  robots: { index: false, follow: false },
};

type LoginPageProps = {
  searchParams?: Promise<{
    next?: string | string[];
    error?: string | string[];
  }>;
};

function safeNextPath(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return safeInternalPath(candidate);
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const configuration = getAuthConfiguration();
  const resolvedSearchParams = await searchParams;
  const nextPath = safeNextPath(resolvedSearchParams?.next);
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "";
  const hostname = host.startsWith("[")
    ? host.slice(1, host.indexOf("]"))
    : host.split(":")[0];
  const localBypass = mayBypassAuthInDevelopment(hostname) && !configuration.configured;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background:
          "radial-gradient(circle at 15% 12%, rgba(21,94,239,.11), transparent 30%), #f8fafc",
        color: "#101828",
        fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
      }}
    >
      <section style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 24 }}>
          <div
            aria-hidden="true"
            style={{
              width: 40,
              height: 40,
              display: "grid",
              placeItems: "center",
              borderRadius: 12,
              background: "#155eef",
              color: "#fff",
              fontWeight: 850,
              letterSpacing: "-.04em",
              boxShadow: "0 8px 20px rgba(21,94,239,.22)",
            }}
          >
            A
          </div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-.02em" }}>AdsCtrl</div>
            <div style={{ color: "#667085", fontSize: 12 }}>Performance command center</div>
          </div>
        </div>

        <div
          style={{
            padding: "30px 30px 28px",
            border: "1px solid #e4e7ec",
            borderRadius: 16,
            background: "rgba(255,255,255,.96)",
            boxShadow: "0 16px 40px rgba(16,24,40,.08)",
          }}
        >
          <h1 style={{ margin: 0, fontSize: 26, lineHeight: 1.2, letterSpacing: "-.035em" }}>
            Acesse seu painel
          </h1>
          <p style={{ margin: "9px 0 24px", color: "#667085", fontSize: 14, lineHeight: 1.55 }}>
            Área privada para gestão das suas contas de mídia.
          </p>

          {!configuration.configured && (
            <div
              role="alert"
              style={{
                marginBottom: 20,
                padding: 14,
                border: "1px solid #fedf89",
                borderRadius: 10,
                background: "#fffaeb",
                color: "#7a2e0e",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              <strong>Configuração necessária.</strong>
              <div style={{ marginTop: 5 }}>
                Adicione <code>DASHBOARD_PASSWORD</code> e <code>SESSION_SECRET</code> nas variáveis
                de ambiente da Vercel e faça um novo deploy.
              </div>
              {localBypass && (
                <a href="/" style={{ display: "inline-block", marginTop: 8, color: "#155eef", fontWeight: 700 }}>
                  Continuar no ambiente local
                </a>
              )}
            </div>
          )}

          <LoginForm configured={configuration.configured} nextPath={nextPath} />
        </div>

        <p style={{ margin: "17px 0 0", textAlign: "center", color: "#98a2b3", fontSize: 12 }}>
          Sessão privada protegida por cookie seguro.
        </p>
      </section>
    </main>
  );
}
