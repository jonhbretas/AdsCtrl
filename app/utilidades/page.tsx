"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  ExternalLink, Calculator, Globe, DollarSign, Target,
  BarChart3, ShoppingCart, ClipboardCheck, BookOpen, TrendingUp, TrendingDown,
  Link2, ChevronDown, ChevronUp
} from "lucide-react";

/* ======================== LINKS ÚTEIS ======================== */
const LINKS = {
  meta: [
    { label: "Ads Library", href: "https://www.facebook.com/ads/library/", hint: "Biblioteca de anúncios" },
    { label: "Status da Plataforma", href: "https://metastatus.com/", hint: "Ver se é bug ou sua conta" },
    { label: "Políticas de Anúncio", href: "https://www.facebook.com/policies/ads/", hint: "Checar rejeições" },
    { label: "Central de Ajuda BM", href: "https://business.facebook.com/business/help/", hint: "Business Manager" },
    { label: "Pixel Helper", href: "https://chromewebstore.google.com/detail/meta-pixel-helper/fdgfkebogiimcoedlicjlajpkdmockpc", hint: "Diagnóstico de eventos" },
  ],
  google: [
    { label: "Google Ads Status", href: "https://ads.google.com/status/", hint: "Dashboard de status" },
    { label: "Políticas Google Ads", href: "https://support.google.com/adspolicy", hint: "Regras de veiculação" },
    { label: "Keyword Planner", href: "https://ads.google.com/aw/keywordplanner/", hint: "Planejamento de palavras" },
    { label: "Google Trends", href: "https://trends.google.com/", hint: "Tendências de busca" },
    { label: "Merchant Center", href: "https://merchants.google.com/", hint: "Shopping ads" },
  ],
  tiktok: [
    { label: "TikTok Ads Library", href: "https://library.tiktok.com/ads/", hint: "Biblioteca de criativos" },
    { label: "TikTok Creative Center", href: "https://ads.tiktok.com/business/creativecenter/", hint: "Tendências" },
    { label: "Central de Ajuda TikTok Ads", href: "https://ads.tiktok.com/help/", hint: "Documentação" },
  ],
  gerais: [
    { label: "Downdetector", href: "https://downdetector.com.br/", hint: "Saber se plataforma caiu" },
    { label: "Similarweb", href: "https://www.similarweb.com/", hint: "Espiar concorrência" },
    { label: "SEMrush", href: "https://www.semrush.com/", hint: "SEO e análise competitiva" },
  ],
};

/* ======================== CALCULADORAS ======================== */

function CalcCard({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className={cn(open && "border-primary/30")}>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-3 w-full px-4 py-3 text-left bg-transparent border-none cursor-pointer hover:bg-accent/10 transition-colors rounded-lg">
        <Icon className="h-4 w-4 text-primary shrink-0" />
        <span className="flex-1 text-sm font-semibold">{title}</span>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {open && <CardContent className="p-4 pt-0 space-y-3">{children}</CardContent>}
    </Card>
  );
}

function Result({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1 px-3 rounded-lg bg-muted/30 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-bold tabular-nums", accent ? "text-primary" : "text-foreground")}>{value}</span>
    </div>
  );
}

/* ======================== PRECIFICAÇÃO ======================== */
function Precificacao() {
  const [custo, setCusto] = useState(50);
  const [margem, setMargem] = useState(40);
  const [imposto, setImposto] = useState(10);
  const [gateway, setGateway] = useState(3);
  const [frete, setFrete] = useState(15);

  const preco = useMemo(() => {
    const markup = 1 / (1 - (margem + imposto + gateway) / 100);
    return (custo + frete) * markup;
  }, [custo, margem, imposto, gateway, frete]);

  const lucro = preco - custo - frete - (preco * (imposto + gateway) / 100);
  const margemReal = (lucro / preco) * 100;

  return (
    <CalcCard title="Precificação de produto" icon={DollarSign}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Custo (R$)"><input type="number" value={custo} onChange={(e) => setCusto(Number(e.target.value))} className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm" /></Field>
        <Field label="Frete (R$)"><input type="number" value={frete} onChange={(e) => setFrete(Number(e.target.value))} className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm" /></Field>
        <Field label="Margem desejada (%)"><input type="number" value={margem} onChange={(e) => setMargem(Number(e.target.value))} className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm" /></Field>
        <Field label="Gateway (%)"><input type="number" value={gateway} onChange={(e) => setGateway(Number(e.target.value))} className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm" /></Field>
        <Field label="Imposto (%)"><input type="number" value={imposto} onChange={(e) => setImposto(Number(e.target.value))} className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm" /></Field>
      </div>
      <div className="space-y-1 pt-2 border-t border-border/50">
        <Result label="Preço final sugerido" value={`R$ ${preco.toFixed(2)}`} accent />
        <Result label="Lucro por venda" value={`R$ ${lucro.toFixed(2)}`} />
        <Result label="Margem real" value={`${margemReal.toFixed(1)}%`} />
      </div>
    </CalcCard>
  );
}

