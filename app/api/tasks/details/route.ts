// app/api/tasks/details/route.ts
// O conteúdo do cartão aberto: comentários e listas de verificação de UMA
// tarefa. O quadro carrega só os contadores (ver GET /api/tasks); o detalhe
// completo chega quando o cartão abre — conversa e passos não precisam
// viajar no quadro inteiro.
//
// GET /api/tasks/details?task_id=<uuid> -> { comments, checklists }
//   comments:  [{ id, body, created_at, updated_at }]
//   checklists: [{ id, title, position, items: [{ id, text, done, position }] }]

import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const MISSING_TABLE = /relation .*task_(comments|checklists|checklist_items).* does not exist|could not find the table/i;

function migrationNeeded() {
  return NextResponse.json(
    { error: "Rode supabase-migration-task-extras.sql no SQL Editor do Supabase para usar comentários e listas." },
    { status: 503 }
  );
}

export async function GET(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const taskId = (new URL(req.url).searchParams.get("task_id") || "").trim();
    if (!taskId) return NextResponse.json({ error: "task_id é obrigatório." }, { status: 400 });

    const supabase = getServiceClient();
    const [commentsResult, checklistsResult] = await Promise.all([
      supabase
        .from("task_comments")
        .select("id,body,created_at,updated_at")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true }),
      supabase
        .from("task_checklists")
        .select("id,title,position,created_at")
        .eq("task_id", taskId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);
    if (commentsResult.error) {
      if (MISSING_TABLE.test(commentsResult.error.message || "")) return migrationNeeded();
      throw commentsResult.error;
    }
    if (checklistsResult.error) {
      if (MISSING_TABLE.test(checklistsResult.error.message || "")) return migrationNeeded();
      throw checklistsResult.error;
    }

    const checklists = checklistsResult.data || [];
    const checklistIds = checklists.map((checklist: any) => checklist.id);
    const itemsResult = checklistIds.length
      ? await supabase
          .from("task_checklist_items")
          .select("id,checklist_id,text,done,position,created_at,done_at")
          .in("checklist_id", checklistIds)
          .order("position", { ascending: true })
          .order("created_at", { ascending: true })
      : { data: [], error: null };
    if (itemsResult.error) {
      if (MISSING_TABLE.test(itemsResult.error.message || "")) return migrationNeeded();
      throw itemsResult.error;
    }

    const itemsByChecklist = new Map<string, any[]>();
    for (const item of itemsResult.data || []) {
      const list = itemsByChecklist.get(item.checklist_id) || [];
      list.push(item);
      itemsByChecklist.set(item.checklist_id, list);
    }

    return NextResponse.json({
      comments: commentsResult.data || [],
      checklists: checklists.map((checklist: any) => ({
        ...checklist,
        items: itemsByChecklist.get(checklist.id) || [],
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao abrir a tarefa." }, { status: 500 });
  }
}
