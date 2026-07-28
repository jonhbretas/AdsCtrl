"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Plus, X, ArrowLeft, ArrowRight, ExternalLink, RefreshCw, AlertTriangle, CheckCircle2, MessageSquare, ListChecks, Calendar } from "lucide-react";

// --- Types ---
interface Task { id: string; title: string; notes: string | null; link: string | null; status: "todo" | "doing" | "done"; priority: "normal" | "high"; due_date: string | null; client_id: string | null; account_id: string | null; project_id: string | null; source: "manual" | "auto"; alert_type: string | null; alert_fingerprint: string | null; context: { ad_ids?: string[]; ad_names?: string[] } | null; created_at: string; done_at: string | null; comments_count?: number; check_done?: number; check_total?: number; }
interface GroupRef { name: string; color: string; }
interface ClientRef { id: string; name: string; account_id: string | null; group?: GroupRef | null; }
interface AccountRef { account_id: string; name: string; group?: GroupRef | null; }
interface Project { id: string; name: string; client_id: string | null; due_date: string | null; status: "active" | "done" | "archived"; notes?: string | null; }
interface TaskComment { id: string; body: string; created_at: string; updated_at: string; }
interface ChecklistItem { id: string; checklist_id: string; text: string; done: boolean; position: number; done_at: string | null; }
interface Checklist { id: string; task_id: string; title: string; position: number; items: ChecklistItem[]; }

const COLUMNS: { key: Task["status"]; label: string; hint: string }[] = [
  { key: "todo", label: "A fazer", hint: "chegou e ainda não começou" },
  { key: "doing", label: "Fazendo", hint: "em andamento agora" },
  { key: "done", label: "Feito", hint: "últimos 14 dias" },
];
const todayIso = () => new Date().toISOString().slice(0, 10);
const brDate = (iso: string) => iso.split("-").reverse().join("/");

function GroupBadge({ group }: { group: GroupRef }) {
  return <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap" style={{ backgroundColor: group.color + "22", color: group.color }}>{group.name}</span>;
}

