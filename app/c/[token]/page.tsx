"use client";

// app/c/[token]/page.tsx
// Painel do cliente: métricas ao vivo por período e a lista dos relatórios
// semanais já enviados. Sem login e sem navegação — o link é a única porta,
// e ele abre só este cliente.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ReportDocument, { ReportPayload } from "@/components/ReportDocument";
import BrandMark from "@/components/BrandMark";
import { ModeToggle, useReadingMode } from "@/components/ReadingMode";

interface HistoryItem {
  since: string;
  until: string;
  sent_at: string;
  url: string;
}
interface DashboardPayload {
  client: { name: string };
  period: string;
  period_label: string;
  range: { since: string; until: string };
  cached: boolean;
  fetched_at: string;
  report: ReportPayload;
  reports: HistoryItem[];
  error?: string;
}

const PERIODS: { key: string; label: string }[] = [
  { key: "7d", label: "7 dias" },
  { key: "14d", label: "14 dias" },
  { key: "30d", label: "30 dias" },
  { key: "mtd", label: "Mês atual" },
];

const brDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

export default function ClientDashboardPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [period, setPeriod] = useState("7d");
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { compact, choose, docWidth, shellRef, printDocument } = useReadingMode();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`/api/dashboard/public?token=${encodeURIComponent(token)}&period=${period}`, { cache: "no-store" })
      .then(async (r) => {
        const text = await r.text();
        const payload = text ? JSON.parse(text) : {};
        if (!r.ok || payload.error) throw new Error(payload.error || `Falha (HTTP ${r.status}).`);
        return payload as DashboardPayload;
      })
      .then((payload) => alive && setData(payload))
      .catch((e) => alive && setError(e?.message ?? "Erro ao abrir o painel."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [token, period]);

  return (
    <div style={{ background: "#f4f5f7", minHeight: "100vh", padding: "22px 16px 60px" }}>
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

      <div className="no-print" style={{ maxWidth: 740, margin: "0 auto 14px", display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <BrandMark size={24} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#12161f" }}>
          {data?.client.name ?? "Painel do cliente"}
        </span>
        <span style={{ fontSize: 12, color: "#8a919e" }}>· métricas de mídia paga</span>
        <span style={{ flex: 1 }} />
        <ModeToggle compact={compact} onChange={choose} />
        <button
          onClick={printDocument}
          disabled={loading || !!error}
          title="O PDF sai sempre no formato de documento"
          style={{
            padding: "7px 14px",
            borderRadius: 9,
            border: "none",
            background: loading || error ? "#c9ccd3" : "#12161f",
            color: "#fff",
            fontSize: 12.5,
            fontWeight: 650,
            cursor: loading || error ? "default" : "pointer",
          }}
        >
          ⤓ Salvar em PDF
        </button>
      </div>

      <div className="no-print" style={{ maxWidth: 740, margin: "0 auto 14px", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {PERIODS.map((option) => (
          <button
            key={option.key}
            onClick={() => setPeriod(option.key)}
            style={{
              padding: "6px 13px",
              borderRadius: 999,
              border: `1px solid ${period === option.key ? "#12161f" : "#e2e4e9"}`,
              background: period === option.key ? "#12161f" : "#fff",
              color: period === option.key ? "#fff" : "#5c6373",
              fontSize: 12,
              fontWeight: 650,
              cursor: "pointer",
            }}
          >
            {option.label}
          </button>
        ))}
        {data && (
          <span style={{ fontSize: 11, color: "#9aa1ad", marginLeft: 4 }}>
            {brDate(data.range.since)} a {brDate(data.range.until)}
            {" · atualizado "}
            {new Date(data.fetched_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </span>
        )}
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
            Carregando as métricas…
          </div>
        )}
        {error && (
          <div style={{ padding: 24 }}>
            <div style={{ background: "#fdf0ef", border: "1px solid #f0cfcc", color: "#a3372f", padding: "12px 14px", borderRadius: 10, fontSize: 13 }}>
              {error}
            </div>
          </div>
        )}
        {data && !loading && <ReportDocument data={data.report} compact={compact} width={docWidth} />}
      </div>

      {data && data.reports.length > 0 && (
        <div
          className="no-print"
          style={{
            maxWidth: 740,
            margin: "16px auto 0",
            background: "#fff",
            borderRadius: 14,
            padding: "18px 20px",
            border: "1px solid #e7e9ef",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: "#7c8493", marginBottom: 10 }}>
            Relatórios semanais anteriores
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {data.reports.map((item) => (
              <a
                key={`${item.since}-${item.until}`}
                href={item.url}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 11px",
                  borderRadius: 9,
                  border: "1px solid #eceef3",
                  background: "#fcfcfd",
                  textDecoration: "none",
                  color: "#12161f",
                  fontSize: 12.5,
                }}
              >
                <span style={{ fontWeight: 650 }}>
                  {brDate(item.since)} a {brDate(item.until)}
                </span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: "#8a919e" }}>
                  enviado em {new Date(item.sent_at).toLocaleDateString("pt-BR")}
                </span>
                <span style={{ color: "#2f6fe4", fontWeight: 650 }}>abrir →</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
