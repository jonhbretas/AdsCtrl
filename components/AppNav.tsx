"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, Target, CheckSquare2, TrendingUp, Palette, Search, Bell, Settings, LogOut,
  Menu, X, ChevronRight, ChevronDown, BarChart3, DollarSign, Users, Mail, HeartPulse, CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { appBrandName } from "@/lib/brand";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/ThemeProvider";

type NavItem = { href: string; label: string; icon: LucideIcon };
type NavGroup = { key: string; label: string; hint: string; icon: LucideIcon; items: NavItem[] };

// A ordem é intencional: primeiro entender o dia, depois diagnosticar,
// executar, acompanhar dinheiro e só então administrar cadastros/configuração.
const NAV_GROUPS: NavGroup[] = [
  { key: "start", label: "Comece aqui", hint: "prioridades do dia", icon: Target, items: [
    { href: "/", label: "Visão Geral", icon: LayoutDashboard },
    { href: "/today", label: "Cockpit Hoje", icon: Target },
    { href: "/proximos-passos", label: "Próximos passos", icon: Target },
    { href: "/decisoes", label: "Decisões", icon: CheckSquare2 },
  ] },
  { key: "diagnosis", label: "Acompanhe campanhas", hint: "resultado e oportunidades", icon: BarChart3, items: [
    { href: "/portfolio", label: "Portfólio", icon: Users },
    { href: "/funil", label: "Funil 360", icon: BarChart3 },
    { href: "/creatives", label: "Criativos", icon: Palette },
    { href: "/meta-assets", label: "Raio-X", icon: Search },
    { href: "/alerts", label: "Alertas", icon: Bell },
  ] },
  { key: "execution", label: "Execute", hint: "tarefas e comunicação", icon: CheckSquare2, items: [
    { href: "/tarefas", label: "Tarefas", icon: CheckSquare2 },
    { href: "/agenda", label: "Agenda", icon: CalendarDays },
    { href: "/relatorios", label: "Relatórios", icon: Mail },
  ] },
  { key: "business", label: "Financeiro e clientes", hint: "caixa e carteira", icon: DollarSign, items: [
    { href: "/financeiro", label: "Financeiro", icon: TrendingUp },
    { href: "/vendas", label: "ROI por Cliente", icon: DollarSign },
    { href: "/negocio", label: "Visão do Negócio", icon: BarChart3 },
    { href: "/saude", label: "Saúde da Carteira", icon: HeartPulse },
    { href: "/clientes", label: "Clientes", icon: Users },
  ] },
  { key: "system", label: "Sistema", hint: "configurações", icon: Settings, items: [
    { href: "/admin", label: "Config", icon: Settings },
    { href: "/utilidades", label: "Utilidades", icon: BarChart3 },
  ] },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((group) => group.items);
const MOBILE_PRIMARY = NAV_GROUPS[0].items.slice(0, 3);
const CHROMELESS_PREFIXES = ["/login", "/report/", "/r/", "/c/"];

function isActivePath(pathname: string, href: string) { return href === "/" ? pathname === "/" : pathname.startsWith(href); }

export default function AppNav({ brand }: { brand?: string }) {
  const brandName = (brand || "").trim() || appBrandName();
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const activeGroup = NAV_GROUPS.find((group) => group.items.some((item) => isActivePath(pathname, item.href)))?.key || "start";
  const [openGroups, setOpenGroups] = useState<string[]>(["start"]);

  useEffect(() => { setSidebarOpen(false); }, [pathname]);
  useEffect(() => { setOpenGroups((current) => current.includes(activeGroup) ? current : [...current, activeGroup]); }, [activeGroup]);

  if (CHROMELESS_PREFIXES.some((prefix) => prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix)) return null;

  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); router.refresh(); }
  function toggleGroup(key: string) { setOpenGroups((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]); }

  const NavItem = ({ item, mobile = false }: { item: NavItem; mobile?: boolean }) => {
    const active = isActivePath(pathname, item.href);
    const Icon = item.icon;
    return <Link href={item.href} className={cn(mobile ? "relative flex flex-col items-center gap-0.5 py-1 text-[10px] font-medium transition-colors" : "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150", active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground")}>
      <Icon className={cn(mobile ? "h-5 w-5" : "h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} /><span>{item.label}</span>{active && <span className={cn(mobile ? "absolute -top-0.5 left-1/4 right-1/4 h-0.5" : "absolute bottom-2 left-0 top-2 w-0.5", "rounded-full bg-primary")} />}
    </Link>;
  };

  const GroupBlock = ({ group, mobile = false }: { group: NavGroup; mobile?: boolean }) => {
    const GroupIcon = group.icon;
    const open = openGroups.includes(group.key);
    const hasActive = group.key === activeGroup;
    return <div className={cn(mobile ? "mb-1" : "mb-1")}>
      <button type="button" onClick={() => toggleGroup(group.key)} aria-expanded={open} className={cn("flex w-full items-center gap-2 rounded-lg border-none bg-transparent text-left transition-colors cursor-pointer", mobile ? "px-3 py-2.5" : "px-3 py-2", hasActive ? "text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground")}>
        <GroupIcon className={cn("h-4 w-4", hasActive && "text-primary")} /><span className="min-w-0 flex-1"><span className="block text-xs font-bold uppercase tracking-wider">{group.label}</span><span className="block text-[10px] font-normal text-muted-foreground">{group.hint}</span></span><ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="mt-0.5 space-y-0.5 pl-2">{group.items.map((item) => <NavItem key={item.href} item={item} />)}</div>}
    </div>;
  };

  return <>
    <aside className="fixed left-0 top-0 z-30 hidden h-screen w-56 flex-col border-r border-border/50 bg-sidebar md:flex">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border/50 px-4"><div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-xs font-bold text-white shadow-sm">A</div><div><div className="text-sm font-semibold text-foreground">{brandName}</div><div className="text-[10px] leading-tight text-muted-foreground">Dash · sequência da operação</div></div></div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">{NAV_GROUPS.map((group, index) => <div key={group.key}>{index > 0 && <div className="mx-2 my-2 h-px bg-border/40" />}<GroupBlock group={group} /></div>)}</nav>
      <div className="border-t border-border/50 p-2"><DropdownMenu><DropdownMenuTrigger asChild><button className="flex w-full items-center gap-2 rounded-lg border-none bg-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"><div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 text-[10px] font-bold text-white">A</div><span className="flex-1 text-left">Admin</span><ChevronRight className="h-3.5 w-3.5" /></button></DropdownMenuTrigger><DropdownMenuContent side="right" align="end" className="w-48"><DropdownMenuLabel>{brandName} Dash</DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? "☀️" : "🌙"} {theme === "dark" ? "Modo claro" : "Modo escuro"}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive"><LogOut className="h-4 w-4" /> Sair</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
    </aside>

    <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-border/50 bg-background/80 px-4 backdrop-blur-lg md:hidden"><div className="flex items-center gap-2.5"><button onClick={() => setSidebarOpen(true)} className="-ml-1 p-1 text-muted-foreground hover:text-foreground"><Menu className="h-5 w-5" /></button><div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-[10px] font-bold text-white">A</div><span className="text-sm font-semibold">{brandName}</span></div><DropdownMenu><DropdownMenuTrigger asChild><button className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 text-[10px] font-bold text-white">A</button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48"><DropdownMenuLabel>Admin</DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? "☀️" : "🌙"} {theme === "dark" ? "Modo claro" : "Modo escuro"}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive"><LogOut className="h-4 w-4" /> Sair</DropdownMenuItem></DropdownMenuContent></DropdownMenu></header>

    {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)}><aside className="absolute bottom-0 left-0 top-0 w-72 overflow-y-auto border-r border-border/50 bg-sidebar" onClick={(event) => event.stopPropagation()}><div className="flex h-12 items-center justify-between border-b border-border/50 px-4"><div className="flex items-center gap-2.5"><div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-[10px] font-bold text-white">A</div><span className="text-sm font-semibold">{brandName}</span></div><button onClick={() => setSidebarOpen(false)} className="p-1 text-muted-foreground"><X className="h-5 w-5" /></button></div><nav className="space-y-1 p-2">{NAV_GROUPS.map((group, index) => <div key={group.key}>{index > 0 && <div className="mx-2 my-2 h-px bg-border/50" />}<GroupBlock group={group} mobile /></div>)}<div className="my-2 h-px bg-border/50" /><button onClick={logout} className="flex w-full items-center gap-3 rounded-lg border-none bg-transparent px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"><LogOut className="h-4 w-4" /> Sair</button></nav></aside></div>}

    <nav className="safe-area-bottom fixed bottom-0 left-0 right-0 z-30 h-14 border-t border-border/50 bg-background/80 backdrop-blur-lg md:hidden"><div className="grid h-full grid-cols-4">{MOBILE_PRIMARY.map((item) => <NavItem key={item.href} item={item} mobile />)}<DropdownMenu><DropdownMenuTrigger asChild><button className={cn("flex flex-col items-center gap-0.5 py-1 text-[10px] font-medium", ALL_ITEMS.slice(3).some((item) => isActivePath(pathname, item.href)) ? "text-primary" : "text-muted-foreground")}><Menu className="h-5 w-5" /><span>Mais</span></button></DropdownMenuTrigger><DropdownMenuContent side="top" align="end" className="mb-2 max-h-[70vh] w-64 overflow-y-auto">{NAV_GROUPS.slice(1).map((group) => <div key={group.key}><DropdownMenuLabel>{group.label}</DropdownMenuLabel>{group.items.map((item) => <DropdownMenuItem key={item.href} asChild><Link href={item.href} className="flex items-center gap-3"><item.icon className="h-4 w-4" />{item.label}</Link></DropdownMenuItem>)}<DropdownMenuSeparator /></div>)}</DropdownMenuContent></DropdownMenu></div></nav>
  </>;
}
