"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type SearchResult = { id: string; kind: string; title: string; subtitle: string; href: string };
const SCREENS: SearchResult[] = [
  { id: "screen:today", kind: "Tela", title: "Cockpit Hoje", subtitle: "Prioridades e pendências da operação", href: "/today" },
  { id: "screen:portfolio", kind: "Tela", title: "Portfólio", subtitle: "Visão consolidada por cliente", href: "/portfolio" },
  { id: "screen:funnel", kind: "Tela", title: "Funil 360", subtitle: "Etapas por modelo de negócio", href: "/funil" },
  { id: "screen:creatives", kind: "Tela", title: "Laboratório de Criativos", subtitle: "Diagnóstico, fadiga e desempenho", href: "/creatives" },
  { id: "screen:alerts", kind: "Tela", title: "Central de Alertas", subtitle: "Sinais operacionais agrupados", href: "/alerts" },
  { id: "screen:tasks", kind: "Tela", title: "Tarefas", subtitle: "Execução e acompanhamento", href: "/tarefas" },
  { id: "screen:finance", kind: "Tela", title: "Financeiro", subtitle: "DRE, caixa e régua financeira", href: "/financeiro" },
  { id: "screen:clients", kind: "Tela", title: "Clientes", subtitle: "Metas, contas e perfil", href: "/clientes" },
  { id: "screen:reports", kind: "Tela", title: "Relatórios", subtitle: "Entregas e painéis", href: "/relatorios" },
];

export default function QuickSearch({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen(true); }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) { setResults([]); return; }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try { const response = await fetch(`/api/search?q=${encodeURIComponent(value)}`, { cache: "no-store" }); const data = await response.json(); setResults(data.results || []); }
      catch { setResults([]); }
      finally { setLoading(false); }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  const screenResults = useMemo(() => { const value = query.trim().toLocaleLowerCase(); return value.length < 2 ? SCREENS.slice(0, 5) : SCREENS.filter((screen) => `${screen.title} ${screen.subtitle}`.toLocaleLowerCase().includes(value)); }, [query]);
  const combined = [...results, ...screenResults].slice(0, 16);
  function navigate(result: SearchResult) { setOpen(false); setQuery(""); router.push(result.href); }

  return <>
    {compact ? <button type="button" onClick={() => setOpen(true)} aria-label="Abrir busca rápida" className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground"><Search className="h-4 w-4" /></button> : <div className="relative mt-3"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><input value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} placeholder="Buscar conta ou tela…" className="h-8 w-full rounded-lg border border-border/60 bg-background/50 pl-8 pr-12 text-[11px] outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/40 focus:ring-1 focus:ring-primary/20" /><kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border/60 px-1 text-[9px] text-muted-foreground">⌘K</kbd></div>}
    {open && <div className="fixed inset-0 z-[70] bg-black/20" onClick={() => setOpen(false)}><div className={cn("absolute max-h-[min(620px,calc(100vh-80px))] overflow-y-auto rounded-xl border border-border/60 bg-popover p-2 shadow-2xl", compact ? "left-3 right-3 top-14" : "left-3 top-14 w-[min(430px,calc(100vw-24px))]")} onClick={(event) => event.stopPropagation()}><div className="mb-2 flex items-center gap-2 border-b border-border/50 px-2 pb-2"><Search className="h-4 w-4 text-primary" /><input autoFocus={compact} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Conta, cliente ou tela…" className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none" /><span className="text-[10px] text-muted-foreground">ESC fecha</span></div>{loading && <div className="px-2 py-3 text-xs text-muted-foreground">Buscando…</div>}{!loading && !combined.length && <div className="px-2 py-5 text-center text-xs text-muted-foreground">Nenhum resultado encontrado.</div>}{!loading && combined.length > 0 && <div className="space-y-0.5">{combined.map((result) => <button key={result.id} type="button" onClick={() => navigate(result)} className="flex w-full items-center gap-3 rounded-lg border-none bg-transparent px-2.5 py-2 text-left transition-colors hover:bg-accent/60"><div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Search className="h-3.5 w-3.5" /></div><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{result.title}</div><div className="truncate text-[10px] text-muted-foreground">{result.kind} · {result.subtitle}</div></div><ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /></button>)}</div>}</div></div>}
  </>;
}
