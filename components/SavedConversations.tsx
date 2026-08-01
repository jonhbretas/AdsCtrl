"use client";

// components/SavedConversations.tsx
// Painel de conversas salvas do Assertivus IA: lista persistida no Supabase
// (tabela ai_conversations), com vínculo a cliente/grupo derivado da conta
// selecionada no chat. Filtra por grupo (pílulas) e por cliente (select).

import { useCallback, useEffect, useState } from "react";
import { Bookmark, History, MessageSquare, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type SavedConversation = {
  id: string;
  title: string;
  account_id: string | null;
  group_id: string | null;
  client_id: string | null;
  messages: { role: "user" | "assistant"; content: string }[];
  created_at: string;
  updated_at: string;
  client_name?: string | null;
  group_name?: string | null;
  group_color?: string | null;
  account_name?: string | null;
};

export type SavedGroup = { id: string; name: string; color: string };
export type SavedClient = { id: string; name: string };

export function useSavedConversations() {
  const [items, setItems] = useState<SavedConversation[] | null>(null);
  const [groups, setGroups] = useState<SavedGroup[]>([]);
  const [clients, setClients] = useState<SavedClient[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/ai/conversations", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.error) throw new Error(payload.error || "Falha ao carregar as conversas salvas.");
      setItems(payload.conversations || []);
      setGroups(payload.groups || []);
      setClients(payload.clients || []);
    } catch (cause: any) {
      setError(cause?.message || "Falha ao carregar as conversas salvas.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (payload: { id?: string | null; messages: SavedConversation["messages"]; account_id?: string | null; group_id?: string | null }, title?: string | null): Promise<SavedConversation | null> => {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { ...payload, messages: payload.messages };
      if (title != null && title !== "") body.title = title;
      const response = await fetch("/api/ai/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) throw new Error(data.error || "Falha ao salvar a conversa.");
      await load();
      return data.conversation || null;
    } catch (cause: any) {
      setError(cause?.message || "Falha ao salvar a conversa.");
      return null;
    } finally {
      setBusy(false);
    }
  }, [load]);

  const remove = useCallback(async (id: string) => {
    setError(null);
    try {
      const response = await fetch(`/api/ai/conversations?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) throw new Error(data.error || "Falha ao excluir a conversa.");
      setItems((current) => (current || []).filter((item) => item.id !== id));
    } catch (cause: any) {
      setError(cause?.message || "Falha ao excluir a conversa.");
    }
  }, []);

  const rename = useCallback(async (id: string, title: string) => {
    setError(null);
    try {
      const response = await fetch("/api/ai/conversations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, title }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) throw new Error(data.error || "Falha ao renomear a conversa.");
      setItems((current) => (current || []).map((item) => (item.id === id ? { ...item, title: data.conversation?.title || title } : item)));
    } catch (cause: any) {
      setError(cause?.message || "Falha ao renomear a conversa.");
    }
  }, []);

  return { items, groups, clients, busy, error, load, save, remove, rename };
}

function brDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function ContextChips({ conversation }: { conversation: SavedConversation }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {conversation.group_name && (
        <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold" style={{ backgroundColor: (conversation.group_color || "#3987e5") + "22", color: `color-mix(in srgb, ${conversation.group_color || "#3987e5"} 62%, var(--color-foreground))` }}>
          {conversation.group_name}
        </span>
      )}
      {conversation.client_name && (
        <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
          {conversation.client_name}
        </span>
      )}
      {!conversation.group_name && !conversation.client_name && (
        <span className="text-[9px] text-muted-foreground">toda a operação</span>
      )}
    </div>
  );
}

export function SavedConversationsPanel({
  items,
  groups,
  clients,
  activeId,
  busy,
  error,
  onOpen,
  onDelete,
  onRename,
  onClose,
  className,
}: {
  items: SavedConversation[] | null;
  groups: SavedGroup[];
  clients: SavedClient[];
  activeId: string | null;
  busy: boolean;
  error: string | null;
  onOpen: (conversation: SavedConversation) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onClose?: () => void;
  className?: string;
}) {
  const [filterGroup, setFilterGroup] = useState("all");
  const [filterClient, setFilterClient] = useState("all");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const visible = (items || []).filter((item) => {
    if (filterGroup !== "all" && item.group_id !== filterGroup) return false;
    if (filterClient !== "all" && item.client_id !== filterClient) return false;
    return true;
  });

  function startRename(conversation: SavedConversation) {
    setRenamingId(conversation.id);
    setRenameValue(conversation.title);
  }

  function commitRename() {
    const title = renameValue.trim();
    if (renamingId && title) onRename(renamingId, title);
    setRenamingId(null);
  }

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2.5">
        <History className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-bold uppercase tracking-wider text-foreground">Conversas salvas</span>
        {items && <span className="text-[10px] text-muted-foreground">{items.length}</span>}
        {onClose && (
          <button type="button" onClick={onClose} className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Fechar">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="space-y-2 border-b border-border/50 p-2.5">
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          <button type="button" onClick={() => setFilterGroup("all")} className={cn("shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold transition-colors", filterGroup === "all" ? "border-primary/30 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground")}>Todos os grupos</button>
          {groups.map((group) => (
            <button key={group.id} type="button" onClick={() => setFilterGroup(filterGroup === group.id ? "all" : group.id)} className={cn("shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold transition-colors", filterGroup === group.id ? "border-primary/30 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground")}>{group.name}</button>
          ))}
        </div>
        <select value={filterClient} onChange={(event) => setFilterClient(event.target.value)} className="h-7 w-full rounded-md border border-border bg-transparent px-2 text-[10px] outline-none focus:ring-1 focus:ring-ring">
          <option value="all">Todos os clientes</option>
          {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
        </select>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {items === null ? (
          <div className="grid place-items-center py-8 text-[11px] text-muted-foreground">Carregando…</div>
        ) : visible.length === 0 ? (
          <div className="grid place-items-center gap-1 py-8 text-center text-[11px] text-muted-foreground">
            <Bookmark className="h-4 w-4 opacity-50" />
            {items.length === 0 ? "Nenhuma conversa salva ainda.\nUse o botão Salvar no topo." : "Nada com este filtro."}
          </div>
        ) : (
          <div className="space-y-1">
            {visible.map((conversation) => (
              <div key={conversation.id} className={cn("group rounded-lg border px-2.5 py-2 transition-colors", activeId === conversation.id ? "border-primary/40 bg-primary/[0.06]" : "border-border/50 bg-card hover:bg-accent/40")}>
                {renamingId === conversation.id ? (
                  <input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onBlur={commitRename} onKeyDown={(event) => { if (event.key === "Enter") commitRename(); if (event.key === "Escape") setRenamingId(null); }} className="w-full rounded-md border border-primary/40 bg-transparent px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring" />
                ) : (
                  <button type="button" onClick={() => onOpen(conversation)} className="block w-full text-left">
                    <div className="truncate text-xs font-semibold text-foreground" title={conversation.title}>{conversation.title}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[9.5px] text-muted-foreground">
                      <span>{brDateTime(conversation.updated_at)}</span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-0.5"><MessageSquare className="h-2.5 w-2.5" />{conversation.messages.length}</span>
                    </div>
                    <div className="mt-1"><ContextChips conversation={conversation} /></div>
                  </button>
                )}
                {renamingId !== conversation.id && (
                  <div className="mt-1 flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
                    <button type="button" onClick={() => startRename(conversation)} title="Renomear" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-3 w-3" /></button>
                    <button type="button" onClick={() => { if (window.confirm(`Excluir a conversa salva "${conversation.title}"?`)) onDelete(conversation.id); }} title="Excluir" className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {error && <div className="mx-1 mt-2 rounded-md border border-red-500/25 bg-red-500/10 px-2 py-1.5 text-[10px] text-red-600 dark:text-red-400">{error}</div>}
      </div>
    </div>
  );
}
