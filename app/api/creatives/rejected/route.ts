// app/api/creatives/rejected/route.ts
// Os anúncios recusados de uma conta, agora.
//
// Existe separado do laboratório de criativos por um motivo de dado: o
// laboratório parte dos insights do período, e anúncio reprovado costuma ter
// entrega zero — ele simplesmente não aparece na tabela. Para responder "quais
// são?", o caminho tem de ser o status do anúncio, não a performance dele.
//
// GET /api/creatives/rejected?account_id=123

import { NextResponse } from "next/server";
import { getRejectedAds, tokenByIndex } from "@/lib/meta";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  try {
    if (supabaseEnvMissing()) {
      return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    }
    const accountId = (new URL(req.url).searchParams.get("account_id") || "")
      .trim()
      .replace(/^act_/, "");
    if (!accountId) {
      return NextResponse.json({ error: "account_id é obrigatório." }, { status: 400 });
    }

    // A seleção do banco é autoritativa, como no laboratório: só conta Meta
    // visível. Um ID do Google nunca chega à Graph API.
    const { data: account, error } = await getServiceClient()
      .from("ad_accounts")
      .select("account_id,name,token_ref")
      .eq("account_id", accountId)
      .eq("platform", "meta")
      .eq("hidden", false)
      .maybeSingle();
    if (error) throw error;
    if (!account) {
      return NextResponse.json(
        { error: "Conta Meta visível não encontrada para este ID." },
        { status: 404 }
      );
    }

    const rejected = await getRejectedAds(
      `act_${account.account_id}`,
      tokenByIndex(typeof account.token_ref === "number" ? account.token_ref : 0)
    );

    return NextResponse.json({
      account_id: account.account_id,
      account_name: account.name,
      count: rejected.length,
      ads: rejected.map((ad) => ({
        ad_id: ad.ad_id,
        ad_name: ad.ad_name,
        campaign_name: ad.campaign_name || null,
        reasons: ad.reasons,
        effective_status: ad.effective_status || null,
        thumbnail: ad.thumbnail_url || null,
      })),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Erro ao consultar os anúncios reprovados." },
      { status: 500 }
    );
  }
}
