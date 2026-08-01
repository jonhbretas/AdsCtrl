// app/api/account-strategies/route.ts
// Resumo estratégico da conta: o "caderno" mensal do que precisa estar
// alinhado — objetivo, público alvo, regiões, cidades e melhores ofertas.
// GET  ?account_id=   devolve o resumo (content + datas)
// POST { account_id, content }  cria ou atualiza (upsert por conta)

import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const FIELDS = ["objective", "audience", "regions", "cities", "offers", "notes"] as const;
const MAX_FIELD = 2000;

function cleanContent(raw: unknown): { content: Record<string, string>; error?: string } {
  const input = raw && typeof raw === "object" ? (raw as Record<string, any>) : {};
  const content: Record<string, string> = {};
  for (const field of FIELDS) {
    const value = typeof input[field] === "string" ? input[field].trim() : "";
    if (value.length > MAX_FIELD) return { content: {}, error: `${field} deve ter no máximo ${MAX_FIELD} caracteres.` };
    content[field] = value;
  }
  return { content };
}

export async function GET(request: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ content: {}, error: "Supabase não configurado." }, { status: 200 });
    const accountId = new URL(request.url).searchParams.get("account_id")?.replace(/^act_/, "");
    if (!accountId) return NextResponse.json({ error: "account_id é obrigatório." }, { status: 400 });

    const { data } = await getServiceClient()
      .from("account_strategies")
      .select("content, created_at, updated_at")
      .eq("account_id", accountId)
      .maybeSingle();
    return NextResponse.json({
      content: data?.content || {},
      created_at: data?.created_at || null,
      updated_at: data?.updated_at || null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao carregar o resumo." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const body = await request.json().catch(() => null);
    const accountId = String(body?.account_id || "").trim().replace(/^act_/, "");
    if (!accountId) return NextResponse.json({ error: "account_id é obrigatório." }, { status: 400 });

    const { content, error: contentError } = cleanContent(body?.content);
    if (contentError) return NextResponse.json({ error: contentError }, { status: 400 });

    const now = new Date().toISOString();
    const { data, error } = await getServiceClient()
      .from("account_strategies")
      .upsert({ account_id: accountId, content, updated_at: now }, { onConflict: "account_id" })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ content: data.content, updated_at: data.updated_at });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao salvar o resumo." }, { status: 500 });
  }
}
