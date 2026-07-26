"use client";

// app/tarefas/page.tsx
// Quadro de tarefas. Nasceu de um problema real: criativo que chega por
// WhatsApp não aparece em nenhuma API, e o que depende de memória se perde.
//
// Duas origens no mesmo quadro — o que você anota e o que a coleta detecta.
// Mover é por botão, não por arrastar: arrastar em tela pequena erra o alvo, e
// o custo de manter drag-and-drop não se paga para três colunas.

import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Notice,
  PageHeader,
  Select,
  Skeleton,
} from "@/components/ui";

interface Task {
  id: string;
  title: string;
  notes: string | null;
  link: string | null;
  status: "todo" | "doing" | "done";
  priority: "normal" | "high";
  due_date: string | null;
  client_id: string | null;
  account_id: string | null;
  source: "manual" | "auto";
  created_at: string;
  done_at: string | null;
}
interface ClientRef {
  id: string;
  name: string;
}

// A cor de cada coluna vive no CSS (data-col), não aqui: cor de interface
// pertence ao design system, não ao componente que a consome.
const COLUMNS: { key: Task["status"]; label: string; hint: string }[] = [
  { key: "todo", label: "A fazer", hint: "chegou e ainda não começou" },
  { key: "doing", label: "Fazendo", hint: "em andamento agora" },
  { key: "done", label: "Feito", hint: "últimos 14 dias" },
];

const todayIso = () => new Date().toISOString().slice(0, 10);
const brDate = (iso: string) => iso.split("-").reverse().join("/");

