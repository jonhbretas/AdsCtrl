"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type LoginFormProps = {
  configured: boolean;
  nextPath: string;
};

export default function LoginForm({ configured, nextPath }: LoginFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.error || "Não foi possível entrar.");

      router.replace(nextPath);
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Não foi possível entrar.");
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 18 }}>
      <div>
        <label
          htmlFor="dashboard-password"
          style={{ display: "block", marginBottom: 8, color: "#344054", fontSize: 14, fontWeight: 650 }}
        >
          Senha do dashboard
        </label>
        <input
          id="dashboard-password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus={configured}
          disabled={!configured || submitting}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          style={{
            boxSizing: "border-box",
            width: "100%",
            height: 48,
            padding: "0 14px",
            border: `1px solid ${error ? "#f04438" : "#d0d5dd"}`,
            borderRadius: 10,
            outline: "none",
            background: configured ? "#fff" : "#f2f4f7",
            color: "#101828",
            fontSize: 16,
          }}
        />
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: "11px 13px",
            border: "1px solid #fecdca",
            borderRadius: 9,
            background: "#fef3f2",
            color: "#b42318",
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!configured || submitting}
        style={{
          height: 48,
          border: 0,
          borderRadius: 10,
          background: !configured || submitting ? "#98a2b3" : "#155eef",
          color: "#fff",
          cursor: !configured || submitting ? "not-allowed" : "pointer",
          fontSize: 15,
          fontWeight: 700,
          boxShadow: "0 1px 2px rgba(16, 24, 40, .08)",
        }}
      >
        {submitting ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
