"use client";

import { FormEvent } from "react";
import { Bot, BrainCircuit, ChevronDown, Send, Sparkles, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils";
import { NEEDS, useAssertivusChat } from "@/lib/useAssertivusChat";

const QUICK_ACTIONS = [
  "Faça o diagnóstico deste contexto",
  "Onde estou desperdiçando verba?",
  "O que pode ser escalado com segurança?",
  "Resuma os alertas e priorize as ações",
];

export default function AssertivusPage() {
  const { messages, input, setInput, busy, accounts, accountId, changeAccount, need, setNeed, aiStatus, endRef, ask, stop, clearHistory } = useAssertivusChat();

  function submit(event: FormEvent) { event.preventDefault(); ask(); }
  const selected = accounts.find((account) => account.account_id === accountId);

  return (
    <div className="flex h-screen flex-col p-4 md:h-screen md:p-6 md:ml-56">
      <PageHeader
        title="Assertivus IA"
        subtitle="Copiloto estratégico com histórico de conversa — pergunte sobre campanhas, criativos, estrutura ou estratégia."
        actions={<div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={cn("h-1.5 w-1.5 rounded-full", aiStatus == null ? "bg-muted-foreground" : aiStatus.active ? "animate-pulse bg-emerald-500" : "bg-destructive")} />
          {aiStatus == null ? "Verificando conexão…" : aiStatus.active ? `Conectada · ${aiStatus.activeLabel}` : "Diagnóstico interno"}
          <button type="button" onClick={clearHistory} title="Limpar conversa" className="rounded-lg border border-border p-1.5 hover:bg-muted"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>}
      />

      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr]">
        <div className="relative"><select value={accountId} onChange={(event) => changeAccount(event.target.value)} className="h-9 w-full appearance-none rounded-lg border border-border bg-background px-3 pr-8 text-xs outline-none focus:ring-1 focus:ring-ring"><option value="">Toda a operação</option>{accounts.map((account) => <option key={account.account_id} value={account.account_id}>{account.platform === "google" ? "Google" : "Meta"} · {account.name}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /></div>
        <div className="relative"><select value={need} onChange={(event) => setNeed(event.target.value as any)} className="h-9 w-full appearance-none rounded-lg border border-border bg-background px-3 pr-8 text-xs outline-none focus:ring-1 focus:ring-ring">{NEEDS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /></div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/50 bg-card">
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {messages.length === 1 && <div className="rounded-xl border border-primary/15 bg-primary/[0.035] p-3">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/80"><Sparkles className="h-3.5 w-3.5" />Comece por aqui</div>
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
              {QUICK_ACTIONS.map((action) => <button key={action} type="button" onClick={() => ask(action)} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/[0.06] hover:text-foreground">{action}</button>)}
            </div>
          </div>}
          {messages.map((message, index) => <div key={index} className={cn("flex gap-2.5", message.role === "user" && "justify-end")}>
            {message.role === "assistant" && <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary"><Bot className="h-3.5 w-3.5" /></div>}
            <div className={cn("max-w-[75%] whitespace-pre-wrap rounded-2xl px-3.5 py-3 text-[13px] leading-6", message.role === "user" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-tl-md border border-border/60 bg-muted/20 text-foreground")}>
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
            <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); ask(); } }} rows={2} placeholder="Pergunte sobre campanhas, alertas, criativos ou resultados…" className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-1 text-sm leading-6 outline-none placeholder:text-muted-foreground" />
            <button type="submit" disabled={busy || !input.trim()} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"><Send className="h-4 w-4" /></button>
          </form>
        </footer>
      </div>
    </div>
  );
}
