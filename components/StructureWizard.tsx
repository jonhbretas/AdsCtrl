"use client";

// components/StructureWizard.tsx
// "Sugerir estrutura": gera o funil de campanhas a partir da estratégia da
// conta (objetivo, público, cidades, ofertas). Cria tudo PAUSADO e "limpo" —
// sem Audience Network, sem Messenger, sem expansão de público, só
// Facebook/Instagram/Threads, segmentação por cidade e faixa etária. O
// operador revisa orçamentos, sobe criativos e publica.

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Info, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface StrategyContent {
  objective: string;
  audience: string;
  regions: string;
  cities: string;
  offers: string;
  notes: string;
}

interface CreateResult {
  name: string;
  campaign_id?: string;
  adsets: { name: string; id?: string; error?: string }[];
  error?: string;
}

function parseCities(text: string): string[] {
  return text.split(/[\n,;]+/).map((city) => city.trim().replace(/^[-•]\s*/, "")).filter(Boolean);
}

function parseAges(audience: string): { min: number; max: number } {
  const match = /(\d{1,2})\s*[-–]\s*(\d{1,2})/.exec(audience || "");
  if (match) {
    const min = Number(match[1]);
    const max = Number(match[2]);
    if (min >= 13 && max >= min && max <= 65) return { min, max };
  }
  return { min: 18, max: 54 };
}

const SALES_OPTIONS = [
  { value: "add_to_cart", label: "Adicionar ao carrinho", hint: "precisa do pixel selecionado" },
  { value: "purchase", label: "Compra", hint: "precisa do pixel selecionado" },
  { value: "link_clicks", label: "Cliques no link", hint: "funciona sem pixel" },
];

