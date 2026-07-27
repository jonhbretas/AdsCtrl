// app/api/meta/duplicate/route.ts
// Duplica a ESTRUTURA de uma campanha Meta (campanha + conjuntos) para outra
// conta de anúncios. Não copia anúncio nem criativo — ver o comentário de
// duplicateCampaignStructure em lib/meta.ts para o porquê.
//
// Terceira rota que escreve em conta de anúncios, e a mais consequente: cria
// objetos novos. Guardas:
//  - exige sessão (o middleware barra /api/* sem cookie, e esta rota NÃO pode
//    entrar na lista de públicas);
//  - origem e destino têm de estar no catálogo, ser Meta e não estar ocultas;
//  - origem e destino não podem ser a mesma conta: para isso existe o botão
//    de duplicar dentro da conta, no Gerenciador;
//  - a campanha tem de pertencer à conta de origem informada;
//  - tudo nasce PAUSADO, e dry_run valida sem criar.
//
// GET  ?source_account_id=act_1&target_account_id=act_2&campaign_id=123
//      devolve a estrutura e os ativos do destino, para montar o formulário.
// POST { source_account_id, target_account_id, campaign_id, page_id, pixel_id,
//        name_suffix, dry_run }

import { NextResponse } from "next/server";
import {
  duplicateCampaignStructure,
  getCampaignStructure,
  getTargetAssets,
  tokenByIndex,
} from "@/lib/meta";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

class InputError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

type Resolved = { actId: string; token: string; name: string };

async function resolveAccount(raw: unknown, papel: "origem" | "destino"): Promise<Resolved> {
  const accountId = String(raw || "").trim();
  if (!accountId) throw new InputError(`Informe a conta de ${papel}.`);
  if (supabaseEnvMissing()) throw new InputError("Supabase não configurado.", 503);

  const lookupId = accountId.replace(/^act_/, "");
  const { data: account, error } = await getServiceClient()
    .from("ad_accounts")
    .select("platform,hidden,token_ref,name")
    .eq("account_id", lookupId)
    .maybeSingle();
  if (error) throw error;
  if (!account) throw new InputError(`Conta de ${papel} não encontrada no catálogo.`, 404);
  if (account.platform === "google") {
    throw new InputError("Duplicar estrutura só existe na Meta.", 400);
  }
  if (account.hidden) {
    throw new InputError(`A conta de ${papel} está oculta. Reative-a antes.`, 403);
  }
  return {
    actId: `act_${lookupId}`,
    token: tokenByIndex(typeof account.token_ref === "number" ? account.token_ref : 0),
    name: account.name || lookupId,
  };
}

/** A campanha tem de ser da conta de origem: sem isto, um id trocado no corpo
    copiaria campanha de outro cliente que o mesmo token alcança na BM. */
async function assertCampaignBelongs(campaignId: string, source: Resolved) {
  if (!/^\d+$/.test(campaignId)) throw new InputError("Identificador de campanha inválido.");
  const structure = await getCampaignStructure(campaignId, source.token);
  const dona = structure.accountId.replace(/^act_/, "");
  const informada = source.actId.replace(/^act_/, "");
  if (dona && dona !== informada) {
    throw new InputError("Esta campanha não pertence à conta de origem informada.", 403);
  }
  return structure;
}

function fail(error: unknown) {
  const status = error instanceof InputError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Falha na duplicação.";
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const source = await resolveAccount(searchParams.get("source_account_id"), "origem");
    const campaignId = String(searchParams.get("campaign_id") || "").trim();
    const structure = await assertCampaignBelongs(campaignId, source);

    // Os ativos são do DESTINO, então vão com o token do destino: contas de
    // BMs diferentes usam tokens diferentes (ver ad_accounts.token_ref), e o
    // da origem pode simplesmente não enxergar a outra conta.
    const targetRaw = searchParams.get("target_account_id");
    let assets = null;
    if (targetRaw) {
      const target = await resolveAccount(targetRaw, "destino");
      assets = await getTargetAssets(target.actId, target.token);
    }

    return NextResponse.json({ structure, targetAssets: assets });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const source = await resolveAccount(body.source_account_id, "origem");
    const target = await resolveAccount(body.target_account_id, "destino");

    if (source.actId === target.actId) {
      throw new InputError("Origem e destino são a mesma conta. Escolha outra conta de destino.");
    }

    const campaignId = String(body.campaign_id || "").trim();
    await assertCampaignBelongs(campaignId, source);

    const dryRun = body.dry_run !== false; // criar de verdade exige dizer que sim
    const result = await duplicateCampaignStructure(
      {
        sourceCampaignId: campaignId,
        targetActId: target.actId,
        pageId: String(body.page_id || "").trim() || undefined,
        pixelId: String(body.pixel_id || "").trim() || undefined,
        nameSuffix: String(body.name_suffix ?? "").trim() || undefined,
        dryRun,
      },
      source.token,
      target.token
    );

    return NextResponse.json({ ok: true, target: target.name, ...result });
  } catch (error) {
    return fail(error);
  }
}
