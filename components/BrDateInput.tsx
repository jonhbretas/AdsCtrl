"use client";

import { useEffect, useState } from "react";

function toBr(value: string | null | undefined) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

function toIso(value: string) {
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  if (date.getUTCFullYear() !== Number(match[3]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[1])) return "";
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function BrDateInput({ value, onChange, className, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & { value?: string | null; onChange: (value: string) => void }) {
  const [text, setText] = useState(toBr(value));
  useEffect(() => setText(toBr(value)), [value]);
  return <input {...props} type="text" inputMode="numeric" placeholder="dd-mm-aaaa" value={text} onChange={(event) => { const next = event.target.value.replace(/[^\d-]/g, "").slice(0, 10); setText(next); const iso = toIso(next); if (iso || next === "") onChange(iso); }} onBlur={() => { if (text && !toIso(text)) setText(toBr(value)); }} className={className} />;
}
