"use client";

import { isValidElement, type ReactNode } from "react";

export type SortDirection = "asc" | "desc";
export type SortState<Key extends string> = {
  key: Key;
  direction: SortDirection;
};
export type SortValue = string | number | boolean | null | undefined;

function textFromNode(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textFromNode).join("");
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textFromNode(node.props.children);
  }
  return "";
}

export function nextSort<Key extends string>(
  current: SortState<Key>,
  key: Key,
  initialDirection: SortDirection = "asc"
): SortState<Key> {
  if (current.key !== key) return { key, direction: initialDirection };
  return {
    key,
    direction: current.direction === "asc" ? "desc" : "asc",
  };
}

// Valores ausentes ficam sempre por último, tanto no crescente quanto no
// decrescente. Isso evita que "—" apareça antes das métricas disponíveis.
export function compareSortValues(
  left: SortValue,
  right: SortValue,
  direction: SortDirection
): number {
  const leftMissing =
    left == null || (typeof left === "number" && Number.isNaN(left));
  const rightMissing =
    right == null || (typeof right === "number" && Number.isNaN(right));
  if (leftMissing && rightMissing) return 0;
  if (leftMissing) return 1;
  if (rightMissing) return -1;

  let result: number;
  if (typeof left === "number" && typeof right === "number") {
    result = left - right;
  } else if (typeof left === "boolean" && typeof right === "boolean") {
    result = Number(left) - Number(right);
  } else {
    result = String(left).localeCompare(String(right), "pt-BR", {
      numeric: true,
      sensitivity: "base",
    });
  }
  return direction === "asc" ? result : -result;
}

export function SortButton<Key extends string>({
  column,
  sort,
  onSort,
  children,
  align = "right",
  initialDirection = "asc",
}: {
  column: Key;
  sort: SortState<Key>;
  onSort: (next: SortState<Key>) => void;
  children: ReactNode;
  align?: "left" | "center" | "right";
  initialDirection?: SortDirection;
}) {
  const active = sort.key === column;
  const arrow = active ? (sort.direction === "asc" ? "↑" : "↓") : "↕";
  const nextDirection = active
    ? sort.direction === "asc"
      ? "decrescente"
      : "crescente"
    : initialDirection === "asc"
      ? "crescente"
      : "decrescente";
  const accessibleLabel = textFromNode(children) || "esta coluna";

  return (
    <button
      type="button"
      onClick={() => onSort(nextSort(sort, column, initialDirection))}
      aria-label={`Ordenar ${accessibleLabel} em ordem ${nextDirection}`}
      aria-pressed={active}
      title={`Ordenar em ordem ${nextDirection}`}
      style={{
        width: "100%",
        minWidth: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent:
          align === "left"
            ? "flex-start"
            : align === "center"
              ? "center"
              : "flex-end",
        gap: 5,
        padding: 0,
        border: 0,
        background: "transparent",
        color: active ? "#333" : "inherit",
        font: "inherit",
        fontWeight: active ? 800 : "inherit",
        textTransform: "inherit",
        letterSpacing: "inherit",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      <span>{children}</span>
      <span
        aria-hidden="true"
        style={{
          color: active ? "#286fc9" : "#c5c5c0",
          fontSize: "0.95em",
          lineHeight: 1,
        }}
      >
        {arrow}
      </span>
    </button>
  );
}
