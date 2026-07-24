// Sincroniza somente o catálogo de contas. Contas novas entram ocultas para
// que o usuário escolha explicitamente quais terão métricas coletadas.

import { NextResponse } from "next/server";
import { listAdAccountsAll, mapAccountStatus, availableBalance, centsToUnit } from "@/lib/meta";
import {
  googleAdsConfigured,
  googleStorageId,
  listGoogleAdsAccounts,
} from "@/lib/google-ads";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function syncMeta(known: Set<string>) {
  const sb = getServiceClient();
  const list = await listAdAccountsAll();
  const added: string[] = [];
  for (const { acc, tokenIndex } of list) {
    const isNew = !known.has(acc.account_id);
    const row: Record<string, any> = {
      account_id: acc.account_id,
      name: acc.name,
      platform: "meta",
      currency: acc.currency,
      status: mapAccountStatus(acc.account_status),
      balance: availableBalance(acc),
      spend_cap: centsToUnit(acc.spend_cap),
      token_ref: tokenIndex,
      updated_at: new Date().toISOString(),
    };
    if (isNew) row.hidden = true;
    const { error } = await sb.from("ad_accounts").upsert(row, { onConflict: "account_id" });
    if (error) throw error;
    // Contas Meta descobertas após a migração também originam um cliente.
    const { data: existingClient, error: clientLookupError } = await sb.from("clients")
      .select("id").eq("source_meta_account_id", acc.account_id).maybeSingle();
    if (!clientLookupError) {
      let clientId = existingClient?.id;
      if (!clientId) {
        const { data: createdClient } = await sb.from("clients").insert({
          name: acc.name,
          status: isNew ? "paused" : "active",
          currency: acc.currency || "BRL",
          source_meta_account_id: acc.account_id,
        }).select("id").maybeSingle();
        clientId = createdClient?.id;
      }
      if (clientId) {
        await sb.from("client_ad_accounts").upsert({
          client_id: clientId,
          account_id: acc.account_id,
          is_primary: true,
        }, { onConflict: "account_id" });
      }
    }
    if (isNew) added.push(acc.name);
  }
  return { platform: "meta", total: list.length, added };
}

async function syncGoogle(known: Set<string>) {
  if (!googleAdsConfigured()) return { platform: "google", total: 0, added: [], skipped: "Credenciais não configuradas." };
  const sb = getServiceClient();
  const list = await listGoogleAdsAccounts();
  const added: string[] = [];
  for (const account of list) {
    const storageId = googleStorageId(account.customerId);
    const isNew = !known.has(storageId);
    const row: Record<string, any> = {
      account_id: storageId,
      name: account.name,
      platform: "google",
      currency: account.currency,
      status: account.status === "ENABLED" ? "ACTIVE" : account.status,
      balance: null,
      spend_cap: null,
      updated_at: new Date().toISOString(),
    };
    if (isNew) row.hidden = true;
    const { error } = await sb.from("ad_accounts").upsert(row, { onConflict: "account_id" });
    if (error) throw error;
    if (isNew) added.push(account.name);
  }
  return { platform: "google", total: list.length, added };
}

async function run(platform: string) {
  if (supabaseEnvMissing()) throw new Error("Supabase não configurado.");
  const sb = getServiceClient();
  const { data: existing, error } = await sb.from("ad_accounts").select("account_id");
  if (error) throw error;
  const known = new Set((existing || []).map((row: any) => row.account_id));
  const results = [];
  if (platform === "all" || platform === "meta") results.push(await syncMeta(known));
  if (platform === "all" || platform === "google") results.push(await syncGoogle(known));
  const addedNames = results.flatMap((result: any) => result.added || []);
  return {
    ok: true,
    total: results.reduce((n: number, result: any) => n + result.total, 0),
    added: addedNames.length,
    addedNames,
    results,
  };
}

export async function GET(req: Request) {
  try {
    const platform = new URL(req.url).searchParams.get("platform") || "all";
    const accounts: { account_id: string; name: string; status: string; platform: "meta" | "google" }[] = [];
    if (platform === "all" || platform === "meta") {
      const meta = await listAdAccountsAll();
      accounts.push(...meta.map(({ acc }) => ({
        account_id: acc.account_id,
        name: acc.name,
        status: mapAccountStatus(acc.account_status),
        platform: "meta" as const,
      })));
    }
    if ((platform === "all" || platform === "google") && googleAdsConfigured()) {
      const google = await listGoogleAdsAccounts();
      accounts.push(...google.map((account) => ({
        account_id: googleStorageId(account.customerId),
        name: account.name,
        status: account.status === "ENABLED" ? "ACTIVE" : account.status,
        platform: "google" as const,
      })));
    }
    return NextResponse.json({ count: accounts.length, accounts });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro ao listar contas." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const platform = ["meta", "google"].includes(body?.platform) ? body.platform : "all";
    return NextResponse.json(await run(platform));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro ao sincronizar contas." }, { status: 500 });
  }
}
