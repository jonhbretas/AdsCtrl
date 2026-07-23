// app/api/accounts/sync/route.ts
// Sincroniza a LISTA de contas com a Meta na hora (sem esperar o cron).
//  - GET: só lista o que o token enxerga (diagnóstico, não grava).
//  - POST: lista e faz upsert das contas no banco (rápido, sem insights).
// Útil para ver contas recém-adicionadas na BM sem esperar a coleta diária.

import { NextResponse } from "next/server";
import { listAdAccountsAll, mapAccountStatus, availableBalance, centsToUnit } from "@/lib/meta";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function fetchList() {
  const accounts = await listAdAccountsAll();
  return accounts.map(({ acc, tokenIndex }) => ({
    raw: acc,
    tokenIndex,
    account_id: acc.account_id,
    name: acc.name,
    status: mapAccountStatus(acc.account_status),
  }));
}

export async function GET() {
  try {
    const list = await fetchList();
    return NextResponse.json({
      count: list.length,
      accounts: list.map(({ account_id, name, status }) => ({ account_id, name, status })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao listar contas na Meta." }, { status: 500 });
  }
}

export async function POST() {
  try {
    if (supabaseEnvMissing()) {
      return NextResponse.json({ error: "Supabase não configurado." }, { status: 200 });
    }
    const sb = getServiceClient();
    const list = await fetchList();

    // Quais já existem, para reportar quantas são NOVAS.
    const { data: existing } = await sb.from("ad_accounts").select("account_id");
    const known = new Set((existing || []).map((r: any) => r.account_id));

    for (const { raw, tokenIndex } of list) {
      await sb.from("ad_accounts").upsert(
        {
          account_id: raw.account_id,
          name: raw.name,
          platform: "meta",
          currency: raw.currency,
          status: mapAccountStatus(raw.account_status),
          balance: availableBalance(raw),
          spend_cap: centsToUnit(raw.spend_cap),
          token_ref: tokenIndex,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "account_id", ignoreDuplicates: false }
      );
    }

    const added = list.filter((a) => !known.has(a.account_id)).map((a) => a.name);
    return NextResponse.json({
      ok: true,
      total: list.length,
      added: added.length,
      addedNames: added,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao sincronizar contas." }, { status: 500 });
  }
}
