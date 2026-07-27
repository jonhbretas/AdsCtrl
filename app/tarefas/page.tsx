"use client";

// app/tarefas/page.tsx
// Quadro de tarefas. Nasceu de um problema real: criativo que chega por
// WhatsApp não aparece em nenhuma API, e o que depende de memória se perde.
//
// Duas origens no mesmo quadro — o que você anota e o que a coleta detecta.
// Mover é por botão, não por arrastar: arrastar em tela pequena erra o alvo, e
// o custo de manter drag-and-drop não se paga para três colunas.
//
// O cartão não para na descrição do problema: o nome do cliente abre a tela
// dele e, quando a tarefa veio de um alerta, um botão leva direto ao lugar onde
// aquilo se resolve — criativo reprovado abre o diagnóstico já filtrado nas
// peças recusadas. Ler o problema e ir até ele passam a ser o mesmo gesto.
//
// Acima do quadro ficam os projetos: a tarefa é a unidade de execução, o
// projeto é o compromisso com data ("Lançamento da Ana, dia 15").

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
  project_id: string | null;
  source: "manual" | "auto";
  alert_type: string | null;
  alert_fingerprint: string | null;
  context: { ad_ids?: string[]; ad_names?: string[] } | null;
  created_at: string;
  done_at: string | null;
}
interface ClientRef {
  id: string;
  name: string;
  // Conta de anúncios que representa o cliente: é por ela que a tela de
  // clientes abre (/?account=<id>), não pelo id do cliente.
  account_id: string | null;
}
interface AccountRef {
  account_id: string;
  name: string;
}
interface Project {
  id: string;
  name: string;
  client_id: string | null;
  due_date: string | null;
  status: "active" | "done" | "archived";
  notes?: string | null;
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

// Tipo do alerta que abriu a tarefa. As tarefas automáticas antigas nasceram
// antes da coluna existir, mas o fingerprint sempre foi "<conta>:<tipo>" — e o
// id de conta do Google tem ":" dentro, então o tipo é o que vem depois do
// ÚLTIMO. Assim o botão de resolver já funciona no histórico, sem esperar a
// próxima coleta.
function alertTypeOf(task: Task): string | null {
  if (task.alert_type) return task.alert_type;
  const fingerprint = task.alert_fingerprint;
  if (!fingerprint) return null;
  const separator = fingerprint.lastIndexOf(":");
  return separator === -1 ? null : fingerprint.slice(separator + 1) || null;
}

// Para onde vai quem quer resolver isto agora. É o coração da tela: sem este
// mapa, "3 criativos reprovados" obriga a abrir o diagnóstico, escolher a conta
// e procurar quais são na mão.
function problemTarget(task: Task): { href: string; label: string; external?: boolean } | null {
  const account = task.account_id;
  if (!account) return null;
  const type = alertTypeOf(task);
  const accountParam = encodeURIComponent(account);
  const clientView = { href: `/?account=${accountParam}`, label: "Ver a conta" };

  switch (type) {
    case "rejected_creative": {
      const ids = (task.context?.ad_ids || []).filter(Boolean);
      const params = new URLSearchParams({ account, issue: "rejected" });
      // Os IDs são um retrato do dia da coleta; a tela também consulta o
      // status atual. Mandá-los junto é o que deixa a tabela já filtrada.
      if (ids.length) params.set("ads", ids.join(","));
      return {
        href: `/creatives?${params.toString()}`,
        label: ids.length
          ? `Ver ${ids.length} criativo${ids.length > 1 ? "s" : ""} reprovado${ids.length > 1 ? "s" : ""}`
          : "Ver criativos reprovados",
      };
    }
    case "low_balance":
    case "payment_issue":
      // Saldo e pagamento não se resolvem aqui dentro — só no Gerenciador.
      return account.startsWith("google:")
        ? clientView
        : {
            href: `https://adsmanager.facebook.com/ads/manager/billing?act=${accountParam}`,
            label: "Abrir cobrança na Meta",
            external: true,
          };
    case "account_disabled":
      return clientView;
    default:
      return type ? clientView : null;
  }
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<ClientRef[]>([]);
  const [accounts, setAccounts] = useState<AccountRef[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Formulário de criação: título é o único obrigatório, para a tarefa entrar
  // no quadro no mesmo minuto em que o criativo chega.
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [due, setDue] = useState("");
  const [link, setLink] = useState("");
  const [priority, setPriority] = useState<"normal" | "high">("normal");
  const [creating, setCreating] = useState(false);

  // Ver só um projeto. O quadro inteiro continua sendo o padrão: filtro que
  // sobrevive à visita esconde trabalho sem avisar.
  const [projectFilter, setProjectFilter] = useState<string>("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/tasks", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || `Falha (HTTP ${response.status}).`);
      setTasks(payload.tasks || []);
      setClients(payload.clients || []);
      setAccounts(payload.accounts || []);
      setProjects(payload.projects || []);
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
          project_id: projectId || null,
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

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // De quem é a tarefa, e para onde vai o nome. A manual guarda o cliente; a
  // automática guarda a conta que gerou o alerta — e as duas precisam abrir a
  // mesma tela. Quando a conta não está vinculada a nenhum cliente, o nome da
  // conta serve: é como ela aparece no resto do sistema.
  const owner = useMemo(() => {
    const clientByAccount = new Map(
      clients.filter((c) => c.account_id).map((c) => [c.account_id as string, c])
    );
    const accountName = new Map(accounts.map((a) => [a.account_id, a.name]));
    return (task: Task): { label: string; href: string | null } | null => {
      const client = task.client_id ? clientById.get(task.client_id) : null;
      const account = client?.account_id ?? task.account_id ?? null;
      const label =
        client?.name ??
        (task.account_id
          ? clientByAccount.get(task.account_id)?.name || accountName.get(task.account_id) || null
          : null);
      if (!label) return null;
      return { label, href: account ? `/?account=${encodeURIComponent(account)}` : null };
    };
  }, [clients, accounts, clientById]);

  const visible = projectFilter ? tasks.filter((t) => t.project_id === projectFilter) : tasks;
  const byStatus = (status: Task["status"]) => visible.filter((t) => t.status === status);
  const lateCount = tasks.filter((t) => t.status !== "done" && t.due_date && t.due_date < todayIso()).length;
  const openCount = tasks.filter((t) => t.status !== "done").length;
  const filteredProject = projectFilter ? projectById.get(projectFilter) : undefined;

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
      <Card className="ec-mesh" style={{ marginBottom: "var(--sp-4)" }}>
        <form onSubmit={create} className="ec-taskform">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex.: subir 3 criativos novos da Ana Prado"
            aria-label="Descrição da tarefa"
            style={{ flex: "1 1 260px", minWidth: 200 }}
          />
          <Select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            aria-label="Cliente"
            style={{ flex: "0 1 170px" }}
          >
            <option value="">sem cliente</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          {projects.length > 0 && (
            <Select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              aria-label="Projeto"
              style={{ flex: "0 1 170px" }}
            >
              <option value="">sem projeto</option>
              {projects
                .filter((p) => p.status === "active")
                .map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
            </Select>
          )}
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
            style={{ flex: "0 1 160px" }}
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

      <Projects
        projects={projects}
        tasks={tasks}
        clients={clients}
        filter={projectFilter}
        loading={loading}
        onFilter={(id) => setProjectFilter((current) => (current === id ? "" : id))}
        onError={setError}
        onChanged={(next) =>
          setProjects((current) => current.map((p) => (p.id === next.id ? next : p)))
        }
        onCreated={(project) => setProjects((current) => [...current, project])}
        onRemoved={(id) => {
          setProjects((current) => current.filter((p) => p.id !== id));
          setProjectFilter((current) => (current === id ? "" : current));
          // As tarefas continuam existindo, agora sem projeto.
          setTasks((current) =>
            current.map((t) => (t.project_id === id ? { ...t, project_id: null } : t))
          );
        }}
      />

      {filteredProject && (
        <div style={{ marginBottom: "var(--sp-3)" }}>
          <Notice tone="brand" onDismiss={() => setProjectFilter("")}>
            Mostrando só as tarefas de <strong>{filteredProject.name}</strong>.
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
                      projectFilter
                        ? "Nada neste projeto"
                        : column.key === "todo"
                          ? "Nada pendente"
                          : column.key === "doing"
                            ? "Nada em andamento"
                            : "Nada concluído ainda"
                    }
                    hint={
                      projectFilter
                        ? "As tarefas do projeto aparecem aqui conforme você as cria ou move."
                        : column.key === "todo"
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
                    owner={owner(task)}
                    project={task.project_id ? projectById.get(task.project_id) || null : null}
                    projects={projects}
                    busy={busy === task.id}
                    onMove={(status) => patch(task.id, { status })}
                    onProject={(id) => patch(task.id, { project_id: id || null })}
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

/* --------------------------------------------------------------- Projetos ---
   Uma faixa, não uma tela: projeto aqui serve para dar data ao compromisso e
   agrupar as tarefas dele. Quem precisar de mais que isso precisa de um
   cronograma, não de um quadro. */
function Projects({
  projects,
  tasks,
  clients,
  filter,
  loading,
  onFilter,
  onError,
  onChanged,
  onCreated,
  onRemoved,
}: {
  projects: Project[];
  tasks: Task[];
  clients: ClientRef[];
  filter: string;
  loading: boolean;
  onFilter: (id: string) => void;
  onError: (message: string) => void;
  onChanged: (project: Project) => void;
  onCreated: (project: Project) => void;
  onRemoved: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [due, setDue] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Fechado quando não há projeto: quem nunca usou não precisa de um formulário
  // na frente. Assim que existe um, a faixa se abre e fica.
  useEffect(() => {
    if (projects.length) setOpen(true);
  }, [projects.length]);

  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);
  const counts = useMemo(() => {
    const map = new Map<string, { open: number; total: number }>();
    for (const task of tasks) {
      if (!task.project_id) continue;
      const current = map.get(task.project_id) || { open: 0, total: 0 };
      current.total += 1;
      if (task.status !== "done") current.open += 1;
      map.set(task.project_id, current);
    }
    return map;
  }, [tasks]);

  async function api(method: string, body: Record<string, unknown>, id?: string) {
    const url = method === "DELETE" ? `/api/projects?id=${encodeURIComponent(String(id))}` : "/api/projects";
    const response = await fetch(url, {
      method,
      ...(method === "DELETE" ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error || "Falha ao salvar o projeto.");
    return payload;
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const payload = await api("POST", {
        name,
        client_id: clientId || null,
        due_date: due || null,
      });
      onCreated(payload.project);
      setName("");
      setDue("");
    } catch (e: any) {
      onError(e?.message ?? "Erro ao criar o projeto.");
    } finally {
      setCreating(false);
    }
  }

  async function update(project: Project, body: Record<string, unknown>) {
    setBusy(project.id);
    try {
      const payload = await api("PATCH", { id: project.id, ...body });
      onChanged(payload.project);
    } catch (e: any) {
      onError(e?.message ?? "Erro ao atualizar o projeto.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(project: Project) {
    const count = counts.get(project.id)?.total || 0;
    const warning = count
      ? `Excluir o projeto "${project.name}"? As ${count} tarefa(s) dele continuam no quadro, sem projeto.`
      : `Excluir o projeto "${project.name}"?`;
    if (!window.confirm(warning)) return;
    setBusy(project.id);
    try {
      await api("DELETE", {}, project.id);
      onRemoved(project.id);
    } catch (e: any) {
      onError(e?.message ?? "Erro ao excluir o projeto.");
    } finally {
      setBusy(null);
    }
  }

  const active = projects.filter((project) => project.status === "active");
  const lateProjects = active.filter((project) => project.due_date && project.due_date < todayIso()).length;

  return (
    <section className="ec-card" style={{ marginBottom: "var(--sp-4)" }} aria-label="Projetos">
      <header className="ec-colhead">
        <span className="ec-colhead__dot" data-col="doing" aria-hidden="true" />
        <span className="ec-colhead__label">Projetos</span>
        <span className="ec-colhead__hint">o compromisso com data que agrupa tarefas</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: "var(--sp-2)", alignItems: "center" }}>
          {lateProjects > 0 && (
            <Badge tone="danger" title="Prazo do projeto já passou">
              {lateProjects} com prazo estourado
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? "▲ ocultar" : `▼ ${active.length || "novo"}`}
          </Button>
        </span>
      </header>

      {open && (
        <div style={{ padding: "var(--sp-3)", display: "grid", gap: "var(--sp-2)" }}>
          <form onSubmit={create} className="ec-taskform">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Lançamento da Ana Prado"
              aria-label="Nome do projeto"
              style={{ flex: "1 1 240px", minWidth: 180 }}
            />
            <Select
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              aria-label="Cliente do projeto"
              style={{ flex: "0 1 170px" }}
            >
              <option value="">sem cliente</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </Select>
            <Input
              type="date"
              value={due}
              onChange={(event) => setDue(event.target.value)}
              aria-label="Prazo do projeto"
              style={{ flex: "0 0 148px" }}
            />
            <Button type="submit" variant="secondary" disabled={creating || !name.trim()}>
              {creating ? "Criando…" : "Criar projeto"}
            </Button>
          </form>

          {!loading && projects.length === 0 && (
            <p className="ec-project__hint">
              Sem projeto, cada tarefa carrega o próprio prazo e ninguém enxerga a data da entrega
              como um todo. Um projeto por compromisso costuma bastar.
            </p>
          )}

          {projects.map((project) => {
            const count = counts.get(project.id) || { open: 0, total: 0 };
            const label = project.due_date ? dueLabel(project.due_date) : null;
            const selected = filter === project.id;
            const done = project.status === "done";
            return (
              <div
                key={project.id}
                className="ec-project"
                data-selected={selected ? "true" : undefined}
                data-done={done ? "true" : undefined}
                data-busy={busy === project.id ? "true" : undefined}
              >
                <button
                  type="button"
                  className="ec-project__name"
                  onClick={() => onFilter(project.id)}
                  aria-pressed={selected}
                  title={selected ? "Mostrar o quadro inteiro" : "Ver só as tarefas deste projeto"}
                >
                  {project.name}
                </button>
                <span className="ec-project__meta">
                  {project.client_id && clientName.get(project.client_id) && (
                    <span>{clientName.get(project.client_id)}</span>
                  )}
                  <span>
                    {count.total === 0
                      ? "sem tarefas"
                      : `${count.open} em aberto de ${count.total}`}
                  </span>
                  {label && !done && (
                    <span className="ec-task__due" data-tone={label.tone}>
                      {label.tone === "late" ? `atrasado desde ${brDate(project.due_date!)}` : label.text}
                    </span>
                  )}
                  {done && <Badge tone="ok">concluído</Badge>}
                </span>
                {/* O prazo se edita aqui, no lugar em que ele é lido: mudar data
                    de entrega é rotina, e abrir um formulário para isso não. */}
                <Input
                  type="date"
                  value={project.due_date || ""}
                  onChange={(event) => update(project, { due_date: event.target.value || null })}
                  aria-label={`Prazo de ${project.name}`}
                  disabled={busy === project.id}
                  style={{ flex: "0 0 142px", height: 30, fontSize: 11.5 }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy === project.id}
                  onClick={() => update(project, { status: done ? "active" : "done" })}
                  title={done ? "Reabrir o projeto" : "Marcar o projeto como concluído"}
                >
                  {done ? "reabrir" : "✓ concluir"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy === project.id}
                  onClick={() => remove(project)}
                  title="Excluir projeto"
                  aria-label={`Excluir projeto ${project.name}`}
                >
                  ✕
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TaskCard({
  task,
  owner,
  project,
  projects,
  busy,
  onMove,
  onProject,
  onRemove,
}: {
  task: Task;
  /** Cliente (ou conta, na tarefa automática) e o link para a tela dele. */
  owner: { label: string; href: string | null } | null;
  project: Project | null;
  projects: Project[];
  busy: boolean;
  onMove: (status: Task["status"]) => void;
  onProject: (id: string) => void;
  onRemove: () => void;
}) {
  const due = task.due_date ? dueLabel(task.due_date) : null;
  const index = COLUMNS.findIndex((c) => c.key === task.status);
  const prev = index > 0 ? COLUMNS[index - 1] : null;
  const next = index < COLUMNS.length - 1 ? COLUMNS[index + 1] : null;
  const target = problemTarget(task);

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
        {/* Nome do cliente clicável: abre a tela dele já expandida. Sem conta
            conhecida ele continua texto — link que não leva a lugar nenhum é
            pior que texto puro. */}
        {owner &&
          (owner.href ? (
            <a href={owner.href} className="ec-task__client" title={`Abrir ${owner.label} na tela de clientes`}>
              {owner.label}
            </a>
          ) : (
            <span>{owner.label}</span>
          ))}
        {project && <span className="ec-task__project" title="Projeto">◆ {project.name}</span>}
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

      {/* O caminho até o problema. Fica em linha própria e com destaque porque
          é a ação que a tarefa automática existe para provocar. */}
      {target && task.status !== "done" && (
        <a
          href={target.href}
          className="ec-task__resolve"
          {...(target.external ? { target: "_blank", rel: "noreferrer" } : {})}
        >
          {target.label} {target.external ? "↗" : "→"}
        </a>
      )}

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
        {projects.some((p) => p.status === "active") && (
          <Select
            value={task.project_id || ""}
            onChange={(event) => onProject(event.target.value)}
            disabled={busy}
            aria-label={`Projeto de ${task.title}`}
            title="Mover para um projeto"
            className="ec-task__pick"
          >
            <option value="">sem projeto</option>
            {projects
              .filter((p) => p.status === "active" || p.id === task.project_id)
              .map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
          </Select>
        )}
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
