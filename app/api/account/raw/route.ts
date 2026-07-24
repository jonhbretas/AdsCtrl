// app/api/account/raw/route.ts
// Diagnóstico (só-leitura): mostra o payload financeiro cru que a Meta devolve
// de uma conta, para investigar o saldo pré-pago.
// Ex: /api/account/raw?account_id=act_123  (ou ?name=Prime%20Foz)

import { NextResponse } from "next/server";
import { getAccountRaw, centsToUnit, tokenByIndex } from "@/lib/meta";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    let actId = (searchParams.get("account_id") || "").trim();
    const name = (searchParams.get("name") || "").trim();
    const sb = getServiceClient();
    let account: { account_id: string; platform: string; hidden: boolean; token_ref: number | null } | null = null;

    // Permite buscar pelo nome (parcial) usando o espelho local.
    if (!actId && name) {
      const { data, error } = await sb
        .from("ad_accounts")
        .select("account_id,platform,hidden,token_ref")
        .ilike("name", `%${name}%`)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      account = data;
      if (account) actId = account.account_id;
    }
    if (!actId) return NextResponse.json({ error: "Informe account_id ou name." }, { status: 400 });
    if (!account) {
      const lookupId = actId.replace(/^act_/, "");
      const { data, error } = await sb
        .from("ad_accounts")
        .select("account_id,platform,hidden,token_ref")
        .eq("account_id", lookupId)
        .maybeSingle();
      if (error) throw error;
      account = data;
    }
    if (!account) return NextResponse.json({ error: "Conta não encontrada no catálogo." }, { status: 404 });
    if (account.hidden) {
      return NextResponse.json({ error: "Conta oculta. Reative-a antes de consultar dados." }, { status: 403 });
    }
    if (account.platform !== "meta") {
      return NextResponse.json({ error: "Diagnóstico bruto disponível apenas para contas Meta." }, { status: 400 });
    }

    const raw = await getAccountRaw(
      account.account_id,
      tokenByIndex(typeof account.token_ref === "number" ? account.token_ref : 0)
    );

    // Interpretação amigável dos campos financeiros (todos em centavos na Meta).
    const interpret = {
      balance_devido: centsToUnit(raw.balance),
      amount_spent: centsToUnit(raw.amount_spent),
      spend_cap: centsToUnit(raw.spend_cap),
      is_prepay_account: raw.is_prepay_account,
      funding_source: raw.funding_source,
      funding_source_details: raw.funding_source_details,
    };

    return NextResponse.json({ account_id: actId, raw, interpret });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro no diagnóstico." }, { status: 500 });
  }
}
