// app/api/reports/send/route.ts
// Envio semanal do relatório para os clientes (cron de segunda-feira).
//
// Travas, porque aqui o erro chega no cliente e não tem desfazer:
//  - só envia para cliente com report_enabled = true e e-mail válido;
//  - dry=1 manda tudo para REPORT_TEST_EMAIL e nunca para o cliente;
//  - período já enviado não repete (report_sends é a fonte da verdade);
//  - conta sem dados ou com erro de API é pulada, nunca vira e-mail vazio.
//
// Ex.: GET /api/reports/send?dry=1            (teste com todos os habilitados)
//      GET /api/reports/send?client=<uuid>&dry=1
//      GET /api/reports/send                  (envio real — o que o cron faz)

import { NextResponse } from "next/server";
import { buildReport, lastFullWeek } from "@/lib/report-data";
import { renderReportEmail } from "@/lib/report-email";
import { dashboardLink, reportLink, reportLinkConfigured } from "@/lib/report-token";
import { looksLikeEmail, resendIssues, sendEmail } from "@/lib/resend";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";
import { AUTH_COOKIE_NAME, constantTimeEqual, verifySessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface SendOutcome {
  client: string;
  status: "sent" | "skipped" | "error";
  recipient?: string;
  reason?: string;
}

// O cron chega com Bearer CRON_SECRET; o disparo manual, com a sessão do painel.
async function authorize(req: Request): Promise<boolean> {
  const authorization = req.headers.get("authorization");
  const cronSecret = (process.env.CRON_SECRET || "").trim();
  if (cronSecret && authorization?.startsWith("Bearer ")) {
    if (await constantTimeEqual(authorization.slice(7), cronSecret)) return true;
  }
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|; )${AUTH_COOKIE_NAME}=([^;]+)`));
  return match ? verifySessionToken(decodeURIComponent(match[1])) : false;
}

// Conta Meta que representa o cliente no relatório.
function primaryAccountId(client: any, links: any[]): string | null {
  if (client.source_meta_account_id) return client.source_meta_account_id;
  const own = links.filter((link) => link.client_id === client.id);
  const primary = own.find((link) => link.is_primary && link.platform === "meta");
  if (primary) return primary.account_id;
  const meta = own.find((link) => link.platform === "meta");
  if (meta) return meta.account_id;
  return own[0]?.account_id ?? null;
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}

async function handle(req: Request) {
  try {
    if (!(await authorize(req))) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }
    if (supabaseEnvMissing()) {
      return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    }
    const issues = [...resendIssues()];
    if (!reportLinkConfigured()) {
      issues.push("REPORT_LINK_SECRET (ou SESSION_SECRET) precisa ter pelo menos 32 caracteres");
    }
    if (issues.length) {
      return NextResponse.json({ error: `Envio não configurado: ${issues.join(" · ")}` }, { status: 503 });
    }

    const params = new URL(req.url).searchParams;
    const dryRun = params.get("dry") === "1";
    const onlyClient = params.get("client");
    const testAddress = (process.env.REPORT_TEST_EMAIL || "").trim();
    if (dryRun && !looksLikeEmail(testAddress)) {
      return NextResponse.json(
        { error: "Defina REPORT_TEST_EMAIL para usar o modo de teste." },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();
    // brand_name entra no select por último de propósito: se a migração de
    // marca não rodou, o catch abaixo já trata e o envio segue sem ela.
    let query = supabase
      .from("clients")
      .select("id,name,timezone,report_email,report_enabled,source_meta_account_id,status,brand_name")
      .neq("status", "archived");
    if (onlyClient) query = query.eq("id", onlyClient);
    else query = query.eq("report_enabled", true);

    let [{ data: clients, error: clientsError }, { data: links }] = await Promise.all([
      query,
      supabase.from("client_ad_accounts").select("client_id,account_id,is_primary"),
    ]);
    // Sem a migração de marca, repete a consulta sem a coluna: o envio semanal
    // não pode falhar por causa de um campo de acabamento.
    if (clientsError && /brand_name/.test(clientsError.message || "")) {
      let retry = supabase
        .from("clients")
        .select("id,name,timezone,report_email,report_enabled,source_meta_account_id,status")
        .neq("status", "archived");
      retry = onlyClient ? retry.eq("id", onlyClient) : retry.eq("report_enabled", true);
      const again = await retry;
      clients = again.data as any;
      clientsError = again.error;
    }
    if (clientsError) {
      if (/report_email|report_enabled|report_sends/.test(clientsError.message || "")) {
        return NextResponse.json(
          { error: "Rode supabase-migration-reports.sql no SQL Editor do Supabase antes de enviar." },
          { status: 503 }
        );
      }
      throw clientsError;
    }

    // O vínculo não guarda a plataforma; buscamos no catálogo.
    const { data: accounts } = await supabase.from("ad_accounts").select("account_id,platform,hidden");
    const platformById = new Map((accounts || []).map((a: any) => [a.account_id, a]));
    const enrichedLinks = (links || []).map((link: any) => ({
      ...link,
      platform: platformById.get(link.account_id)?.platform || "meta",
    }));

    const results: SendOutcome[] = [];

    for (const client of clients || []) {
      const range = lastFullWeek(client.timezone);
      const recipient = dryRun ? testAddress : (client.report_email || "").trim();

      const log = async (status: SendOutcome["status"], reason?: string, messageId?: string, accountId?: string) => {
        results.push({ client: client.name, status, reason, recipient: status === "sent" ? recipient : undefined });
        await supabase.from("report_sends").insert({
          client_id: client.id,
          account_id: accountId ?? null,
          range_since: range.since,
          range_until: range.until,
          recipient: status === "sent" ? recipient : null,
          status,
          reason: reason ?? null,
          provider_message_id: messageId ?? null,
          dry_run: dryRun,
        });
      };

      if (!dryRun && !client.report_enabled) {
        results.push({ client: client.name, status: "skipped", reason: "envio desativado para este cliente" });
        continue;
      }
      if (!looksLikeEmail(recipient)) {
        results.push({ client: client.name, status: "skipped", reason: "sem e-mail de destino válido" });
        continue;
      }

      // Já foi enviado para este período? Não manda de novo.
      if (!dryRun) {
        const { data: previous } = await supabase
          .from("report_sends")
          .select("id")
          .eq("client_id", client.id)
          .eq("range_since", range.since)
          .eq("range_until", range.until)
          .eq("status", "sent")
          .eq("dry_run", false)
          .maybeSingle();
        if (previous) {
          results.push({ client: client.name, status: "skipped", reason: "já enviado neste período" });
          continue;
        }
      }

      const accountId = primaryAccountId(client, enrichedLinks);
      if (!accountId) {
        await log("skipped", "cliente sem conta de anúncios vinculada");
        continue;
      }

      try {
        const report = await buildReport(accountId, range.since, range.until);
        const metaError = report.meta?.error;
        const metaSpend = (report.meta as any)?.kpis?.spend ?? 0;
        const googleSpend = report.google.reduce((sum, g: any) => sum + (g.detail?.kpis?.spend || 0), 0);

        if (metaError) {
          await log("skipped", `dados indisponíveis: ${metaError}`, undefined, accountId);
          continue;
        }
        if (metaSpend <= 0 && googleSpend <= 0) {
          await log("skipped", "sem investimento no período", undefined, accountId);
          continue;
        }

        const [link, dashboard] = await Promise.all([
          reportLink(accountId, range.since, range.until),
          dashboardLink(client.id),
        ]);
        const email = renderReportEmail(report, {
          clientName: client.name,
          link,
          dashboardLink: dashboard,
          dryRun,
          // Marca do cliente quando configurada; APP_BRAND_NAME por padrão.
          brand: (client as any).brand_name ?? null,
        });
        const sent = await sendEmail({
          to: recipient,
          subject: email.subject,
          html: email.html,
          text: email.text,
        });
        await log("sent", undefined, sent.id, accountId);
        if (!dryRun) {
          await supabase
            .from("clients")
            .update({ report_last_sent_at: new Date().toISOString() })
            .eq("id", client.id);
        }
      } catch (error: any) {
        await log("error", error?.message?.slice(0, 300) || "falha desconhecida", undefined, accountId);
      }
    }

    return NextResponse.json({
      dry_run: dryRun,
      week: lastFullWeek(),
      total: results.length,
      sent: results.filter((r) => r.status === "sent").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      errors: results.filter((r) => r.status === "error").length,
      results,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Falha ao enviar os relatórios." }, { status: 500 });
  }
}
