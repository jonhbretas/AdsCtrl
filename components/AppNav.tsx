"use client";

import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";

const ITEMS = [
  { href: "/today", label: "Hoje", icon: "✦" },
  { href: "/", label: "Clientes", icon: "◫" },
  { href: "/creatives", label: "Criativos", icon: "◉" },
  { href: "/alerts", label: "Alertas", icon: "△" },
  { href: "/admin", label: "Configurações", icon: "⚙" },
];

export default function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }
  if (pathname === "/login" || pathname.startsWith("/report/")) return null;
  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 50, height: 58, display: "flex",
      alignItems: "center", padding: "0 22px", borderBottom: "1px solid #e9e9e7",
      background: "rgba(255,255,255,.94)", backdropFilter: "blur(12px)",
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <a href="/today" style={{ display: "flex", alignItems: "center", gap: 9, color: "#111", textDecoration: "none", marginRight: 34 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: "#111", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 13 }}>AC</span>
        <span style={{ fontWeight: 750, letterSpacing: -0.3 }}>AdsCtrl</span>
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
