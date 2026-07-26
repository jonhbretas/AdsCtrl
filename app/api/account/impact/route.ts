// app/api/account/impact/route.ts
// Impacto das decisões de uma conta: o período contra o anterior e a janela
// antes/depois de cada decisão de peso.
//
// Uma única chamada de insights cobre tudo: getDailyMetrics devolve a série
// diária por família, e as janelas saem daí por agregação. Buscar cada janela
// na API custaria uma dezena de chamadas por conta.
//
// Ex: /api/account/impact?account_id=act_123&since=2026-07-01&until=2026-07-25

import { NextResponse } from "next/server";
import { getMetaChangeLog } from "@/lib/changes";
import { getDailyMetrics, tokenByIndex } from "@/lib/meta";
import { buildImpact, previousWindow } from "@/lib/impact";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Margem antes do período: a janela "antes" da primeira decisão pode começar
// fora dele, e sem esses dias a comparação sairia truncada.
const LOOKBEHIND_DAYS = 10;

function defaultRange() {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const until = new Date();
  until.setUTCDate(until.getUTCDate() - 1);
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - 29);
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !/^\d{4}-\d{2}-\d{2}$/.test(until) || since > until) {
      return NextResponse.json({ error: "Período inválido." }, { status: 400 });
    }

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
    if (account.platform === "google") {
      return NextResponse.json({
        account_id: lookupId,
        platform: "google",
        note: "O impacto das decisões ainda só está disponível na Meta.",
        impact: null,
      });
    }

    const token = tokenByIndex(typeof account.token_ref === "number" ? account.token_ref : 0);

    // Comparação explícita (mês contra mês, por exemplo) ou o anterior de
    // mesma duração.
    const compareSince = searchParams.get("compare_since");
    const compareUntil = searchParams.get("compare_until");
    const compare =
      compareSince && compareUntil &&
      /^\d{4}-\d{2}-\d{2}$/.test(compareSince) &&
      /^\d{4}-\d{2}-\d{2}$/.test(compareUntil) &&
      compareSince <= compareUntil
        ? { since: compareSince, until: compareUntil }
        : undefined;

    const previous = compare ?? previousWindow(since, until);
    const seriesSince = new Date(`${previous.since}T00:00:00Z`);
    seriesSince.setUTCDate(seriesSince.getUTCDate() - LOOKBEHIND_DAYS);

    const [daily, log] = await Promise.all([
      getDailyMetrics(`act_${lookupId}`, seriesSince.toISOString().slice(0, 10), until, token),
      getMetaChangeLog(`act_${lookupId}`, since, until, token, account.currency || "BRL"),
    ]);

    const impact = buildImpact({ daily, since, until, events: log.events, compare });

    return NextResponse.json({
      account_id: lookupId,
      platform: "meta",
      currency: account.currency || "BRL",
      range: { since, until },
      impact,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao calcular o impacto." }, { status: 500 });
  }
}