/* ======================== ROAS NECESSÁRIO ======================== */
function RoasNecessario() {
  const [margemLiquida, setMargemLiquida] = useState(30);
  const [custoFixo, setCustoFixo] = useState(10000);
  const [ticket, setTicket] = useState(150);

  const roasBreakEven = 1 / (margemLiquida / 100);
  const roasSeguro = roasBreakEven * 1.2;
  const vendasBreakEven = Math.ceil(custoFixo / (ticket * margemLiquida / 100));

  return (
    <CalcCard title="ROAS necessário para lucro" icon={Target}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Margem líquida (%)"><input type="number" value={margemLiquida} onChange={(e) => setMargemLiquida(Number(e.target.value))} className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm" /></Field>
        <Field label="Custo fixo mensal (R$)"><input type="number" value={custoFixo} onChange={(e) => setCustoFixo(Number(e.target.value))} className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm" /></Field>
        <Field label="Ticket médio (R$)"><input type="number" value={ticket} onChange={(e) => setTicket(Number(e.target.value))} className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm" /></Field>
      </div>
      <div className="space-y-1 pt-2 border-t border-border/50">
        <Result label="ROAS break-even" value={`${roasBreakEven.toFixed(2)}x`} accent />
        <Result label="ROAS seguro (+20%)" value={`${roasSeguro.toFixed(2)}x`} />
        <Result label="Vendas p/ cobrir custo fixo" value={`${vendasBreakEven} por mês`} />
      </div>
    </CalcCard>
  );
}

/* ======================== CPA REAL ======================== */
function CpaReal() {
  const [cpaCampanha, setCpaCampanha] = useState(25);
  const [custoProduto, setCustoProduto] = useState(30);
  const [freteMedio, setFreteMedio] = useState(12);
  const [taxaGateway, setTaxaGateway] = useState(3);
  const [ticket, setTicket] = useState(100);

  const cpaTotal = cpaCampanha + custoProduto + freteMedio + ticket * (taxaGateway / 100);
  const lucroPorVenda = ticket - cpaTotal;
  const roasEfetivo = ticket / cpaCampanha;

  return (
    <CalcCard title="CPA real (inclui custo do produto)" icon={ShoppingCart}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="CPA da campanha (R$)"><input type="number" value={cpaCampanha} onChange={(e) => setCpaCampanha(Number(e.target.value))} className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm" /></Field>
        <Field label="Ticket médio (R$)"><input type="number" value={ticket} onChange={(e) => setTicket(Number(e.target.value))} className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm" /></Field>
        <Field label="Custo do produto (R$)"><input type="number" value={custoProduto} onChange={(e) => setCustoProduto(Number(e.target.value))} className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm" /></Field>
        <Field label="Frete médio (R$)"><input type="number" value={freteMedio} onChange={(e) => setFreteMedio(Number(e.target.value))} className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm" /></Field>
        <Field label="Taxa gateway (%)"><input type="number" value={taxaGateway} onChange={(e) => setTaxaGateway(Number(e.target.value))} className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm" /></Field>
      </div>
      <div className="space-y-1 pt-2 border-t border-border/50">
        <Result label="CPA total por venda" value={`R$ ${cpaTotal.toFixed(2)}`} accent />
        <Result label="Lucro por venda" value={`R$ ${lucroPorVenda.toFixed(2)}`} />
        <Result label="ROAS da campanha" value={`${roasEfetivo.toFixed(2)}x`} />
      </div>
    </CalcCard>
  );
}

