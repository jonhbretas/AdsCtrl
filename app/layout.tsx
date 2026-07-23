export const metadata = { title: "Ads Dashboard", description: "Overview de mídia paga" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, background: "#fff" }}>{children}</body>
    </html>
  );
}
