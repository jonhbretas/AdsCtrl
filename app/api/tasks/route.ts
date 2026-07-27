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
//
// O GET devolve junto o cliente com a conta de anúncios que o representa: é o
// que faz o nome do cliente no cartão virar link para a tela dele.

import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const STATUSES = ["todo", "doing", "done"];
const PRIORITIES = ["normal", "high"];
const MISSING_TABLE = /relation .*tasks.* does not exist|could not find the table/i;
// Colunas que vieram na migração de projetos. Enquanto ela não rodar, a falha
// precisa dizer QUAL arquivo rodar — "coluna não encontrada" não ajuda ninguém.
const MISSING_PROJECT_COLUMN = /project_id|alert_type|'context'/i;

function migrationNeeded() {
  return NextResponse.json(
    { error: "Rode supabase-migration-tasks.sql no SQL Editor do Supabase para usar o quadro." },
    { status: 503 }
  );
}

function projectsMigrationNeeded() {
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

// Conta de anúncios que representa o cliente. A conta de origem manda; depois
// o vínculo marcado como principal; por último qualquer um.
function accountForClient(client: any, links: any[]): string | null {
  if (client.source_meta_account_id) return client.source_meta_account_id;
  const own = links.filter((link) => link.client_id === client.id);
  return own.find((link) => link.is_primary)?.account_id ?? own[0]?.account_id ?? null;
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

    const [clientsResult, linksResult, accountsResult, projectsResult, groupsResult] = await Promise.all([
      supabase.from("clients").select("id,name,source_meta_account_id").neq("status", "archived"),
      supabase.from("client_ad_accounts").select("client_id,account_id,is_primary"),
      // Tarefa automática não tem cliente, só a conta que gerou o alerta — é
      // por aqui que o cartão consegue dizer de quem é o problema. O group_id
      // é o que colore o selo do grupo ao lado do nome.
      supabase.from("ad_accounts").select("account_id,name,group_id"),
      // Projetos podem não existir ainda (migração não rodada): o quadro
      // continua funcionando sem eles.
      supabase
        .from("projects")
        .select("id,name,client_id,due_date,status,notes")
        .neq("status", "archived")
        .order("due_date", { ascending: true, nullsFirst: false }),
      supabase.from("client_groups").select("id,name,color"),
    ]);

    const links = linksResult.data || [];
    const groupById = new Map(
      (groupsResult.data || []).map((group: any) => [group.id, { name: group.name, color: group.color }])
    );
    const groupOfAccount = (accountId: string | null | undefined) => {
      if (!accountId) return null;
      const account = (accountsResult.data || []).find((row: any) => row.account_id === accountId);
      return account?.group_id ? groupById.get(account.group_id) || null : null;
    };
    const clients = (clientsResult.data || []).map((client: any) => {
      // A tela de clientes abre por conta de anúncios (?account=<id>), não por
      // id de cliente. Mesma ordem de preferência do envio semanal.
      const account_id = accountForClient(client, links);
      return { id: client.id, name: client.name, account_id, group: groupOfAccount(account_id) };
    });

    // Selo do grupo por conta, para a tarefa automática (que não tem cliente).
    const accounts = (accountsResult.data || []).map((account: any) => ({
      account_id: account.account_id,
      name: account.name,
      group: account.group_id ? groupById.get(account.group_id) || null : null,
    }));

    // Contadores do cartão (comentários + progresso das listas). Sem a
    // migração de extras, as consultas falham e o quadro segue com zeros —
    // o selo simplesmente não aparece até a migração rodar.
    const taskIds = (data || []).map((task: any) => task.id);
    const stats = new Map<string, { comments: number; checkDone: number; checkTotal: number }>();
    if (taskIds.length) {
      const [commentsResult, checklistsResult] = await Promise.all([
        supabase.from("task_comments").select("task_id").in("task_id", taskIds),
        supabase.from("task_checklists").select("id,task_id").in("task_id", taskIds),
      ]);
      if (!commentsResult.error) {
        for (const row of commentsResult.data || []) {
          const entry = stats.get(row.task_id) || { comments: 0, checkDone: 0, checkTotal: 0 };
          entry.comments += 1;
          stats.set(row.task_id, entry);
        }
      }
      if (!checklistsResult.error) {
        const checklistIds = (checklistsResult.data || []).map((row: any) => row.id);
        const taskByChecklist = new Map(
          (checklistsResult.data || []).map((row: any) => [row.id, row.task_id])
        );
        if (checklistIds.length) {
          const { data: items } = await supabase
            .from("task_checklist_items")
            .select("checklist_id,done")
            .in("checklist_id", checklistIds);
          for (const item of items || []) {
            const taskId = taskByChecklist.get(item.checklist_id);
            if (!taskId) continue;
            const entry = stats.get(taskId) || { comments: 0, checkDone: 0, checkTotal: 0 };
            entry.checkTotal += 1;
            if (item.done) entry.checkDone += 1;
            stats.set(taskId, entry);
          }
        }
      }
    }

    const tasks = (data || []).map((task: any) => {
      const entry = stats.get(task.id);
      return {
        ...task,
        comments_count: entry?.comments || 0,
        check_done: entry?.checkDone || 0,
        check_total: entry?.checkTotal || 0,
      };
    });

    return NextResponse.json({
      tasks,
      clients,
      accounts,
      projects: projectsResult.data || [],
    });
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
    // Só entra no insert quando veio: assim o quadro continua criando tarefa
    // solta mesmo sem a migração de projetos.
    const projectId = text(body.project_id, 64);
    if (projectId) row.project_id = projectId;

    const { data, error } = await getServiceClient().from("tasks").insert(row).select("*").maybeSingle();
    if (error) {
      if (MISSING_TABLE.test(error.message || "")) return migrationNeeded();
      if (MISSING_PROJECT_COLUMN.test(error.message || "")) return projectsMigrationNeeded();
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
    if (body.project_id !== undefined) patch.project_id = text(body.project_id, 64);

    const { data, error } = await getServiceClient()
      .from("tasks")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) {
      if (MISSING_TABLE.test(error.message || "")) return migrationNeeded();
      if (MISSING_PROJECT_COLUMN.test(error.message || "")) return projectsMigrationNeeded();
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