export default function StructureWizard({ accountId, accountName, onClose, onCreated }: { accountId: string; accountName: string; onClose: () => void; onCreated: () => void }) {
  const [strategy, setStrategy] = useState<StrategyContent | null>(null);
  const [pixels, setPixels] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [recognition, setRecognition] = useState(true);
  const [sales, setSales] = useState(true);
  const [destination, setDestination] = useState<"landing" | "profile">("landing");
  const [landingUrl, setLandingUrl] = useState("");
  const [salesOptimization, setSalesOptimization] = useState("add_to_cart");
  const [cbo, setCbo] = useState(false);
  const [budgetRec, setBudgetRec] = useState("10");
  const [budgetSales, setBudgetSales] = useState("15");
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(54);
  const [citiesText, setCitiesText] = useState("");
  const [suffix, setSuffix] = useState("[estratégia]");
  const [pixelId, setPixelId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ results: CreateResult[]; warnings: string[] } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [strategyRes, pixelsRes] = await Promise.all([
          fetch(`/api/account-strategies?account_id=${encodeURIComponent(accountId)}`, { cache: "no-store" }),
          fetch(`/api/meta/suggest-campaigns?account_id=${encodeURIComponent(accountId)}`, { cache: "no-store" }),
        ]);
        const [strategyData, pixelsData] = await Promise.all([strategyRes.json(), pixelsRes.json()]);
        if (!alive) return;
        const content: StrategyContent = { objective: "", audience: "", regions: "", cities: "", offers: "", notes: "", ...(strategyData.content || {}) };
        setStrategy(content);
        setCitiesText(content.cities || "");
        const ages = parseAges(content.audience);
        setAgeMin(ages.min);
        setAgeMax(ages.max);
        setPixels(pixelsData.pixels || []);
        if (pixelsData.pixels?.[0]) setPixelId(pixelsData.pixels[0].id);
      } catch {
        if (alive) setError("Não foi possível carregar a estratégia da conta.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [accountId]);

  const cities = useMemo(() => parseCities(citiesText), [citiesText]);

  const preview = useMemo(() => {
    const plan: { kind: string; name: string; budget: number; adsets: string[] }[] = [];
    if (!cities.length) return plan;
    if (recognition) {
      plan.push({ kind: "Reconhecimento (perfil)", name: `REC - Visita ao perfil${suffix ? ` ${suffix}` : ""}`, budget: Number(budgetRec) || 0, adsets: cities.map((city) => `REC - ${city}${suffix ? ` ${suffix}` : ""}`) });
    }
    if (sales) {
      const label = destination === "landing" ? "VEN - Landing" : "VEN - Perfil";
      plan.push({ kind: destination === "landing" ? "Vendas (landing)" : "Vendas (perfil)", name: `${label}${suffix ? ` ${suffix}` : ""}`, budget: Number(budgetSales) || 0, adsets: cities.map((city) => `${label} - ${city}${suffix ? ` ${suffix}` : ""}`) });
    }
    return plan;
  }, [recognition, sales, destination, suffix, cities, budgetRec, budgetSales]);

  async function create() {
    setBusy(true); setError(null); setResult(null);
    try {
      const r = await fetch("/api/meta/suggest-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: accountId,
          funnel: { recognition, sales },
          destination,
          landing_url: destination === "landing" ? landingUrl : null,
          sales_optimization: salesOptimization,
          cbo,
          budget_recognition: Number(budgetRec),
          budget_sales: Number(budgetSales),
          age_min: ageMin,
          age_max: ageMax,
          cities,
          suffix,
          pixel_id: pixelId || null,
        }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Falha ao gerar.");
      setResult({ results: d.results || [], warnings: d.warnings || [] });
    } catch (e: any) {
      setError(e?.message || "Falha ao gerar a estrutura.");
    } finally {
      setBusy(false);
    }
  }

  const inputClass = "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus:ring-1 focus:ring-ring";
  const labelClass = "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border/50 bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-border/50 p-4">
          <div className="flex items-start gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary"><Sparkles className="h-4 w-4" /></span>
            <div>
              <h3 className="text-base font-bold">Sugerir estrutura de campanhas</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Funil limpo a partir da estratégia de {accountName} — tudo nasce <strong>pausado</strong>; você revisa orçamentos, sobe criativos e publica.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading && <div className="grid place-items-center py-10 text-xs text-muted-foreground">Carregando estratégia…</div>}

          {!loading && !result && (
            <div className="space-y-4">
              {error && <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</div>}

              {/* Estratégia */}
              <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><Info className="h-3 w-3" /> Estratégia cadastrada</div>
                <div className="mt-1.5 space-y-1 text-[11.5px] leading-5 text-foreground/80">
                  {strategy?.objective && <p><span className="font-semibold">Objetivo:</span> {strategy.objective}</p>}
                  {strategy?.audience && <p><span className="font-semibold">Público:</span> {strategy.audience}</p>}
                  {strategy?.regions && <p><span className="font-semibold">Regiões:</span> {strategy.regions}</p>}
                  {strategy?.offers && <p><span className="font-semibold">Ofertas:</span> {strategy.offers}</p>}
                  {!strategy?.objective && !strategy?.audience && !strategy?.regions && !strategy?.offers && <p>Sem estratégia cadastrada — preencha o Resumo Estratégico da conta primeiro.</p>}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {/* Funil */}
                <div className="space-y-2 md:col-span-2">
                  <label className={labelClass}>Funil</label>
                  <div className="flex flex-wrap gap-2">
                    <label className={cn("flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors min-w-[200px]", recognition ? "border-primary/40 bg-primary/10 text-foreground" : "border-border/60 text-muted-foreground")}>
                      <input type="checkbox" checked={recognition} onChange={(e) => setRecognition(e.target.checked)} className="accent-primary" />
                      <span><span className="font-semibold">Reconhecimento</span><span className="block text-[10px] text-muted-foreground">visita ao perfil — aumentar seguidores</span></span>
                    </label>
                    <label className={cn("flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors min-w-[200px]", sales ? "border-primary/40 bg-primary/10 text-foreground" : "border-border/60 text-muted-foreground")}>
                      <input type="checkbox" checked={sales} onChange={(e) => setSales(e.target.checked)} className="accent-primary" />
                      <span><span className="font-semibold">Vendas</span><span className="block text-[10px] text-muted-foreground">landing ou perfil — carrinho/cliques</span></span>
                    </label>
                  </div>
                </div>

                {/* Destino das vendas */}
                {sales && (
                  <div className="space-y-2 md:col-span-2">
                    <label className={labelClass}>Destino das vendas</label>
                    <div className="flex flex-wrap gap-2">
                      {([["landing", "Landing page (URL)"], ["profile", "Perfil do Instagram"]] as const).map(([value, label]) => (
                        <button key={value} type="button" onClick={() => setDestination(value)} className={cn("rounded-lg border px-3 py-2 text-xs font-semibold transition-colors", destination === value ? "border-primary/40 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground")}>{label}</button>
                      ))}
                    </div>
                    {destination === "landing" && (
                      <input value={landingUrl} onChange={(e) => setLandingUrl(e.target.value)} placeholder="https://sualoja.com.br/pagina-de-vendas" className={inputClass} />
                    )}
                    {destination === "landing" && (
                      <div className="space-y-2">
                        <label className={labelClass}>Otimização de vendas</label>
                        <div className="flex flex-wrap gap-2">
                          {SALES_OPTIONS.map((option) => (
                            <button key={option.value} type="button" onClick={() => setSalesOptimization(option.value)} className={cn("rounded-lg border px-3 py-2 text-[11px] font-semibold transition-colors", salesOptimization === option.value ? "border-primary/40 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground")}>
                              {option.label}
                              <span className="block text-[9px] font-normal opacity-70">{option.hint}</span>
                            </button>
                          ))}
                        </div>
                        {pixels.length > 0 ? (
                          <div className="grid gap-1.5">
                            <label className={labelClass}>Pixel (para otimizar por evento)</label>
                            <select value={pixelId} onChange={(e) => setPixelId(e.target.value)} className={inputClass}>
                              <option value="">Sem pixel (usa clique no link)</option>
                              {pixels.map((pixel) => <option key={pixel.id} value={pixel.id}>{pixel.name} ({pixel.id})</option>)}
                            </select>
                          </div>
                        ) : (
                          <p className="text-[10.5px] text-muted-foreground">Nenhum pixel encontrado nesta conta — a otimização cai para clique no link.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Orçamento */}
                <div className="space-y-2">
                  <label className={labelClass}>Estrutura de orçamento</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setCbo(false)} className={cn("flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors", !cbo ? "border-primary/40 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground")}>ABO<span className="block text-[9px] font-normal opacity-70">orçamento por conjunto</span></button>
                    <button type="button" onClick={() => setCbo(true)} className={cn("flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors", cbo ? "border-primary/40 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground")}>CBO<span className="block text-[9px] font-normal opacity-70">orçamento por campanha</span></button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className={labelClass}>Orçamento diário (R$)</label>
                  <div className="flex gap-2">
                    {recognition && <div className="flex-1"><label className="text-[10px] text-muted-foreground">Reconhecimento</label><input value={budgetRec} onChange={(e) => setBudgetRec(e.target.value)} type="number" min="1" className={inputClass} /></div>}
                    {sales && <div className="flex-1"><label className="text-[10px] text-muted-foreground">Vendas</label><input value={budgetSales} onChange={(e) => setBudgetSales(e.target.value)} type="number" min="1" className={inputClass} /></div>}
                  </div>
                </div>

                {/* Cidades */}
                <div className="space-y-2 md:col-span-2">
                  <label className={labelClass}>Cidades (uma por linha) — da estratégia</label>
                  <textarea value={citiesText} onChange={(e) => setCitiesText(e.target.value)} rows={3} placeholder={"Búzios\nCabo Frio\nArmação dos Búzios"} className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
                  <p className="text-[10.5px] text-muted-foreground">{cities.length} cidade(s) · uma campanha de cada tipo por cidade, segmentada nela.</p>
                </div>

                {/* Idade + sufixo */}
                <div className="space-y-2">
                  <label className={labelClass}>Faixa etária</label>
                  <div className="flex items-center gap-2">
                    <input value={ageMin} onChange={(e) => setAgeMin(Number(e.target.value))} type="number" min="13" max="65" className={inputClass} />
                    <span className="text-muted-foreground">—</span>
                    <input value={ageMax} onChange={(e) => setAgeMax(Number(e.target.value))} type="number" min="13" max="65" className={inputClass} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className={labelClass}>Sufixo no nome (opcional)</label>
                  <input value={suffix} onChange={(e) => setSuffix(e.target.value)} placeholder="[estratégia]" maxLength={60} className={inputClass} />
                </div>
              </div>

              {/* Preview */}
              <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Estrutura que será criada (pausada)</div>
                <div className="mt-2 space-y-2">
                  {preview.length === 0 && <p className="text-[11px] text-muted-foreground">Escolha ao menos um tipo de campanha e informe as cidades.</p>}
                  {preview.map((plan) => (
                    <div key={plan.name} className="rounded-md border border-border/40 bg-card px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold">{plan.name}</span>
                        <span className="text-[10px] text-muted-foreground">R$ {plan.budget}/dia · {plan.adsets.length} conjunto(s)</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {plan.adsets.map((adset) => <span key={adset} className="rounded-full bg-muted px-1.5 py-0.5 text-[9.5px] text-muted-foreground">{adset}</span>)}
                      </div>
                    </div>
                  ))}
                  <p className="text-[10px] leading-4 text-muted-foreground">Limpeza aplicada: sem Audience Network, sem Messenger, sem expansão de público · só Facebook/Instagram/Threads · segmentação por cidade + faixa etária {ageMin}-{ageMax}.</p>
                </div>
              </div>
            </div>
          )}

          {/* Resultado */}
          {!loading && result && (
            <div className="space-y-3">
              <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">
                Estrutura criada e pausada. Revise na tela, suba os criativos e publique quando estiver pronto.
              </div>
              {result.warnings.map((warning) => <div key={warning} className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400">{warning}</div>)}
              <div className="space-y-2">
                {result.results.map((campaign) => (
                  <div key={campaign.name} className={cn("rounded-lg border px-3 py-2", campaign.campaign_id ? "border-border/50 bg-card" : "border-red-500/25 bg-red-500/5")}>
                    <div className="flex items-center gap-2">
                      {campaign.campaign_id ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" /> : <X className="h-3.5 w-3.5 shrink-0 text-red-500" />}
                      <span className="text-xs font-bold">{campaign.name}</span>
                      {campaign.campaign_id && <span className="text-[9.5px] text-muted-foreground">id {campaign.campaign_id}</span>}
                    </div>
                    {campaign.error && <div className="mt-1 text-[11px] text-red-600 dark:text-red-400">{campaign.error}</div>}
                    {campaign.adsets.length > 0 && (
                      <div className="mt-1.5 space-y-1">
                        {campaign.adsets.map((adset) => (
                          <div key={adset.name} className="flex items-center gap-1.5 text-[10.5px]">
                            {adset.id ? <Check className="h-3 w-3 shrink-0 text-emerald-500" /> : <X className="h-3 w-3 shrink-0 text-red-500" />}
                            <span className={adset.id ? "text-foreground/80" : "text-red-600 dark:text-red-400"}>{adset.name}</span>
                            {adset.error && <span className="truncate text-muted-foreground">— {adset.error}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/50 p-4">
          {result ? (
            <Button size="sm" onClick={() => { onCreated(); onClose(); }}>Concluir e revisar</Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
              <Button size="sm" onClick={create} disabled={busy || cities.length === 0 || (!recognition && !sales) || (sales && destination === "landing" && !landingUrl.trim())}>
                {busy ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Criando…</> : <><Sparkles className="h-3.5 w-3.5 mr-1" /> Criar estrutura (pausada)</>}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
