"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Download, ArrowLeft, RefreshCw } from "lucide-react";
import ReportDocument, { ReportPayload } from "@/components/ReportDocument";

function safeDecode(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

function defaultRange() {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const until = new Date();
  const since = new Date(); since.setDate(until.getDate() - 7);
  return { since: fmt(since), until: fmt(until) };
}

export default function ReportPage() {
  const params = useParams<{ id: string }>();
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
      .then(async (r) => { const t = await r.text(); const p = t ? JSON.parse(t) : {}; if (!r.ok || p.error) throw new Error(p.error || `Falha (HTTP ${r.status}).`); return p as ReportPayload; })
      .then((p) => alive && setData(p))
      .catch((e) => alive && setError(e?.message ?? "Erro ao montar o relatório."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [accountId]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--color-background)" }}>
      <style>{`@media print { body { background: #fff !important; } .page-shell { box-shadow: none !important; padding: 0 !important; background: #fff !important; } }`}</style>

      <div className="no-print max-w-[740px] mx-auto px-4 pt-5 pb-0 flex items-center gap-2">
        <Link href="/"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium text-foreground no-underline hover:bg-accent transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar
        </Link>
        <div className="flex-1" />
        <button onClick={() => window.print()} disabled={loading || !!error}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold border-none cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-default"
          style={{ backgroundColor: "var(--color-foreground)", color: "var(--color-background)" }}>
          <Download className="h-3.5 w-3.5" /> Baixar PDF
        </button>
      </div>

      <div className="page-shell max-w-[740px] mx-auto mt-3 mb-6 rounded-xl shadow-lg"
        style={{ background: "var(--color-card)", padding: "26px 20px" }}>
        {loading && (
          <div className="py-16 text-center">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Montando o relatório…</p>
          </div>
        )}
        {error && (
          <div className="p-4">
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-red-500/20 bg-red-500/10 text-sm text-red-500">{error}</div>
          </div>
        )}
        {data && <ReportDocument data={data} />}
      </div>
    </div>
  );
}
