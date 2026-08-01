"use client";

// components/NeedSelector.tsx
// Seletor de "necessidade" do Assertivus IA com o plano de roteamento: para
// cada opção mostra a especialidade, o modelo que será usado (pago/gratuito),
// o teto de saída e os fallbacks. A faixa de roteamento (RoutingInfoStrip)
// resume o plano da necessidade atual embaixo dos seletores.

import { Check, ChevronDown, Cpu } from "lucide-react";
import { NEEDS, type AiPlanItem, type Need } from "@/lib/useAssertivusChat";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NEED_LABEL: Record<Need, string> = { auto: "Automático", fast: "Resposta rápida", analysis: "Análise de performance", strategic: "Estratégia profunda", creative: "Criativos e copy" };

function stepsText(steps: AiPlanItem["steps"]): string {
  if (!steps.length) return "nenhum provedor configurado — diagnóstico interno";
  const primary = steps[0];
  let text = `${primary.model} (${primary.label})`;
  if (primary.tier === "pago") text += " · pago";
  else if (primary.tier === "gratuito") text += " · gratuito";
  else text += " · custo variável";
  if (primary.maxOutputTokens) text += ` · saída até ~${primary.maxOutputTokens.toLocaleString("pt-BR")} tok`;
  if (steps.length > 1) text += ` → fallback ${steps.slice(1).map((step) => step.model).join(" → ")}`;
  return text;
}

export function NeedSelector({
  value,
  onChange,
  plan,
  autoHint,
  className,
}: {
  value: Need;
  onChange: (need: Need) => void;
  plan?: AiPlanItem[];
  autoHint?: string;
  className?: string;
}) {
  const planByNeed = new Map((plan || []).map((item) => [item.need, item]));
  const currentPrimary = value !== "auto" ? planByNeed.get(value)?.steps[0] : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn("flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 text-left text-xs outline-none focus:ring-1 focus:ring-ring", className)}>
          <span className="shrink-0 font-semibold">{NEED_LABEL[value]}</span>
          <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
            {currentPrimary ? `${currentPrimary.model} (${currentPrimary.label})` : value === "auto" ? "roteia pela pergunta" : "carregando plano…"}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[min(340px,calc(100vw-24px))]">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Roteamento</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onChange("auto")} className="flex items-start gap-2 py-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5"><Cpu className="h-3.5 w-3.5 shrink-0 text-primary" /><span className="text-xs font-semibold">Automático</span>{value === "auto" && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}</div>
            <div className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{autoHint || "Roteia pela sua pergunta: criativos, estratégia, respostas rápidas ou análise."}</div>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {NEEDS.filter((option) => option.value !== "auto").map((option) => {
          const item = planByNeed.get(option.value as Exclude<Need, "auto">);
          const active = value === option.value;
          return (
            <DropdownMenuItem key={option.value} onSelect={() => onChange(option.value as Exclude<Need, "auto">)} className="flex items-start gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5"><span className="text-xs font-semibold">{option.label}</span>{active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}</div>
                <div className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{item?.specialty || "—"}</div>
                <div className="mt-1 truncate text-[10px] font-medium text-foreground/80" title={item ? stepsText(item.steps) : ""}>{item ? stepsText(item.steps) : "carregando plano…"}</div>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RoutingInfoStrip({
  need,
  plan,
  autoHint,
  className,
}: {
  need: Need;
  plan?: AiPlanItem[];
  autoHint?: string;
  className?: string;
}) {
  if (!plan) return null;
  const item = need !== "auto" ? plan.find((entry) => entry.need === need) : null;
  const text = need === "auto"
    ? `Roteamento automático — ${autoHint || "roteia pela pergunta"}`
    : item
      ? `${item.label} · ${stepsText(item.steps)}`
      : NEED_LABEL[need];
  return (
    <div className={cn("flex items-start gap-1.5 px-3 py-1.5 text-[10px] leading-4 text-muted-foreground", className)}>
      <Cpu className="mt-px h-3 w-3 shrink-0 text-primary/70" />
      <span>{text}</span>
    </div>
  );
}
