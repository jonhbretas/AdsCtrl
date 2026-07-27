// app/api/tasks/comments/route.ts
// Comentários da tarefa: a decisão que morria no WhatsApp fica no cartão.
//
// POST   /api/tasks/comments   { task_id, body } -> { comment }
// PATCH  /api/tasks/comments   { id, body }      -> { comment }
// DELETE /api/tasks/comments?id=<uuid>           -> { ok }

import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const MISSING_TABLE = /relation .*task_comments.* does not exist|could not find the table/i;

function migrationNeeded() {
  return NextResponse.json(
    { error: "Rode supabase-migration-task-extras.sql no SQL Editor do Supabase para usar comentários." },
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
    const commentBody = text(body.body, 2000);
    if (!taskId) return NextResponse.json({ error: "task_id é obrigatório." }, { status: 400 });
    if (!commentBody) return NextResponse.json({ error: "Escreva o comentário." }, { status: 400 });

    const { data, error } = await getServiceClient()
      .from("task_comments")
      .insert({ task_id: taskId, body: commentBody })
      .select("id,task_id,body,created_at,updated_at")
      .single();
    if (error) {
      if (MISSING_TABLE.test(error.message || "")) return migrationNeeded();
      throw error;
    }
    return NextResponse.json({ comment: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao comentar." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const body = await req.json().catch(() => ({}));
    const id = text(body.id, 64);
    const commentBody = text(body.body, 2000);
    if (!id) return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });
    if (!commentBody) return NextResponse.json({ error: "Escreva o comentário." }, { status: 400 });

    const { data, error } = await getServiceClient()
      .from("task_comments")
      .update({ body: commentBody, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id,task_id,body,created_at,updated_at")
      .maybeSingle();
    if (error) {
      if (MISSING_TABLE.test(error.message || "")) return migrationNeeded();
      throw error;
    }
    if (!data) return NextResponse.json({ error: "Comentário não encontrado." }, { status: 404 });
    return NextResponse.json({ comment: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao editar o comentário." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const id = (new URL(req.url).searchParams.get("id") || "").trim();
    if (!id) return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });
    const { error } = await getServiceClient().from("task_comments").delete().eq("id", id);
    if (error) {
      if (MISSING_TABLE.test(error.message || "")) return migrationNeeded();
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao excluir o comentário." }, { status: 500 });
  }
}
