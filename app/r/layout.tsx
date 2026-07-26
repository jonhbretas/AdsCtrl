// app/r/layout.tsx
// Área do cliente: sem navegação e sem indexação.

import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Relatório de mídia paga",
  robots: { index: false, follow: false },
};

// Largura real do aparelho. Antes o viewport ficava travado em 740px para o
// documento A4 encaixar por zoom-out — o que deixava tudo minúsculo. Agora
// existe leitura empilhada de celular, então a página usa a tela como ela é.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function ClientReportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
