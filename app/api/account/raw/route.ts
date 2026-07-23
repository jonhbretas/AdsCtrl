// app/api/account/raw/route.ts
// Diagnóstico (só-leitura): mostra o payload financeiro cru que a Meta devolve
// de uma conta, para investigar o saldo pré-pago.
// Ex: /api/account/raw?account_id=act_123  (ou ?name=Prime%20Foz)

import { NextResponse } from "next/server";
import { getAccountRaw, centsToUnit } from "@/lib/meta";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    let actId = (searchParams.get("account_id") || "").trim();
    const name = (searchParams.get("name") || "").trim();

    // Permite buscar pelo nome (parcial) usando o espelho local.
    if (!actId && name) {
      const sb = getServiceClient();
      const { data } = await sb.from("ad_accounts").select("account_id, name").ilike("name", `%${name}%`).limit(1);
      if (data && data[0]) actId = data[0].account_id;
    }
    if (!actId) return NextResponse.json({ error: "Informe account_id ou name." }, { status: 400 });

    const raw = await getAccountRaw(actId);

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
