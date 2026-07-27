// app/api/google/negatives/route.ts
// Palavras negativas de campanha no Google Ads: listar, criar e remover.
//
// É a segunda rota do app que ESCREVE em conta de anúncios (a primeira é
// /api/account/status, que pausa objetos da Meta), e segue as mesmas guardas:
//  - exige sessão. O middleware barra /api/* sem cookie, e esta rota NÃO pode
//    entrar na lista de rotas públicas — link assinado de cliente jamais deve
//    alcançar uma escrita;
//  - a plataforma e o id de cliente vêm do catálogo em ad_accounts, nunca do
//    corpo da requisição;
//  - conta oculta não escreve: se ela não é coletada, não é para ser operada;
//  - só EXACT e PHRASE. Correspondência ampla negativa é a que mais corta por
//    engano e não é decisão de um clique;
//  - remover exige o resourceName completo, e lib/google-ads.ts confere que
//    ele pertence à conta informada.
//
// Ex.: POST   { "account_id": "google:123", "campaign_id": "456",
//               "text": "curso gratis", "match_type": "PHRASE" }
//      DELETE { "account_id": "google:123",
//               "resource_name": "customers/123/campaignCriteria/456~789" }

import { NextResponse } from "next/server";
import {
  addCampaignNegative,
  googleAdsConfigured,
  googleCustomerId,
  listCampaignNegatives,
  removeCampaignNegative,
  type NegativeMatchType,
} from "@/lib/google-ads";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// O termo digitado vem do Google, mas volta pelo navegador: tratar como
// entrada do usuário. O teto de 80 é o limite da própria API.
const MAX_TERM = 80;

class InputError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** Resolve a conta pelo catálogo e devolve o customerId numérico. */
async function resolveAccount(rawAccountId: unknown): Promise<{ customerId: string; name: string }> {
  const accountId = String(rawAccountId || "").trim();
  if (!accountId) throw new InputError("account_id é obrigatório.");
  if (supabaseEnvMissing()) throw new InputError("Supabase não configurado.", 503);
  if (!googleAdsConfigured()) throw new InputError("Credenciais do Google Ads não configuradas.", 503);

  const { data: account, error } = await getServiceClient()
    .from("ad_accounts")
    .select("platform,hidden,name")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw error;
  if (!account) throw new InputError("Conta não encontrada no catálogo.", 404);
  if (account.platform !== "google") {
    throw new InputError("Palavras negativas existem só no Google Ads.", 400);
  }
  if (account.hidden) {
    throw new InputError("Conta oculta. Reative-a antes de alterar palavras.", 403);
  }
  return { customerId: googleCustomerId(accountId), name: account.name || accountId };
}

function fail(error: unknown) {
  const status = error instanceof InputError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Falha na operação.";
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const { customerId } = await resolveAccount(searchParams.get("account_id"));
    return NextResponse.json({ negatives: await listCampaignNegatives(customerId) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { customerId, name } = await resolveAccount(body.account_id);

    const text = String(body.text || "").trim();
    const campaignId = String(body.campaign_id || "").trim();
    const matchType = String(body.match_type || "").toUpperCase() as NegativeMatchType;

    if (!text) throw new InputError("Informe o termo a negativar.");
    if (text.length > MAX_TERM) throw new InputError(`O termo passa de ${MAX_TERM} caracteres.`);
    if (!/^\d+$/.test(campaignId)) throw new InputError("Campanha inválida.");
    if (matchType !== "EXACT" && matchType !== "PHRASE") {
      throw new InputError("Correspondência deve ser EXACT ou PHRASE.");
    }

    // Negativar duas vezes devolve erro cru da API ("já existe"). Melhor
    // responder que já estava tratado — o resultado que o usuário queria.
    const existing = await listCampaignNegatives(customerId);
    const already = existing.find(
      (negative) =>
        negative.campaignId === campaignId &&
        negative.text.toLowerCase() === text.toLowerCase() &&
        negative.matchType === matchType
    );
    if (already) {
      return NextResponse.json({ ok: true, unchanged: true, negative: already, account: name });
    }

    const created = await addCampaignNegative(customerId, campaignId, text, matchType);
    return NextResponse.json({ ok: true, negative: created, account: name });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { customerId, name } = await resolveAccount(body.account_id);
    const resourceName = String(body.resource_name || "").trim();
    if (!resourceName) throw new InputError("resource_name é obrigatório.");
    // Critério de outra conta é pedido errado, não falha do servidor. A mesma
    // conferência existe em removeCampaignNegative: aqui ela dá a resposta
    // certa, lá ela impede que uma chamada futura pule esta rota.
    if (!resourceName.startsWith(`customers/${customerId}/campaignCriteria/`)) {
      throw new InputError("Este critério não pertence à conta informada.", 400);
    }

    await removeCampaignNegative(customerId, resourceName);
    return NextResponse.json({ ok: true, removed: resourceName, account: name });
  } catch (error) {
    return fail(error);
  }
}
