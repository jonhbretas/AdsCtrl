"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, BrainCircuit, ChevronDown, Expand, Send, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NEEDS, useAssertivusChat } from "@/lib/useAssertivusChat";

const QUICK_ACTIONS = [
  "Faça o diagnóstico deste contexto",
  "Onde estou desperdiçando verba?",
  "O que pode ser escalado com segurança?",
  "Resuma os alertas e priorize as ações",
];
const HIDDEN_PREFIXES = ["/login", "/report/", "/r/", "/c/", "/contratos/", "/assertivus"];

export default function TrafficAI() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const chat = useAssertivusChat();
  const { messages, input, setInput, busy, accounts, accountId, changeAccount, need, setNeed, alertCount, aiStatus, endRef, ask, stop } = chat;

  if (HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix))) return null;

  function submit(event: FormEvent) { event.preventDefault(); ask(); }
  const selected = accounts.find((account) => account.account_id === accountId);

  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label="Abrir Assertivus IA" className={cn("fixed z-40 grid h-14 w-14 place-items-center rounded-full border border-primary/40 bg-primary text-primary-foreground shadow-[0_0_0_6px_color-mix(in_srgb,var(--color-primary)_10%,transparent),0_18px_45px_rgba(0,0,0,0.35)] transition-all hover:scale-105", open && "pointer-events-none scale-90 opacity-0", "bottom-20 right-4 md:bottom-6 md:right-6")}>
      <BrainCircuit className="h-6 w-6" />
      {alertCount > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border-2 border-background bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">{Math.min(alertCount, 99)}</span>}
    </button>

    {open && <div className="fixed inset-0 z-[65] bg-black/35 backdrop-blur-[2px] md:bg-transparent md:backdrop-blur-none" onClick={() => setOpen(false)}>
      <section onClick={(event) => event.stopPropagation()} className="absolute bottom-0 left-0 right-0 flex h-[88vh] overflow-hidden rounded-t-2xl border border-border/50 bg-card text-foreground shadow-[0_28px_90px_rgba(0,0,0,0.35)] transition-all md:bottom-5 md:left-auto md:right-5 md:h-[min(720px,calc(100vh-40px))] md:w-[440px] md:rounded-2xl">
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="relative border-b border-border/50 bg-primary/5 px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><BrainCircuit className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="font-semibold">Assertivus IA</span><span style={{ animationDuration: "2400ms", animationTimingFunction: "ease-in-out" }} className={cn("h-1.5 w-1.5 rounded-full", aiStatus == null ? "bg-muted-foreground" : aiStatus.active ? "animate-pulse bg-emerald-500" : "bg-destructive")} /></div>
                <div className="truncate text-[10px] text-muted-foreground">{aiStatus == null ? "Verificando conexão…" : aiStatus.active ? `Conectada · ${aiStatus.activeLabel}` : "Sem provedor externo · usando diagnóstico interno"}</div>
              </div>
              <Link href="/assertivus" onClick={() => setOpen(false)} title="Abrir em tela cheia" className="hidden rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground md:block"><Expand className="h-4 w-4" /></Link>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="relative"><select value={accountId} onChange={(event) => changeAccount(event.target.value)} className="h-9 w-full appearance-none rounded-lg border border-border bg-background px-3 pr-8 text-xs outline-none focus:ring-1 focus:ring-ring"><option value="">Toda a operação</option>{accounts.map((account) => <option key={account.account_id} value={account.account_id}>{account.platform === "google" ? "Google" : "Meta"} · {account.name}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /></div>
              <div className="relative"><select value={need} onChange={(event) => setNeed(event.target.value as any)} className="h-9 w-full appearance-none rounded-lg border border-border bg-background px-3 pr-8 text-xs outline-none focus:ring-1 focus:ring-ring">{NEEDS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /></div>
            </div>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {messages.length === 1 && <div className="rounded-xl border border-primary/15 bg-primary/[0.035] p-3">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/80"><Sparkles className="h-3.5 w-3.5" />Comece por aqui</div>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-1">
                {QUICK_ACTIONS.map((action) => <button key={action} type="button" onClick={() => ask(action)} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/[0.06] hover:text-foreground">{action}</button>)}
              </div>
            </div>}
            {messages.map((message, index) => <div key={index} className={cn("flex gap-2.5", message.role === "user" && "justify-end")}>
              {message.role === "assistant" && <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary"><Bot className="h-3.5 w-3.5" /></div>}
              <div className={cn("max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-3 text-[12px] leading-5", message.role === "user" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-tl-md border border-border/60 bg-muted/20 text-foreground")}>
                {message.content}
                {message.role === "assistant" && message.mode && <div className="mt-2 border-t border-border/50 pt-1.5 text-[9px] uppercase tracking-wider text-muted-foreground">{message.mode === "ai" ? `${message.routing?.label || "IA conectada"} · ${message.routing?.provider || "provedor externo"} · ${message.routing?.model || "modelo roteado"}` : "Diagnóstico interno"}</div>}
                {message.role === "assistant" && message.mode === "internal" && message.diagnostics?.some((item) => item.configured) && <div className="mt-1 text-[9px] normal-case tracking-normal text-destructive/80">{message.diagnostics.filter((item) => item.configured).map((item) => `${item.provider}: ${item.reason || "falhou"}`).join(" · ")}</div>}
              </div>
            </div>)}
            {busy && <div className="flex items-center gap-2.5">
              <div className="grid h-7 w-7 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary"><Bot className="h-3.5 w-3.5" /></div>
              <div className="flex items-center gap-2 rounded-2xl rounded-tl-md border border-border/60 bg-muted/20 px-4 py-3">
                <div className="flex gap-1">
                  <span style={{ animationDuration: "1100ms" }} className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/80" />
                  <span style={{ animationDuration: "1100ms", animationDelay: "220ms" }} className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/80" />
                  <span style={{ animationDuration: "1100ms", animationDelay: "440ms" }} className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/80" />
                </div>
                <button type="button" onClick={stop} className="text-[10px] font-semibold text-muted-foreground underline decoration-dotted hover:text-foreground">parar</button>
              </div>
            </div>}
            <div ref={endRef} />
          </div>

          <footer className="border-t border-border/50 bg-muted/10 p-3">
            <div className="mb-2 flex items-center justify-between px-1 text-[10px] text-muted-foreground"><span className="truncate">Contexto: {selected?.name || "toda a operação"}</span><span>Alterações exigem aprovação</span></div>
            <form onSubmit={submit} className="flex items-end gap-2 rounded-xl border border-border bg-background p-2 focus-within:ring-1 focus-within:ring-ring">
              <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); ask(); } }} rows={2} placeholder="Pergunte sobre campanhas, alertas, criativos ou resultados…" className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-1 text-xs leading-5 outline-none placeholder:text-muted-foreground" />
              <button type="submit" disabled={busy || !input.trim()} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"><Send className="h-4 w-4" /></button>
            </form>
          </footer>
        </div>
      </section>
    </div>}
  </>;
}
