// app/api/tasks/checklists/route.ts
// Listas de verificação da tarefa ("Preparar peças", "Subir", "Conferir").
// Apagar a lista leva os itens dela junto (ON DELETE CASCADE).
//
// POST   /api/tasks/checklists   { task_id, title } -> { checklist }
// PATCH  /api/tasks/checklists   { id, title }      -> { checklist }
// DELETE /api/tasks/checklists?id=<uuid>            -> { ok }

import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const MISSING_TABLE = /relation .*task_checklists.* does not exist|could not find the table/i;

function migrationNeeded() {
  return NextResponse.json(
    { error: "Rode supabase-migration-task-extras.sql no SQL Editor do Supabase para usar listas de verificação." },
    { status: 503 }
  );
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export async function POST(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const body = await req.json().catch(() => ({}));
    const taskId = text(body.task_id, 64);
    const title = text(body.title, 120) || "Lista";
    if (!taskId) return NextResponse.json({ error: "task_id é obrigatório." }, { status: 400 });

    const supabase = getServiceClient();
    // Posição no fim: a lista nova entra depois das que já existem.
    const { data: siblings } = await supabase
      .from("task_checklists")
      .select("position")
      .eq("task_id", taskId)
      .order("position", { ascending: false })
      .limit(1);
    const position = (siblings?.[0]?.position ?? -1) + 1;

    const { data, error } = await supabase
      .from("task_checklists")
      .insert({ task_id: taskId, title, position })
      .select("id,task_id,title,position,created_at")
      .single();
    if (error) {
      if (MISSING_TABLE.test(error.message || "")) return migrationNeeded();
      throw error;
    }
    // O quadro espera a lista já no formato do detalhe (com items vazio).
    return NextResponse.json({ checklist: { ...data, items: [] } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao criar a lista." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const body = await req.json().catch(() => ({}));
    const id = text(body.id, 64);
    if (!id) return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });

    const patch: Record<string, any> = {};
    if (body.title !== undefined) {
      const title = text(body.title, 120);
      if (!title) return NextResponse.json({ error: "Dê um nome à lista." }, { status: 400 });
      patch.title = title;
    }
    if (body.position !== undefined && Number.isFinite(Number(body.position))) {
      patch.position = Number(body.position);
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
    }

    const { data, error } = await getServiceClient()
      .from("task_checklists")
      .update(patch)
      .eq("id", id)
      .select("id,task_id,title,position,created_at")
      .maybeSingle();
    if (error) {
      if (MISSING_TABLE.test(error.message || "")) return migrationNeeded();
      throw error;
    }
    if (!data) return NextResponse.json({ error: "Lista não encontrada." }, { status: 404 });
    return NextResponse.json({ checklist: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao atualizar a lista." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const id = (new URL(req.url).searchParams.get("id") || "").trim();
    if (!id) return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });
    const { error } = await getServiceClient().from("task_checklists").delete().eq("id", id);
    if (error) {
      if (MISSING_TABLE.test(error.message || "")) return migrationNeeded();
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao excluir a lista." }, { status: 500 });
  }
}
