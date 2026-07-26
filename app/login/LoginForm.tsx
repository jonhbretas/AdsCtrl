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
        <label htmlFor="dashboard-password" className="ec-login__label">
          Senha do dashboard
        </label>
        {/* 16px de fonte não é estética: abaixo disso o Safari no iPhone dá
            zoom automático ao focar o campo. */}
        <input
          id="dashboard-password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus={configured}
          disabled={!configured || submitting}
          required
          aria-invalid={error ? true : undefined}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="ec-input ec-login__input"
          data-error={error ? "true" : undefined}
        />
      </div>

      {error && (
        <div role="alert" className="ec-notice" data-tone="danger">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!configured || submitting}
        className="ec-btn ec-btn--full ec-login__submit"
        data-variant="primary"
        data-size="md"
      >
        {submitting ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
