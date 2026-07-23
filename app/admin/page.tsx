"use client";

// app/admin/page.tsx
// Administração de grupos: criar/editar/excluir grupos e atribuir contas a grupos.

import { useEffect, useMemo, useState } from "react";

interface Group {
  id: string;
  name: string;
  color: string;
}
interface Account {
  account_id: string;
  name: string;
  status: string;
  group_id: string | null;
}

const PALETTE = ["#3987e5", "#16a34a", "#db2777", "#f59e0b", "#7c3aed", "#0891b2", "#dc2626", "#4b5563"];

export default function Admin() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PALETTE[0]);

  async function load() {
    setError(null);
    try {
      const r = await fetch("/api/accounts");
      const text = await r.text();
      const d = text ? JSON.parse(text) : {};
      if (!r.ok || d.error) throw new Error(d.error || `Falha ao carregar (HTTP ${r.status}).`);
      setAccounts(d.accounts || []);
      setGroups(d.groups || []);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const countByGroup = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of accounts) if (a.group_id) m[a.group_id] = (m[a.group_id] || 0) + 1;
    return m;
  }, [accounts]);

  async function api(url: string, opts: RequestInit): Promise<any> {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
      const text = await r.text();
      const d = text ? JSON.parse(text) : {};
      if (!r.ok || d.error) throw new Error(d.error || `Falha (HTTP ${r.status}).`);
      return d;
    } finally {
      setBusy(false);
    }
  }

  async function createGroup() {
    const name = newName.trim();
    if (!name) return;
    try {
      await api("/api/groups", { method: "POST", body: JSON.stringify({ name, color: newColor }) });
      setNewName("");
      await load();
    } catch (e: any) {
      setError(e?.message);
    }
  }

  async function updateGroup(id: string, patch: Partial<Group>) {
    try {
      await api("/api/groups", { method: "PATCH", body: JSON.stringify({ id, ...patch }) });
      await load();
    } catch (e: any) {
      setError(e?.message);
    }
  }

  async function deleteGroup(id: string, name: string) {
    if (!confirm(`Excluir o grupo "${name}"? As contas ficarão sem grupo.`)) return;
    try {
      await api(`/api/groups?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setError(e?.message);
    }
  }

  async function assignAccount(account_id: string, group_id: string) {
    // otimista: atualiza local antes do refetch
    setAccounts((prev) =>
      prev.map((a) => (a.account_id === account_id ? { ...a, group_id: group_id || null } : a))
    );
    try {
      await api("/api/accounts/group", {
        method: "POST",
        body: JSON.stringify({ account_id, group_id: group_id || null }),
      });
    } catch (e: any) {
      setError(e?.message);
      await load(); // reverte em caso de erro
    }
  }

  if (loading) return <div style={{ padding: 40, fontFamily: "system-ui" }}>Carregando administração…</div>;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>Grupos de contas</h1>
          <p style={{ margin: "4px 0 0", color: "#6b6b6b", fontSize: 14 }}>
            Crie grupos e atribua as {accounts.length} contas a eles.
          </p>
        </div>
        <a href="/" style={{ fontSize: 14, color: "#3987e5", textDecoration: "none" }}>
          ← Voltar ao overview
        </a>
      </header>

      {error && (
        <div style={{ background: "#fceceb", color: "#a32d2d", padding: "10px 14px", borderRadius: 8, marginBottom: 20, fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* CRIAR GRUPO */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 12px" }}>Novo grupo</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createGroup()}
            placeholder="Nome do grupo (ex: Cliente X)"
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, minWidth: 260 }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                aria-label={`cor ${c}`}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: c,
                  border: newColor === c ? "2px solid #111" : "2px solid transparent",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
          <button
            onClick={createGroup}
            disabled={busy || !newName.trim()}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: newName.trim() ? "#111" : "#ccc",
              color: "#fff",
              fontSize: 14,
              cursor: newName.trim() ? "pointer" : "default",
            }}
          >
            Criar
          </button>
        </div>
      </section>

      {/* LISTA DE GRUPOS */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 12px" }}>Grupos ({groups.length})</h2>
        {groups.length === 0 ? (
          <p style={{ color: "#888", fontSize: 14 }}>Nenhum grupo ainda. Crie o primeiro acima.</p>
        ) : (
          <div style={{ border: "1px solid #eee", borderRadius: 12, overflow: "hidden" }}>
            {groups.map((g, i) => (
              <div
                key={g.id}
                style={{
                  padding: "12px 16px",
                  borderTop: i === 0 ? "none" : "1px solid #f0f0f0",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <input
                  type="color"
                  value={g.color}
                  onChange={(e) => updateGroup(g.id, { color: e.target.value })}
                  style={{ width: 28, height: 28, border: "none", background: "none", cursor: "pointer", padding: 0 }}
                />
                <input
                  defaultValue={g.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== g.name) updateGroup(g.id, { name: v });
                  }}
                  style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid #eee", fontSize: 14 }}
                />
                <span style={{ fontSize: 13, color: "#888", minWidth: 90, textAlign: "right" }}>
                  {countByGroup[g.id] || 0} conta(s)
                </span>
                <button
                  onClick={() => deleteGroup(g.id, g.name)}
                  disabled={busy}
                  style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #f0d0d0", background: "#fff", color: "#a32d2d", fontSize: 13, cursor: "pointer" }}
                >
                  Excluir
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ATRIBUIR CONTAS */}
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 12px" }}>Contas → grupo</h2>
        <div style={{ border: "1px solid #eee", borderRadius: 12, overflow: "hidden" }}>
          {[...accounts]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((a, i) => (
              <div
                key={a.account_id}
                style={{
                  padding: "10px 16px",
                  borderTop: i === 0 ? "none" : "1px solid #f0f0f0",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <span style={{ flex: 1, fontSize: 14 }}>{a.name}</span>
                {a.status !== "ACTIVE" && (
                  <span style={{ fontSize: 11, color: "#a32d2d" }}>● {a.status}</span>
                )}
                <select
                  value={a.group_id || ""}
                  onChange={(e) => assignAccount(a.account_id, e.target.value)}
                  style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 14, minWidth: 200 }}
                >
                  <option value="">— sem grupo —</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}
