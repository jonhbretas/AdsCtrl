import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

const DEFAULT_ITEMS = [
  ["contract", "Contrato cadastrado e assinado", "Dados das partes e documento vigente."],
  ["billing", "Financeiro configurado", "Valor, vencimento e cobrança recorrente."],
  ["access_meta", "Acesso à Meta recebido", "Business Manager, Página e conta de anúncios."],
  ["access_google", "Acesso ao Google recebido", "Google Ads, Analytics e Tag Manager quando aplicável."],
  ["briefing", "Briefing preenchido", "Objetivo, oferta, público e diferenciais."],
  ["brand", "Identidade e materiais recebidos", "Logo, fotos, vídeos, copies e referências."],
  ["tracking", "Rastreamento revisado", "Pixel, eventos, conversões e UTMs."],
  ["campaign", "Primeira campanha publicada", "Estrutura inicial ativa e conferida."],
  ["report", "Primeiro relatório entregue", "Resultados iniciais e próximos passos enviados."],
] as const;

async function ensureItems(clientId: string) {
  const sb = getServiceClient();
  const { data: current, error } = await sb.from("client_onboarding_items").select("*").eq("client_id", clientId).order("position");
  if (error) throw error;
  if (current?.length) return current;
  const rows = DEFAULT_ITEMS.map(([code, title, description], position) => ({ client_id: clientId, code, title, description, position }));
  const { data, error: insertError } = await sb.from("client_onboarding_items").insert(rows).select("*").order("position");
  if (insertError) throw insertError;
  return data || [];
}

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { id } = await params; const items = await ensureItems(id); const done = items.filter((item: any) => item.status === "done").length;
    return NextResponse.json({ items, progress: { done, total: items.length, percent: items.length ? Math.round(done / items.length * 100) : 0 } });
  } catch (error: any) { return NextResponse.json({ error: error?.message || "Falha ao carregar onboarding." }, { status: 500 }); }
}

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { id } = await params; const body = await req.json().catch(() => null); if (!body?.item_id) return NextResponse.json({ error: "Item não informado." }, { status: 400 });
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.status !== undefined) {
      if (!["pending", "in_progress", "done", "blocked"].includes(body.status)) return NextResponse.json({ error: "Status inválido." }, { status: 400 });
      update.status = body.status; update.completed_at = body.status === "done" ? new Date().toISOString() : null;
    }
    if (body.notes !== undefined) update.notes = body.notes || null;
    if (body.due_date !== undefined) update.due_date = body.due_date || null;
    if (Object.keys(update).length === 1) return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
    const { data, error } = await getServiceClient().from("client_onboarding_items").update(update).eq("id", body.item_id).eq("client_id", id).select("*").single();
    if (error) throw error; return NextResponse.json({ item: data });
  } catch (error: any) { return NextResponse.json({ error: error?.message || "Falha ao atualizar onboarding." }, { status: 500 }); }
}
