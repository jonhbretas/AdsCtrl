"use client";

import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import BrandMark from "@/components/BrandMark";

const ITEMS = [
  { href: "/today", label: "Hoje", icon: "✦" },
  { href: "/", label: "Clientes", icon: "◫" },
  { href: "/creatives", label: "Criativos", icon: "◉" },
  { href: "/meta-assets", label: "Raio-X", icon: "⌁" },
  { href: "/alerts", label: "Alertas", icon: "△" },
  { href: "/tarefas", label: "Tarefas", icon: "☑" },
  { href: "/admin", label: "Configurações", icon: "⚙" },
];

// Páginas sem a navegação do sistema. As três últimas são vistas por CLIENTE:
// ali não pode existir menu nem botão de sair — ele não é usuário do app.
// Toda rota nova aberta por link assinado precisa entrar nesta lista.
const CHROMELESS_PREFIXES = ["/login", "/report/", "/r/", "/c/"];

function isChromeless(pathname: string): boolean {
  return CHROMELESS_PREFIXES.some((prefix) =>
    prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix
  );
}

export default function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }
  if (isChromeless(pathname)) return null;
  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 50, height: 58, display: "flex",
      alignItems: "center", padding: "0 22px", borderBottom: "1px solid #e9e9e7",
      background: "rgba(255,255,255,.94)", backdropFilter: "blur(12px)",
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <a href="/today" style={{ display: "flex", alignItems: "center", gap: 9, color: "#111", textDecoration: "none", marginRight: 34 }}>
        <BrandMark size={30} />
        <span style={{ fontWeight: 750, letterSpacing: -0.3 }}>Assertivus Dash</span>
      </a>
      <div style={{ display: "flex", gap: 4, height: "100%", alignItems: "center" }}>
        {ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <a key={item.href} href={item.href} style={{
              display: "flex", alignItems: "center", gap: 7, padding: "8px 12px",
              borderRadius: 9, textDecoration: "none", fontSize: 13,
              fontWeight: active ? 650 : 500, color: active ? "#111" : "#6f6f6b",
              background: active ? "#f1f1ef" : "transparent",
            }}>
              <span style={{ fontSize: 12, color: active ? "#111" : "#999" }}>{item.icon}</span>
              {item.label}
            </a>
          );
        })}
      </div>
      <span style={{ flex: 1 }} />
      <span style={{ fontSize: 11, color: "#aaa" }}>Cockpit PPC</span>
      <button onClick={logout} title="Encerrar sessão" style={{ marginLeft: 10, border: 0, background: "transparent", color: "#aaa", cursor: "pointer", fontSize: 12 }}>Sair</button>
    </nav>
  );
}
