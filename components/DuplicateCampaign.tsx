"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select, Notice } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Copy, X, AlertTriangle, CheckCircle2, Info } from "lucide-react";

interface Conta { account_id: string; name: string; platform?: string; hidden?: boolean; }
interface Estrutura { name: string; objective: string; adsets: { name: string; ads: number }[]; needsRemap: { pages: string[]; pixels: string[]; instagram: string[]; audiences: number }; }
interface Resultado { dryRun: boolean; campaign: { id?: string; name: string }; adsets: { name: string; id?: string; error?: string; approximate?: boolean }[]; warnings: string[]; target?: string; }

export default function DuplicateCampaign({ sourceAccountId, campaignId, campaignName, onClose }: { sourceAccountId: string; campaignId: string; campaignName: string; onClose: () => void; }) {
  const [contas, setContas] = useState<Conta[]>([]);
  const [destino, setDestino] = useState("");
  const [estrutura, setEstrutura] = useState<Estrutura | null>(null);
  const [ativos, setAtivos] = useState<{ pages: string[]; pixels: { id: string; name?: string }[] } | null>(null);
  const [pagina, setPagina] = useState("");
  const [pixel, setPixel] = useState("");
  const [sufixo, setSufixo] = useState("[cópia]");
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState<"dry" | "real" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [agendado, setAgendado] = useState(false);

  useEffect(() => {
    fetch("/api/accounts").then(async (r) => { const d = await r.json(); if (r.ok) setContas((d.accounts || []).filter((a: Conta) => a.platform === "meta" && a.account_id !== sourceAccountId && !a.hidden)); }).catch(() => {});
  }, [sourceAccountId]);

  useEffect(() => {
    if (!destino) { setEstrutura(null); setAtivos(null); setPagina(""); setPixel(""); return; }
    setCarregando(true); setErro(null);
    const params = new URLSearchParams({ source_account_id: sourceAccountId, target_account_id: destino, campaign_id: campaignId });
    fetch(`/api/account/raw?${params}`, { cache: "no-store" }).then(async (r) => { const d = await r.json(); if (!r.ok || d.error) throw new Error(d.error || "Falha."); setEstrutura(d.structure || null); setAtivos(d.assets || null); const primeiro = d.assets?.pages?.[0] ?? ""; setPagina(primeiro); const primPixel = d.assets?.pixels?.[0]?.id ?? ""; setPixel(primPixel); }).catch((e) => setErro(e.message)).finally(() => setCarregando(false));
  }, [destino, sourceAccountId, campaignId]);

  async function duplicar(dryRun: boolean) {
    if (!destino || !estrutura) return;
    setEnviando(dryRun ? "dry" : "real"); setErro(null); setResultado(null);
    try {
      const r = await fetch("/api/account/raw", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dry_run: dryRun, source_account_id: sourceAccountId, target_account_id: destino,
          campaign_id: campaignId, campaign_name: estrutura.name,
          page_id: pagina || null, pixel_id: pixel || null, sufixo: sufixo || null,
        }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Falha.");
      setResultado(d);
      if (dryRun) setAgendado(false);
      else setAgendado(true);
    } catch (e: any) { setErro(e.message); }
    finally { setEnviando(null); }
  }

  const destinoConta = contas.find((c) => c.account_id === destino);
  const warnings = resultado?.warnings || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/40" onClick={onClose}>
      <div className="w-full max-w-[620px] max-h-[88vh] flex flex-col rounded-xl border border-border/50 bg-card shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start gap-3 p-4 border-b border-border/50">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold">Duplicar campanha</h3>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{campaignName}</p>
          </div>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer rounded"><X className="h-4 w-4" /></button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {erro && <Notice tone="danger" onDismiss={() => setErro(null)}>{erro}</Notice>}

          <div className="space-y-2">
            <label className="grid gap-1"><span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Conta de destino</span>
              <Select value={destino} onChange={(e) => setDestino(e.target.value)}>
                <option value="">Selecione a conta…</option>
                {contas.map((c) => <option key={c.account_id} value={c.account_id}>{c.name}</option>)}
              </Select>
            </label>

            {carregando && <div className="flex items-center gap-2 text-sm text-muted-foreground"><span className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /> Lendo a estrutura…</div>}

            {estrutura && (
              <Card><CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between"><Badge variant="info" className="text-[10px]">Estrutura encontrada</Badge><span className="text-xs text-muted-foreground">{estrutura.adsets.length} conjunto(s)</span></div>
                <p className="text-xs font-semibold">{estrutura.name} · {estrutura.objective}</p>

                {estrutura.needsRemap.pages.length > 0 && (
                  <label className="grid gap-1"><span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Página do destino</span>
                    <Select value={pagina} onChange={(e) => setPagina(e.target.value)}>{estrutura.needsRemap.pages.map((p) => <option key={p} value={p}>{p}</option>)}</Select>
                    <span className="text-[10px] text-muted-foreground">A página da conta origem não publica na conta destino. Escolha uma página que você administra na conta de destino.</span>
                  </label>
                )}

                {estrutura.needsRemap.pixels.length > 0 && (
                  <label className="grid gap-1"><span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pixel do destino</span>
                    <Select value={pixel} onChange={(e) => setPixel(e.target.value)}>{ativos?.pixels.map((p: any) => <option key={p.id} value={p.id}>{p.name || p.id}</option>)}</Select>
                  </label>
                )}

                <label className="grid gap-1"><span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sufixo no nome</span>
                  <Input value={sufixo} onChange={(e) => setSufixo(e.target.value)} placeholder="[cópia]" />
                  <span className="text-[10px] text-muted-foreground">Para não confundir a cópia com a original na lista.</span>
                </label>

                {estrutura.needsRemap.audiences > 0 && (
                  <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400">
                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{estrutura.needsRemap.audiences} público(s) personalizado(s) não serão copiados — eles não existem na conta de destino.</span>
                  </div>
                )}
              </CardContent></Card>
            )}
          </div>

          {resultado && (
            <div className="space-y-2">
              {warnings.length > 0 && warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400"><Info className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span>{w}</span></div>
              ))}
              <div className={cn("flex items-start gap-2 px-3 py-2 rounded-lg text-xs", resultado.dryRun ? "bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400" : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400")}>
                {resultado.dryRun ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                <div>
                  {resultado.dryRun ? "Validação concluída. Nada foi criado." : `Campanha criada com sucesso em ${resultado.target || "destino"}.`}
                  <span className="block text-muted-foreground mt-0.5">{resultado.adsets.filter((a) => a.id).length} de {resultado.adsets.length} conjuntos criados{resultado.adsets.some((a) => a.approximate) ? " (alguns com orçamento aproximado)" : ""}.</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 p-3 border-t border-border/50 bg-muted/20 flex-wrap">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          {!resultado?.dryRun && (
            <Button variant="secondary" size="sm" onClick={() => duplicar(true)} disabled={!destino || !estrutura || enviando !== null || !!resultado} className="text-xs">
              {enviando === "dry" ? "Validando…" : "Conferir"}
            </Button>
          )}
          {(!resultado || resultado.dryRun) && (
            <Button variant="default" size="sm" onClick={() => duplicar(false)} disabled={!destino || !estrutura || enviando !== null} className="text-xs">
              {enviando === "real" ? <><span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1" /> Duplicando…</> : resultado?.dryRun ? "Duplicar (tudo pausado)" : "Duplicar"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
