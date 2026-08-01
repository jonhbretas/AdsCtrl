"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export type Need = "auto" | "fast" | "analysis" | "strategic" | "creative";
export type Routing = { label: string; automatic: boolean; provider: string; model: string };
export type Diagnostic = { provider: string; configured: boolean; ok: boolean; reason?: string };
export type ChatMessage = { role: "user" | "assistant"; content: string; mode?: "ai" | "internal"; routing?: Routing; diagnostics?: Diagnostic[] };
export type Account = { account_id: string; name: string; platform: "meta" | "google"; hidden?: boolean; group_id?: string | null };
export type AiStatus = { providers: { id: string; label: string; configured: boolean }[]; active: string | null; activeLabel: string | null };

export const NEEDS: { value: Need; label: string }[] = [
  { value: "auto", label: "Roteamento automático" },
  { value: "fast", label: "Resposta rápida" },
  { value: "analysis", label: "Análise de performance" },
  { value: "strategic", label: "Estratégia profunda" },
  { value: "creative", label: "Criativos e copy" },
];

const HISTORY_KEY = "adsctrl:ai-chat-history";
const GREETING: ChatMessage = { role: "assistant", content: "Estou conectada ao contexto do Assertivus Dash. Selecione uma conta ou consulte toda a operação para começar." };

// Duas telas (widget flutuante e /assistente em tela cheia) compartilham a
// mesma conversa: histórico salvo no navegador, não por sessão de tela.
export function useAssertivusChat() {
  const pathname = usePathname();
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [need, setNeed] = useState<Need>("auto");
  const [alertCount, setAlertCount] = useState(0);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(HISTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed.length) setMessages(parsed);
    } catch {}
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify(messages)); } catch {}
  }, [messages]);

  useEffect(() => {
    const queryAccount = new URLSearchParams(window.location.search).get("account") || "";
    const stored = window.localStorage.getItem("adsctrl:selected-account") || "";
    setAccountId(queryAccount || stored);
    const onSelection = (event: Event) => setAccountId((event as CustomEvent<string>).detail || "");
    window.addEventListener("adsctrl:account-selected", onSelection);
    return () => window.removeEventListener("adsctrl:account-selected", onSelection);
  }, [pathname]);

  useEffect(() => {
    if (accounts.length) return;
    Promise.all([fetch("/api/accounts", { cache: "no-store" }).then((response) => response.json()), fetch("/api/alerts", { cache: "no-store" }).then((response) => response.json())])
      .then(([accountData, alertData]) => { setAccounts((accountData.accounts || []).filter((account: Account) => !account.hidden)); setAlertCount((alertData.alerts || []).length); })
      .catch(() => {});
  }, [accounts.length]);

  useEffect(() => {
    if (aiStatus) return;
    fetch("/api/ai/status", { cache: "no-store" }).then((response) => response.json()).then(setAiStatus).catch(() => {});
  }, [aiStatus]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  function changeAccount(value: string) {
    setAccountId(value);
    if (value) window.localStorage.setItem("adsctrl:selected-account", value); else window.localStorage.removeItem("adsctrl:selected-account");
    window.dispatchEvent(new CustomEvent("adsctrl:account-selected", { detail: value }));
  }

  async function ask(text?: string) {
    const question = (text ?? input).trim();
    if (!question || busy) return;
    setMessages((current) => [...current, { role: "user", content: question }]);
    setInput(""); setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/ai/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: question, pathname, account_id: accountId || null, need, history: messages.slice(-6) }), signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao consultar a Assertivus IA.");
      setMessages((current) => [...current, { role: "assistant", content: data.answer, mode: data.mode, routing: data.routing, diagnostics: data.diagnostics }]);
    } catch (error: any) {
      if (error?.name === "AbortError") setMessages((current) => [...current, { role: "assistant", content: "Consulta interrompida." }]);
      else setMessages((current) => [...current, { role: "assistant", content: error?.message || "Não consegui concluir esta análise agora." }]);
    } finally { setBusy(false); abortRef.current = null; }
  }

  function stop() { abortRef.current?.abort(); }
  function clearHistory() { setMessages([GREETING]); }

  return { pathname, messages, setMessages, input, setInput, busy, accounts, accountId, changeAccount, need, setNeed, alertCount, aiStatus, endRef, ask, stop, clearHistory };
}
