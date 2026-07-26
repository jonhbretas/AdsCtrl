// app/api/account/changes/route.ts
// "Últimas edições" de uma conta: o que foi mexido no período (pausas,
// orçamentos, lances, criativos). A plataforma vem do banco, como no detalhe.
// Ex: /api/account/changes?account_id=act_123&since=2026-07-13&until=2026-07-20

import { NextResponse } from "next/server";
import { getMetaChangeLog } from "@/lib/changes";
import { tokenByIndex } from "@/lib/meta";
import { getGoogleChangeLog, googleAdsConfigured } from "@/lib/google-ads";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function defaultRange() {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const until = new Date();
  const since = new Date();
  since.setDate(until.getDate() - 7);
  return { since: fmt(since), until: fmt(until) };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const requested = (searchParams.get("account_id") || "").trim();
    if (!requested) {
      return NextResponse.json({ error: "account_id é obrigatório." }, { status: 400 });
    }
    const def = defaultRange();
    const since = searchParams.get("since") || def.since;
    const until = searchParams.get("until") || def.until;

    if (supabaseEnvMissing()) {
      return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    }
    const lookupId = requested.replace(/^act_/, "");
    const { data: account, error } = await getServiceClient()
      .from("ad_accounts")
      .select("platform,hidden,token_ref,currency")
      .eq("account_id", lookupId)
      .maybeSingle();
    if (error) throw error;
    if (!account) {
      return NextResponse.json({ error: "Conta não encontrada no catálogo." }, { status: 404 });
    }
    if (account.hidden) {
      return NextResponse.json({ error: "Conta oculta." }, { status: 403 });
    }

    const currency = account.currency || "BRL";
    const range = { since, until };

    if (account.platform === "google") {
      if (!googleAdsConfigured()) {
        return NextResponse.json({
          account_id: lookupId, platform: "google", range,
          events: [], truncated: false,
          note: "Google Ads não configurado nas variáveis de ambiente.",
        });
      }
      const log = await getGoogleChangeLog(lookupId, since, until, currency);
      return NextResponse.json({ account_id: lookupId, platform: "google", range, ...log });
    }

    const token = tokenByIndex(typeof account.token_ref === "number" ? account.token_ref : 0);
    const log = await getMetaChangeLog(`act_${lookupId}`, since, until, token, currency);
    return NextResponse.json({ account_id: lookupId, platform: "meta", range, ...log });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Erro ao buscar as últimas edições." },
      { status: 500 }
    );
  }
}
