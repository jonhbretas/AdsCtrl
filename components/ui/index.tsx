"use client";

// Wrappers shadcn/ui para compatibilidade com componentes legados.

import React from "react";
import { cn } from "@/lib/utils";
import { Button as ShadButton } from "@/components/ui/button";
import { Badge as ShadBadge } from "@/components/ui/badge";
import { Card as ShadCard, CardContent as ShadCardContent } from "@/components/ui/card";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const variantMap: Record<ButtonVariant, "default" | "secondary" | "ghost" | "destructive"> = {
  primary: "default",
  secondary: "secondary",
  ghost: "ghost",
  danger: "destructive",
};

const sizeMap: Record<ButtonSize, "default" | "sm"> = {
  sm: "sm",
  md: "default",
};

export function Button({
  variant = "secondary",
  size = "md",
  full,
  children,
  className,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <ShadButton
      {...(rest as any)}
      variant={variantMap[variant]}
      size={sizeMap[size]}
      className={cn(full && "w-full", className)}
    >
      {children}
    </ShadButton>
  );
}

export function Card({
  children,
  tone,
  padded = true,
  className,
  as: Tag = "div",
  ...rest
}: {
  children: React.ReactNode;
  tone?: "neutral" | "brand" | "accent" | "ok" | "warn" | "danger";
  padded?: boolean;
  as?: "div" | "article" | "section" | "li";
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <ShadCard
      {...(rest as any)}
      className={cn(className)}
      as={Tag as any}
    >
      {padded ? <ShadCardContent className="p-4 sm:p-6">{children}</ShadCardContent> : children}
    </ShadCard>
  );
}

const badgeToneMap: Record<string, "default" | "secondary" | "destructive" | "success" | "warning" | "info"> = {
  neutral: "secondary",
  brand: "info",
  accent: "info",
  ok: "success",
  warn: "warning",
  danger: "destructive",
};

