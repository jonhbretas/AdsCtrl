"use client";

// app/report/[id]/page.tsx
// Relatório de uma conta em página limpa — pronta para imprimir/salvar em PDF.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AccountDetail from "@/components/AccountDetail";

function defaultRange() {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const until = new Date();
  const since = new Date();
  since.setDate(until.getDate() - 7);
  return { since: fmt(since), until: fmt(until) };
}

export default function ReportPage() {
  const params = useParams<{ id: string }>();
  const accountId = params.id;
  const [range, setRange] = useState(defaultRange());
  const [account, setAccount] = useState<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const def = defaultRange();
    setRange({ since: q.get("since") || def.since, until: q.get("until") || def.until });

    fetch("/api/accounts")
      .then((r) => r.json())
      .then((d) => {
        const acc = (d.accounts || []).find(
          (a: any) => a.account_id === accountId || `act_${a.account_id}` === accountId
        );
        setAccount(acc || null);
      })
      .finally(() => setReady(true));
  }, [accountId]);

  const name = account?.name || `Conta ${accountId}`;

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 24px", fontFamily: "system-ui, sans-serif", color: "#111" }}>
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } }`}</style>

      <header className="report-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 12, color: "#888", fontWeight: 600, letterSpacing: 0.5 }}>RELATÓRIO DE MÍDIA PAGA · {(account?.platform || "meta").toUpperCase()}</div>
          <h1 style={{ margin: "4px 0 0", fontSize: 26, fontWeight: 700 }}>{name}</h1>
          <p style={{ margin: "4px 0 0", color: "#888", fontSize: 14 }}>
            Período: {range.since} → {range.until}
          </p>
        </div>
        <div className="no-print" style={{ display: "flex", gap: 8 }}>
          <a href="/" style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #e2e2e2", background: "#fff", fontSize: 13, color: "#333", textDecoration: "none" }}>← Overview</a>
          <button onClick={() => window.print()} style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: "#111", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            ⤓ Baixar PDF
          </button>
        </div>
      </header>

      {!ready ? (
        <div style={{ padding: 40, color: "#888" }}>Carregando relatório…</div>
      ) : (
        <div style={{ border: "1px solid #eee", borderRadius: 14, overflow: "hidden", background: "#fff" }}>
          <AccountDetail
            accountId={accountId}
            platform={account?.platform || "meta"}
            since={range.since}
            until={range.until}
            status={account?.status || "—"}
            balance={account?.balance ?? null}
            currency={account?.currency || "BRL"}
          />
        </div>
      )}

      <footer style={{ marginTop: 20, fontSize: 11, color: "#bbb", textAlign: "center" }}>
        Gerado por AdsCtrl · dados ao vivo da plataforma de anúncios
      </footer>
    </div>
  );
}
