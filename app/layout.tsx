import AppNav from "@/components/AppNav";

export const metadata = { title: "AdsCtrl", description: "Cockpit pessoal de performance PPC" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, background: "#fff" }}>
        <AppNav />
        {children}
      </body>
    </html>
  );
}
