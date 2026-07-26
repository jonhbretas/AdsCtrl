// app/api/account/status/route.ts
// Pausa ou reativa campanha, conjunto ou anúncio na Meta.
//
// É a única rota do app que ESCREVE em conta de anúncios, então ela é estreita
// de propósito:
//  - exige sessão (o middleware barra /api/* sem cookie; esta rota não está na
//    lista de rotas públicas, e não pode entrar — link assinado de cliente
//    jamais deve chegar aqui);
//  - aceita só ACTIVE e PAUSED (ARCHIVED/DELETED passam pelo mesmo campo da
//    Meta e não têm volta por um clique);
//  - confere que o objeto pertence à conta informada antes de escrever, para
//    um id trocado na requisição não virar alteração em outra conta;
//  - Google Ads ainda não: a permissão existe, o código não.
//
// Ex.: POST /api/account/status
//      { "account_id": "act_123", "level": "campaign", "id": "456", "status": "PAUSED" }

import { NextResponse } from "next/server";
import { fetchStatuses, setObjectStatus, tokenByIndex, type MetaLevel } from "@/lib/meta";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const LEVELS: MetaLevel[] = ["campaign", "adset", "ad"];
const NOT_FOUND: Record<MetaLevel, string> = {
  campaign: "Campanha não encontrada nesta conta.",
  adset: "Conjunto não encontrado nesta conta.",
  ad: "Anúncio não encontrado nesta conta.",
};

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const accountId = String(body.account_id || "").trim();
    const level = String(body.level || "") as MetaLevel;
    const objectId = String(body.id || "").trim();
    const status = String(body.status || "").toUpperCase();

    if (!accountId || !objectId) {
      return NextResponse.json({ error: "account_id e id são obrigatórios." }, { status: 400 });
    }
    if (!LEVELS.includes(level)) {
      return NextResponse.json({ error: "level deve ser campaign, adset ou ad." }, { status: 400 });
    }
    if (status !== "ACTIVE" && status !== "PAUSED") {
      return NextResponse.json({ error: "status deve ser ACTIVE ou PAUSED." }, { status: 400 });
    }
    if (!/^\d+$/.test(objectId)) {
      return NextResponse.json({ error: "Identificador inválido." }, { status: 400 });
    }
    if (supabaseEnvMissing()) {
      return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    }

    // Plataforma e token vêm do catálogo, nunca do cliente da requisição.
    const lookupId = accountId.replace(/^act_/, "");
    const { data: account, error } = await getServiceClient()
      .from("ad_accounts")
      .select("platform,hidden,token_ref,name")
      .eq("account_id", lookupId)
      .maybeSingle();
    if (error) throw error;
    if (!account) {
      return NextResponse.json({ error: "Conta não encontrada no catálogo." }, { status: 404 });
    }
    if (account.hidden) {
      return NextResponse.json({ error: "Conta oculta. Reative-a antes de alterar campanhas." }, { status: 403 });
    }
    if (account.platform === "google") {
      return NextResponse.json(
        { error: "Pausar pelo painel ainda só funciona na Meta. No Google, use o Google Ads." },
        { status: 501 }
      );
    }

    const token = tokenByIndex(typeof account.token_ref === "number" ? account.token_ref : 0);
    const actId = lookupId.startsWith("act_") ? lookupId : `act_${lookupId}`;

    // O objeto tem que ser desta conta. Sem esta checagem, um id trocado na
    // requisição alteraria qualquer objeto que o token alcança na BM.
    const statuses = await fetchStatuses(actId, level, token);
    const current = statuses[objectId];
    if (!current) {
      return NextResponse.json({ error: NOT_FOUND[level] }, { status: 404 });
    }
    if (current.status === status) {
      return NextResponse.json({
        ok: true,
        unchanged: true,
        id: objectId,
        status,
        effective_status: current.effective_status,
      });
    }

    await setObjectStatus(objectId, status, token);

    return NextResponse.json({
      ok: true,
      id: objectId,
      level,
      previous_status: current.status,
      status,
      account: account.name || lookupId,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Falha ao alterar o status." }, { status: 500 });
  }
}
