// app/api/meta/suggest-campaigns/route.ts
// Gera a ESTRUTURA de campanhas a partir da estratégia da conta (tela de
// campanhas > "Sugerir estrutura"): funil limpo, tudo PAUSADO, sem criativo
// (o operador sobe as peças depois).
//
// GET  ?account_id=            -> pixels da conta (para o formulário)
// POST { account_id, funnel, destination, landing_url, sales_optimization,
//        cbo, budget_recognition, budget_sales, age_min, age_max,
//        cities: string[], suffix, pixel_id } -> cria campanhas + conjuntos
//
// Regras de "limpeza" aplicadas (ver buildCleanTargeting):
//  - sem Audience Network, sem Messenger, sem expansão de público;
//  - só Facebook/Instagram/Threads nos posicionamentos clássicos;
//  - faixa etária explícita e segmentação por cidade resolvida pela Meta;
//  - CBO (orçamento na campanha) ou ABO (orçamento em cada conjunto).

import { NextResponse } from "next/server";
import {
  createAdsetInAccount, createMetaCampaign, buildCleanTargeting, searchGeoCity, tokenByIndex,
} from "@/lib/meta";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const OBJECTIVES = {
  recognition: "OUTCOME_TRAFFIC",
  sales: "OUTCOME_TRAFFIC",
} as const;

const SALES_OPTIMIZATIONS: Record<string, { goal: string; event?: string }> = {
  add_to_cart: { goal: "ADD_TO_CART", event: "ADD_TO_CART" },
  purchase: { goal: "PURCHASE", event: "PURCHASE" },
  link_clicks: { goal: "LINK_CLICKS" },
};

