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
//
// O cron passa de hora em hora; cada cliente tem dia e hora próprios
// (report_weekday / report_hour, no fuso dele). Quem não bate a janela é
// ignorado sem virar registro — ver isScheduledNow abaixo.

import { NextResponse } from "next/server";
import { buildReport, lastFullWeek } from "@/lib/report-data";
import { renderReportEmail } from "@/lib/report-email";
import { dashboardLink, reportLink, reportLinkConfigured } from "@/lib/report-token";
import { looksLikeEmail, resendIssues, sendEmail } from "@/lib/resend";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";
import { getSettings } from "@/lib/settings";
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

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Dia da semana e hora agora, no fuso do cliente. Fuso inválido cai em UTC em
// vez de derrubar o envio da rodada inteira.
function localNow(timezone: string | null): { weekday: number; hour: number } {
  const format = (tz: string) =>
    new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", hour12: false }).formatToParts(new Date());
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = format(timezone || "UTC");
  } catch {
    parts = format("UTC");
  }
  const weekday = WEEKDAY_INDEX[parts.find((p) => p.type === "weekday")?.value || "Mon"] ?? 1;
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 11);
  return { weekday, hour: Number.isFinite(hour) ? hour % 24 : 11 };
}

// A janela é a hora cheia combinada. O cron roda de hora em hora, então cada
// combinação dia+hora acontece uma vez por semana — e o registro em
// report_sends impede repetir se o cron disparar duas vezes na mesma hora.
function isScheduledNow(client: any): boolean {
  const { weekday, hour } = localNow(client.timezone);
  const wanted = Number.isInteger(client.report_weekday) ? client.report_weekday : 1;
  const wantedHour = Number.isInteger(client.report_hour) ? client.report_hour : 11;
  return weekday === wanted && hour === wantedHour;
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
    const issues = [...(await resendIssues())];
    if (!reportLinkConfigured()) {
      issues.push("REPORT_LINK_SECRET (ou SESSION_SECRET) precisa ter pelo menos 32 caracteres");
    }
    if (issues.length) {
      return NextResponse.json({ error: `Envio não configurado: ${issues.join(" · ")}` }, { status: 503 });
    }

    const params = new URL(req.url).searchParams;
    const dryRun = params.get("dry") === "1";
    const onlyClient = params.get("client");
    const testAddress = (await getSettings()).report_test_email;
    if (dryRun && !looksLikeEmail(testAddress)) {
      return NextResponse.json(
        { error: "Defina o e-mail de teste em Config › E-mail para usar o modo de teste." },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();
    // Colunas de acabamento (marca e agenda) entram por último de propósito: se
    // a migração correspondente não rodou, o retry abaixo repete sem elas e o
    // envio segue com o comportamento antigo — segunda-feira, 11h.
    const BASE_COLUMNS = "id,name,timezone,report_email,report_enabled,source_meta_account_id,status";
    const EXTRA_COLUMNS = "brand_name,report_weekday,report_hour";
    let query = supabase
      .from("clients")
      .select(`${BASE_COLUMNS},${EXTRA_COLUMNS}`)
      .neq("status", "archived");
    if (onlyClient) query = query.eq("id", onlyClient);
    else query = query.eq("report_enabled", true);

    let [{ data: clients, error: clientsError }, { data: links }] = await Promise.all([
      query,
      supabase.from("client_ad_accounts").select("client_id,account_id,is_primary"),
    ]);
    if (clientsError && /brand_name|report_weekday|report_hour/.test(clientsError.message || "")) {
      let retry = supabase.from("clients").select(BASE_COLUMNS).neq("status", "archived");
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
    // Rodada do cron: passa de hora em hora e só toca em quem tem a janela
    // agora. Disparo manual (client=...) e teste ignoram a agenda de propósito.
    const scheduledRun = !onlyClient && !dryRun;
    let outOfWindow = 0;

    for (const client of clients || []) {
      if (scheduledRun && !isScheduledNow(client)) {
        outOfWindow++;
        continue;
      }
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
          // Marca do cliente quando configurada; a da Config por padrão.
          brand: (client as any).brand_name || (await getSettings()).brand_name,
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
      out_of_window: outOfWindow,
      sent: results.filter((r) => r.status === "sent").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      errors: results.filter((r) => r.status === "error").length,
      results,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Falha ao enviar os relatórios." }, { status: 500 });
  }
}
