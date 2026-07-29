"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Download, ChevronRight, Calendar, RefreshCw } from "lucide-react";
import ReportDocument, { ReportPayload } from "@/components/ReportDocument";
import { ModeToggle, useReadingMode } from "@/components/ReadingMode";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface HistoryItem {
  since: string; until: string; sent_at: string; url: string;
}
interface DashboardPayload {
  client: { name: string };
  period: string; period_label: string;
  range: { since: string; until: string };
  cached: boolean; fetched_at: string;
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

const brDate = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };

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
    setLoading(true); setError(null);
    fetch(`/api/dashboard/public?token=${encodeURIComponent(token)}&period=${period}`, { cache: "no-store" })
      .then(async (r) => { const t = await r.text(); const p = t ? JSON.parse(t) : {}; if (!r.ok || p.error) throw new Error(p.error || `Falha (HTTP ${r.status}).`); return p as DashboardPayload; })
      .then((p) => alive && setData(p))
      .catch((e) => alive && setError(e?.message ?? "Erro ao abrir o painel."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [token, period]);

  return (
    <div className="doc-light min-h-screen">
      <style>{`
        .page-shell { overflow-x: auto; }
        @media print {
          body { background: #fff !important; }
          .page-shell { box-shadow: none !important; padding: 0 !important; overflow: visible !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Header */}
      <div className="no-print max-w-[740px] mx-auto px-4 pt-5 pb-0 flex items-center gap-2.5 flex-wrap">
        <span className="text-sm font-bold text-foreground">{data?.client.name ?? "Painel do cliente"}</span>
        <span className="text-xs text-muted-foreground">· métricas de mídia paga</span>
        <div className="flex-1" />
        <ModeToggle compact={compact} onChange={choose} />
        <button onClick={printDocument} disabled={loading || !!error}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border-none cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-default"
          style={{ backgroundColor: "var(--color-foreground)", color: "var(--color-background)" }}>
          <Download className="h-3.5 w-3.5" /> Salvar em PDF
        </button>
      </div>

      {/* Period selector */}
      <div className="no-print max-w-[740px] mx-auto px-4 pt-3 pb-0 flex items-center gap-1.5 flex-wrap">
        {PERIODS.map((opt) => (
          <button key={opt.key} onClick={() => setPeriod(opt.key)}
            className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer",
              period === opt.key ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground bg-transparent"
            )}>
            {opt.label}
          </button>
        ))}
        {data && (
          <span className="text-[11px] text-muted-foreground ml-2">
            {brDate(data.range.since)} a {brDate(data.range.until)}
            {" · "}
            {new Date(data.fetched_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </span>
        )}
      </div>

      {/* Document shell */}
      <div ref={shellRef} className="page-shell max-w-[740px] mx-auto mt-3 mb-6 rounded-xl shadow-lg"
        style={{ background: "var(--color-card)", padding: compact ? "16px 12px" : "26px 20px" }}>
        {loading && (
          <div className="py-16 text-center">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Carregando as métricas…</p>
          </div>
        )}
        {error && (
          <div className="p-4">
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-red-500/20 bg-red-500/10 text-sm text-red-500">
              {error}
            </div>
          </div>
        )}
        {data && !loading && <ReportDocument data={data.report} compact={compact} width={docWidth} />}
      </div>

      {/* Historical reports */}
      {data && data.reports.length > 0 && (
        <div className="no-print max-w-[740px] mx-auto px-4 pb-10">
          <div className="rounded-xl border border-border/50 bg-card p-5">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">
              Relatórios semanais anteriores
            </h3>
            <div className="space-y-1.5">
              {data.reports.map((item) => (
                <a key={`${item.since}-${item.until}`} href={item.url}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-border/50 bg-muted/20 hover:bg-accent transition-colors no-underline group">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">{brDate(item.since)} a {brDate(item.until)}</span>
                  <span className="flex-1" />
                  <span className="text-[11px] text-muted-foreground">enviado em {new Date(item.sent_at).toLocaleDateString("pt-BR")}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-primary group-hover:translate-x-0.5 transition-transform" />
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
