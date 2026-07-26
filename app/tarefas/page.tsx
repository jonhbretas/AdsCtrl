"use client";

// app/tarefas/page.tsx
// Quadro de tarefas. Nasceu de um problema real: criativo que chega por
// WhatsApp não aparece em nenhuma API, e o que depende de memória se perde.
//
// Duas origens no mesmo quadro — o que você anota e o que a coleta detecta.
// Mover é por botão, não por arrastar: arrastar em tela pequena erra o alvo, e
// o custo de manter drag-and-drop não se paga para três colunas.

import { useEffect, useMemo, useState } from "react";

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

const COLUMNS: { key: Task["status"]; label: string; hint: string; color: string }[] = [
  { key: "todo", label: "A fazer", hint: "chegou e ainda não começou", color: "#e0a83a" },
  { key: "doing", label: "Fazendo", hint: "em andamento agora", color: "#2f6fe4" },
  { key: "done", label: "Feito", hint: "últimos 14 dias", color: "#1f8a4c" },
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

const DUE_COLOR: Record<string, string> = {
  late: "#c2410c",
  today: "#b45309",
  soon: "#1768ca",
  far: "#8a919e",
};

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

  return (
    <main style={{ padding: "22px 22px 60px", fontFamily: "system-ui, -apple-system, sans-serif", color: "#12161f" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
        <h1 style={{ fontSize: 20, fontWeight: 750, margin: 0, letterSpacing: -0.3 }}>Tarefas</h1>
        <span style={{ fontSize: 12.5, color: "#8a919e" }}>
          o que chegou e o que o sistema detectou, no mesmo lugar
        </span>
        {lateCount > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: "#c2410c", background: "#fdf0ef", border: "1px solid #f0cfcc", borderRadius: 999, padding: "2px 9px" }}>
            {lateCount} atrasada{lateCount > 1 ? "s" : ""}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button
          onClick={load}
          disabled={loading}
          style={{ padding: "5px 11px", borderRadius: 8, border: "1px dashed #ddd", background: "#fff", color: "#888", fontSize: 11.5, cursor: loading ? "default" : "pointer" }}
        >
          {loading ? "Carregando…" : "Atualizar"}
        </button>
      </div>

      {/* criação rápida */}
      <form
        onSubmit={create}
        style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center", margin: "14px 0 16px", padding: "11px 12px", border: "1px solid #e7e9ef", borderRadius: 11, background: "#fcfcfd" }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex.: subir 3 criativos novos da Ana Prado"
          style={{ flex: "1 1 280px", minWidth: 220, padding: "8px 11px", borderRadius: 9, border: "1px solid #dfe2e8", fontSize: 13 }}
        />
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid #dfe2e8", fontSize: 12.5, maxWidth: 200 }}
        >
          <option value="">sem cliente</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          title="Prazo"
          style={{ padding: "7px 10px", borderRadius: 9, border: "1px solid #dfe2e8", fontSize: 12.5 }}
        />
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="link do arquivo (opcional)"
          style={{ flex: "0 1 200px", padding: "8px 11px", borderRadius: 9, border: "1px solid #dfe2e8", fontSize: 12.5 }}
        />
        <button
          type="button"
          onClick={() => setPriority((p) => (p === "high" ? "normal" : "high"))}
          title="Marcar como urgente"
          style={{
            padding: "7px 11px", borderRadius: 9, fontSize: 11.5, fontWeight: 650, cursor: "pointer",
            border: `1px solid ${priority === "high" ? "#f0cfcc" : "#dfe2e8"}`,
            background: priority === "high" ? "#fdf0ef" : "#fff",
            color: priority === "high" ? "#c2410c" : "#7c8493",
          }}
        >
          {priority === "high" ? "● urgente" : "○ urgente"}
        </button>
        <button
          type="submit"
          disabled={creating || !title.trim()}
          style={{
            padding: "8px 16px", borderRadius: 9, border: "none", fontSize: 12.5, fontWeight: 700,
            background: creating || !title.trim() ? "#c9ccd3" : "#12161f", color: "#fff",
            cursor: creating || !title.trim() ? "default" : "pointer",
          }}
        >
          {creating ? "Criando…" : "Adicionar"}
        </button>
      </form>

      {error && (
        <div style={{ margin: "0 0 14px", padding: "10px 12px", borderRadius: 9, background: "#fdf0ef", border: "1px solid #f0cfcc", color: "#a3372f", fontSize: 12.5 }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, alignItems: "start" }}>
        {COLUMNS.map((column) => {
          const items = byStatus(column.key);
          return (
            <section key={column.key} style={{ border: "1px solid #e7e9ef", borderRadius: 12, background: "#fff", overflow: "hidden" }}>
              <header style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid #f0f1f5" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: column.color }} />
                <span style={{ fontSize: 12, fontWeight: 750 }}>{column.label}</span>
                <span style={{ fontSize: 11, color: "#a0a4ad" }}>{column.hint}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#7c8493" }}>{items.length}</span>
              </header>
              <div style={{ display: "grid", gap: 8, padding: 10 }}>
                {items.length === 0 && (
                  <div style={{ fontSize: 12, color: "#b4b9c4", padding: "10px 2px" }}>
                    {column.key === "todo" ? "Nada pendente." : column.key === "doing" ? "Nada em andamento." : "Nada concluído por aqui."}
                  </div>
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

  return (
    <article
      style={{
        border: `1px solid ${task.priority === "high" ? "#f0cfcc" : "#eceef3"}`,
        borderLeft: `3px solid ${task.priority === "high" ? "#c2410c" : task.source === "auto" ? "#e0a83a" : "#dfe2e8"}`,
        borderRadius: 9,
        padding: "9px 10px",
        background: task.status === "done" ? "#fbfcfb" : "#fff",
        opacity: busy ? 0.6 : 1,
      }}
    >
      <div style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap", marginBottom: 5 }}>
        {task.source === "auto" && (
          <span
            title="Aberta automaticamente pela coleta"
            style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.4, color: "#8a6116", background: "#fdf6e6", border: "1px solid #f0dfb4", borderRadius: 5, padding: "1px 5px" }}
          >
            AUTO
          </span>
        )}
        <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.35, textDecoration: task.status === "done" ? "line-through" : "none", color: task.status === "done" ? "#8a919e" : "#12161f" }}>
          {task.title}
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 10.5, color: "#8a919e" }}>
        {clientName && <span>{clientName}</span>}
        {due && (
          <span style={{ color: DUE_COLOR[due.tone], fontWeight: due.tone === "late" || due.tone === "today" ? 700 : 500 }}>
            {due.text}
          </span>
        )}
        {task.link && (
          <a href={task.link} target="_blank" rel="noreferrer" style={{ color: "#2f6fe4", textDecoration: "none", fontWeight: 650 }}>
            abrir arquivo →
          </a>
        )}
      </div>

      {task.notes && (
        <div style={{ marginTop: 6, fontSize: 11, color: "#5c6373", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
          {task.notes}
        </div>
      )}

      <div style={{ display: "flex", gap: 5, marginTop: 8, alignItems: "center" }}>
        {prev && (
          <button onClick={() => onMove(prev.key)} disabled={busy} style={moveButton}>
            ← {prev.label}
          </button>
        )}
        {next && (
          <button onClick={() => onMove(next.key)} disabled={busy} style={{ ...moveButton, color: "#1f8a4c", borderColor: "#cfe6d8" }}>
            {next.label} →
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button onClick={onRemove} disabled={busy} title="Excluir" style={{ ...moveButton, border: "none", color: "#b4b9c4" }}>
          ✕
        </button>
      </div>
    </article>
  );
}

const moveButton: React.CSSProperties = {
  padding: "3px 8px",
  borderRadius: 7,
  border: "1px solid #e6e8ee",
  background: "#fff",
  color: "#5c6373",
  fontSize: 10.5,
  fontWeight: 650,
  cursor: "pointer",
};
