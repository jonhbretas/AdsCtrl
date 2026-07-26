import type { Metadata } from "next";
import { headers } from "next/headers";
import LoginForm from "./LoginForm";
import BrandMark from "@/components/BrandMark";
import { getAuthConfiguration, mayBypassAuthInDevelopment, safeInternalPath } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Entrar | Assertivus Dash",
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
    <main className="ec-login ec-mesh">
      <section style={{ width: "100%", maxWidth: 420 }}>
        <div className="ec-login__brand">
          {/* O mesmo símbolo do app, em vez de uma letra em caixa azul: é a
              primeira tela que se vê e precisa ser a mesma marca. */}
          <BrandMark size={40} />
          <div>
            <div className="ec-login__name">Assertivus Dash</div>
            <div className="ec-login__tagline">Cockpit de performance em mídia paga</div>
          </div>
        </div>

        <div className="ec-login__card">
          <h1 className="ec-login__title">Acesse seu painel</h1>
          <p className="ec-login__sub">Área privada para gestão das suas contas de mídia.</p>

          {!configuration.configured && (
            <div
              role="alert"
              className="ec-notice"
              data-tone="warn"
              style={{ marginBottom: 20, display: "block" }}
            >
              <strong>Configuração necessária.</strong>
              <div style={{ marginTop: 5 }}>
                Adicione <code>DASHBOARD_PASSWORD</code> e <code>SESSION_SECRET</code> nas variáveis
                de ambiente da Vercel e faça um novo deploy.
              </div>
              {localBypass && (
                <a href="/" style={{ display: "inline-block", marginTop: 8, color: "var(--brand-700)", fontWeight: 700 }}>
                  Continuar no ambiente local
                </a>
              )}
            </div>
          )}

          <LoginForm configured={configuration.configured} nextPath={nextPath} />
        </div>

        <p className="ec-login__foot">Sessão privada protegida por cookie seguro.</p>
      </section>
    </main>
  );
}
