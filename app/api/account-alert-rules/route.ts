// app/api/account-alert-rules/route.ts
// Regras de alerta por CONTA de anúncios (Central de Alertas > Alertas
// personalizados).
// GET  ?account_id=      lista regras + alertas ativos/histórico da conta
// POST { account_id, kind, name, config, enabled, id? }  cria ou atualiza
// DELETE ?id=            remove a regra (e os alertas dela, por cascade)

import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";
import type { AccountAlertKind, AccountAlertRule } from "@/lib/account-alerts";

export const dynamic = "force-dynamic";

const KINDS: AccountAlertKind[] = ["cpl", "region", "creative_age", "strategy_review"];

const KIND_LABELS: Record<AccountAlertKind, string> = {
  cpl: "Custo de lead (CPL)",
  region: "Regiões obrigatórias",
  creative_age: "Novo criativo (idade)",
  strategy_review: "Revisão mensal da estratégia",
};

function cleanConfig(kind: AccountAlertKind, raw: unknown): { config: Record<string, any>; error?: string } {
  const input = raw && typeof raw === "object" ? (raw as Record<string, any>) : {};
  if (kind === "cpl") {
    const maxCpl = Number(input.max_cpl);
    if (!Number.isFinite(maxCpl) || maxCpl <= 0) return { config: {}, error: "Informe o custo máximo por lead (maior que zero)." };
    const periodDays = Number(input.period_days);
    return {
      config: {
        max_cpl: maxCpl,
        period_days: Number.isInteger(periodDays) && periodDays > 0 && periodDays <= 90 ? periodDays : 7,
      },
    };
  }
  if (kind === "region") {
    const regions = (Array.isArray(input.regions) ? input.regions : []).map((region: unknown) => String(region || "").trim()).filter(Boolean);
    if (!regions.length) return { config: {}, error: "Informe ao menos uma região obrigatória." };
    return {
      config: {
        regions: [...new Set(regions)].slice(0, 50),
        warn_outside: input.warn_outside === true,
      },
    };
  }
  if (kind === "creative_age") {
    const maxAgeDays = Number(input.max_age_days);
    if (!Number.isInteger(maxAgeDays) || maxAgeDays < 1 || maxAgeDays > 365) {
      return { config: {}, error: "Informe o limite de dias sem criativo novo (1 a 365)." };
    }
    return { config: { max_age_days: maxAgeDays } };
  }
  if (kind === "strategy_review") {
    const maxAgeDays = Number(input.max_age_days);
    return {
      config: {
        max_age_days: Number.isInteger(maxAgeDays) && maxAgeDays >= 1 && maxAgeDays <= 180 ? maxAgeDays : 30,
      },
    };
  }
  return { config: {}, error: "Tipo de regra inválido." };
}

export async function GET(request: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ rules: [], alerts: [], error: "Supabase não configurado." }, { status: 200 });
    const accountId = new URL(request.url).searchParams.get("account_id");
    if (!accountId) return NextResponse.json({ error: "account_id é obrigatório." }, { status: 400 });

    const sb = getServiceClient();
    const lookupId = accountId.replace(/^act_/, "");
    const [{ data: rules }, { data: alerts }] = await Promise.all([
      sb.from("account_alert_rules").select("*").eq("account_id", lookupId).order("created_at"),
      sb.from("account_alerts").select("*").eq("account_id", lookupId).order("last_seen_at", { ascending: false }),
    ]);
    return NextResponse.json({ rules: rules || [], alerts: alerts || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao listar as regras." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });

    const accountId = String(body.account_id || "").trim().replace(/^act_/, "");
    const kind = String(body.kind || "").trim() as AccountAlertKind;
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    if (!accountId) return NextResponse.json({ error: "account_id é obrigatório." }, { status: 400 });
    if (!KINDS.includes(kind)) return NextResponse.json({ error: `kind deve ser ${KINDS.join(", ")}.` }, { status: 400 });

    const { config, error: configError } = cleanConfig(kind, body.config);
    if (configError) return NextResponse.json({ error: configError }, { status: 400 });

    const sb = getServiceClient();
    const { data: account } = await sb.from("ad_accounts").select("account_id").eq("account_id", accountId).maybeSingle();
    if (!account) return NextResponse.json({ error: "Conta de anúncios não encontrada." }, { status: 404 });

    const row = {
      account_id: accountId,
      kind,
      name: name || KIND_LABELS[kind],
      config,
      enabled: body.enabled !== false,
      updated_at: new Date().toISOString(),
    };

    if (typeof body.id === "string" && body.id.trim()) {
      const { data, error } = await sb.from("account_alert_rules").update(row).eq("id", body.id.trim()).eq("account_id", accountId).select().single();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: "Regra não encontrada." }, { status: 404 });
      return NextResponse.json({ rule: data });
    }

    const { data, error } = await sb.from("account_alert_rules").insert({ ...row, created_at: new Date().toISOString() }).select().single();
    if (error) throw error;
    return NextResponse.json({ rule: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao salvar a regra." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });
    const { error } = await getServiceClient().from("account_alert_rules").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao excluir a regra." }, { status: 500 });
  }
}

export type { AccountAlertRule };
