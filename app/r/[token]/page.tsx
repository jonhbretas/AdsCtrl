"use client";

// app/r/[token]/page.tsx
// Relatório aberto pelo cliente, sem login. O token na URL define conta,
// período e validade — ver lib/report-token.ts.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ReportDocument, { ReportPayload } from "@/components/ReportDocument";
import BrandMark from "@/components/BrandMark";
import { ModeToggle, useReadingMode } from "@/components/ReadingMode";

export default function PublicReportPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [data, setData] = useState<ReportPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { compact, choose, docWidth, shellRef, printDocument } = useReadingMode();

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
      {/* O documento tem largura de A4 (700px) e não encolhe — é o mesmo
          desenho que sai na impressão. Em tela estreita ele rola DENTRO do
          cartão; sem isso, vaza para fora e corta o conteúdo à direita.
          Na impressão o recorte precisa sumir, ou a página sai cortada. */}
      <style>{`
        .page-shell { overflow-x: auto; }
        @media print {
          body { background: #fff !important; }
          .page-shell { box-shadow: none !important; padding: 0 !important; overflow: visible !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print" style={{ maxWidth: 740, margin: "0 auto 16px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <BrandMark size={22} />
        <span style={{ fontSize: 12, color: "#8a919e" }}>
          Relatório de mídia paga · Assertivus
        </span>
        <span style={{ flex: 1 }} />
        <ModeToggle compact={compact} onChange={choose} />
        <button
          onClick={printDocument}
          disabled={loading || !!error}
          title="O PDF sai sempre no formato de documento"
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
        ref={shellRef}
        className="page-shell"
        style={{
          maxWidth: 740,
          margin: "0 auto",
          background: "#fff",
          borderRadius: 14,
          // Empilhado, cada pixel de margem é conteúdo perdido.
          padding: compact ? "16px 12px" : "26px 20px",
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
        {data && <ReportDocument data={data} compact={compact} width={docWidth} />}
      </div>
    </div>
  );
}
