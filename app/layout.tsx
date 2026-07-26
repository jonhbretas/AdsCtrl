import "./globals.css";
import "./components.css";
import { Inter, Manrope } from "next/font/google";
import AppNav from "@/components/AppNav";

// Duas famílias, subset latino, display swap. next/font serve as fontes do
// próprio domínio: nenhuma requisição a terceiros em tempo de execução, e
// nenhum texto invisível enquanto carrega.
const manrope = Manrope({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  title: "Assertivus Dash",
  description: "Cockpit de performance em mídia paga da Assertivus",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${manrope.variable} ${inter.variable}`}>
      <body>
        <AppNav />
        {children}
      </body>
    </html>
  );
}
