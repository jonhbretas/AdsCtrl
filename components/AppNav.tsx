"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Target,
  CheckSquare2,
  TrendingUp,
  Palette,
  Search,
  Bell,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight,
  BarChart3,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { appBrandName } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/ThemeProvider";

const NAV_GROUPS = [
  {
    label: "Análise",
    items: [
      { href: "/", label: "Visão Geral", icon: LayoutDashboard },
      { href: "/today", label: "Cockpit Hoje", icon: Target },
      { href: "/creatives", label: "Criativos", icon: Palette },
      { href: "/meta-assets", label: "Raio-X", icon: Search },
      { href: "/alerts", label: "Alertas", icon: Bell },
    ],
  },
  {
    label: "Operacional",
    items: [
      { href: "/tarefas", label: "Tarefas", icon: CheckSquare2 },
      { href: "/vendas", label: "ROI por Cliente", icon: DollarSign },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/admin", label: "Config", icon: Settings },
      { href: "/utilidades", label: "Utilidades", icon: BarChart3 },
    ],
  },
];

// Flat array for mobile tab bar (first 3 + More)
const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

const CHROMELESS_PREFIXES = ["/login", "/report/", "/r/", "/c/"];

export default function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (CHROMELESS_PREFIXES.some((p) => p.endsWith("/") ? pathname.startsWith(p) : pathname === p)) return null;

  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const NavItem = ({ item, mobile }: { item: (typeof ALL_ITEMS)[0]; mobile?: boolean }) => {
    const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
    const Icon = item.icon;

    if (mobile) {
      return (
        <Link
          href={item.href}
          className={cn(
            "flex flex-col items-center gap-0.5 text-[10px] font-medium transition-colors relative py-1",
            active ? "text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="h-5 w-5" />
          <span>{item.label}</span>
          {active && <span className="absolute -top-0.5 left-1/4 right-1/4 h-0.5 rounded-full bg-primary" />}
        </Link>
      );
    }

    return (
      <Link
        href={item.href}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 group relative",
          active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
        <span>{item.label}</span>
        {active && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-primary" />}
      </Link>
    );
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex h-screen w-56 flex-col fixed left-0 top-0 z-30 border-r border-border/50 bg-sidebar">
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-border/50 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
            A
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">{appBrandName()}</div>
            <div className="text-[10px] text-muted-foreground leading-tight">Dash</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.label}>
              {gi > 0 && <div className="h-px bg-border/40 mx-2 my-1.5" />}
              {group.items.map((item) => (
                <NavItem key={item.href} item={item} />
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-2 border-t border-border/50">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-[10px] font-bold">
                  A
                </div>
                <span className="flex-1 text-left">Admin</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-48">
              <DropdownMenuLabel>{appBrandName()} Dash</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
                {theme === "dark" ? "☀️" : "🌙"} {theme === "dark" ? "Modo claro" : "Modo escuro"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4" /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between h-12 px-4 border-b border-border/50 bg-background/80 backdrop-blur-lg">
        <div className="flex items-center gap-2.5">
          <button onClick={() => setSidebarOpen(true)} className="p-1 -ml-1 text-muted-foreground hover:text-foreground">
            <Menu className="h-5 w-5" />
          </button>
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-[10px] font-bold">
            A
          </div>
          <span className="text-sm font-semibold">{appBrandName()}</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-[10px] font-bold">
              A
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Admin</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? "☀️" : "🌙"} {theme === "dark" ? "Modo claro" : "Modo escuro"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4" /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setSidebarOpen(false)}>
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-sidebar border-r border-border/50 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 h-12 border-b border-border/50">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-[10px] font-bold">
                  A
                </div>
                <span className="text-sm font-semibold">{appBrandName()}</span>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="p-1 text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="p-2 space-y-0.5">
              {NAV_GROUPS.map((group, gi) => (
                <div key={group.label}>
                  {gi > 0 && <div className="h-px bg-border/50 mx-2 my-1.5" />}
                  {group.items.map((item) => (
                    <NavItem key={item.href} item={item} />
                  ))}
                </div>
              ))}
              <div className="h-px bg-border/50 my-2" />
              <button onClick={logout} className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors border-none cursor-pointer bg-transparent">
                <LogOut className="h-4 w-4" /> Sair
              </button>
            </nav>
          </aside>
        </div>
      )}

      {/* Mobile Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-14 border-t border-border/50 bg-background/80 backdrop-blur-lg safe-area-bottom">
        <div className="grid grid-cols-4 h-full">
          {ALL_ITEMS.slice(0, 3).map((item) => (
            <NavItem key={item.href} item={item} mobile />
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(
                "flex flex-col items-center gap-0.5 text-[10px] font-medium transition-colors py-1",
                ALL_ITEMS.slice(3).some((i) => i.href === "/" ? pathname === "/" : pathname.startsWith(i.href))
                  ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}>
                <Menu className="h-5 w-5" />
                <span>Mais</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" className="w-56 mb-2">
              {ALL_ITEMS.slice(3).map((item) => (
                <DropdownMenuItem key={item.href} asChild>
                  <Link href={item.href} className="flex items-center gap-3">
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>
    </>
  );
}
