// app/api/tasks/route.ts
// Quadro de tarefas: listar, criar, mover e excluir.
//
// Sem chamada a API de anúncios em nenhum caminho — é só Postgres. Foi um
// requisito explícito: o quadro não pode consumir cota da Meta nem do Google.
//
// GET    /api/tasks                  -> abertas + concluídas recentes
// POST   /api/tasks                  -> cria (title obrigatório)
// PATCH  /api/tasks                  -> atualiza (id obrigatório)
// DELETE /api/tasks?id=<uuid>        -> exclui

import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const STATUSES = ["todo", "doing", "done"];
const PRIORITIES = ["normal", "high"];
const MISSING_TABLE = /relation .*tasks.* does not exist|could not find the table/i;

function migrationNeeded() {
  return NextResponse.json(
    { error: "Rode supabase-migration-tasks.sql no SQL Editor do Supabase para usar o quadro." },
    { status: 503 }
  );
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export async function GET() {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const supabase = getServiceClient();

    // Concluídas antigas saem do quadro: board que acumula deixa de ser lido.
    const cutoff = new Date(Date.now() - 14 * 86400000).toISOString();
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .or(`status.neq.done,done_at.gte.${cutoff}`)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) {
      if (MISSING_TABLE.test(error.message || "")) return migrationNeeded();
      throw error;
    }

    const { data: clients } = await supabase.from("clients").select("id,name").neq("status", "archived");
    return NextResponse.json({ tasks: data || [], clients: clients || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao carregar o quadro." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const body = await req.json().catch(() => ({}));
    const title = text(body.title, 200);
    if (!title) return NextResponse.json({ error: "Descreva a tarefa." }, { status: 400 });

    const row: Record<string, any> = {
      title,
      notes: text(body.notes, 2000),
      link: text(body.link, 500),
      status: STATUSES.includes(body.status) ? body.status : "todo",
      priority: PRIORITIES.includes(body.priority) ? body.priority : "normal",
      due_date: /^\d{4}-\d{2}-\d{2}$/.test(body.due_date || "") ? body.due_date : null,
      client_id: text(body.client_id, 64),
      account_id: text(body.account_id, 64),
      source: "manual",
    };

    const { data, error } = await getServiceClient().from("tasks").insert(row).select("*").maybeSingle();
    if (error) {
      if (MISSING_TABLE.test(error.message || "")) return migrationNeeded();
      throw error;
    }
    return NextResponse.json({ task: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao criar a tarefa." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const body = await req.json().catch(() => ({}));
    const id = text(body.id, 64);
    if (!id) return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });

    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) {
        return NextResponse.json({ error: "status deve ser todo, doing ou done." }, { status: 400 });
      }
      patch.status = body.status;
      // done_at é o que decide o que sai do quadro; precisa acompanhar o status.
      patch.done_at = body.status === "done" ? new Date().toISOString() : null;
    }
    if (body.title !== undefined) {
      const title = text(body.title, 200);
      if (!title) return NextResponse.json({ error: "Descreva a tarefa." }, { status: 400 });
      patch.title = title;
    }
    if (body.notes !== undefined) patch.notes = text(body.notes, 2000);
    if (body.link !== undefined) patch.link = text(body.link, 500);
    if (body.priority !== undefined) {
      patch.priority = PRIORITIES.includes(body.priority) ? body.priority : "normal";
    }
    if (body.due_date !== undefined) {
      patch.due_date = /^\d{4}-\d{2}-\d{2}$/.test(body.due_date || "") ? body.due_date : null;
    }
    if (body.client_id !== undefined) patch.client_id = text(body.client_id, 64);

    const { data, error } = await getServiceClient()
      .from("tasks")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) {
      if (MISSING_TABLE.test(error.message || "")) return migrationNeeded();
      throw error;
    }
    if (!data) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });
    return NextResponse.json({ task: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao atualizar a tarefa." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const id = (new URL(req.url).searchParams.get("id") || "").trim();
    if (!id) return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });
    const { error } = await getServiceClient().from("tasks").delete().eq("id", id);
    if (error) {
      if (MISSING_TABLE.test(error.message || "")) return migrationNeeded();
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao excluir a tarefa." }, { status: 500 });
  }
}
