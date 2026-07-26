import AppNav from "@/components/AppNav";

export const metadata = {
  title: "Assertivus Dash",
  description: "Cockpit de performance em mídia paga da Assertivus",
};
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
