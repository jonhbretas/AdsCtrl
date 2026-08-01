// app/api/meta/campaigns/route.ts
// Cria uma CAMPANHA na Meta (casca: nome, objetivo, status). Nasce PAUSADA por
// padrão — os conjuntos e anúncios entram depois, no Gerenciador ou na tela de
// campanhas, que esta rota alimenta. Só Meta, conta do catálogo e não oculta.

import { NextResponse } from "next/server";
import { META_CAMPAIGN_OBJECTIVES, createMetaCampaign, tokenByIndex } from "@/lib/meta";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const body = await req.json().catch(() => ({}));
    const accountId = String(body.account_id || "").trim();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const objective = String(body.objective || "").trim();
    const status = String(body.status || "PAUSED").toUpperCase();

    if (!accountId || !name) {
      return NextResponse.json({ error: "account_id e name são obrigatórios." }, { status: 400 });
    }
    if (name.length > 160) return NextResponse.json({ error: "O nome deve ter no máximo 160 caracteres." }, { status: 400 });
    if (!META_CAMPAIGN_OBJECTIVES.includes(objective)) {
      return NextResponse.json({ error: `Objetivo inválido. Use: ${META_CAMPAIGN_OBJECTIVES.join(", ")}.` }, { status: 400 });
    }
    if (status !== "ACTIVE" && status !== "PAUSED") {
      return NextResponse.json({ error: "status deve ser ACTIVE ou PAUSED." }, { status: 400 });
    }

    const lookupId = accountId.replace(/^act_/, "");
    const { data: account, error } = await getServiceClient()
      .from("ad_accounts")
      .select("platform,hidden,token_ref,name")
      .eq("account_id", lookupId)
      .maybeSingle();
    if (error) throw error;
    if (!account) return NextResponse.json({ error: "Conta não encontrada no catálogo." }, { status: 404 });
    if (account.hidden) return NextResponse.json({ error: "Conta oculta. Reative-a antes." }, { status: 403 });
    if (account.platform === "google") return NextResponse.json({ error: "Criar campanha só existe na Meta." }, { status: 501 });

    const token = tokenByIndex(typeof account.token_ref === "number" ? account.token_ref : 0);
    const actId = lookupId.startsWith("act_") ? lookupId : `act_${lookupId}`;
    const result = await createMetaCampaign({ accountId: actId, name, objective, status }, token);
    return NextResponse.json({ ok: true, account: account.name || lookupId, ...result }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Falha ao criar a campanha." }, { status: 500 });
  }
}
