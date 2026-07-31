"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bot, BrainCircuit, ChevronDown, Maximize2, Minimize2, Send, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Message = { role: "user" | "assistant"; content: string; mode?: "ai" | "internal" };
type Account = { account_id: string; name: string; platform: "meta" | "google"; hidden?: boolean };

const QUICK_ACTIONS = [
  "Faça o diagnóstico deste contexto",
  "Onde estou desperdiçando verba?",
  "O que pode ser escalado com segurança?",
  "Resuma os alertas e priorize as ações",
];
const HIDDEN_PREFIXES = ["/login", "/report/", "/r/", "/c/", "/contratos/"];

export default function TrafficAI() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [alertCount, setAlertCount] = useState(0);
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: "Estou conectado ao contexto do AdsCtrl. Selecione uma conta ou consulte toda a operação para começar." }]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const queryAccount = new URLSearchParams(window.location.search).get("account") || "";
    const stored = window.localStorage.getItem("adsctrl:selected-account") || "";
    setAccountId(queryAccount || stored);
    const onSelection = (event: Event) => setAccountId((event as CustomEvent<string>).detail || "");
    window.addEventListener("adsctrl:account-selected", onSelection);
    return () => window.removeEventListener("adsctrl:account-selected", onSelection);
  }, [pathname]);

  useEffect(() => {
    const openAssistant = () => setOpen(true);
    window.addEventListener("adsctrl:open-ai", openAssistant);
    return () => window.removeEventListener("adsctrl:open-ai", openAssistant);
  }, []);

  useEffect(() => {
    if (!open || accounts.length) return;
    Promise.all([fetch("/api/accounts", { cache: "no-store" }).then((response) => response.json()), fetch("/api/alerts", { cache: "no-store" }).then((response) => response.json())])
      .then(([accountData, alertData]) => { setAccounts((accountData.accounts || []).filter((account: Account) => !account.hidden)); setAlertCount((alertData.alerts || []).length); })
      .catch(() => {});
  }, [open, accounts.length]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);
  if (HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix))) return null;

  function changeAccount(value: string) {
    setAccountId(value);
    if (value) window.localStorage.setItem("adsctrl:selected-account", value); else window.localStorage.removeItem("adsctrl:selected-account");
    window.dispatchEvent(new CustomEvent("adsctrl:account-selected", { detail: value }));
  }

  async function ask(text?: string) {
    const question = (text ?? input).trim();
    if (!question || busy) return;
    const nextMessages: Message[] = [...messages, { role: "user", content: question }];
    setMessages(nextMessages); setInput(""); setBusy(true);
    try {
      const response = await fetch("/api/ai/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: question, pathname, account_id: accountId || null, history: messages.slice(-6) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao consultar o Traffic AI.");
      setMessages((current) => [...current, { role: "assistant", content: data.answer, mode: data.mode }]);
    } catch (error: any) {
      setMessages((current) => [...current, { role: "assistant", content: error?.message || "Não consegui concluir esta análise agora." }]);
    } finally { setBusy(false); }
  }

  function submit(event: FormEvent) { event.preventDefault(); ask(); }
  const selected = accounts.find((account) => account.account_id === accountId);

  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label="Abrir Traffic AI" className={cn("fixed z-40 grid h-14 w-14 place-items-center rounded-full border border-amber-300/35 bg-[radial-gradient(circle_at_35%_25%,#f5d77c,#9a6b16_72%)] text-slate-950 shadow-[0_0_0_6px_rgba(217,168,63,0.08),0_18px_45px_rgba(0,0,0,0.4)] transition-all hover:scale-105 hover:shadow-[0_0_0_8px_rgba(217,168,63,0.12),0_18px_55px_rgba(0,0,0,0.5)]", open && "pointer-events-none scale-90 opacity-0", "bottom-20 right-4 md:bottom-6 md:right-6")}>
      <BrainCircuit className="h-6 w-6" />
      {alertCount > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border-2 border-background bg-red-500 px-1 text-[9px] font-bold text-white">{Math.min(alertCount, 99)}</span>}
    </button>

    {open && <div className="fixed inset-0 z-[65] bg-black/35 backdrop-blur-[2px] md:bg-transparent md:backdrop-blur-none" onClick={() => setOpen(false)}>
      <section onClick={(event) => event.stopPropagation()} className={cn("absolute flex overflow-hidden border border-white/10 bg-[#090b12]/95 text-slate-100 shadow-[0_28px_90px_rgba(0,0,0,0.65)] backdrop-blur-2xl transition-all", expanded ? "inset-3 md:bottom-5 md:left-auto md:right-5 md:top-5 md:w-[min(920px,calc(100vw-250px))]" : "bottom-0 left-0 right-0 h-[88vh] rounded-t-2xl md:bottom-5 md:left-auto md:right-5 md:h-[min(720px,calc(100vh-40px))] md:w-[440px] md:rounded-2xl")}>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="relative border-b border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(217,168,63,0.13),transparent_44%)] px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl border border-amber-300/25 bg-amber-300/10 text-amber-300"><BrainCircuit className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="font-semibold">Traffic AI</span><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /></div><div className="truncate text-[10px] text-slate-400">Análise contextual · dados atualizados a cada consulta</div></div>
              <button type="button" onClick={() => setExpanded((value) => !value)} className="hidden rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white md:block">{expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <div className="relative mt-3">
              <select value={accountId} onChange={(event) => changeAccount(event.target.value)} className="h-9 w-full appearance-none rounded-lg border border-white/10 bg-black/20 px-3 pr-8 text-xs text-slate-200 outline-none focus:border-amber-300/35">
                <option value="">Toda a operação</option>
                {accounts.map((account) => <option key={account.account_id} value={account.account_id}>{account.platform === "google" ? "Google" : "Meta"} · {account.name}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            </div>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {messages.length === 1 && <div className="rounded-xl border border-amber-300/12 bg-amber-300/[0.035] p-3">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-300/80"><Sparkles className="h-3.5 w-3.5" />Comece por aqui</div>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-1">
                {QUICK_ACTIONS.map((action) => <button key={action} type="button" onClick={() => ask(action)} className="rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2.5 text-left text-xs text-slate-300 transition-colors hover:border-amber-300/20 hover:bg-amber-300/[0.06] hover:text-white">{action}</button>)}
              </div>
            </div>}
            {messages.map((message, index) => <div key={index} className={cn("flex gap-2.5", message.role === "user" && "justify-end")}>
              {message.role === "assistant" && <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-amber-300/20 bg-amber-300/10 text-amber-300"><Bot className="h-3.5 w-3.5" /></div>}
              <div className={cn("max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-3 text-[12px] leading-5", message.role === "user" ? "rounded-br-md bg-amber-300 text-slate-950" : "rounded-tl-md border border-white/8 bg-white/[0.035] text-slate-200")}>
                {message.content}
                {message.role === "assistant" && message.mode && <div className="mt-2 border-t border-white/8 pt-1.5 text-[9px] uppercase tracking-wider text-slate-500">{message.mode === "ai" ? "IA conectada" : "Diagnóstico interno"}</div>}
              </div>
            </div>)}
            {busy && <div className="flex items-center gap-2.5"><div className="grid h-7 w-7 place-items-center rounded-lg border border-amber-300/20 bg-amber-300/10 text-amber-300"><Bot className="h-3.5 w-3.5" /></div><div className="flex gap-1 rounded-2xl rounded-tl-md border border-white/8 bg-white/[0.035] px-4 py-3"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-300" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-300 [animation-delay:120ms]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-300 [animation-delay:240ms]" /></div></div>}
            <div ref={endRef} />
          </div>

          <footer className="border-t border-white/8 bg-black/25 p-3">
            <div className="mb-2 flex items-center justify-between px-1 text-[10px] text-slate-500"><span className="truncate">Contexto: {selected?.name || "toda a operação"}</span><span>Alterações exigem aprovação</span></div>
            <form onSubmit={submit} className="flex items-end gap-2 rounded-xl border border-white/10 bg-white/[0.035] p-2 focus-within:border-amber-300/30 focus-within:ring-1 focus-within:ring-amber-300/10">
              <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); ask(); } }} rows={2} placeholder="Pergunte sobre campanhas, alertas, criativos ou resultados…" className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-1 text-xs leading-5 text-slate-100 outline-none placeholder:text-slate-600" />
              <button type="submit" disabled={busy || !input.trim()} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-300 text-slate-950 transition-colors hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-30"><Send className="h-4 w-4" /></button>
            </form>
          </footer>
        </div>
      </section>
    </div>}
  </>;
}
