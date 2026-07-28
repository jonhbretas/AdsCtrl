"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { FileText, Smartphone } from "lucide-react";

const MOBILE_BREAKPOINT = 760;

export function useReadingMode() {
  const [compact, setCompact] = useState(false);
  const [chosenByReader, setChosenByReader] = useState(false);
  const [docWidth, setDocWidth] = useState(700);
  const shellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const apply = () => { if (!chosenByReader) setCompact(window.innerWidth < MOBILE_BREAKPOINT); };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [chosenByReader]);

  useEffect(() => {
    const el = shellRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const style = window.getComputedStyle(el);
      const inner = el.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
      setDocWidth(Math.max(280, Math.floor(inner)));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, []);

  const choose = useCallback((value: boolean) => { setChosenByReader(true); setCompact(value); }, []);

  const printDocument = useCallback(() => {
    if (!compact) { window.print(); return; }
    setCompact(false);
    const restore = () => setCompact(true);
    window.addEventListener("afterprint", restore, { once: true });
    window.setTimeout(() => { window.print(); window.setTimeout(restore, 800); }, 400);
  }, [compact]);

  return { compact, choose, docWidth, shellRef, printDocument };
}

export function ModeToggle({ compact, onChange }: { compact: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="inline-flex gap-0.5 p-0.5 rounded-lg bg-muted border border-border/50">
      <button onClick={() => onChange(false)} title="Layout de página A4 — igual ao PDF"
        className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors border-none cursor-pointer",
          !compact ? "bg-background text-foreground shadow-sm" : "bg-transparent text-muted-foreground hover:text-foreground"
        )}>
        <FileText className="h-3.5 w-3.5" /> Documento
      </button>
      <button onClick={() => onChange(true)} title="Conteúdo empilhado para tela pequena"
        className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors border-none cursor-pointer",
          compact ? "bg-background text-foreground shadow-sm" : "bg-transparent text-muted-foreground hover:text-foreground"
        )}>
        <Smartphone className="h-3.5 w-3.5" /> Celular
      </button>
    </div>
  );
}