// "atrasada", "hoje", "em 3 dias" — a distância importa mais que a data.
function dueLabel(due: string): { text: string; tone: "late" | "today" | "soon" | "far" } {
  const today = todayIso();
  if (due < today) return { text: "atrasada", tone: "late" };
  if (due === today) return { text: "hoje", tone: "today" };
  const days = Math.round(
    (new Date(`${due}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000
  );
  if (days === 1) return { text: "amanhã", tone: "soon" };
  if (days <= 3) return { text: `em ${days} dias`, tone: "soon" };
  return { text: brDate(due), tone: "far" };
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<ClientRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Formulário de criação: título é o único obrigatório, para a tarefa entrar
  // no quadro no mesmo minuto em que o criativo chega.
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [due, setDue] = useState("");
  const [link, setLink] = useState("");
  const [priority, setPriority] = useState<"normal" | "high">("normal");
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/tasks", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || `Falha (HTTP ${response.status}).`);
      setTasks(payload.tasks || []);
      setClients(payload.clients || []);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar o quadro.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          client_id: clientId || null,
          due_date: due || null,
          link: link || null,
          priority,
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || "Falha ao criar.");
      setTasks((current) => [payload.task, ...current]);
      setTitle("");
      setLink("");
      setDue("");
      setPriority("normal");
    } catch (e: any) {
      setError(e?.message ?? "Erro ao criar a tarefa.");
    } finally {
      setCreating(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id);
    // Otimista: mover coluna precisa responder na hora.
    const previous = tasks;
    setTasks((current) => current.map((t) => (t.id === id ? { ...t, ...(body as any) } : t)));
    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || "Falha ao atualizar.");
      setTasks((current) => current.map((t) => (t.id === id ? payload.task : t)));
    } catch (e: any) {
      setTasks(previous);
      setError(e?.message ?? "Erro ao atualizar.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(task: Task) {
    if (!window.confirm(`Excluir "${task.title}"?`)) return;
    setBusy(task.id);
    try {
      const response = await fetch(`/api/tasks?id=${encodeURIComponent(task.id)}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || "Falha ao excluir.");
      setTasks((current) => current.filter((t) => t.id !== task.id));
    } catch (e: any) {
      setError(e?.message ?? "Erro ao excluir.");
    } finally {
      setBusy(null);
    }
  }

  const clientName = useMemo(() => {
    const map = new Map(clients.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? map.get(id) || null : null);
  }, [clients]);

  const byStatus = (status: Task["status"]) => tasks.filter((t) => t.status === status);
  const lateCount = tasks.filter((t) => t.status !== "done" && t.due_date && t.due_date < todayIso()).length;

  const openCount = tasks.filter((t) => t.status !== "done").length;

  return (
    <main className="ec-page">
      <PageHeader
        title="Tarefas"
        subtitle="O que chegou por fora e o que o sistema detectou, no mesmo lugar."
        meta={
          <>
            {lateCount > 0 && (
              <Badge tone="danger" title="Passaram do prazo">
                {lateCount} atrasada{lateCount > 1 ? "s" : ""}
              </Badge>
            )}
            {openCount > 0 && <Badge tone="brand">{openCount} em aberto</Badge>}
            {!loading && openCount === 0 && lateCount === 0 && <Badge tone="ok">nada pendente</Badge>}
          </>
        }
        actions={
          <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
            {loading ? "Carregando…" : "Atualizar"}
          </Button>
        }
      />

      {/* Criação em uma linha: o título é o único campo obrigatório, para a
          tarefa entrar no quadro no mesmo minuto em que o criativo chega. */}
      <Card className="ec-mesh" style={{ marginBottom: "var(--sp-5)" }}>
        <form onSubmit={create} className="ec-taskform">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex.: subir 3 criativos novos da Ana Prado"
            aria-label="Descrição da tarefa"
            style={{ flex: "1 1 300px", minWidth: 200 }}
          />
          <Select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            aria-label="Cliente"
            style={{ flex: "0 1 190px" }}
          >
            <option value="">sem cliente</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            aria-label="Prazo"
            style={{ flex: "0 0 148px" }}
          />
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="link do arquivo"
            aria-label="Link do arquivo"
            style={{ flex: "0 1 180px" }}
          />
          <Button
            type="button"
            variant={priority === "high" ? "danger" : "secondary"}
            size="sm"
            aria-pressed={priority === "high"}
            onClick={() => setPriority((p) => (p === "high" ? "normal" : "high"))}
            title="Tarefa urgente"
          >
            {priority === "high" ? "● urgente" : "○ urgente"}
          </Button>
          <Button type="submit" variant="primary" disabled={creating || !title.trim()}>
            {creating ? "Criando…" : "Adicionar"}
          </Button>
        </form>
      </Card>

      {error && (
        <div style={{ marginBottom: "var(--sp-4)" }}>
          <Notice tone="danger" onDismiss={() => setError(null)}>
            {error}
          </Notice>
        </div>
      )}

      <div className="ec-cols">
        {COLUMNS.map((column) => {
          const items = byStatus(column.key);
          return (
            <section key={column.key} className="ec-card" aria-label={column.label}>
              <header className="ec-colhead">
                <span className="ec-colhead__dot" data-col={column.key} aria-hidden="true" />
                <span className="ec-colhead__label">{column.label}</span>
                <span className="ec-colhead__hint">{column.hint}</span>
                <span className="ec-colhead__count">{items.length}</span>
              </header>
              <div style={{ display: "grid", gap: "var(--sp-2)", padding: "var(--sp-3)" }}>
                {loading && items.length === 0 && (
                  <>
                    <Skeleton h={54} radius={9} />
                    <Skeleton h={54} radius={9} />
                  </>
                )}
                {!loading && items.length === 0 && (
                  <EmptyState
                    title={
                      column.key === "todo"
                        ? "Nada pendente"
                        : column.key === "doing"
                          ? "Nada em andamento"
                          : "Nada concluído ainda"
                    }
                    hint={
                      column.key === "todo"
                        ? "Quando um cliente mandar criativo, anote aqui em cima antes de fechar a conversa."
                        : column.key === "doing"
                          ? "Mova uma tarefa de “A fazer” quando começar."
                          : "O que você concluir aparece aqui por 14 dias."
                    }
                  />
                )}
                {items.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    clientName={clientName(task.client_id)}
                    busy={busy === task.id}
                    onMove={(status) => patch(task.id, { status })}
                    onRemove={() => remove(task)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}

function TaskCard({
  task,
  clientName,
  busy,
  onMove,
  onRemove,
}: {
  task: Task;
  clientName: string | null;
  busy: boolean;
  onMove: (status: Task["status"]) => void;
  onRemove: () => void;
}) {
  const due = task.due_date ? dueLabel(task.due_date) : null;
  const index = COLUMNS.findIndex((c) => c.key === task.status);
  const prev = index > 0 ? COLUMNS[index - 1] : null;
  const next = index < COLUMNS.length - 1 ? COLUMNS[index + 1] : null;

  // A borda esquerda carrega prioridade e origem — é o único uso de cor no
  // cartão, então "urgente" e "automática" se leem sem precisar de rótulo.
  const tone = task.priority === "high" ? "danger" : task.source === "auto" ? "accent" : undefined;

  return (
    <Card
      as="article"
      tone={tone}
      padded={false}
      className="ec-task"
      data-done={task.status === "done" ? "true" : undefined}
      data-busy={busy ? "true" : undefined}
      aria-busy={busy}
    >
      <div className="ec-task__head">
        {task.source === "auto" && (
          <Badge tone="accent" title="Aberta automaticamente pela coleta">
            AUTO
          </Badge>
        )}
        <h3 className="ec-task__title">{task.title}</h3>
      </div>

      <div className="ec-task__meta">
        {clientName && <span>{clientName}</span>}
        {due && (
          <span className="ec-task__due" data-tone={due.tone}>
            {due.text}
          </span>
        )}
        {task.link && (
          <a href={task.link} target="_blank" rel="noreferrer" className="ec-task__link">
            abrir arquivo →
          </a>
        )}
      </div>

      {task.notes && <p className="ec-task__notes">{task.notes}</p>}

      <div className="ec-task__actions">
        {prev && (
          <Button variant="ghost" size="sm" onClick={() => onMove(prev.key)} disabled={busy}>
            ← {prev.label}
          </Button>
        )}
        {next && (
          <Button variant="secondary" size="sm" onClick={() => onMove(next.key)} disabled={busy}>
            {next.label} →
          </Button>
        )}
        <span style={{ flex: 1 }} />
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={busy}
          title="Excluir tarefa"
          aria-label={`Excluir ${task.title}`}
        >
          ✕
        </Button>
      </div>
    </Card>
  );
}
