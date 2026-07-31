import "./globals.css";
import "./components.css";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import AppNav from "@/components/AppNav";
import TrafficAI from "@/components/TrafficAI";
import { getSettings } from "@/lib/settings";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

// Nome e descrição saem da Config (tabela app_settings), com o .env como
// reserva — trocar a marca não exige redeploy.
export async function generateMetadata() {
  const settings = await getSettings();
  return {
    title: settings.brand_name,
    description: settings.brand_description,
  };
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { brand_name } = await getSettings();
  return (
    <html lang="pt-BR" className={`${inter.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("adsctrl:theme");var d=t==="light"?false:t==="system"?matchMedia("(prefers-color-scheme: dark)").matches:true;var r=document.documentElement;r.classList.toggle("dark",d);r.dataset.theme=d?"dark":"light";r.style.colorScheme=d?"dark":"light";}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <AppNav brand={brand_name} />
          <main className="flex-1">{children}</main>
          <TrafficAI />
        </ThemeProvider>
      </body>
    </html>
  );
}
