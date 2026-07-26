// app/r/layout.tsx
// Área do cliente: sem navegação, sem indexação e com viewport fixo.
// O documento tem largura fixa de página A4; travar o viewport em 740px faz
// o celular encaixar o relatório inteiro na tela em vez de cortar as caixas
// e obrigar a rolar para o lado.

import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Relatório de mídia paga",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 740,
  initialScale: 1,
};

export default function ClientReportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
