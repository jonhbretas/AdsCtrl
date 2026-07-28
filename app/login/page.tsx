import type { Metadata } from "next";
import { headers } from "next/headers";
import LoginForm from "./LoginForm";
import BrandMark from "@/components/BrandMark";
import { getAuthConfiguration, mayBypassAuthInDevelopment, safeInternalPath } from "@/lib/auth";
import { appBrandName, appBrandDescription } from "@/lib/brand";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Entrar | ${appBrandName()}`,
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
    <main className="min-h-screen flex items-center justify-center p-5 bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950">
      <section className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          <BrandMark size={40} />
          <div>
            <div className="text-lg font-semibold text-white">{appBrandName()}</div>
            <div className="text-xs text-white/60">{appBrandDescription()}</div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-7 shadow-2xl">
          <h1 className="text-2xl font-bold text-white mb-1">Acesse seu painel</h1>
          <p className="text-sm text-white/60 mb-6">Área privada para gestão das suas contas de mídia.</p>

          {!configuration.configured && (
            <div
              role="alert"
              className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-amber-500/20 bg-amber-500/10 text-sm text-amber-400 mb-5"
            >
              <div>
                <strong className="font-semibold">Configuração necessária.</strong>
                <div className="mt-1 text-xs text-amber-400/80">
                  Adicione <code className="text-amber-300">DASHBOARD_PASSWORD</code> e <code className="text-amber-300">SESSION_SECRET</code> nas variáveis de ambiente da Vercel e faça um novo deploy.
                </div>
                {localBypass && (
                  <a href="/" className="inline-block mt-2 text-sm font-semibold text-cyan-400 hover:text-cyan-300">
                    Continuar no ambiente local
                  </a>
                )}
              </div>
            </div>
          )}

          <LoginForm configured={configuration.configured} nextPath={nextPath} />
        </div>

        <p className="text-xs text-white/40 text-center mt-5">Sessão privada protegida por cookie seguro.</p>
      </section>
    </main>
  );
}
