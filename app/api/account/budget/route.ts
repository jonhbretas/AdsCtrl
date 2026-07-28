import { NextResponse } from "next/server";
import { tokenByIndex } from "@/lib/meta";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const GRAPH = "https://graph.facebook.com/v22.0";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const accountId = String(body.account_id || "").trim();
    const level = String(body.level || ""); // "campaign" | "adset"
    const objectId = String(body.id || "").trim();
    const pct = Number(body.percentual); // 0.7 = -30%, 1.3 = +30%

    if (!accountId || !objectId) {
      return NextResponse.json({ error: "account_id e id são obrigatórios." }, { status: 400 });
    }
    if (!["campaign", "adset"].includes(level)) {
      return NextResponse.json({ error: "level deve ser campaign ou adset." }, { status: 400 });
    }
    if (!Number.isFinite(pct) || pct <= 0 || pct > 3) {
      return NextResponse.json({ error: "percentual deve ser entre 0.01 e 3 (1% a 300%)." }, { status: 400 });
    }
    if (supabaseEnvMissing()) {
      return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    }

    const lookupId = accountId.replace(/^act_/, "");
    const { data: account, error } = await getServiceClient()
      .from("ad_accounts")
      .select("platform,hidden,token_ref,name")
      .eq("account_id", lookupId)
      .maybeSingle();
    if (error) throw error;
    if (!account) return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
    if (account.hidden) return NextResponse.json({ error: "Conta oculta." }, { status: 403 });
    if (account.platform === "google") return NextResponse.json({ error: "Google Ads não suportado." }, { status: 501 });

    const token = tokenByIndex(typeof account.token_ref === "number" ? account.token_ref : 0);
    const actId = lookupId.startsWith("act_") ? lookupId : `act_${lookupId}`;

    // Busca orçamento atual
    const res = await fetch(`${GRAPH}/${objectId}?fields=daily_budget,lifetime_budget,budget_remaining&access_token=${token}`, { cache: "no-store" });
    const current = await res.json();
    if (!res.ok || current.error) throw new Error(current.error?.message || "Erro ao ler orçamento atual.");

    const dailyBudget = current.daily_budget ? Number(current.daily_budget) : null;
    const lifetimeBudget = current.lifetime_budget ? Number(current.lifetime_budget) : null;
    const novo = dailyBudget ? Math.round(dailyBudget * pct) : lifetimeBudget ? Math.round(lifetimeBudget * pct) : null;
    if (!novo) return NextResponse.json({ error: "Orçamento não encontrado para este objeto." }, { status: 404 });

    const params: Record<string, string> = { access_token: token };
    if (dailyBudget) params.daily_budget = String(novo);
    else if (lifetimeBudget) params.lifetime_budget = String(novo);

    const updateRes = await fetch(`${GRAPH}/${objectId}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
      cache: "no-store",
    });
    const result = await updateRes.text();
    if (!updateRes.ok) throw new Error(`Erro da Meta: ${result.slice(0, 200)}`);

    const antes = dailyBudget || lifetimeBudget || 0;
    return NextResponse.json({
      ok: true,
      id: objectId,
      level,
      account: account.name || lookupId,
      anterior: antes,
      atual: novo,
      percentual: Math.round((pct - 1) * 100),
      moeda: account.name || "BRL",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Falha ao ajustar orçamento." }, { status: 500 });
  }
}