export function Badge({
  children,
  tone = "neutral",
  title,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "brand" | "accent" | "ok" | "warn" | "danger";
  title?: string;
}) {
  return (
    <ShadBadge variant={badgeToneMap[tone] || "secondary"} title={title}>
      {children}
    </ShadBadge>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  meta,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        {meta && <div className="flex flex-wrap gap-2 mt-2">{meta}</div>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
    </div>
  );
}

export function WideScreenHint({ children }: { children?: React.ReactNode }) {
  return (
    <div className="md:hidden mb-4 px-3 py-2.5 rounded-lg border border-border/50 bg-muted/30 text-xs text-muted-foreground leading-relaxed">
      {children || "Esta tela compara muitas colunas ao mesmo tempo — as tabelas rolam para o lado. No computador fica mais confortável."}
    </div>
  );
}

export function Skeleton({ h = 14, w = "100%", radius }: { h?: number; w?: number | string; radius?: number }) {
  return (
    <div
      className="animate-pulse rounded-md bg-muted"
      style={{ height: h, width: w as any, borderRadius: radius }}
    />
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <ShadCard aria-busy="true" aria-live="polite">
      <ShadCardContent className="p-4 space-y-3">
        <Skeleton h={11} w="38%" />
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} h={13} w={i === lines - 1 ? "62%" : "100%"} />
        ))}
      </ShadCardContent>
    </ShadCard>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="text-center py-8 px-4 text-muted-foreground">
      {icon && <div className="text-2xl mb-2 opacity-50">{icon}</div>}
      <p className="text-sm font-semibold text-foreground mb-1">{title}</p>
      {hint && <p className="text-xs max-w-[42ch] mx-auto leading-relaxed">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Notice({
  tone = "danger",
  children,
  onDismiss,
}: {
  tone?: "ok" | "warn" | "danger" | "brand";
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  const colors: Record<string, string> = {
    ok: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400",
    warn: "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400",
    danger: "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400",
    brand: "bg-sky-500/10 border-sky-500/20 text-sky-600 dark:text-sky-400",
  };
  return (
    <div className={`flex items-start gap-2 px-3 py-2.5 rounded-lg border text-sm ${colors[tone] || colors.danger}`} role="status">
      <span className="flex-1">{children}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="text-current opacity-60 hover:opacity-100 bg-transparent border-none cursor-pointer p-0 text-sm" aria-label="Fechar">
          ✕
        </button>
      )}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="grid gap-1.5 min-w-0">
      <label htmlFor={htmlFor} className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && <span className="text-[11.5px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function Modal({ title, children, onClose, wide = false }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={cn("max-h-[90vh] w-full overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-2xl", wide ? "max-w-4xl" : "max-w-xl")}>
      <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-base font-semibold">{title}</h2><button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-lg text-muted-foreground hover:bg-muted" aria-label="Fechar">×</button></div>
      {children}
    </div>
  </div>;
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input(props, ref) {
    return (
      <input
        ref={ref}
        {...props}
        className={cn(
          "flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          props.className
        )}
      />
    );
  }
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select(props, ref) {
    return (
      <select
        ref={ref}
        {...props}
        className={cn(
          "flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          props.className
        )}
      />
    );
  }
);

export function Collapsible({
  id,
  summary,
  children,
  defaultOpen = false,
  tone,
  storageKey,
}: {
  id?: string;
  summary: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  tone?: "brand" | "neutral";
  storageKey?: string;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!id) return;
    if (window.location.hash === `#${id}`) { setOpen(true); setTimeout(() => ref.current?.scrollIntoView({ block: "start" }), 0); }
    const handler = () => { if (window.location.hash === `#${id}`) setOpen(true); };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, [id]);

  React.useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = localStorage.getItem(`ec-collapse:${storageKey}`);
      if (saved === "1" || saved === "0") setOpen(saved === "1");
    } catch {}
  }, [storageKey]);

  function toggle() {
    setOpen((v) => {
      const next = !v;
      if (storageKey) { try { localStorage.setItem(`ec-collapse:${storageKey}`, next ? "1" : "0"); } catch {} }
      return next;
    });
  }

  return (
    <div id={id} ref={ref} className="rounded-lg border border-border/50 overflow-hidden bg-card">
      <button
        onClick={toggle}
        aria-expanded={open}
        className="flex items-center gap-3 w-full px-4 py-3 text-left bg-muted/10 hover:bg-accent/20 transition-colors cursor-pointer border-none"
      >
        <span className="flex-1 flex items-center gap-3 flex-wrap min-w-0">{summary}</span>
        <span className="text-muted-foreground text-xs shrink-0">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="px-4 py-3 border-t border-border/30">{children}</div>}
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <div className="inline-flex p-0.5 rounded-lg bg-muted/50 border border-border/50 gap-0.5" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          onClick={() => onChange(option.value)}
          aria-pressed={option.value === value}
          title={option.title}
          className={cn(
            "px-3 py-1.5 text-xs font-medium rounded-md transition-colors border-none cursor-pointer",
            option.value === value
              ? "bg-background text-foreground shadow-sm"
              : "bg-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Menu({
  label,
  items,
  disabled,
  variant = "secondary",
  size = "sm",
  title,
}: {
  label: React.ReactNode;
  items: { label: React.ReactNode; hint?: string; onSelect: () => void }[];
  disabled?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  title?: string;
}) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-menu]')) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div className="relative inline-flex" data-menu>
      <Button variant={variant} size={size} disabled={disabled} title={title} onClick={() => setOpen((v) => !v)}>
        {label} <span className="text-[0.8em]">▾</span>
      </Button>
      {open && (
        <div className="absolute top-full right-0 mt-1.5 z-40 min-w-[180px] p-1 rounded-xl border border-border/50 bg-popover shadow-lg">
          {items.map((item, i) => (
            <button
              key={i}
              className="flex flex-col items-start w-full px-2.5 py-2 rounded-lg text-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors bg-transparent border-none cursor-pointer"
              onClick={() => { setOpen(false); item.onSelect(); }}
            >
              <span>{item.label}</span>
              {item.hint && <span className="text-[11px] text-muted-foreground font-normal">{item.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
