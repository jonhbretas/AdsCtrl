import "./globals.css";
import "./components.css";
import { Inter } from "next/font/google";
import AppNav from "@/components/AppNav";

// Apple design system usa SF Pro como tipografia principal. Inter é o
// substituto open-source mais próximo (conforme DESIGN.md). A escada de pesos
// Apple é 300 / 400 / 600 / 700 — weight 500 é deliberadamente ausente.
const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  title: "Assertivus Dash",
  description: "Cockpit de performance em mídia paga da Assertivus",
};

// O painel nunca declarou viewport: sem isto o navegador de celular assume um
// layout de 980px e desenha a página encolhida, o que fazia qualquer ajuste
// responsivo parecer não funcionar. As páginas /r e /c já declaravam o seu.
export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable}`}>
      <body>
        <AppNav />
        {children}
      </body>
    </html>
  );
}
