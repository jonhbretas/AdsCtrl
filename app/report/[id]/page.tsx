"use client";

// app/report/[id]/page.tsx
// Relatório do cliente em página limpa — pronta para imprimir/salvar em PDF.
// Busca tudo de uma vez (/api/report) para o documento nunca ir para a
// impressora com metade dos blocos ainda carregando.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ReportDocument, { ReportPayload } from "@/components/ReportDocument";

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function defaultRange() {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const until = new Date();
  const since = new Date();
  since.setDate(until.getDate() - 7);
  return { since: fmt(since), until: fmt(until) };
}

export default function ReportPage() {
  const params = useParams<{ id: string }>();
  // Contas Google têm ":" no id ("google:123") e chegam aqui percent-encoded.
  const accountId = safeDecode(params.id);
  const [data, setData] = useState<ReportPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const def = defaultRange();
    const since = q.get("since") || def.since;
    const until = q.get("until") || def.until;

    let alive = true;
    setLoading(true);
    fetch(`/api/report?account_id=${encodeURIComponent(accountId)}&since=${since}&until=${until}`, { cache: "no-store" })
      .then(async (r) => {
        const text = await r.text();
        const payload = text ? JSON.parse(text) : {};
        if (!r.ok || payload.error) throw new Error(payload.error || `Falha (HTTP ${r.status}).`);
        return payload as ReportPayload;
      })
      .then((payload) => alive && setData(payload))
      .catch((e) => alive && setError(e?.message ?? "Erro ao montar o relatório."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [accountId]);

  return (
    <div style={{ background: "#f4f5f7", minHeight: "100vh", padding: "24px 16px 60px" }}>
      <style>{`@media print { body { background: #fff !important; } .page-shell { box-shadow: none !important; padding: 0 !important; background: #fff !important; } }`}</style>

      <div className="no-print" style={{ maxWidth: 740, margin: "0 auto 16px", display: "flex", gap: 8, alignItems: "center" }}>
        <a href="/" style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #e2e2e2", background: "#fff", fontSize: 13, color: "#333", textDecoration: "none" }}>
          ← Voltar
        </a>
        <span style={{ flex: 1 }} />
        <button
          onClick={() => window.print()}
          disabled={loading || !!error}
          style={{
            padding: "8px 18px",
            borderRadius: 10,
            border: "none",
            background: loading || error ? "#c9ccd3" : "#12161f",
            color: "#fff",
            fontSize: 13,
            fontWeight: 650,
            cursor: loading || error ? "default" : "pointer",
          }}
        >
          ⤓ Baixar PDF
        </button>
      </div>

      <div
        className="page-shell"
        style={{
          maxWidth: 740,
          margin: "0 auto",
          background: "#fff",
          borderRadius: 14,
          padding: "26px 20px",
          boxShadow: "0 1px 3px rgba(16,24,40,.08), 0 12px 32px rgba(16,24,40,.06)",
        }}
      >
        {loading && (
          <div style={{ padding: 60, textAlign: "center", color: "#8a919e", fontSize: 14 }}>
            Montando o relatório com os dados ao vivo das plataformas…
          </div>
        )}
        {error && (
          <div style={{ padding: 24 }}>
            <div style={{ background: "#fdf0ef", border: "1px solid #f0cfcc", color: "#a3372f", padding: "12px 14px", borderRadius: 10, fontSize: 13 }}>
              {error}
            </div>
          </div>
        )}
        {data && <ReportDocument data={data} />}
      </div>
    </div>
  );
}
