// app/c/layout.tsx
// Área do cliente (painel): sem navegação, sem indexação, viewport travado
// na largura do documento para o celular encaixar tudo na tela.

import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Painel de mídia paga",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 740,
  initialScale: 1,
};

export default function ClientDashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
