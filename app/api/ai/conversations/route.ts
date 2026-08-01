// app/api/ai/conversations/route.ts
// Conversas salvas do Assertivus IA. GET lista (com filtros e contexto
// enriquecido: nome do cliente, grupo e conta), POST cria ou atualiza,
// PATCH renomeia e DELETE remove.

import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const MAX_MESSAGES = 500;
const MAX_CHARS = 200_000;
const MAX_TITLE = 140;

interface ConvMessage {
  role: "user" | "assistant";
  content: string;
  mode?: "ai" | "internal";
  routing?: unknown;
  diagnostics?: unknown[];
}

function cleanMessages(value: unknown): ConvMessage[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const out: ConvMessage[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const message = item as Record<string, unknown>;
    if (message.role !== "user" && message.role !== "assistant") return null;
    if (typeof message.content !== "string") return null;
    out.push({
      role: message.role,
      content: message.content,
      mode: message.mode === "ai" || message.mode === "internal" ? message.mode : undefined,
      routing: message.routing && typeof message.routing === "object" ? message.routing : undefined,
      diagnostics: Array.isArray(message.diagnostics) ? message.diagnostics : undefined,
    });
  }
  if (out.length > MAX_MESSAGES) return null;
  const total = out.reduce((acc, message) => acc + message.content.length, 0);
  if (total > MAX_CHARS) return null;
  return out;
}

function cleanTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.trim().replace(/\s+/g, " ").slice(0, MAX_TITLE);
  return title || null;
}

function autoTitle(messages: ConvMessage[]): string {
  const firstUser = messages.find((message) => message.role === "user");
  const raw = (firstUser?.content || "Conversa salva").trim().replace(/\s+/g, " ");
  return raw.length > 80 ? `${raw.slice(0, 80).trimEnd()}…` : raw;
}

function apiError(error: unknown, fallback: string) {
  return NextResponse.json({ error: (error as any)?.message || fallback }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    if (supabaseEnvMissing()) {
      return NextResponse.json({ conversations: [], groups: [], clients: [], error: "Supabase não configurado." }, { status: 200 });
    }
    const { searchParams } = new URL(request.url);
    const sb = getServiceClient();

    let query = sb.from("ai_conversations").select("*").order("updated_at", { ascending: false });
    const clientId = searchParams.get("client_id");
    const groupId = searchParams.get("group_id");
    const accountId = searchParams.get("account_id");
    if (clientId) query = query.eq("client_id", clientId);
    if (groupId) query = query.eq("group_id", groupId);
    if (accountId) query = query.eq("account_id", accountId);

    const [{ data: conversations, error: conversationsError }, { data: clients, error: clientsError }, { data: groups, error: groupsError }, { data: accounts, error: accountsError }] =
      await Promise.all([
        query,
        sb.from("clients").select("id, name"),
        sb.from("client_groups").select("id, name, color"),
        sb.from("ad_accounts").select("account_id, name"),
      ]);
    if (conversationsError) throw conversationsError;
    if (clientsError) throw clientsError;
    if (groupsError) throw groupsError;
    if (accountsError) throw accountsError;

    const clientById = new Map((clients || []).map((client: any) => [client.id, client]));
    const groupById = new Map((groups || []).map((group: any) => [group.id, group]));
    const accountById = new Map((accounts || []).map((account: any) => [account.account_id, account]));

    const enriched = (conversations || []).map((conversation: any) => {
      const group = conversation.group_id ? groupById.get(conversation.group_id) : null;
      const client = conversation.client_id ? clientById.get(conversation.client_id) : null;
      const account = conversation.account_id ? accountById.get(conversation.account_id) : null;
      return {
        ...conversation,
        client_name: client?.name || null,
        group_name: group?.name || null,
        group_color: group?.color || null,
        account_name: account?.name || null,
      };
    });

    return NextResponse.json({
      conversations: enriched,
      groups: groups || [],
      clients: (clients || []).map((client: any) => ({ id: client.id, name: String(client.name || "").trim() || "Cliente sem nome" })),
    });
  } catch (error) {
    return apiError(error, "Falha ao listar as conversas salvas.");
  }
}

export async function POST(request: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const sb = getServiceClient();
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });

    const messages = cleanMessages(body.messages);
    if (!messages) {
      return NextResponse.json({ error: "messages deve ser uma lista não vazia de mensagens (user/assistant)." }, { status: 400 });
    }

    let accountId = typeof body.account_id === "string" && body.account_id.trim() ? body.account_id.trim() : null;
    let groupId = typeof body.group_id === "string" && body.group_id.trim() ? body.group_id.trim() : null;
    let clientId = typeof body.client_id === "string" && body.client_id.trim() ? body.client_id.trim() : null;
    const title = cleanTitle(body.title) || autoTitle(messages);

    // Vínculos derivam da conta selecionada no chat: cliente (via
    // client_ad_accounts) e grupo (via ad_accounts.group_id).
    if (accountId) {
      const [{ data: account }, { data: link }] = await Promise.all([
        sb.from("ad_accounts").select("group_id").eq("account_id", accountId).maybeSingle(),
        sb.from("client_ad_accounts").select("client_id").eq("account_id", accountId).maybeSingle(),
      ]);
      if (!account && !link) return NextResponse.json({ error: "Conta de anúncios não encontrada." }, { status: 404 });
      if (account?.group_id && !groupId) groupId = account.group_id;
      if (link?.client_id && !clientId) clientId = link.client_id;
    }

    // Com id no corpo, atualiza a conversa salva (ex.: salvou de novo depois
    // de continuar a pesquisa); sem id, cria uma nova.
    if (typeof body.id === "string" && body.id.trim()) {
      const { data: existing } = await sb.from("ai_conversations").select("id").eq("id", body.id.trim()).maybeSingle();
      if (!existing) return NextResponse.json({ error: "Conversa salva não encontrada." }, { status: 404 });
      const { data, error } = await sb
        .from("ai_conversations")
        .update({ title, messages, account_id: accountId, group_id: groupId, client_id: clientId, updated_at: new Date().toISOString() })
        .eq("id", body.id.trim())
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ conversation: data });
    }

    const { data, error } = await sb
      .from("ai_conversations")
      .insert({ title, messages, account_id: accountId, group_id: groupId, client_id: clientId })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ conversation: data }, { status: 201 });
  } catch (error) {
    return apiError(error, "Falha ao salvar a conversa.");
  }
}

export async function PATCH(request: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const sb = getServiceClient();
    const body = await request.json().catch(() => null);
    const id = typeof body?.id === "string" && body.id.trim() ? body.id.trim() : null;
    const title = cleanTitle(body?.title);
    if (!id || !title) return NextResponse.json({ error: "id e title são obrigatórios." }, { status: 400 });

    const { data, error } = await sb
      .from("ai_conversations")
      .update({ title, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Conversa salva não encontrada." }, { status: 404 });
    return NextResponse.json({ conversation: data });
  } catch (error) {
    return apiError(error, "Falha ao renomear a conversa.");
  }
}

export async function DELETE(request: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const sb = getServiceClient();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });
    const { error } = await sb.from("ai_conversations").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, "Falha ao excluir a conversa.");
  }
}
