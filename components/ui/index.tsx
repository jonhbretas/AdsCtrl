"use client";

// components/ui/index.tsx
// Primitivos do painel interno (identidade Ectolab).
//
// Por que existem: o sistema tinha 274 cores hex distintas em estilo inline, o
// que também significava zero :hover e zero :focus-visible. Aqui os estados
// vivem em CSS de verdade, e a cor vem sempre de token — não de literal.
//
// As páginas /r e /c (que o CLIENTE abre) NÃO usam estes componentes: elas
// seguem a marca Assertivus.

import React from "react";

/* ---------------------------------------------------------------- Button ---
   Três níveis, e a diferença entre eles é intencionalmente grande:
   primary domina, secondary acompanha, ghost desaparece. Destrutivo é
   vermelho e nunca é o primário de uma tela. */
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

export function Button({
  variant = "secondary",
  size = "md",
  full,
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      data-variant={variant}
      data-size={size}
      className={`ec-btn${full ? " ec-btn--full" : ""}${rest.className ? ` ${rest.className}` : ""}`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ Card ---
   Superfície opaca de propósito: vidro em card de conteúdo custa desempenho e
   atrapalha a leitura de número. `tone` pinta apenas a borda esquerda. */
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
  /** Elemento a renderizar — "article"/"section" quando o card é conteúdo
      autônomo, para o leitor de tela não ver só uma pilha de div. */
  as?: "div" | "article" | "section" | "li";
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      {...rest}
      data-tone={tone || "neutral"}
      className={`ec-card${padded ? " ec-card--padded" : ""}${className ? ` ${className}` : ""}`}
    >
      {children}
    </Tag>
  );
}

/* ----------------------------------------------------------------- Badge --- */
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
    <span className="ec-badge" data-tone={tone} title={title}>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------ PageHeader ---
   Um plano dominante por tela: título, uma linha de contexto e a ação
   principal à direita. */
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
    <header className="ec-pagehead">
      <div className="ec-pagehead__text">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
        {meta && <div className="ec-pagehead__meta">{meta}</div>}
      </div>
      {actions && <div className="ec-pagehead__actions">{actions}</div>}
    </header>
  );
}

/* ------------------------------------------------------- WideScreenHint ---
   Criativos e Raio-X comparam 11 e 13 colunas: o valor delas está em ver tudo
   lado a lado, e nenhuma reorganização faz isso caber em 390px. Em vez de
   fingir que cabe, a tela avisa — e diz que a tabela rola de lado, porque
   muita gente simplesmente não descobre que rola. Só aparece no celular. */
export function WideScreenHint({ children }: { children?: React.ReactNode }) {
  return (
    <p className="ec-widehint">
      {children || "Esta tela compara muitas colunas ao mesmo tempo — as tabelas rolam para o lado. No computador ela fica bem mais confortável."}
    </p>
  );
}

/* -------------------------------------------------------------- Skeleton ---
   Substitui a frase "Carregando…", que fazia o layout saltar quando os dados
   chegavam. O esqueleto ocupa o espaço final desde o primeiro quadro. */
export function Skeleton({ h = 14, w = "100%", radius }: { h?: number; w?: number | string; radius?: number }) {
  return <span className="ec-skeleton" style={{ display: "block", height: h, width: w, borderRadius: radius }} />;
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="ec-card ec-card--padded" aria-busy="true" aria-live="polite">
      <Skeleton h={11} w="38%" />
      <div style={{ height: 12 }} />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <Skeleton h={13} w={i === lines - 1 ? "62%" : "100%"} />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ EmptyState ---
   Estado vazio que diz o que fazer em seguida, em vez de só "sem dados". */
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
    <div className="ec-empty">
      {icon && <div className="ec-empty__icon" aria-hidden="true">{icon}</div>}
      <p className="ec-empty__title">{title}</p>
      {hint && <p className="ec-empty__hint">{hint}</p>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- Notice ---
   Mensagem de erro/sucesso no fluxo. role="status" para leitor de tela
   anunciar sem roubar o foco. */
export function Notice({
  tone = "danger",
  children,
  onDismiss,
}: {
  tone?: "ok" | "warn" | "danger" | "brand";
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div className="ec-notice" data-tone={tone} role="status">
      <span>{children}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="ec-notice__x" aria-label="Fechar aviso">
          ✕
        </button>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- Field --- */
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
    <label className="ec-field" htmlFor={htmlFor}>
      <span className="ec-field__label">{label}</span>
      {children}
      {hint && <span className="ec-field__hint">{hint}</span>}
    </label>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input(props, ref) {
    return <input ref={ref} {...props} className={`ec-input${props.className ? ` ${props.className}` : ""}`} />;
  }
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select(props, ref) {
    return <select ref={ref} {...props} className={`ec-input${props.className ? ` ${props.className}` : ""}`} />;
  }
);

/* ----------------------------------------------------------- Collapsible ---
   Painel que só MONTA o conteúdo quando aberto.

   A diferença em relação ao <details> nativo importa aqui: com <details>, o
   React renderiza os filhos mesmo fechado — o navegador só os esconde. Como o
   conteúdo destes painéis busca dados no efeito de montagem, um cliente
   expandido disparava as consultas de TODAS as contas vinculadas de uma vez,
   fechadas ou não. Montando sob demanda, só paga quem abre. */
export function Collapsible({
  summary,
  children,
  defaultOpen = false,
  tone,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  tone?: "brand" | "neutral";
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <section className="ec-collapse" data-open={open ? "true" : undefined} data-tone={tone}>
      <button className="ec-collapse__head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="ec-collapse__summary">{summary}</span>
        <span className="ec-collapse__chevron" aria-hidden="true">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="ec-collapse__body">{children}</div>}
    </section>
  );
}

/* ------------------------------------------------------------------ Menu ---
   Botão que abre uma lista de ações. Existe para o caso em que a ação é uma
   só mas o alvo varia (sincronizar Meta, Google ou as duas): três botões
   lado a lado pesariam mais na tela do que a escolha merece. */
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
  const ref = React.useRef<HTMLDivElement>(null);

  // Sem isto o menu fica aberto atrás do próximo clique — e o usuário não
  // tem para onde clicar para desistir.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="ec-menu" ref={ref}>
      <Button
        variant={variant}
        size={size}
        disabled={disabled}
        title={title}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        {label} <span aria-hidden="true" style={{ fontSize: "0.8em" }}>▾</span>
      </Button>
      {open && (
        <div className="ec-menu__list" role="menu">
          {items.map((item, index) => (
            <button
              key={index}
              type="button"
              role="menuitem"
              className="ec-menu__item"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              <span>{item.label}</span>
              {item.hint && <small>{item.hint}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ SegmentedControl ---
   Substitui as fileiras de "chips" que hoje se repetem em cada tela com
   estilo próprio. Um só componente, um só comportamento de teclado. */
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
    <div className="ec-seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          onClick={() => onChange(option.value)}
          data-active={option.value === value ? "true" : undefined}
          aria-pressed={option.value === value}
          title={option.title}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
