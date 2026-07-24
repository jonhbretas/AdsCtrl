import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";
import { apiError, ClientInputError, fetchClients } from "../../_shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = { params: Promise<{ id: string }> };

async function ensureClientAndAccount(
  sb: SupabaseClient,
  clientId: string,
  accountId: string
): Promise<any> {
  const [{ data: client, error: clientError }, { data: account, error: accountError }] =
    await Promise.all([
      sb.from("clients").select("id").eq("id", clientId).maybeSingle(),
      sb
        .from("ad_accounts")
        .select("account_id, name, platform")
        .eq("account_id", accountId)
        .maybeSingle(),
    ]);

  if (clientError) throw clientError;
  if (accountError) throw accountError;
  if (!client) throw new ClientInputError("Cliente não encontrado.", 404);
  if (!account) throw new ClientInputError("Conta de anúncios não encontrada.", 404);
  return account;
}

async function syncLegacyLinksForClient(sb: SupabaseClient, clientId: string): Promise<void> {
  const { data: links, error: linksError } = await sb
    .from("client_ad_accounts")
    .select("account_id, is_primary")
    .eq("client_id", clientId);
  if (linksError) throw linksError;

  const accountIds = (links || []).map((link: any) => link.account_id);
  let accounts: any[] = [];
  if (accountIds.length) {
    const { data, error } = await sb
      .from("ad_accounts")
      .select("account_id, platform")
      .in("account_id", accountIds);
    if (error) throw error;
    accounts = data || [];
  }

  const primaryById = new Map(
    (links || []).map((link: any) => [link.account_id, Boolean(link.is_primary)])
  );
  const metaAccounts = accounts
    .filter((account: any) => account.platform === "meta")
    .sort((a: any, b: any) => Number(primaryById.get(b.account_id)) - Number(primaryById.get(a.account_id)));
  const preferredMetaId = metaAccounts[0]?.account_id || null;

  const { error: clientError } = await sb
    .from("clients")
    .update({
      source_meta_account_id: preferredMetaId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", clientId);
  if (clientError) throw clientError;

  const googleAccountIds = accounts
    .filter((account: any) => account.platform === "google")
    .map((account: any) => account.account_id);
  if (googleAccountIds.length) {
    const { error: googleError } = await sb
      .from("ad_accounts")
      .update({
        linked_meta_account_id: preferredMetaId,
        updated_at: new Date().toISOString(),
      })
      .in("account_id", googleAccountIds);
    if (googleError) throw googleError;
  }
}

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    if (supabaseEnvMissing()) {
      return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ClientInputError("O corpo da requisição precisa ser um objeto JSON.");
    }
    const accountId =
      typeof (body as any).account_id === "string" ? (body as any).account_id.trim() : "";
    if (!accountId) throw new ClientInputError("account_id é obrigatório.");
    if (
      Object.prototype.hasOwnProperty.call(body, "is_primary") &&
      typeof (body as any).is_primary !== "boolean"
    ) {
      throw new ClientInputError("is_primary deve ser boolean.");
    }

    const sb = getServiceClient();
    await ensureClientAndAccount(sb, id, accountId);

    const { data: existing, error: existingError } = await sb
      .from("client_ad_accounts")
      .select("client_id, account_id, is_primary")
      .eq("account_id", accountId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing && existing.client_id !== id) {
      throw new ClientInputError("Esta conta já está vinculada a outro cliente.", 409);
    }

    const { count, error: countError } = await sb
      .from("client_ad_accounts")
      .select("account_id", { count: "exact", head: true })
      .eq("client_id", id);
    if (countError) throw countError;
    const shouldBePrimary =
      typeof (body as any).is_primary === "boolean" ? (body as any).is_primary : (count || 0) === 0;

    if (!existing) {
      const { error: insertError } = await sb.from("client_ad_accounts").insert({
        client_id: id,
        account_id: accountId,
        is_primary: false,
      });
      if (insertError) throw insertError;
    }

    if (shouldBePrimary) {
      const { error: demoteError } = await sb
        .from("client_ad_accounts")
        .update({ is_primary: false })
        .eq("client_id", id)
        .neq("account_id", accountId);
      if (demoteError) throw demoteError;
    }

    const { error: primaryError } = await sb
      .from("client_ad_accounts")
      .update({ is_primary: shouldBePrimary })
      .eq("client_id", id)
      .eq("account_id", accountId);
    if (primaryError) throw primaryError;

    await syncLegacyLinksForClient(sb, id);
    const { clients } = await fetchClients(sb, id);
    return NextResponse.json({ client: clients[0] });
  } catch (error: any) {
    const response = apiError(error, "Erro ao vincular conta.");
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}

export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    if (supabaseEnvMissing()) {
      return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    }

    const urlAccountId = new URL(req.url).searchParams.get("account_id");
    const body = urlAccountId ? null : await req.json().catch(() => null);
    const accountId = String(urlAccountId || body?.account_id || "").trim();
    if (!accountId) throw new ClientInputError("account_id é obrigatório.");

    const sb = getServiceClient();
    await ensureClientAndAccount(sb, id, accountId);

    const { data: link, error: findError } = await sb
      .from("client_ad_accounts")
      .select("account_id")
      .eq("client_id", id)
      .eq("account_id", accountId)
      .maybeSingle();
    if (findError) throw findError;
    if (!link) throw new ClientInputError("Esta conta não está vinculada ao cliente.", 404);

    const { error: deleteError } = await sb
      .from("client_ad_accounts")
      .delete()
      .eq("client_id", id)
      .eq("account_id", accountId);
    if (deleteError) throw deleteError;

    // A conta removida deixa de apontar para um cliente no modelo legado.
    const { error: clearLegacyError } = await sb
      .from("ad_accounts")
      .update({ linked_meta_account_id: null, updated_at: new Date().toISOString() })
      .eq("account_id", accountId)
      .eq("platform", "google");
    if (clearLegacyError) throw clearLegacyError;

    await syncLegacyLinksForClient(sb, id);
    const { clients } = await fetchClients(sb, id);
    return NextResponse.json({ client: clients[0] });
  } catch (error: any) {
    const response = apiError(error, "Erro ao desvincular conta.");
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}