function cleanString(value: unknown, max = 120): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export async function GET(request: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ pixels: [], error: "Supabase não configurado." }, { status: 200 });
    const accountId = String(new URL(request.url).searchParams.get("account_id") || "").trim().replace(/^act_/, "");
    if (!accountId) return NextResponse.json({ error: "account_id é obrigatório." }, { status: 400 });

    const sb = getServiceClient();
    const { data: account } = await sb.from("ad_accounts").select("platform,hidden,token_ref").eq("account_id", accountId).maybeSingle();
    if (!account || account.hidden) return NextResponse.json({ error: "Conta não encontrada ou oculta." }, { status: 404 });
    if (account.platform !== "meta") return NextResponse.json({ error: "Gerar estrutura só existe na Meta." }, { status: 501 });

    const token = tokenByIndex(typeof account.token_ref === "number" ? account.token_ref : 0);
    const actId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
    const url = `https://graph.facebook.com/v25.0/${actId}/adspixels?fields=id,name&limit=50&access_token=${token}`;
    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    return NextResponse.json({ pixels: (json.data || []).map((pixel: any) => ({ id: String(pixel.id), name: pixel.name })) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao carregar os pixels." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });

    const accountId = String(body.account_id || "").trim().replace(/^act_/, "");
    if (!accountId) return NextResponse.json({ error: "account_id é obrigatório." }, { status: 400 });

    const sb = getServiceClient();
    const { data: account, error: accountError } = await sb
      .from("ad_accounts")
      .select("platform,hidden,token_ref,name")
      .eq("account_id", accountId)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account) return NextResponse.json({ error: "Conta não encontrada no catálogo." }, { status: 404 });
    if (account.hidden) return NextResponse.json({ error: "Conta oculta. Reative-a antes." }, { status: 403 });
    if (account.platform === "google") return NextResponse.json({ error: "Gerar estrutura só existe na Meta." }, { status: 501 });

    const cities = (Array.isArray(body.cities) ? body.cities : [])
      .map((city: unknown) => cleanString(city, 100))
      .filter(Boolean);
    if (!cities.length) return NextResponse.json({ error: "Informe ao menos uma cidade." }, { status: 400 });

    const funnelRecognition = body.funnel?.recognition !== false;
    const funnelSales = body.funnel?.sales !== false;
    if (!funnelRecognition && !funnelSales) return NextResponse.json({ error: "Escolha ao menos um tipo de campanha (reconhecimento ou vendas)." }, { status: 400 });

    const destination = body.destination === "landing" ? "landing" : "profile";
    const landingUrl = destination === "landing" ? cleanString(body.landing_url, 300) : "";
    if (destination === "landing" && !landingUrl) return NextResponse.json({ error: "Informe a URL da landing page." }, { status: 400 });

    const salesOptimization = SALES_OPTIMIZATIONS[String(body.sales_optimization || "add_to_cart")] || SALES_OPTIMIZATIONS.add_to_cart;
    const cbo = body.cbo === true;
    const budgetRecognition = cleanNumber(body.budget_recognition, 10, 1, 5000);
    const budgetSales = cleanNumber(body.budget_sales, 15, 1, 5000);
    const ageMin = cleanNumber(body.age_min, 18, 13, 65);
    const ageMax = cleanNumber(body.age_max, 54, ageMin, 65);
    const suffix = cleanString(body.suffix, 60);
    const pixelId = cleanString(body.pixel_id, 60);

    const token = tokenByIndex(typeof account.token_ref === "number" ? account.token_ref : 0);
    const actId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;

    // Resolve as cidades para o key geográfico da Meta (busca por nome).
    const geoResolved: { name: string; geo: { key: string; name: string } }[] = [];
    const unresolved: string[] = [];
    for (const city of cities) {
      const geo = await searchGeoCity(city, token);
      if (geo?.key) geoResolved.push({ name: city, geo: { key: geo.key, name: geo.name } });
      else unresolved.push(city);
    }
    if (!geoResolved.length) {
      return NextResponse.json({ error: `Nenhuma cidade foi encontrada na Meta: ${unresolved.join(", ")}. Confira os nomes.` }, { status: 400 });
    }

    const results: { name: string; campaign_id?: string; adsets: { name: string; id?: string; error?: string }[]; error?: string }[] = [];
    const warnings: string[] = [];
    if (unresolved.length) warnings.push(`Cidade(s) não encontrada(s) na Meta (puladas): ${unresolved.join(", ")}.`);

    const sufixo = suffix ? ` ${suffix}` : "";

    async function createFunnel(type: "recognition" | "sales", label: string, objectiveBudgetCents: number) {
      const campaignName = `${label}${sufixo}`;
      const campaignParams: { name: string; objective: string; status: "ACTIVE" | "PAUSED" } = { name: campaignName, objective: OBJECTIVES[type], status: "PAUSED" };
      const campaignId = await createCampaignWithBudget(campaignParams, actId, token, cbo, objectiveBudgetCents);
      const result = { name: campaignName, campaign_id: campaignId as string | undefined, adsets: [] as { name: string; id?: string; error?: string }[] };
      results.push(result);

      if (!campaignId) return;

      for (const { name: cityName, geo } of geoResolved) {
        const targeting = buildCleanTargeting({ cities: [geo], ageMin, ageMax });
        const adsetName = `${label} - ${cityName}${sufixo}`;
        const adsetInput: Parameters<typeof createAdsetInAccount>[0] = {
          accountId: actId,
          campaignId,
          name: adsetName,
          optimizationGoal: "LINK_CLICKS",
          billingEvent: "IMPRESSIONS",
          destinationType: "website",
          targeting,
        };
        if (!cbo) adsetInput.dailyBudget = objectiveBudgetCents;

        if (type === "sales") {
          adsetInput.optimizationGoal = salesOptimization.goal;
          if (salesOptimization.event && pixelId) {
            adsetInput.promotedObject = { pixel_id: pixelId, custom_event_type: salesOptimization.event };
          }
          if (destination === "landing") {
            adsetInput.destinationType = "website";
            if (!adsetInput.promotedObject) adsetInput.destinationType = "website";
          } else {
            adsetInput.destinationType = "profile";
            adsetInput.optimizationGoal = "PROFILE_VISIT";
          }
        } else {
          // Reconhecimento: visita ao perfil do Instagram (aumentar seguidores).
          adsetInput.destinationType = "profile";
          adsetInput.optimizationGoal = "PROFILE_VISIT";
        }

        try {
          const created = await createAdsetInAccount(adsetInput, token);
          result.adsets.push({ name: adsetName, id: created.id });
        } catch (e: any) {
          result.adsets.push({ name: adsetName, error: e?.message || "Falha ao criar o conjunto." });
        }
      }
    }

    // Cria a campanha (campaignId por retorno) — com orçamento CBO ou sem (ABO).
    async function createCampaignWithBudget(params: { name: string; objective: string; status: "ACTIVE" | "PAUSED" }, act: string, tk: string, shared: boolean, budgetCents: number): Promise<string | undefined> {
      try {
        const campaign = await createMetaCampaign({ accountId: act, name: params.name, objective: params.objective, status: params.status }, tk);
        if (!campaign.id) throw new Error("A Meta não devolveu o id da campanha.");
        if (shared && budgetCents > 0) {
          const fbPostBody = new URLSearchParams({ daily_budget: String(Math.round(budgetCents)), access_token: tk });
          const res = await fetch(`https://graph.facebook.com/v25.0/${campaign.id}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: fbPostBody, cache: "no-store" });
          const text = await res.text();
          if (!res.ok) {
            const message = (() => { try { return JSON.parse(text)?.error?.message || text; } catch { return text; } })();
            throw new Error(`Orçamento da campanha: ${message}`);
          }
        }
        return campaign.id;
      } catch (e: any) {
        results.push({ name: params.name, adsets: [], error: e?.message || "Falha ao criar a campanha." });
        return undefined;
      }
    }

    if (funnelRecognition) await createFunnel("recognition", "REC - Visita ao perfil", Math.round(budgetRecognition * 100));
    if (funnelSales) await createFunnel("sales", destination === "landing" ? "VEN - Landing" : "VEN - Perfil", Math.round(budgetSales * 100));

    return NextResponse.json({ ok: true, account: account.name || accountId, results, warnings, destination, cbo });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao gerar a estrutura." }, { status: 500 });
  }
}
