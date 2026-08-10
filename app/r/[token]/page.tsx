"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Download, RefreshCw } from "lucide-react";
import ReportDocument, { ReportPayload, ReportTab, ReportTabs } from "@/components/ReportDocument";
import { ModeToggle, useReadingMode } from "@/components/ReadingMode";

export default function PublicReportPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [data, setData] = useState<ReportPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ReportTab>("resumo");
  const { compact, choose, docWidth, shellRef, printDocument } = useReadingMode();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/report/public?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (r) => { const t = await r.text(); const p = t ? JSON.parse(t) : {}; if (!r.ok || p.error) throw new Error(p.error || `Falha (HTTP ${r.status}).`); return p as ReportPayload; })
      .then((p) => alive && setData(p))
      .catch((e) => alive && setError(e?.message ?? "Erro ao abrir o relatório."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [token]);

  return (
    <div className="doc-light min-h-screen">
      <meta name="robots" content="noindex, nofollow" />
      <style>{`
        .page-shell { overflow-x: auto; }
        @media print {
          body { background: #fff !important; }
          .page-shell { box-shadow: none !important; padding: 0 !important; overflow: visible !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print max-w-[740px] mx-auto px-4 pt-5 pb-0 flex items-center gap-2.5 flex-wrap">
        <span className="text-xs text-muted-foreground">
          Relatório de mídia paga · {(data?.brand || "").trim() || data?.account?.name || "Cliente"}
        </span>
        <div className="flex-1" />
        {data?.creatives && <ReportTabs active={tab} onChange={setTab} creativesAvailable={true} />}
        <ModeToggle compact={compact} onChange={choose} />
        <button onClick={printDocument} disabled={loading || !!error}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold border-none cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-default"
          style={{ backgroundColor: "var(--color-foreground)", color: "var(--color-background)" }}>
          <Download className="h-3.5 w-3.5" /> Salvar em PDF
        </button>
      </div>

      <div ref={shellRef} className="page-shell max-w-[740px] mx-auto mt-3 mb-6 rounded-xl shadow-lg"
        style={{ background: "var(--color-card)", padding: compact ? "16px 12px" : "26px 20px" }}>
        {loading && (
          <div className="py-16 text-center">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Carregando o relatório…</p>
          </div>
        )}
        {error && (
          <div className="p-4">
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-red-500/20 bg-red-500/10 text-sm text-red-500">{error}</div>
          </div>
        )}
        {data && <ReportDocument data={data} compact={compact} width={docWidth} activeTab={tab} />}
      </div>
    </div>
  );
}
