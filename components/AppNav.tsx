"use client";

import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import BrandMark from "@/components/BrandMark";

// Os sete itens eram uma fileira plana. Agrupados por intenção — o que se opera
// todo dia, o que se analisa quando há dúvida, e o que se configura raramente —
// a barra passa a dizer para que serve cada coisa. Nenhum item foi removido.
const GROUPS: { items: { href: string; label: string; icon: string; title: string }[] }[] = [
  {
    items: [
      { href: "/today", label: "Hoje", icon: "◴", title: "O que precisa de atenção agora" },
      { href: "/", label: "Clientes", icon: "◫", title: "Contas, métricas e relatórios" },
      { href: "/tarefas", label: "Tarefas", icon: "☑", title: "O que chegou e o que o sistema detectou" },
    ],
  },
  {
    items: [
      { href: "/creatives", label: "Criativos", icon: "◉", title: "Qual peça merece continuar no ar" },
      { href: "/meta-assets", label: "Raio-X", icon: "⌁", title: "Estrutura e ativos das contas" },
      { href: "/alerts", label: "Alertas", icon: "△", title: "Saldo, pagamento, reprovação" },
    ],
  },
  {
    items: [{ href: "/admin", label: "Configurações", icon: "⚙", title: "Clientes, grupos e envio semanal" }],
  },
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
    <nav className="ec-nav ec-glass" aria-label="Navegação principal">
      <a href="/today" className="ec-nav__brand" aria-label="Assertivus Dash — início">
        <BrandMark size={28} />
        <span>Assertivus Dash</span>
      </a>

      <div className="ec-nav__links">
        {GROUPS.map((group, groupIndex) => (
          <div key={groupIndex} style={{ display: "flex", gap: 2, alignItems: "center" }}>
            {groupIndex > 0 && <span className="ec-nav__group" aria-hidden="true" />}
            {group.items.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className="ec-nav__link"
                  data-active={active ? "true" : undefined}
                  aria-current={active ? "page" : undefined}
                  title={item.title}
                >
                  <span aria-hidden="true" style={{ fontSize: 12, opacity: active ? 1 : 0.65 }}>
                    {item.icon}
                  </span>
                  <span className="ec-nav__label">{item.label}</span>
                </a>
              );
            })}
          </div>
        ))}
      </div>

      <div className="ec-nav__tail">
        <button onClick={logout} className="ec-btn" data-variant="ghost" data-size="sm" title="Encerrar sessão">
          Sair
        </button>
      </div>
    </nav>
  );
}
