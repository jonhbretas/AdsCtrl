"use client";

import { useState, useMemo } from "react";
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

/* ======================== CHECKLIST ======================== */
function QuickChecklist() {
  const items = [
    "Pixel / Tag de conversão ativo e testado",
    "Público-alvo definido (lookalike, custom, amplo)",
    "UTMs padronizadas em todos os links",
    "Orçamento diário configurado com pacing",
    "Criativos aprovados e revisados (política)",
    "Regra de automação ativa (se houver)",
    "Link de checkout / LP funcional e rápido",
    "Configuração de conversão (evento padrão)",
  ];
  const [checked, setChecked] = useState<Set<number>>(new Set());

  return (
    <Card>
      <CardContent className="p-4 space-y-1">
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-primary" /> Checklist pré-lançamento
        </h4>
        {items.map((item, i) => (
          <label key={i} className={cn("flex items-center gap-2.5 py-1 text-sm cursor-pointer", checked.has(i) && "line-through text-muted-foreground")}>
            <input type="checkbox" checked={checked.has(i)} onChange={() => setChecked((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; })} className="accent-primary" />
            {item}
          </label>
        ))}
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

      {/* Checklist + Glossário lado a lado */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <QuickChecklist />
        <Glossario />
      </div>
    </div>
  );
}
