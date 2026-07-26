"use client";

// components/ReadingMode.tsx
// Alternância entre o documento em A4 e a leitura empilhada de celular, usada
// pelo painel (/c) e pelo relatório por link (/r).
//
// Duas regras que valem para as duas telas:
//  - o palpite inicial é pela largura da janela, mas se o leitor escolher, a
//    escolha dele manda (inclusive ao girar o aparelho);
//  - o PDF sai SEMPRE em A4. Imprimir a versão de celular geraria um
//    documento estreito e esticado, que é justamente o que se quer evitar.

import { useCallback, useEffect, useRef, useState } from "react";

// Abaixo disto o documento de 700px não cabe sem rolar de lado.
const MOBILE_BREAKPOINT = 760;

export function useReadingMode() {
  const [compact, setCompact] = useState(false);
  const [chosenByReader, setChosenByReader] = useState(false);
  const [docWidth, setDocWidth] = useState(700);
  const shellRef = useRef<HTMLDivElement | null>(null);

  // Palpite inicial e reação a giro de tela / redimensionamento.
  useEffect(() => {
    const apply = () => {
      if (!chosenByReader) setCompact(window.innerWidth < MOBILE_BREAKPOINT);
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [chosenByReader]);

  // Largura real de dentro do cartão. clientWidth inclui o padding, e o
  // padding muda conforme o modo — usar ele direto deixava o documento mais
  // largo que o espaço disponível e sobrava rolagem lateral.
  useEffect(() => {
    const el = shellRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const style = window.getComputedStyle(el);
      const inner =
        el.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
      setDocWidth(Math.max(280, Math.floor(inner)));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, []);

  const choose = useCallback((value: boolean) => {
    setChosenByReader(true);
    setCompact(value);
  }, []);

  // Imprime em A4 mesmo lendo no celular: troca o modo, deixa o React
  // repintar, imprime, e devolve a tela como estava.
  const printDocument = useCallback(() => {
    if (!compact) {
      window.print();
      return;
    }
    setCompact(false);
    const restore = () => setCompact(true);
    window.addEventListener("afterprint", restore, { once: true });
    window.setTimeout(() => {
      window.print();
      // Safari no iOS não dispara afterprint de forma confiável.
      window.setTimeout(restore, 800);
    }, 400);
  }, [compact]);

  return { compact, choose, docWidth, shellRef, printDocument };
}

export function ModeToggle({
  compact,
  onChange,
}: {
  compact: boolean;
  onChange: (compact: boolean) => void;
}) {
  const option = (value: boolean, label: string, title: string) => (
    <button
      onClick={() => onChange(value)}
      title={title}
      style={{
        padding: "5px 11px",
        borderRadius: 8,
        border: "none",
        background: compact === value ? "#fff" : "transparent",
        boxShadow: compact === value ? "0 1px 2px rgba(16,24,40,.14)" : "none",
        color: compact === value ? "#12161f" : "#6b7280",
        fontSize: 11.5,
        fontWeight: 650,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
  return (
    <div style={{ display: "inline-flex", gap: 2, padding: 2, borderRadius: 10, background: "#e9ebef" }}>
      {option(false, "Documento", "Layout de página A4 — igual ao PDF")}
      {option(true, "Celular", "Conteúdo empilhado para tela pequena")}
    </div>
  );
}
