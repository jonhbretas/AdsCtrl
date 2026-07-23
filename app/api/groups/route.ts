// app/api/groups/route.ts
// CRUD de grupos de clientes (client_groups). Sempre responde JSON.

import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ groups: [], error: "Supabase não configurado." });
    const sb = getServiceClient();
    const { data, error } = await sb.from("client_groups").select("*").order("name");
    if (error) throw error;
    return NextResponse.json({ groups: data || [] });
  } catch (e: any) {
    return NextResponse.json({ groups: [], error: e?.message ?? "Erro ao listar grupos." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim();
    const color = String(body?.color ?? "#3987e5");
    if (!name) return NextResponse.json({ error: "Nome do grupo é obrigatório." }, { status: 400 });
    const sb = getServiceClient();
    const { data, error } = await sb.from("client_groups").insert({ name, color }).select().single();
    if (error) throw error;
    return NextResponse.json({ group: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao criar grupo." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = body?.id;
    if (!id) return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });
    const patch: Record<string, string> = {};
    if (typeof body?.name === "string") patch.name = body.name.trim();
    if (typeof body?.color === "string") patch.color = body.color;
    if (Object.keys(patch).length === 0)
      return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
    const sb = getServiceClient();
    const { data, error } = await sb.from("client_groups").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return NextResponse.json({ group: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao atualizar grupo." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });
    const sb = getServiceClient();
    // ad_accounts.group_id tem ON DELETE SET NULL, então as contas apenas ficam sem grupo.
    const { error } = await sb.from("client_groups").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao excluir grupo." }, { status: 500 });
  }
}