/* ======================== BENCHMARK META ADS (Heatmap) ======================== */
type BMEntry = { metric: string; ecommerce: number | null; leads: number | null; traffic: number | null; awareness: number | null; apps: number | null; lower: boolean; fmt: string };
const BENCHMARK_DATA: BMEntry[] = [
  { metric: "CPM", ecommerce: 12.5, leads: 18, traffic: 8.5, awareness: 7, apps: 20, lower: true, fmt: "money" },
  { metric: "CTR", ecommerce: 1.8, leads: 2.5, traffic: 3.2, awareness: 0.8, apps: 1.2, lower: false, fmt: "pct" },
  { metric: "CPC", ecommerce: 1.2, leads: 1.8, traffic: 0.6, awareness: 0.9, apps: 2.5, lower: true, fmt: "money" },
  { metric: "CPA", ecommerce: 25, leads: 35, traffic: null, awareness: null, apps: 40, lower: true, fmt: "money" },
  { metric: "ROAS", ecommerce: 4, leads: null, traffic: null, awareness: null, apps: null, lower: false, fmt: "x" },
  { metric: "Frequência", ecommerce: 2, leads: 2.5, traffic: 1.8, awareness: 3.5, apps: 2.2, lower: true, fmt: "num" },
  { metric: "CTR Link", ecommerce: 1.2, leads: 1.5, traffic: 2.8, awareness: 0.5, apps: 0.8, lower: false, fmt: "pct" },
  { metric: "LPV", ecommerce: 65, leads: 55, traffic: 70, awareness: null, apps: null, lower: false, fmt: "pct" },
  { metric: "Conversão", ecommerce: 3, leads: 8, traffic: null, awareness: null, apps: 5, lower: false, fmt: "pct" },
  { metric: "Hook", ecommerce: 25, leads: 30, traffic: 20, awareness: 15, apps: 22, lower: false, fmt: "pct" },
  { metric: "Hold", ecommerce: 12, leads: 15, traffic: 10, awareness: 8, apps: 11, lower: false, fmt: "pct" },
];

function Heat({ value, benchmark, invert }: { value: number | null; benchmark: number | null | undefined; invert?: boolean }) {
  if (value == null || benchmark == null) return <span className="text-muted-foreground">—</span>;
  const better = invert ? value < benchmark : value > benchmark;
  const worse = invert ? value > benchmark * 1.15 : value < benchmark * 0.85;
  const bg = better ? "bg-emerald-100" : worse ? "bg-red-100" : "bg-amber-50";
  const txt = better ? "text-emerald-700" : worse ? "text-red-700" : "text-amber-700";
  return <span className={cn("tabular-nums font-semibold px-1.5 py-0.5 rounded", bg, txt)}>{value.toFixed(1)}</span>;
}

