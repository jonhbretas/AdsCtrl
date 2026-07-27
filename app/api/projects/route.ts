// app/api/projects/route.ts
// Projetos: o compromisso com data que agrupa tarefas.
//
// Mesma disciplina do quadro de tarefas: nenhum caminho aqui chama API de
// anúncios. É só Postgres.
//
// GET    /api/projects                 -> ativos + concluídos recentes, com contagem
// POST   /api/projects                 -> cria (name obrigatório)
// PATCH  /api/projects                 -> atualiza (id obrigatório)
// DELETE /api/projects?id=<uuid>       -> exclui (as tarefas ficam, sem projeto)

import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const STATUSES = ["active", "done", "archived"];
const MISSING_TABLE = /relation .*projects.* does not exist|could not find the table|column .*project_id/i;

function migrationNeeded() {
  return NextResponse.json(
    { error: "Rode supabase-migration-projects.sql no SQL Editor do Supabase para usar projetos." },
    { status: 503 }
  );
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

const isDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

export async function GET() {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const supabase = getServiceClient();

    // Projeto concluído sai da lista depois de 30 dias — o dobro da tarefa, que
    // é mais volátil. Arquivado nunca aparece.
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .neq("status", "archived")
      .or(`status.neq.done,done_at.gte.${cutoff}`)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) {
      if (MISSING_TABLE.test(error.message || "")) return migrationNeeded();
      throw error;
    }

    return NextResponse.json({ projects: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao carregar os projetos." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const body = await req.json().catch(() => ({}));
    const name = text(body.name, 160);
    if (!name) return NextResponse.json({ error: "Dê um nome ao projeto." }, { status: 400 });

    const { data, error } = await getServiceClient()
      .from("projects")
      .insert({
        name,
        notes: text(body.notes, 2000),
        client_id: text(body.client_id, 64),
        due_date: isDate(body.due_date) ? body.due_date : null,
        status: STATUSES.includes(body.status) ? body.status : "active",
      })
      .select("*")
      .maybeSingle();
    if (error) {
      if (MISSING_TABLE.test(error.message || "")) return migrationNeeded();
      throw error;
    }
    return NextResponse.json({ project: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao criar o projeto." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const body = await req.json().catch(() => ({}));
    const id = text(body.id, 64);
    if (!id) return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });

    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) {
      const name = text(body.name, 160);
      if (!name) return NextResponse.json({ error: "Dê um nome ao projeto." }, { status: 400 });
      patch.name = name;
    }
    if (body.notes !== undefined) patch.notes = text(body.notes, 2000);
    if (body.client_id !== undefined) patch.client_id = text(body.client_id, 64);
    if (body.due_date !== undefined) patch.due_date = isDate(body.due_date) ? body.due_date : null;
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) {
        return NextResponse.json({ error: "status deve ser active, done ou archived." }, { status: 400 });
      }
      patch.status = body.status;
      patch.done_at = body.status === "done" ? new Date().toISOString() : null;
    }

    const { data, error } = await getServiceClient()
      .from("projects")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) {
      if (MISSING_TABLE.test(error.message || "")) return migrationNeeded();
      throw error;
    }
    if (!data) return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
    return NextResponse.json({ project: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao atualizar o projeto." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const id = (new URL(req.url).searchParams.get("id") || "").trim();
    if (!id) return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });
    // As tarefas do projeto sobrevivem (FK on delete set null): apagar o
    // compromisso não pode apagar o trabalho que ainda está em aberto.
    const { error } = await getServiceClient().from("projects").delete().eq("id", id);
    if (error) {
      if (MISSING_TABLE.test(error.message || "")) return migrationNeeded();
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao excluir o projeto." }, { status: 500 });
  }
}
