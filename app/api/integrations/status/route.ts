// app/api/integrations/status/route.ts
// Estado das integrações, para a tela de Config responder "por que os dados
// não chegaram?" sem abrir log.
//
// Cada item diz três coisas: se está configurado, se respondeu agora e o que
// falta quando não está. A checagem ao vivo (?probe=1) toca a API de verdade —
// é a única forma de pegar token expirado, que continua "configurado".

import { NextResponse } from "next/server";
import { META_TOKENS } from "@/lib/meta";
import { googleAdsConfigured, listGoogleAdsAccounts } from "@/lib/google-ads";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";
import { getSettings } from "@/lib/settings";
import { reportLinkConfigured, appBaseUrl } from "@/lib/report-token";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type State = "ok" | "warn" | "off" | "error";

interface Integration {
  key: string;
  label: string;
  state: State;
  detail: string;
  hint?: string;
}

// Nenhuma checagem ao vivo pode segurar a tela: 10s e segue.
async function withTimeout<T>(promise: Promise<T>, ms = 10_000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("tempo esgotado")), ms)),
  ]);
}

async function checkMeta(probe: boolean): Promise<Integration> {
  const count = META_TOKENS.length;
  if (!count) {
    return {
      key: "meta",
      label: "Meta Ads",
      state: "off",
      detail: "Nenhum token configurado.",
      hint: "Defina META_ACCESS_TOKEN (e META_ACCESS_TOKENS para outras BMs) no ambiente.",
    };
  }
  const plural = `${count} token${count === 1 ? "" : "s"}`;
  if (!probe) return { key: "meta", label: "Meta Ads", state: "ok", detail: `${plural} configurado${count === 1 ? "" : "s"}.` };

  // Um token vencido entre vários derruba só as contas daquela BM — por isso
  // o resultado é por token, e não um sim/não geral.
  const results = await Promise.all(
    META_TOKENS.map(async (token, index) => {
      try {
        const r = await withTimeout(
          fetch(`https://graph.facebook.com/v25.0/me?fields=id,name&access_token=${encodeURIComponent(token)}`, { cache: "no-store" })
        );
        const body = await r.json();
        if (!r.ok || body.error) throw new Error(body?.error?.message || `HTTP ${r.status}`);
        return { index, ok: true as const, name: body.name || body.id };
      } catch (e: any) {
        return { index, ok: false as const, message: e?.message || "falha" };
      }
    })
  );
  const bad = results.filter((r) => !r.ok);
  if (!bad.length) {
    return { key: "meta", label: "Meta Ads", state: "ok", detail: `${plural} respondendo: ${results.map((r: any) => r.name).join(" · ")}.` };
  }
  return {
    key: "meta",
    label: "Meta Ads",
    state: bad.length === count ? "error" : "warn",
    detail: `${bad.length} de ${count} token(s) com falha: ${bad.map((b: any) => `#${b.index + 1} ${b.message}`).join(" · ")}.`,
    hint: "Token de usuário de sistema costuma cair por permissão removida na BM ou senha trocada.",
  };
}

async function checkGoogle(probe: boolean): Promise<Integration> {
  if (!googleAdsConfigured()) {
    return {
      key: "google",
      label: "Google Ads",
      state: "off",
      detail: "Credenciais OAuth incompletas.",
      hint: "Faltam GOOGLE_ADS_CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN, DEVELOPER_TOKEN ou LOGIN_CUSTOMER_ID.",
    };
  }
  if (!probe) return { key: "google", label: "Google Ads", state: "ok", detail: "Credenciais configuradas." };
  try {
    const accounts = await withTimeout(listGoogleAdsAccounts(), 20_000);
    return { key: "google", label: "Google Ads", state: "ok", detail: `${accounts.length} conta(s) acessível(is).` };
  } catch (e: any) {
    return {
      key: "google",
      label: "Google Ads",
      state: "error",
      detail: e?.message?.slice(0, 200) || "falha ao renovar o token.",
      hint: "Refresh token revogado ou developer token sem acesso à conta gerenciadora.",
    };
  }
}

async function checkSupabase(): Promise<Integration> {
  if (supabaseEnvMissing()) {
    return {
      key: "supabase",
      label: "Banco (Supabase)",
      state: "off",
      detail: "NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente.",
    };
  }
  try {
    const result = await withTimeout<any>(
      getServiceClient().from("ad_accounts").select("account_id", { count: "exact", head: true }) as any
    );
    if (result?.error) throw result.error;
    return { key: "supabase", label: "Banco (Supabase)", state: "ok", detail: "Conectado." };
  } catch (e: any) {
    return { key: "supabase", label: "Banco (Supabase)", state: "error", detail: e?.message?.slice(0, 200) || "falha na consulta." };
  }
}

async function checkEmail(): Promise<Integration> {
  const settings = await getSettings();
  const missing: string[] = [];
  if (!(process.env.RESEND_API_KEY || "").trim()) missing.push("RESEND_API_KEY (ambiente)");
  if (!settings.report_from_email) missing.push("remetente");
  if (missing.length) {
    return { key: "email", label: "E-mail (Resend)", state: "off", detail: `Falta: ${missing.join(" · ")}.` };
  }
  const extras: string[] = [`remetente ${settings.report_from_email}`];
  if (settings.report_test_email) extras.push(`teste ${settings.report_test_email}`);
  else extras.push("sem endereço de teste");
  return {
    key: "email",
    label: "E-mail (Resend)",
    state: settings.report_test_email ? "ok" : "warn",
    detail: `${extras.join(" · ")}.`,
    hint: settings.report_test_email ? undefined : "Sem endereço de teste, o botão \"Enviar teste\" dos relatórios não funciona.",
  };
}

function checkLinks(): Integration {
  if (!reportLinkConfigured()) {
    return {
      key: "links",
      label: "Links do cliente",
      state: "off",
      detail: "REPORT_LINK_SECRET (ou SESSION_SECRET) precisa ter 32+ caracteres.",
      hint: "Sem isso o painel do cliente e o link do relatório não são gerados.",
    };
  }
  return { key: "links", label: "Links do cliente", state: "ok", detail: `Assinados · base ${appBaseUrl()}.` };
}

function checkCron(): Integration {
  const configured = Boolean((process.env.CRON_SECRET || "").trim());
  return {
    key: "cron",
    label: "Rotinas automáticas",
    state: configured ? "ok" : "warn",
    detail: configured
      ? "Coleta diária 10h UTC · relatórios de hora em hora (cada cliente no dia e hora dele)."
      : "CRON_SECRET ausente — o cron da Vercel será barrado pelo middleware.",
  };
}

export async function GET(req: Request) {
  try {
    const probe = new URL(req.url).searchParams.get("probe") === "1";
    const [meta, google, supabase, email] = await Promise.all([
      checkMeta(probe),
      checkGoogle(probe),
      checkSupabase(),
      checkEmail(),
    ]);
    return NextResponse.json({ probed: probe, integrations: [meta, google, supabase, email, checkLinks(), checkCron()] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Falha ao checar as integrações." }, { status: 500 });
  }
}