function BenchmarkTable() {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [niche, setNiche] = useState("ecommerce");
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<{ account_id: string; name: string }[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/accounts").then((r) => r.json()).then((d) => { if (d.accounts) setAccounts(d.accounts.filter((a: any) => a.platform === "meta" && !a.hidden)); }).catch(() => {});
  }, []);

  async function carregarDados() {
    if (!selectedAccount) return;
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/creatives/meta?account_id=${encodeURIComponent(selectedAccount)}&period=7d`, { cache: "no-store" });
      const text = await r.text();
      const d = JSON.parse(text);
      if (!r.ok || d.error) throw new Error(d.error || "Falha.");
      const lab = d.accounts?.[0];
      if (!lab || !lab.creatives) throw new Error("Nenhum criativo encontrado no período.");
      const c = lab.creatives;
      const median = (picker: (cr: any) => number | null) => {
        const vals = c.filter((cr: any) => cr.sampleStatus === "reliable" || cr.sampleStatus === "learning").map(picker).filter((v: any): v is number => v != null && Number.isFinite(v)).sort((a: number, b: number) => a - b);
        if (vals.length < 2) return null;
        const mid = Math.floor(vals.length / 2);
        return vals.length % 2 === 0 ? (vals[mid - 1] + vals[mid]) / 2 : vals[mid];
      };
      const spend = c.reduce((s: number, cr: any) => s + (cr.metrics?.spend || 0), 0);
      const impr = c.reduce((s: number, cr: any) => s + (cr.metrics?.impressions || 0), 0);
      const clicks = c.reduce((s: number, cr: any) => s + (cr.metrics?.clicks || 0), 0);
      const convs = c.reduce((s: number, cr: any) => s + (cr.metrics?.conversions || 0), 0);
      const convVal = c.reduce((s: number, cr: any) => s + (cr.metrics?.conversionValue || 0), 0);
      const freq = impr > 0 ? c.reduce((s: number, cr: any) => s + (cr.metrics?.impressions || 0), 0) / Math.max(1, c.reduce((s: number, cr: any) => s + (cr.metrics?.reach || 0), 0)) : null;
      const cpm = impr > 0 ? (spend / impr) * 1000 : null;
      const cpc = clicks > 0 ? spend / clicks : null;
      const cpa = convs > 0 ? spend / convs : null;
      const roas = spend > 0 && convVal > 0 ? convVal / spend : null;
      const ctr = impr > 0 ? (clicks / impr) * 100 : null;
      const linkClicks = c.reduce((s: number, cr: any) => s + (cr.metrics?.linkCtr != null ? (cr.metrics?.impressions || 0) * cr.metrics.linkCtr / 100 : 0), 0);
      const linkCtr = impr > 0 ? (linkClicks / impr) * 100 : null;
      const lpv = median((cr: any) => cr.metrics?.landingPageViewRate);
      const convRate = median((cr: any) => cr.metrics?.conversionRate);
      const hook = median((cr: any) => cr.metrics?.video?.hookRate);
      const hold = median((cr: any) => cr.metrics?.video?.holdRate);

      const mapValues: Record<string, string> = {};
      mapValues["CPM"] = cpm?.toFixed(2) ?? "";
      mapValues["CTR"] = ctr?.toFixed(2) ?? "";
      mapValues["CPC"] = cpc?.toFixed(2) ?? "";
      mapValues["CPA"] = cpa?.toFixed(2) ?? "";
      mapValues["ROAS"] = roas?.toFixed(2) ?? "";
      mapValues["Frequência"] = freq?.toFixed(1) ?? "";
      mapValues["CTR Link"] = linkCtr?.toFixed(2) ?? "";
      mapValues["LPV"] = lpv?.toFixed(1) ?? "";
      mapValues["Conversão"] = convRate?.toFixed(2) ?? "";
      mapValues["Hook"] = hook?.toFixed(1) ?? "";
      mapValues["Hold"] = hold?.toFixed(1) ?? "";
      setVals(mapValues);
    } catch (e: any) { setError(e?.message); }
    finally { setLoading(false); }
  }

  const niches = [
    { key: "ecommerce", label: "E-commerce" },
    { key: "leads", label: "Geração de Leads" },
    { key: "traffic", label: "Tráfego" },
    { key: "awareness", label: "Reconhecimento" },
    { key: "apps", label: "Aplicativos" },
  ];

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" /> Benchmark Meta Ads por Nicho
          </h4>
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/50 border border-border/50">
            {niches.map((n) => (
              <button key={n.key} onClick={() => setNiche(n.key)}
                className={cn("px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors border-none cursor-pointer",
                  niche === n.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent"
                )}>{n.label}</button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)} className="flex-1 min-w-[200px] h-9 rounded-lg border border-input bg-transparent px-3 text-sm">
            <option value="">Selecione uma conta Meta…</option>
            {accounts.map((a) => <option key={a.account_id} value={a.account_id}>{a.name}</option>)}
          </select>
          <Button size="sm" onClick={carregarDados} disabled={loading || !selectedAccount} className="h-9">
            {loading ? "Carregando…" : "Carregar dados reais"}
          </Button>
          {Object.keys(vals).length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setVals({})} className="h-9 text-xs">Limpar</Button>
          )}
        </div>

        {error && <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/20 bg-red-500/10 text-sm text-red-500">{error}</div>}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-2 font-semibold text-muted-foreground uppercase tracking-wider">Métrica</th>
                <th className="text-center p-2 font-semibold text-primary uppercase tracking-wider">Seu valor</th>
                <th className="text-center p-2 font-semibold text-muted-foreground uppercase tracking-wider">Benchmark</th>
                <th className="text-center p-2 font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {BENCHMARK_DATA.map((row) => {
                const k = niche as keyof typeof row;
                const benchVal = row[k] as number | null;
                const rawVal = parseFloat(vals[row.metric] || "");
                const val = isNaN(rawVal) ? null : rawVal;
                const isRelevant = benchVal != null;
                let status: "better" | "worse" | "neutral" | null = null;
                if (val != null && benchVal != null) {
                  const better = row.lower ? val < benchVal : val > benchVal;
                  const worse = row.lower ? val > benchVal * 1.15 : val < benchVal * 0.85;
                  status = better ? "better" : worse ? "worse" : "neutral";
                }
                const fmt = (v: number) => {
                  if (row.fmt === "money") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
                  if (row.fmt === "pct") return `${v.toFixed(1)}%`;
                  if (row.fmt === "x") return `${v.toFixed(2)}x`;
                  return String(v);
                };
                return (
                  <tr key={row.metric} className={cn("border-b border-border/30", !isRelevant && "opacity-40")}>
                    <td className="p-2 font-semibold whitespace-nowrap">{row.metric}</td>
                    <td className="p-2 text-center tabular-nums font-semibold">{val != null ? fmt(val) : "—"}</td>
                    <td className="p-2 text-center tabular-nums font-semibold">{isRelevant ? fmt(benchVal) : "—"}</td>
                    <td className="p-2 text-center">
                      {isRelevant && status ? (
                        <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full",
                          status === "better" ? "bg-emerald-100 text-emerald-700" :
                          status === "worse" ? "bg-red-100 text-red-700" : "bg-amber-50 text-amber-700"
                        )}>
                          {status === "better" ? "▲ Melhor" : status === "worse" ? "▼ Pior" : "◆ Mediano"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground pt-2 border-t border-border/50">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-100 border border-emerald-300" /> Melhor que o benchmark</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-50 border border-amber-300" /> Próximo do benchmark</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-100 border border-red-300" /> Pior que o benchmark</span>
          <span className="ml-auto text-[10px]">Referências: média do mercado brasileiro (2025-2026).</span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ======================== GLOSSÁRIO ======================== */
function Glossario() {
  const terms = [
    { term: "CPM", def: "Custo por mil impressões. Quanto você paga a cada 1.000 vezes que seu anúncio aparece." },
    { term: "CTR", def: "Click-Through Rate. % de pessoas que clicaram após ver o anúncio." },
    { term: "CPC", def: "Custo por clique. Valor médio pago por cada clique no anúncio." },
    { term: "CPA", def: "Custo por aquisição/ação. Quanto custa gerar uma conversão (venda, lead, mensagem)." },
    { term: "ROAS", def: "Return on Ad Spend. Receita gerada ÷ investimento. ROAS 3x = cada R$1 trouxe R$3." },
    { term: "Hook Rate", def: "Em vídeos, % de pessoas que assistiram pelo menos 3 segundos." },
    { term: "Hold Rate", def: "% que assistiu o vídeo inteiro (ThruPlay) dentre os que passaram do hook." },
    { term: "LPV", def: "Landing Page View. Visualização da página de destino após o clique no anúncio." },
    { term: "Frequência", def: "Média de vezes que a mesma pessoa viu o anúncio. Acima de 3 pode indicar fadiga." },
    { term: "Pacing", def: "Ritmo de gasto. 100% = investimento está exatamente no ritmo esperado para o dia." },
    { term: "Atingimento", def: "KPI atual ÷ meta. 100% = atingiu exatamente a meta. Acima = superou." },
    { term: "CAC", def: "Custo de Aquisição de Cliente. Soma de todos os custos de marketing ÷ clientes novos." },
  ];
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" /> Glossário rápido
        </h4>
        {terms.map((t, i) => (
          <div key={i} className="pb-2 border-b border-border/30 last:pb-0 last:border-0">
            <span className="text-xs font-bold text-primary">{t.term}</span>
            <span className="text-xs text-muted-foreground ml-1.5">{t.def}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ======================== MAIN PAGE ======================== */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1 min-w-0"><span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>{children}</label>;
}

export default function UtilidadesPage() {
  return (
    <div className="p-4 md:p-6 md:ml-56 pb-20 md:pb-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Central de Utilidades</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Links, calculadoras, checklists e referências do dia a dia.</p>
      </div>

      {/* Links úteis */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <Link2 className="h-3.5 w-3.5" /> Links úteis
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.entries(LINKS).map(([cat, links]) => (
            <Card key={cat}>
              <CardContent className="p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2.5">
                  {cat === "meta" ? "🔵 Meta Ads" : cat === "google" ? "🟡 Google Ads" : cat === "tiktok" ? "⚫ TikTok" : "🌐 Gerais"}
                </h3>
                <div className="space-y-1">
                  {links.map((l) => (
                    <a key={l.href} href={l.href} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs hover:bg-accent/30 transition-colors group no-underline">
                      <span className="font-semibold text-foreground group-hover:text-primary transition-colors">{l.label}</span>
                      <span className="flex-1 text-muted-foreground truncate">{l.hint}</span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Calculadoras */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <Calculator className="h-3.5 w-3.5" /> Calculadoras
        </h2>
        <div className="space-y-3">
          <Precificacao />
          <RoasNecessario />
          <CpaReal />
        </div>
      </section>

      {/* Benchmark + Glossário */}
      <div className="space-y-4">
        <BenchmarkTable />
        <Glossario />
      </div>
    </div>
  );
}
