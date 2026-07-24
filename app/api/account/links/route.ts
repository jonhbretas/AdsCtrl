import { NextResponse } from "next/server";
import {
  AdAccountRaw,
  availableBalance,
  getDailySpend,
  isPrepaidAccount,
  tokenByIndex,
} from "@/lib/meta";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const GRAPH = "https://graph.facebook.com/v25.0";
const DAY_MS = 86_400_000;

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  try {
    if (supabaseEnvMissing()) {
      return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    }
    const requested = new URL(req.url).searchParams.get("account_id")?.trim() || "";
    const accountId = requested.replace(/^act_/, "").replace(/^google:/, "");
    if (!accountId) {
      return NextResponse.json({ error: "account_id é obrigatório." }, { status: 400 });
    }

    const { data: account, error } = await getServiceClient()
      .from("ad_accounts")
      .select("platform,token_ref,hidden")
      .eq("account_id", requested.replace(/^act_/, ""))
      .maybeSingle();
    if (error) throw error;
    if (!account) {
      return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
    }
    if (account.hidden) {
      return NextResponse.json({ error: "Conta oculta." }, { status: 403 });
    }
    if (account.platform !== "meta") {
      return NextResponse.json({ account_id: accountId, business_id: null, business_name: null });
    }

    const token = tokenByIndex(typeof account.token_ref === "number" ? account.token_ref : 0);
    const url = new URL(`${GRAPH}/act_${accountId}`);
    url.searchParams.set(
      "fields",
      "account_id,name,account_status,currency,balance,funding_source_details,business{id,name}"
    );
    url.searchParams.set("access_token", token);
    const [response, daily] = await Promise.all([
      fetch(url, { cache: "no-store" }),
      getDailySpend(
        `act_${accountId}`,
        isoDaysAgo(7),
        isoDaysAgo(1),
        token
      ).catch(() => []),
    ]);
    const payload = await response.json().catch(() => ({}));
    const raw = response.ok ? (payload as AdAccountRaw) : null;
    const prepaid = raw ? isPrepaidAccount(raw) : false;
    const currentBalance = raw && prepaid ? availableBalance(raw) : null;
    const spend7d = daily.reduce((sum, row) => sum + row.spend, 0);
    const averageDailySpend = spend7d / 7;
    const runwayDays =
      currentBalance != null && averageDailySpend > 0
        ? currentBalance / averageDailySpend
        : null;
    const depletionDate =
      runwayDays != null
        ? new Date(Date.now() + runwayDays * DAY_MS).toISOString().slice(0, 10)
        : null;

    return NextResponse.json({
      account_id: accountId,
      business_id: response.ok ? payload?.business?.id || null : null,
      business_name: response.ok ? payload?.business?.name || null : null,
      finance: response.ok
        ? {
            is_prepaid: prepaid,
            balance: currentBalance,
            spend_7d: spend7d,
            average_daily_spend: averageDailySpend,
            runway_days: runwayDays,
            estimated_depletion_date: depletionDate,
            range: { since: isoDaysAgo(7), until: isoDaysAgo(1) },
          }
        : null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Não foi possível identificar a BM da conta." },
      { status: 500 }
    );
  }
}
