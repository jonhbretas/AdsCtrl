"use client";

// app/r/[token]/page.tsx
// Relatório aberto pelo cliente, sem login. O token na URL define conta,
// período e validade — ver lib/report-token.ts.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ReportDocument, { ReportPayload } from "@/components/ReportDocument";
import BrandMark from "@/components/BrandMark";

export default function PublicReportPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [data, setData] = useState<ReportPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/report/public?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (r) => {
        const text = await r.text();
        const payload = text ? JSON.parse(text) : {};
        if (!r.ok || payload.error) throw new Error(payload.error || `Falha (HTTP ${r.status}).`);
        return payload as ReportPayload;
      })
      .then((payload) => alive && setData(payload))
      .catch((e) => alive && setError(e?.message ?? "Erro ao abrir o relatório."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [token]);

  return (
    <div style={{ background: "#f4f5f7", minHeight: "100vh", padding: "24px 16px 60px" }}>
      {/* Link privado: não deve ser indexado por buscador. */}
      <meta name="robots" content="noindex, nofollow" />
      <style>{`@media print { body { background: #fff !important; } .page-shell { box-shadow: none !important; padding: 0 !important; } .no-print { display: none !important; } }`}</style>

      <div className="no-print" style={{ maxWidth: 740, margin: "0 auto 16px", display: "flex", alignItems: "center", gap: 8 }}>
        <BrandMark size={22} />
        <span style={{ fontSize: 12, color: "#8a919e" }}>
          Relatório de mídia paga · Assertivus
        </span>
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
          ⤓ Salvar em PDF
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
            Carregando o relatório…
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
