// app/api/tasks/checklist-items/route.ts
// Passos de uma lista de verificação. Marcar feito registra done_at: o "3/5"
// do cartão diz onde está, o histórico diz quando cada passo caiu.
//
// POST   /api/tasks/checklist-items   { checklist_id, text }      -> { item }
// PATCH  /api/tasks/checklist-items   { id, text?, done? }        -> { item }
// DELETE /api/tasks/checklist-items?id=<uuid>                     -> { ok }

import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const MISSING_TABLE = /relation .*task_checklist_items.* does not exist|could not find the table/i;

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
    const checklistId = text(body.checklist_id, 64);
    const itemText = text(body.text, 300);
    if (!checklistId) return NextResponse.json({ error: "checklist_id é obrigatório." }, { status: 400 });
    if (!itemText) return NextResponse.json({ error: "Descreva o passo." }, { status: 400 });

    const supabase = getServiceClient();
    const { data: siblings } = await supabase
      .from("task_checklist_items")
      .select("position")
      .eq("checklist_id", checklistId)
      .order("position", { ascending: false })
      .limit(1);
    const position = (siblings?.[0]?.position ?? -1) + 1;

    const { data, error } = await supabase
      .from("task_checklist_items")
      .insert({ checklist_id: checklistId, text: itemText, position })
      .select("id,checklist_id,text,done,position,created_at,done_at")
      .single();
    if (error) {
      if (MISSING_TABLE.test(error.message || "")) return migrationNeeded();
      throw error;
    }
    return NextResponse.json({ item: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao adicionar o passo." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const body = await req.json().catch(() => ({}));
    const id = text(body.id, 64);
    if (!id) return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });

    const patch: Record<string, any> = {};
    if (body.text !== undefined) {
      const itemText = text(body.text, 300);
      if (!itemText) return NextResponse.json({ error: "Descreva o passo." }, { status: 400 });
      patch.text = itemText;
    }
    if (body.done !== undefined) {
      patch.done = Boolean(body.done);
      patch.done_at = patch.done ? new Date().toISOString() : null;
    }
    if (body.position !== undefined && Number.isFinite(Number(body.position))) {
      patch.position = Number(body.position);
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
    }

    const { data, error } = await getServiceClient()
      .from("task_checklist_items")
      .update(patch)
      .eq("id", id)
      .select("id,checklist_id,text,done,position,created_at,done_at")
      .maybeSingle();
    if (error) {
      if (MISSING_TABLE.test(error.message || "")) return migrationNeeded();
      throw error;
    }
    if (!data) return NextResponse.json({ error: "Passo não encontrado." }, { status: 404 });
    return NextResponse.json({ item: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao atualizar o passo." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const id = (new URL(req.url).searchParams.get("id") || "").trim();
    if (!id) return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });
    const { error } = await getServiceClient().from("task_checklist_items").delete().eq("id", id);
    if (error) {
      if (MISSING_TABLE.test(error.message || "")) return migrationNeeded();
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao excluir o passo." }, { status: 500 });
  }
}