function dueLabel(due: string): { text: string; tone: "late" | "today" | "soon" | "far" } {
  const today = todayIso();
  if (due < today) return { text: "atrasada", tone: "late" };
  if (due === today) return { text: "hoje", tone: "today" };
  const days = Math.round((new Date(`${due}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000);
  if (days <= 1) return { text: "amanhã", tone: "soon" };
  if (days <= 3) return { text: `em ${days} dias`, tone: "soon" };
  return { text: brDate(due), tone: "far" };
}

function alertTypeOf(task: Task): string | null {
  if (task.alert_type) return task.alert_type;
  if (!task.alert_fingerprint) return null;
  const sep = task.alert_fingerprint.lastIndexOf(":");
  return sep === -1 ? null : task.alert_fingerprint.slice(sep + 1) || null;
}

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
      if (ids.length) params.set("ads", ids.join(","));
      return { href: `/creatives?${params.toString()}`, label: ids.length ? `Ver ${ids.length} criativo${ids.length > 1 ? "s" : ""} reprovado${ids.length > 1 ? "s" : ""}` : "Ver criativos reprovados" };
    }
    case "low_balance": case "payment_issue":
      return account.startsWith("google:") ? clientView : { href: `https://adsmanager.facebook.com/ads/manager/billing?act=${accountParam}`, label: "Abrir cobrança na Meta", external: true };
    case "account_disabled": return clientView;
    default: return type ? clientView : null;
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
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [due, setDue] = useState("");
  const [link, setLink] = useState("");
  const [priority, setPriority] = useState<"normal" | "high">("normal");
  const [creating, setCreating] = useState(false);
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/tasks", { cache: "no-store" });
      const p = await r.json();
      if (!r.ok || p.error) throw new Error(p.error || `Falha (HTTP ${r.status}).`);
      setTasks(p.tasks || []); setClients(p.clients || []); setAccounts(p.accounts || []); setProjects(p.projects || []);
    } catch (e: any) { setError(e?.message ?? "Erro ao carregar."); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault(); if (!title.trim()) return; setCreating(true);
    try {
      const r = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, client_id: clientId || null, project_id: projectId || null, due_date: due || null, link: link || null, priority }) });
      const p = await r.json(); if (!r.ok || p.error) throw new Error(p.error || "Falha.");
      setTasks((c) => [p.task, ...c]); setTitle(""); setLink(""); setDue(""); setPriority("normal");
    } catch (e: any) { setError(e?.message ?? "Erro ao criar."); } finally { setCreating(false); }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id); const prev = tasks;
    setTasks((c) => c.map((t) => (t.id === id ? { ...t, ...(body as any) } : t)));
    try { const r = await fetch("/api/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) }); const p = await r.json(); if (!r.ok || p.error) throw new Error(p.error || "Falha."); setTasks((c) => c.map((t) => (t.id === id ? p.task : t))); }
    catch { setTasks(prev); } finally { setBusy(null); }
  }

  async function remove(task: Task) {
    if (!window.confirm(`Excluir "${task.title}"?`)) return; setBusy(task.id);
    try { const r = await fetch(`/api/tasks?id=${encodeURIComponent(task.id)}`, { method: "DELETE" }); const p = await r.json(); if (!r.ok || p.error) throw new Error(p.error || "Falha."); setTasks((c) => c.filter((t) => t.id !== task.id)); }
    catch (e: any) { setError(e?.message ?? "Erro ao excluir."); } finally { setBusy(null); }
  }

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const owner = useMemo(() => {
    const cba = new Map(clients.filter((c) => c.account_id).map((c) => [c.account_id as string, c]));
    const aba = new Map(accounts.map((a) => [a.account_id, a]));
    return (task: Task): { label: string; href: string | null; group: GroupRef | null } | null => {
      const client = task.client_id ? clientById.get(task.client_id) : null;
      const account = client?.account_id ?? task.account_id ?? null;
      const via = task.account_id ? cba.get(task.account_id) : undefined;
      const label = client?.name ?? (task.account_id ? via?.name || aba.get(task.account_id)?.name || null : null);
      if (!label) return null;
      return { label, href: account ? `/?account=${encodeURIComponent(account)}` : null, group: client?.group ?? via?.group ?? (task.account_id ? aba.get(task.account_id)?.group : null) ?? null };
    };
  }, [clients, accounts, clientById]);

  const visible = projectFilter ? tasks.filter((t) => t.project_id === projectFilter) : tasks;
  const byStatus = (s: Task["status"]) => visible.filter((t) => t.status === s);
  const lateCount = tasks.filter((t) => t.status !== "done" && t.due_date && t.due_date < todayIso()).length;
  const openCount = tasks.filter((t) => t.status !== "done").length;
  const openTask = openTaskId ? tasks.find((t) => t.id === openTaskId) || null : null;

  function applyStats(id: string, stats: { comments_count: number; check_done: number; check_total: number }) {
    setTasks((c) => c.map((t) => (t.id === id ? { ...t, ...stats } : t)));
  }

  return (
    <div className="p-4 md:p-6 md:ml-56 pb-20 md:pb-6 space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tarefas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">O que chegou por fora e o que o sistema detectou, no mesmo lugar.</p>
        </div>
        <div className="flex items-center gap-2">
          {lateCount > 0 && <Badge variant="destructive" className="text-[11px]">{lateCount} atrasada{lateCount > 1 ? "s" : ""}</Badge>}
          {openCount > 0 && <Badge variant="info" className="text-[11px]">{openCount} em aberto</Badge>}
          {!loading && openCount === 0 && lateCount === 0 && <Badge variant="success" className="text-[11px]">nada pendente</Badge>}
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}><RefreshCw className={cn("h-3.5 w-3.5 mr-1", loading && "animate-spin")} /> Atualizar</Button>
        </div>
      </div>

      {/* Create form */}
      <Card className="bg-muted/20 border-dashed">
        <CardContent className="p-4">
          <form onSubmit={create} className="flex flex-wrap items-center gap-2">
            <Input value={title} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)} placeholder="Ex.: subir 3 criativos novos da Ana Prado" className="flex-[1_1_260px] min-w-[200px]" />
            <Select value={clientId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setClientId(e.target.value)} className="flex-[0_1_170px]"><option value="">sem cliente</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            {projects.length > 0 && <Select value={projectId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setProjectId(e.target.value)} className="flex-[0_1_170px]"><option value="">sem projeto</option>{projects.filter((p) => p.status === "active").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}
            <Input type="date" value={due} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDue(e.target.value)} className="flex-[0_0_148px]" />
            <Input value={link} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLink(e.target.value)} placeholder="link do arquivo" className="flex-[0_1_160px]" />
            <Button type="button" variant={priority === "high" ? "destructive" : "secondary"} size="sm" onClick={() => setPriority((p) => (p === "high" ? "normal" : "high"))}>{priority === "high" ? "● urgente" : "○ normal"}</Button>
            <Button type="submit" disabled={creating || !title.trim()}>{creating ? "Criando…" : <><Plus className="h-3.5 w-3.5" /> Adicionar</>}</Button>
          </form>
        </CardContent>
      </Card>

      {error && <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-red-500/20 bg-red-500/10 text-sm text-red-500"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}

      {/* Projects */}
      <ProjectsSection projects={projects} tasks={tasks} clients={clients} filter={projectFilter} loading={loading}
        onFilter={(id) => setProjectFilter((c) => (c === id ? "" : id))} onError={setError}
        onChanged={(p) => setProjects((c) => c.map((x) => (x.id === p.id ? p : x)))}
        onCreated={(p) => setProjects((c) => [...c, p])}
        onRemoved={(id) => { setProjects((c) => c.filter((x) => x.id !== id)); setProjectFilter((c) => (c === id ? "" : c)); setTasks((c) => c.map((t) => (t.project_id === id ? { ...t, project_id: null } : t))); }} />

      {projectFilter && projectById.get(projectFilter) && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-sky-500/20 bg-sky-500/5 text-sm text-sky-600">
          Mostrando só as tarefas de <strong>{projectById.get(projectFilter)!.name}</strong>.
          <button onClick={() => setProjectFilter("")} className="ml-auto text-xs font-semibold hover:underline bg-transparent border-none cursor-pointer">Limpar filtro</button>
        </div>
      )}

      {/* Kanban */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLUMNS.map((col) => {
          const items = byStatus(col.key);
          return (
            <Card key={col.key} className="overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 bg-muted/10">
                <span className={cn("w-2 h-2 rounded-full", col.key === "todo" ? "bg-primary" : col.key === "doing" ? "bg-amber-500" : "bg-emerald-500")} />
                <span className="text-sm font-semibold">{col.label}</span>
                <span className="text-xs text-muted-foreground">{col.hint}</span>
                <span className="ml-auto text-xs font-semibold text-muted-foreground">{items.length}</span>
              </div>
              <div className="p-3 space-y-2">
                {loading && items.length === 0 && <><Skeleton className="h-20 rounded-lg" /><Skeleton className="h-20 rounded-lg" /></>}
                {!loading && items.length === 0 && (
                  <div className="text-center py-6 text-xs text-muted-foreground">
                    {projectFilter ? "Nada neste projeto" : col.key === "todo" ? "Nada pendente" : col.key === "doing" ? "Nada em andamento" : "Nada concluído ainda"}
                  </div>
                )}
                {items.map((task) => (
                  <TaskCard key={task.id} task={task} owner={owner(task)} project={task.project_id ? projectById.get(task.project_id) || null : null} projects={projects} busy={busy === task.id}
                    onMove={(s) => patch(task.id, { status: s })} onProject={(id) => patch(task.id, { project_id: id || null })} onOpen={() => setOpenTaskId(task.id)} onRemove={() => remove(task)} />
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      {openTask && <TaskDetailModal task={openTask} owner={owner(openTask)} clients={clients} projects={projects} onPatch={(body) => patch(openTask.id, body)} onStats={(s) => applyStats(openTask.id, s)} onClose={() => setOpenTaskId(null)} />}
    </div>
  );
}

function ProjectsSection({ projects, tasks, clients, filter, loading, onFilter, onError, onChanged, onCreated, onRemoved }: {
  projects: Project[]; tasks: Task[]; clients: ClientRef[]; filter: string; loading: boolean;
  onFilter: (id: string) => void; onError: (msg: string) => void; onChanged: (p: Project) => void; onCreated: (p: Project) => void; onRemoved: (id: string) => void;
}) {
  const [name, setName] = useState(""); const [clientId, setClientId] = useState(""); const [due, setDue] = useState("");
  const [creating, setCreating] = useState(false); const [busy, setBusy] = useState<string | null>(null); const [open, setOpen] = useState(false);
  useEffect(() => { if (projects.length) setOpen(true); }, [projects.length]);
  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);
  const counts = useMemo(() => { const m = new Map<string, { open: number; total: number }>(); for (const t of tasks) { if (!t.project_id) continue; const c = m.get(t.project_id) || { open: 0, total: 0 }; c.total += 1; if (t.status !== "done") c.open += 1; m.set(t.project_id, c); } return m; }, [tasks]);

  async function api(method: string, body: Record<string, unknown>, id?: string) {
    const url = method === "DELETE" ? `/api/projects?id=${encodeURIComponent(String(id))}` : "/api/projects";
    const r = await fetch(url, { method, ...(method === "DELETE" ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
    const p = await r.json(); if (!r.ok || p.error) throw new Error(p.error || "Falha."); return p;
  }
  async function create(e: React.FormEvent) {
    e.preventDefault(); if (!name.trim()) return; setCreating(true);
    try { const p = await api("POST", { name, client_id: clientId || null, due_date: due || null }); onCreated(p.project); setName(""); setDue(""); }
    catch (e: any) { onError(e?.message ?? "Erro."); } finally { setCreating(false); }
  }
  async function update(project: Project, body: Record<string, unknown>) { setBusy(project.id); try { const p = await api("PATCH", { id: project.id, ...body }); onChanged(p.project); } catch (e: any) { onError(e?.message ?? "Erro."); } finally { setBusy(null); } }
  async function removeProject(project: Project) {
    const count = counts.get(project.id)?.total || 0;
    if (!window.confirm(count ? `Excluir "${project.name}"? ${count} tarefa(s) perdem o projeto.` : `Excluir "${project.name}"?`)) return;
    setBusy(project.id); try { await api("DELETE", {}, project.id); onRemoved(project.id); } catch (e: any) { onError(e?.message ?? "Erro."); } finally { setBusy(null); }
  }

  const active = projects.filter((p) => p.status === "active");
  const late = active.filter((p) => p.due_date && p.due_date < todayIso()).length;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
        <span className="w-2 h-2 rounded-full bg-amber-500" />
        <span className="text-sm font-semibold">Projetos</span>
        <span className="text-xs text-muted-foreground">o compromisso com data que agrupa tarefas</span>
        <div className="ml-auto flex items-center gap-2">
          {late > 0 && <Badge variant="destructive" className="text-[10px]">{late} com prazo estourado</Badge>}
          <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>{open ? "▲ ocultar" : `▼ ${active.length || "novo"}`}</Button>
        </div>
      </div>
      {open && (
        <div className="p-3 space-y-2">
          <form onSubmit={create} className="flex flex-wrap items-center gap-2">
            <Input value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} placeholder="Ex.: Lançamento da Ana Prado" className="flex-[1_1_240px] min-w-[180px]" />
            <Select value={clientId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setClientId(e.target.value)} className="flex-[0_1_170px]"><option value="">sem cliente</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            <Input type="date" value={due} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDue(e.target.value)} className="flex-[0_0_148px]" />
            <Button type="submit" disabled={creating || !name.trim()}>{creating ? "Criando…" : "Criar projeto"}</Button>
          </form>
          {!loading && projects.length === 0 && <p className="text-xs text-muted-foreground">Crie projetos para agrupar tarefas com prazo.</p>}
          {projects.map((p) => {
            const count = counts.get(p.id) || { open: 0, total: 0 };
            const label = p.due_date ? dueLabel(p.due_date) : null;
            const selected = filter === p.id;
            const done = p.status === "done";
            return (
              <div key={p.id} className={cn("flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg border transition-colors", selected ? "border-primary/50 bg-primary/5" : "border-border/50", done && "opacity-60 bg-muted/20")}>
                <button onClick={() => onFilter(p.id)} className={cn("text-sm font-semibold hover:text-primary transition-colors bg-transparent border-none cursor-pointer", done && "line-through text-muted-foreground")}>{p.name}</button>
                <span className="text-xs text-muted-foreground">
                  {p.client_id && clientName.get(p.client_id) && <>{clientName.get(p.client_id)} · </>}
                  {count.total === 0 ? "sem tarefas" : `${count.open} em aberto de ${count.total}`}
                </span>
                {label && !done && <span className={cn("text-[11px] font-semibold", label.tone === "late" ? "text-red-500" : label.tone === "today" ? "text-amber-500" : "text-muted-foreground")}>· {label.tone === "late" ? `atrasado desde ${brDate(p.due_date!)}` : label.text}</span>}
                {done && <Badge variant="success" className="text-[10px]">concluído</Badge>}
                <div className="ml-auto flex items-center gap-1">
                  <Input type="date" value={p.due_date || ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update(p, { due_date: e.target.value || null })} disabled={busy === p.id} className="w-28 h-7 text-[11px]" />
                  <Button variant="ghost" size="sm" disabled={busy === p.id} onClick={() => update(p, { status: done ? "active" : "done" })} className="h-7 text-xs">{done ? "reabrir" : "✓ concluir"}</Button>
                  <Button variant="ghost" size="sm" disabled={busy === p.id} onClick={() => removeProject(p)} className="h-7 text-xs text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function TaskCard({ task, owner, project, projects, busy, onMove, onProject, onOpen, onRemove }: {
  task: Task; owner: { label: string; href: string | null; group: GroupRef | null } | null;
  project: Project | null; projects: Project[]; busy: boolean;
  onMove: (s: Task["status"]) => void; onProject: (id: string) => void; onOpen: () => void; onRemove: () => void;
}) {
  const due = task.due_date ? dueLabel(task.due_date) : null;
  const idx = COLUMNS.findIndex((c) => c.key === task.status);
  const prev = idx > 0 ? COLUMNS[idx - 1] : null;
  const next = idx < COLUMNS.length - 1 ? COLUMNS[idx + 1] : null;
  const target = problemTarget(task);
  const tone = task.priority === "high" ? "border-l-red-500" : task.source === "auto" ? "border-l-sky-500" : "border-l-transparent";

  return (
    <div className={cn("rounded-lg border border-border/50 bg-card p-3 space-y-2 border-l-2 transition-all", tone, busy && "opacity-60", task.status === "done" && "bg-muted/20")}>
      <div className="flex items-start gap-2">
        {task.source === "auto" && <Badge variant="info" className="text-[9px] px-1 py-0">AUTO</Badge>}
        <h3 className="text-sm font-semibold flex-1 min-w-0">
          <button onClick={onOpen} className="text-left hover:text-primary transition-colors bg-transparent border-none cursor-pointer break-words">{task.title}</button>
        </h3>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        {owner && (owner.href ? <Link href={owner.href} className="font-semibold text-foreground hover:text-primary transition-colors">{owner.label}</Link> : <span className="font-semibold text-foreground">{owner.label}</span>)}
        {owner?.group && <GroupBadge group={owner.group} />}
        {project && <span className="text-primary font-semibold">◆ {project.name}</span>}
        {due && <span className={cn("font-semibold", due.tone === "late" ? "text-red-500" : due.tone === "today" ? "text-amber-500" : "text-muted-foreground")}>{due.text}</span>}
        {task.link && <a href={task.link} target="_blank" rel="noreferrer" className="text-primary hover:underline font-semibold">arquivo ↗</a>}
      </div>
      {((task.check_total ?? 0) > 0 || (task.comments_count ?? 0) > 0) && (
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          {(task.check_total ?? 0) > 0 && <span className={cn("flex items-center gap-1", task.check_done === task.check_total && "text-emerald-500")}><ListChecks className="h-3 w-3" />{task.check_done}/{task.check_total}</span>}
          {(task.comments_count ?? 0) > 0 && <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{task.comments_count}</span>}
        </div>
      )}
      {task.notes && <p className="text-xs text-muted-foreground leading-relaxed">{task.notes}</p>}
      {target && task.status !== "done" && (
        <Link href={target.href} {...(target.external ? { target: "_blank", rel: "noreferrer" } : {})}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors no-underline">
          {target.label} {target.external ? <ExternalLink className="h-3 w-3" /> : "→"}
        </Link>
      )}
      <div className="flex items-center gap-1 pt-1 flex-wrap">
        {prev && <Button variant="ghost" size="sm" onClick={() => onMove(prev.key)} disabled={busy} className="h-7 text-xs"><ArrowLeft className="h-3 w-3" /> {prev.label}</Button>}
        {next && <Button variant="secondary" size="sm" onClick={() => onMove(next.key)} disabled={busy} className="h-7 text-xs">{next.label} <ArrowRight className="h-3 w-3" /></Button>}
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={onOpen} disabled={busy} className="h-7 text-xs">abrir</Button>
        {projects.some((p) => p.status === "active") && (
          <select value={task.project_id || ""} onChange={(e) => onProject(e.target.value)} disabled={busy} className="w-24 h-7 text-[11px] rounded-md border border-input bg-transparent px-1">
            <option value="">sem projeto</option>
            {projects.filter((p) => p.status === "active" || p.id === task.project_id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <Button variant="ghost" size="sm" onClick={onRemove} disabled={busy} className="h-7 text-xs text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></Button>
      </div>
    </div>
  );
}

function TaskDetailModal({ task, owner, clients, projects, onPatch, onStats, onClose }: {
  task: Task; owner: { label: string; href: string | null; group: GroupRef | null } | null;
  clients: ClientRef[]; projects: Project[]; onPatch: (body: Record<string, unknown>) => void;
  onStats: (stats: { comments_count: number; check_done: number; check_total: number }) => void; onClose: () => void;
}) {
  const [comments, setComments] = useState<TaskComment[] | null>(null);
  const [checklists, setChecklists] = useState<Checklist[] | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [extrasMissing, setExtrasMissing] = useState(false);
  const [draft, setDraft] = useState(""); const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editingText, setEditingText] = useState(""); const [newItem, setNewItem] = useState<Record<string, string>>({});
  const [newListTitle, setNewListTitle] = useState(""); const [savingComment, setSavingComment] = useState(false);
  const [title, setTitle] = useState(task.title); const [notes, setNotes] = useState(task.notes || ""); const [link, setLink] = useState(task.link || "");

  useEffect(() => {
    let alive = true;
    fetch(`/api/tasks/details?task_id=${encodeURIComponent(task.id)}`, { cache: "no-store" })
      .then(async (r) => { const p = await r.json(); if (!r.ok || p.error) { if (r.status === 503 && alive) setExtrasMissing(true); throw new Error(p.error || `Falha.`); } return p; })
      .then((p) => { if (alive) { setComments(p.comments || []); setChecklists(p.checklists || []); } })
      .catch((e) => { if (alive) setDetailError(e?.message || "Erro."); });
    return () => { alive = false; };
  }, [task.id]);

  useEffect(() => {
    if (!comments || !checklists) return;
    const total = checklists.reduce((s, l) => s + l.items.length, 0);
    const done = checklists.reduce((s, l) => s + l.items.filter((i) => i.done).length, 0);
    onStats({ comments_count: comments.length, check_done: done, check_total: total });
  }, [comments, checklists, onStats]);

  useEffect(() => { const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose]);

  async function call<T>(url: string, method: string, body?: Record<string, unknown>): Promise<T> {
    const r = await fetch(url, { method, ...(method === "DELETE" ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) }) });
    const p = await r.json(); if (!r.ok || p.error) throw new Error(p.error || "Falha."); return p;
  }
  async function run(action: () => Promise<void>, fallback: string) { try { setDetailError(null); await action(); } catch (e: any) { setDetailError(e?.message ?? fallback); } }
  const saveTitle = () => { const n = title.trim(); if (n && n !== task.title) onPatch({ title: n }); else setTitle(task.title); };
  const saveNotes = () => { if (notes !== (task.notes || "")) onPatch({ notes: notes.trim() || null }); };
  const saveLink = () => { if (link !== (task.link || "")) onPatch({ link: link.trim() || null }); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/40" onClick={onClose}>
      <div className="w-full max-w-[640px] max-h-[92vh] overflow-y-auto rounded-xl border border-border/50 bg-card shadow-xl p-4 space-y-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Detalhes de ${task.title}`}>
        {/* Title */}
        <div className="flex items-start gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="flex-1 text-lg font-bold bg-transparent border-none outline-none rounded px-0 focus:ring-2 focus:ring-ring/30" />
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer rounded"><X className="h-4 w-4" /></button>
        </div>

        {/* Fields row */}
        <div className="flex flex-wrap gap-3">
          <Field label="Cliente"><Select value={task.client_id || ""} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onPatch({ client_id: e.target.value || null })}><option value="">sem cliente</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="Projeto"><Select value={task.project_id || ""} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onPatch({ project_id: e.target.value || null })}><option value="">sem projeto</option>{projects.filter((p) => p.status === "active" || p.id === task.project_id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Field label="Prazo"><Input type="date" value={task.due_date || ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onPatch({ due_date: e.target.value || null })} /></Field>
          <Field label="Coluna"><Select value={task.status} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onPatch({ status: e.target.value })}>{COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</Select></Field>
          <Field label="Urgência"><Button type="button" variant={task.priority === "high" ? "destructive" : "secondary"} size="sm" onClick={() => onPatch({ priority: task.priority === "high" ? "normal" : "high" })}>{task.priority === "high" ? "● urgente" : "○ normal"}</Button></Field>
          {owner?.group && <Field label="Grupo"><span className="text-sm text-muted-foreground">{owner.group.name}</span></Field>}
        </div>

        {/* Link */}
        <Field label="Link do arquivo"><Input value={link} onChange={(e) => setLink(e.target.value)} onBlur={saveLink} placeholder="https://…" /></Field>

        {/* Notes */}
        <Field label="Anotações"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} rows={3} className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm resize-y" placeholder="Contexto, combinado, telefone…" /></Field>

        {detailError && <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/20 bg-red-500/10 text-sm text-red-500"><AlertTriangle className="h-4 w-4 shrink-0" />{detailError}<button onClick={() => setDetailError(null)} className="ml-auto bg-transparent border-none cursor-pointer"><X className="h-3 w-3" /></button></div>}
        {extrasMissing && <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/20 bg-amber-500/10 text-sm text-amber-500">Migração necessária: rode supabase-migration-task-extras.sql</div>}

        {/* Checklists */}
        {!extrasMissing && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Listas de verificação</h4>
            {checklists === null && <Skeleton className="h-16 rounded-lg" />}
            {(checklists || []).map((list) => {
              const done = list.items.filter((i) => i.done).length;
              const total = list.items.length;
              const complete = total > 0 && done === total;
              return (
                <div key={list.id} className={cn("rounded-lg border p-3 space-y-2", complete ? "border-emerald-500/30 bg-emerald-500/5" : "border-border/50")}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{list.title}</span>
                    <span className="text-xs text-muted-foreground">{done}/{total}</span>
                    {total > 0 && <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden"><div className={cn("h-full rounded-full", complete ? "bg-emerald-500" : "bg-primary")} style={{ width: `${(done / total) * 100}%` }} /></div>}
                    <button onClick={() => { if (window.confirm(`Excluir lista "${list.title}"?`)) { fetch(`/api/tasks/checklists?id=${encodeURIComponent(list.id)}`, { method: "DELETE" }).then(() => setChecklists((c) => (c || []).filter((x) => x.id !== list.id))); } }} className="ml-auto bg-transparent border-none cursor-pointer text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                  </div>
                  <div className="space-y-1">{list.items.map((item) => (
                    <label key={item.id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                      <input type="checkbox" checked={item.done} onChange={() => {
                        const prev = checklists;
                        setChecklists((c) => (c || []).map((l) => l.id === list.id ? { ...l, items: l.items.map((i) => i.id === item.id ? { ...i, done: !i.done } : i) } : l));
                        call<{ item: ChecklistItem }>("/api/tasks/checklist-items", "PATCH", { id: item.id, done: !item.done }).then((r) => setChecklists((c) => (c || []).map((l) => l.id === list.id ? { ...l, items: l.items.map((i) => i.id === item.id ? r.item : i) } : l))).catch(() => setChecklists(prev));
                      }} className="accent-primary" />
                      <span className={cn(item.done && "line-through text-muted-foreground")}>{item.text}</span>
                    </label>
                  ))}</div>
                  <form onSubmit={(e) => { e.preventDefault(); const text = (newItem[list.id] || "").trim(); if (!text) return; call<{ item: ChecklistItem }>("/api/tasks/checklist-items", "POST", { checklist_id: list.id, text }).then((r) => { setChecklists((c) => (c || []).map((l) => l.id === list.id ? { ...l, items: [...l.items, r.item] } : l)); setNewItem((c) => ({ ...c, [list.id]: "" })); }); }} className="flex gap-1">
                    <Input value={newItem[list.id] || ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewItem((c) => ({ ...c, [list.id]: e.target.value }))} placeholder="Novo passo…" className="flex-1 h-8 text-xs" />
                    <Button type="submit" size="sm" variant="ghost" className="h-8"><Plus className="h-3 w-3" /></Button>
                  </form>
                </div>
              );
            })}
            <form onSubmit={(e) => { e.preventDefault(); const t = newListTitle.trim() || "Lista"; call<{ checklist: Checklist }>("/api/tasks/checklists", "POST", { task_id: task.id, title: t }).then((r) => { setChecklists((c) => [...(c || []), r.checklist]); setNewListTitle(""); }); }} className="flex gap-1">
              <Input value={newListTitle} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewListTitle(e.target.value)} placeholder="Nova lista…" className="flex-1 h-8 text-xs" />
              <Button type="submit" size="sm" variant="outline" className="h-8 text-xs"><Plus className="h-3 w-3 mr-1" />Adicionar</Button>
            </form>
          </div>
        )}

        {/* Comments */}
        {!extrasMissing && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Comentários</h4>
            {comments === null && <Skeleton className="h-12 rounded-lg" />}
            {(comments || []).map((c) => (
              <div key={c.id} className="rounded-lg border border-border/50 p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground font-semibold">{new Date(c.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                  <div className="flex gap-1">
                    {editingComment === c.id ? (
                      <button onClick={() => { const t = editingText.trim(); if (t) call<{ comment: TaskComment }>("/api/tasks/comments", "PATCH", { id: c.id, body: t }).then((r) => { setComments((cs) => (cs || []).map((x) => (x.id === c.id ? r.comment : x))); setEditingComment(null); }); }} className="text-[11px] text-primary bg-transparent border-none cursor-pointer">salvar</button>
                    ) : (
                      <button onClick={() => { setEditingComment(c.id); setEditingText(c.body); }} className="text-[11px] text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer">editar</button>
                    )}
                  </div>
                </div>
                {editingComment === c.id ? (
                  <textarea value={editingText} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditingText(e.target.value)} className="w-full text-sm rounded border border-input bg-transparent px-2 py-1 resize-y" rows={2} />
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{c.body}</p>
                )}
              </div>
            ))}
            <form onSubmit={(e) => { e.preventDefault(); const b = draft.trim(); if (!b) return; setSavingComment(true); call<{ comment: TaskComment }>("/api/tasks/comments", "POST", { task_id: task.id, body: b }).then((r) => { setComments((c) => [...(c || []), r.comment]); setDraft(""); }).finally(() => setSavingComment(false)); }} className="flex gap-1">
              <Input value={draft} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)} placeholder="Escreva um comentário…" className="flex-1" />
              <Button type="submit" disabled={savingComment || !draft.trim()} size="sm">{savingComment ? "Enviando…" : "Enviar"}</Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 min-w-0 flex-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
