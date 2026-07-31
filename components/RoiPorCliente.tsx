"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { RefreshCw, Settings, AlertTriangle, CheckCircle2, LayoutDashboard, ExternalLink } from "lucide-react";

interface ContaCliente { account_id: string; platform: "meta" | "google"; }
interface MesDoCliente { month: string; spend: number; daysWithData: number; daysElapsed: number; inProgress: boolean; partial: boolean; revenue: number | null; orders: number | null; note: string | null; }
interface LinhaCliente { client_id: string; name: string; currency: string; accounts: ContaCliente[]; group?: { name: string; color: string } | null; months: MesDoCliente[]; }
interface Payload { months: string[]; rows: LinhaCliente[]; allClients: { id: string; name: string; track_sales?: boolean }[]; }

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function SeloGrupo({ grupo }: { grupo: { name: string; color: string } }) {
  return <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap" style={{ backgroundColor: grupo.color + "22", color: grupo.color }}>{grupo.name}</span>;
}

// Meta e Google abrem pelo id nu, sem prefixo (act_/google:). O painel expõe o
// id prefixado, então cada gerenciador tira o prefixo que não é dele.
function gerenciadorUrl(conta: ContaCliente): string {
  const bareId = conta.account_id.replace(/^act_/, "").replace(/^google:/, "");
  return conta.platform === "google"
    ? `https://ads.google.com/aw/overview?ocid=${encodeURIComponent(bareId)}`
    : `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent(bareId)}`;
}

// Nome do cliente vira menu: visão geral no painel, ou o gerenciador de cada
// conta vinculada (uma pode ter Meta e Google ao mesmo tempo). Sem isto,
// resolver algo na conta de um cliente era sair da tela de vendas, procurar o
// cliente na Visão Geral e copiar o link do gerenciador na mão.
function NomeCliente({ nome, contas, children }: { nome: string; contas: ContaCliente[]; children?: React.ReactNode }) {
  const metaConta = contas.find((c) => c.platform === "meta");
  const googleContas = contas.filter((c) => c.platform === "google");
  // Visão geral abre por qualquer conta vinculada; a Meta é preferida porque
  // a Visão Geral organiza a linha por ela e aninha o Google embaixo.
  const overviewConta = metaConta || contas[0];
  if (!contas.length) return <>{nome}{children}</>;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="bg-transparent border-none p-0 font-inherit text-inherit cursor-pointer underline decoration-dotted decoration-muted-foreground/50 underline-offset-2 hover:decoration-foreground"
          title="Ir para a visão geral ou abrir o gerenciador da conta"
        >
          {nome}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{nome}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={`/?account=${encodeURIComponent(overviewConta.account_id)}`}>
            <LayoutDashboard className="h-3.5 w-3.5" /> Visão geral do cliente
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {metaConta && (
          <DropdownMenuItem asChild>
            <a href={gerenciadorUrl(metaConta)} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" /> Abrir Meta Ads Manager
            </a>
          </DropdownMenuItem>
        )}
        {googleContas.map((conta) => (
          <DropdownMenuItem key={conta.account_id} asChild>
            <a href={gerenciadorUrl(conta)} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" /> Abrir Google Ads{googleContas.length > 1 ? ` (${conta.account_id.replace(/^google:/, "")})` : ""}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
function rotuloMes(iso: string, longo = false) { const [ano, mes] = iso.split("-"); const nome = MESES[Number(mes) - 1] || mes; return longo ? `${nome}/${ano}` : `${nome}/${ano.slice(2)}`; }
function paraNumero(texto: string): number | null { const limpo = texto.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", "."); if (!limpo) return null; const valor = Number(limpo); return Number.isFinite(valor) ? valor : null; }
function paraTexto(valor: number | null, emEdicao: boolean): string { if (valor == null) return ""; if (emEdicao) return String(valor).replace(".", ","); return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
const ticketMedio = (r: number | null, o: number | null) => r != null && o != null && o > 0 ? r / o : null;
const custoPorVenda = (s: number, o: number | null) => o != null && o > 0 && s > 0 ? s / o : null;

export function RoiPorCliente({ clientId }: { clientId?: string } = {}) {
  const [data, setData] = useState<Payload | null>(null);
  const [meses, setMeses] = useState(6);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [emFoco, setEmFoco] = useState<string | null>(null);
  const [grupoFiltro, setGrupoFiltro] = useState("all");

  async function carregar(qtd = meses) { setCarregando(true); setErro(null); try { const r = await fetch(`/api/sales?months=${qtd}`, { cache: "no-store" }); const d = await r.json(); if (!r.ok || d.error) throw new Error(d.error || `Falha (HTTP ${r.status}).`); setData(d); setRascunho({}); } catch (e: any) { setErro(e?.message ?? "Erro ao carregar."); } finally { setCarregando(false); } }
  useEffect(() => { carregar(meses); }, [meses]);

  const mesVigente = data?.months?.[0];

  async function salvar(clientId: string, month: string, campo: "revenue" | "orders", texto: string) {
    const chave = `${clientId}::${month}`; setSalvando(chave); setAviso(null);
    try {
      const atual = data?.rows.find((r) => r.client_id === clientId)?.months.find((m) => m.month === month);
      const corpo: Record<string, unknown> = { client_id: clientId, month: month.slice(0, 7), revenue: campo === "revenue" ? paraNumero(texto) : atual?.revenue ?? null, orders: campo === "orders" ? paraNumero(texto) : atual?.orders ?? null };
      const r = await fetch("/api/sales", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      const d = await r.json(); if (!r.ok || d.error) throw new Error(d.error || `Falha (HTTP ${r.status}).`);
      setData((prev) => { if (!prev) return prev; return { ...prev, rows: prev.rows.map((linha) => linha.client_id !== clientId ? linha : { ...linha, months: linha.months.map((m) => m.month !== month ? m : { ...m, revenue: corpo.revenue as number | null, orders: corpo.orders as number | null }) }) }; });
      setAviso(`Salvo: ${rotuloMes(month, true)}.`);
    } catch (e: any) { setAviso(e?.message ?? "Falha ao salvar."); setErro(null); } finally { setSalvando(null); }
  }

  const totaisPorMes = useMemo(() => {
    if (!data) return [];
    return data.months.map((mes) => {
      let spend = 0, revenue = 0, orders = 0, temVenda = false, temQtd = false, parcial = false, clientesComVenda = 0, clientesComGasto = 0, clientesComQtd = 0;
      for (const linha of data.rows) { const m = linha.months.find((x) => x.month === mes); if (!m) continue; spend += m.spend; if (m.spend > 0) clientesComGasto++; if (m.partial) parcial = true; if (m.revenue != null) { revenue += m.revenue; temVenda = true; clientesComVenda++; } if (m.orders != null) { orders += m.orders; temQtd = true; clientesComQtd++; } }
      return { mes, spend, revenue: temVenda ? revenue : null, orders: temQtd ? orders : null, parcial, incompleto: clientesComVenda > 0 && clientesComVenda < clientesComGasto, qtdIncompleta: clientesComQtd > 0 && clientesComQtd < clientesComGasto, clientesComVenda, clientesComQtd, clientesComGasto };
    });
  }, [data]);

  const grupos = useMemo(() => {
    if (!data) return [];
    const seen = new Map<string, { name: string; color: string }>();
    for (const r of data.rows) { if (r.group) seen.set(r.group.name, r.group); }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const linhasFiltradas = useMemo(() => {
    if (!data) return [];
    const rows = clientId ? data.rows.filter((r) => r.client_id === clientId) : data.rows;
    if (grupoFiltro === "all") return rows;
    return rows.filter((r) => r.group?.name === grupoFiltro);
  }, [data, grupoFiltro, clientId]);

  const totalsGrupo = useMemo(() => {
    if (!data || grupos.length === 0) return [];
    return grupos.map((g) => {
      const linhas = data.rows.filter((r) => r.group?.name === g.name);
      let spend = 0, revenue = 0, orders = 0;
      for (const l of linhas) { for (const m of l.months) { spend += m.spend; if (m.revenue != null) revenue += m.revenue; if (m.orders != null) orders += m.orders; } }
      return { group: g, spend, revenue, orders, roas: spend > 0 && revenue > 0 ? revenue / spend : null };
    }).filter((t) => t.spend > 0 || t.revenue > 0);
  }, [data, grupos]);

  const semClientes = !!data && data.rows.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Receita real informada vs. investimento em mídia, mês a mês.</p>
        <div className="flex items-center gap-2 flex-wrap">
          {data && !clientId && <Badge variant="secondary" className="text-[11px]">{linhasFiltradas.length} cliente(s)</Badge>}
          {!clientId && grupos.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setGrupoFiltro("all")}
                className={cn("px-3 py-1.5 text-xs font-medium rounded-full border transition-colors", grupoFiltro === "all" ? "bg-primary/10 border-primary/30 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground hover:bg-accent/50")}>Todos</button>
              {grupos.map((g) => <button key={g.name} onClick={() => setGrupoFiltro(g.name)}
                className={cn("px-3 py-1.5 text-xs font-medium rounded-full border transition-colors", grupoFiltro === g.name ? "border-primary/30" : "border-border/50 text-muted-foreground hover:text-foreground hover:bg-accent/50")}
                style={grupoFiltro === g.name ? { backgroundColor: g.color + "18", borderColor: g.color + "40", color: g.color } : undefined}>
                <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: g.color }} />
                {g.name}
              </button>)}
            </div>
          )}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-semibold">Meses</span>
            <select value={meses} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMeses(Number(e.target.value))} className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm">{[3, 6, 12, 24].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </label>
          <Button variant="ghost" size="sm" onClick={() => carregar()} disabled={carregando}><RefreshCw className={cn("h-3.5 w-3.5 mr-1", carregando && "animate-spin")} /> Atualizar</Button>
        </div>
      </div>

      {erro && <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/20 bg-red-500/10 text-sm text-red-500"><AlertTriangle className="h-4 w-4 shrink-0" />{erro}<button onClick={() => setErro(null)} className="ml-auto bg-transparent border-none cursor-pointer">✕</button></div>}
      {aviso && <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-sm text-emerald-500"><CheckCircle2 className="h-4 w-4 shrink-0" />{aviso}<button onClick={() => setAviso(null)} className="ml-auto bg-transparent border-none cursor-pointer">✕</button></div>}

      {carregando && !data && <div className="space-y-3"><Skeleton className="h-20 rounded-lg" /><Skeleton className="h-28 rounded-lg" /></div>}

      {semClientes && (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          <p className="text-lg mb-1">◷</p>
          <p className="font-semibold text-foreground">Nenhum cliente marcado para acompanhar vendas</p>
          <p className="text-xs mt-1">Acima, em "Metas e orçamento por cliente", marque "Acompanhar vendas reais" em cada cliente.</p>
        </CardContent></Card>
      )}
      {!semClientes && clientId && data && linhasFiltradas.length === 0 && (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          <p className="text-lg mb-1">◷</p>
          <p className="font-semibold text-foreground">Este cliente não acompanha vendas reais</p>
          <p className="text-xs mt-1">Na aba Metas, marque "Acompanhar vendas reais" para liberar o lançamento aqui.</p>
        </CardContent></Card>
      )}

      {/* Current month entry */}
      {data && linhasFiltradas.length > 0 && mesVigente && (
        <section>
          <h2 className="text-base font-semibold mb-1">Lançar vendas de {rotuloMes(mesVigente, true)}</h2>
          <p className="text-xs text-muted-foreground mb-3">Qualquer mês é editável — na tabela abaixo também.</p>
          <Card><CardContent className="p-4 space-y-3">
            {linhasFiltradas.map((linha) => {
              const m = linha.months.find((x) => x.month === mesVigente);
              if (!m) return null;
              const ch = `${linha.client_id}::${mesVigente}`;
              const roas = m.revenue != null && m.spend > 0 ? m.revenue / m.spend : null;
              return (
                <div key={linha.client_id} className="flex flex-wrap items-end gap-x-4 gap-y-2 pb-3 border-b border-border/50 last:pb-0 last:border-b-0">
                  <div className="min-w-0 flex-[2_1_200px]">
                    <div className="text-sm font-semibold"><NomeCliente nome={linha.name} contas={linha.accounts}>{linha.group && <SeloGrupo grupo={linha.group} />}</NomeCliente></div>
                    <div className="text-[11px] text-muted-foreground">investido {new Intl.NumberFormat("pt-BR", { style: "currency", currency: linha.currency }).format(m.spend)}{m.inProgress && " · mês em curso"}</div>
                  </div>
                  <label className="grid gap-0.5 min-w-0 flex-[1_0_120px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Vendas (R$)</span>
                    <input inputMode="decimal" placeholder="—" value={rascunho[`${ch}::r`] ?? paraTexto(m.revenue, emFoco === `${ch}::r`)}
                      onFocus={() => setEmFoco(`${ch}::r`)}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRascunho((p) => ({ ...p, [`${ch}::r`]: e.target.value }))}
                      onBlur={(e: React.FocusEvent<HTMLInputElement>) => { setEmFoco(null); setRascunho((p) => { const n = { ...p }; delete n[`${ch}::r`]; return n; }); const t = e.target.value; const novo = paraNumero(t); if (novo !== m.revenue) salvar(linha.client_id, mesVigente, "revenue", t); }}
                      className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm text-right" />
                  </label>
                  <label className="grid gap-0.5 min-w-0 flex-[0_1_100px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Vendas (qtd)</span>
                    <input inputMode="numeric" placeholder="—" value={rascunho[`${ch}::o`] ?? (m.orders != null ? String(m.orders) : "")}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRascunho((p) => ({ ...p, [`${ch}::o`]: e.target.value }))}
                      onBlur={(e: React.FocusEvent<HTMLInputElement>) => { setRascunho((p) => { const n = { ...p }; delete n[`${ch}::o`]; return n; }); const novo = paraNumero(e.target.value); if (novo !== m.orders) salvar(linha.client_id, mesVigente, "orders", e.target.value); }}
                      className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm text-right" />
                  </label>
                  <div className="text-right min-w-[100px]">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Retorno</div>
                    <div className={cn("text-base font-bold", roas == null ? "text-muted-foreground" : roas >= 1 ? "text-emerald-500" : "text-red-500")}>{roas == null ? "—" : `${roas.toFixed(2)}x`}</div>
                    <div className="text-[10px] text-muted-foreground leading-relaxed">
                      {ticketMedio(m.revenue, m.orders) != null && <div title="Ticket médio">ticket {new Intl.NumberFormat("pt-BR", { style: "currency", currency: linha.currency }).format(ticketMedio(m.revenue, m.orders)!)}</div>}
                      {custoPorVenda(m.spend, m.orders) != null && <div title="Custo por venda">custo/venda {new Intl.NumberFormat("pt-BR", { style: "currency", currency: linha.currency }).format(custoPorVenda(m.spend, m.orders)!)}</div>}
                    </div>
                  </div>
                  <div className="w-12 text-right text-[11px] text-muted-foreground shrink-0">{salvando === ch ? "salvando…" : ""}</div>
                </div>
              );
            })}
          </CardContent></Card>
        </section>
      )}

      {/* Month-by-month table */}
      {data && linhasFiltradas.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-1">Mês a mês</h2>
          <p className="text-xs text-muted-foreground mb-3">Investido, vendido em valor e quantidade. Qualquer mês é editável. <em className="text-amber-500">parcial</em> = histórico incompleto.</p>
          <div className="overflow-x-auto rounded-lg border border-border/50">
            <table className="w-full text-[11px] min-w-[760px]">
              <thead><tr className="border-b border-border bg-muted/30">
                <th className="text-left p-2 font-semibold text-muted-foreground uppercase tracking-wider">Cliente</th>
                {data.months.map((mes) => <th key={mes} className="p-2 font-semibold text-muted-foreground uppercase tracking-wider text-right">{rotuloMes(mes)}</th>)}
              </tr></thead>
              <tbody>
                {linhasFiltradas.map((linha) => (
                  <tr key={linha.client_id} className="border-b border-border/30 last:border-b-0">
                    <th className="text-left p-2 font-semibold text-foreground whitespace-nowrap"><NomeCliente nome={linha.name} contas={linha.accounts}>{linha.group && <SeloGrupo grupo={linha.group} />}</NomeCliente></th>
                    {linha.months.map((m) => {
                      const ch = `${linha.client_id}::${m.month}`;
                      const roas = m.revenue != null && m.spend > 0 ? m.revenue / m.spend : null;
                      const semDado = m.spend === 0 && m.revenue == null;
                      return (
                        <td key={m.month} className={cn("p-2.5 align-top", semDado && "bg-muted/10")}>
                          <div className="grid gap-1.5 justify-items-end">
                            <span className="text-[10px] text-muted-foreground tabular-nums">{m.spend > 0 ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: linha.currency }).format(m.spend) : "—"}</span>
                            <input inputMode="decimal" placeholder="valor" value={rascunho[`${ch}::r`] ?? paraTexto(m.revenue, emFoco === `${ch}::r`)}
                              onFocus={() => setEmFoco(`${ch}::r`)}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRascunho((p) => ({ ...p, [`${ch}::r`]: e.target.value }))}
                              onBlur={(e: React.FocusEvent<HTMLInputElement>) => { setEmFoco(null); setRascunho((p) => { const n = { ...p }; delete n[`${ch}::r`]; return n; }); const novo = paraNumero(e.target.value); if (novo !== m.revenue) salvar(linha.client_id, m.month, "revenue", e.target.value); }}
                              className="w-full max-w-[128px] h-7 rounded border border-transparent bg-transparent px-1.5 text-right text-xs font-semibold tabular-nums hover:border-input focus:border-ring focus:bg-card focus:shadow-sm transition-colors" />
                            <input inputMode="numeric" placeholder="qtd" value={rascunho[`${ch}::o`] ?? (m.orders != null ? String(m.orders) : "")}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRascunho((p) => ({ ...p, [`${ch}::o`]: e.target.value }))}
                              onBlur={(e: React.FocusEvent<HTMLInputElement>) => { setRascunho((p) => { const n = { ...p }; delete n[`${ch}::o`]; return n; }); const novo = paraNumero(e.target.value); if (novo !== m.orders) salvar(linha.client_id, m.month, "orders", e.target.value); }}
                              className="w-full max-w-[72px] h-7 rounded border border-transparent bg-transparent px-1.5 text-right text-[10px] text-muted-foreground tabular-nums hover:border-input focus:border-ring focus:text-foreground focus:bg-card focus:shadow-sm transition-colors" />
                            <span className={cn("text-[10px] font-bold tabular-nums", roas == null ? "text-muted-foreground" : roas >= 1 ? "text-emerald-500" : "text-red-500")}>
                              {roas == null ? " " : `${roas.toFixed(2)}x`}
                              {m.partial && <em className="not-italic text-amber-500 ml-1 font-normal">parcial</em>}
                            </span>
                            {custoPorVenda(m.spend, m.orders) != null && <span className="text-[10px] text-muted-foreground tabular-nums" title="Custo por venda">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: linha.currency }).format(custoPorVenda(m.spend, m.orders)!)}/venda</span>}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="border-t-2 border-border bg-muted/20">
                  <th className="text-left p-2 font-semibold text-foreground">Todos</th>
                  {totaisPorMes.map((t) => {
                    const roas = t.revenue != null && t.spend > 0 ? t.revenue / t.spend : null;
                    return (
                      <td key={t.mes} className="p-2 align-top">
                        <div className="grid gap-1 justify-items-end">
                          <span className="text-[10px] text-muted-foreground tabular-nums">{t.spend > 0 ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(t.spend) : "—"}</span>
                          <span className="text-xs font-bold tabular-nums">{t.revenue != null ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(t.revenue) : "—"}</span>
                          <span className="text-[10px] text-muted-foreground font-semibold">
                            {t.orders != null ? `${t.orders.toLocaleString("pt-BR")} venda${t.orders === 1 ? "" : "s"}` : " "}
                            {t.orders != null && t.qtdIncompleta && <em className="not-italic text-amber-500 ml-1">{t.clientesComQtd}/{t.clientesComGasto}</em>}
                          </span>
                          <span className={cn("text-[10px] font-bold tabular-nums", roas == null ? "text-muted-foreground" : roas >= 1 ? "text-emerald-500" : "text-red-500")}>
                            {roas == null ? " " : `${roas.toFixed(2)}x`}
                            {t.parcial && <em className="not-italic text-amber-500 ml-1 font-normal">parcial</em>}
                            {!t.parcial && t.incompleto && <em className="not-italic text-amber-500 ml-1 font-normal">{t.clientesComVenda}/{t.clientesComGasto}</em>}
                          </span>
                          {custoPorVenda(t.spend, t.orders) != null && <span className="text-[10px] text-muted-foreground tabular-nums">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(custoPorVenda(t.spend, t.orders)!)}/venda</span>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Ticket médio table */}
      {data && linhasFiltradas.some((l) => l.months.some((m) => m.orders != null)) && (
        <section>
          <h2 className="text-base font-semibold mb-1">Por venda: ticket médio e custo</h2>
          <p className="text-xs text-muted-foreground mb-3">Ticket = valor ÷ quantidade; custo = investido ÷ quantidade.</p>
          <div className="overflow-x-auto rounded-lg border border-border/50">
            <table className="w-full text-[11px] min-w-[760px]">
              <thead><tr className="border-b border-border bg-muted/30">
                <th className="text-left p-2 font-semibold text-muted-foreground uppercase tracking-wider">Cliente</th>
                {data.months.map((mes) => <th key={mes} className="p-2 font-semibold text-muted-foreground uppercase tracking-wider text-right">{rotuloMes(mes)}</th>)}
              </tr></thead>
              <tbody>
                {linhasFiltradas.map((linha) => (
                  <tr key={linha.client_id} className="border-b border-border/30">
                    <th className="text-left p-2 font-semibold text-foreground whitespace-nowrap"><NomeCliente nome={linha.name} contas={linha.accounts}>{linha.group && <SeloGrupo grupo={linha.group} />}</NomeCliente></th>
                    {linha.months.map((m) => {
                      const ticket = ticketMedio(m.revenue, m.orders);
                      const custo = custoPorVenda(m.spend, m.orders);
                      const prejuizo = ticket != null && custo != null && custo > ticket;
                      return (
                        <td key={m.month} className="p-2">
                          <div className="grid gap-1 justify-items-end">
                            <span className="text-xs font-bold tabular-nums">{ticket != null ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: linha.currency }).format(ticket) : "—"}</span>
                            {custo != null && <span className={cn("text-[10px] tabular-nums", prejuizo ? "text-red-500 font-semibold" : "text-muted-foreground")}>custo {new Intl.NumberFormat("pt-BR", { style: "currency", currency: linha.currency }).format(custo)}</span>}
                            {m.orders != null && <span className="text-[10px] text-muted-foreground tabular-nums">{m.orders.toLocaleString("pt-BR")} venda{m.orders === 1 ? "" : "s"}</span>}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="border-t-2 border-border bg-muted/20">
                  <th className="text-left p-2 font-semibold text-foreground">Todos</th>
                  {totaisPorMes.map((t) => {
                    const ticket = ticketMedio(t.revenue, t.orders);
                    const custo = custoPorVenda(t.spend, t.orders);
                    return (
                      <td key={t.mes} className="p-2">
                        <div className="grid gap-1 justify-items-end">
                          <span className="text-xs font-bold tabular-nums">{ticket != null ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(ticket) : "—"}</span>
                          {custo != null && <span className={cn("text-[10px] tabular-nums", ticket != null && custo > ticket ? "text-red-500 font-semibold" : "text-muted-foreground")}>custo {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(custo)}</span>}
                          {t.orders != null && <span className="text-[10px] text-muted-foreground tabular-nums">{t.orders.toLocaleString("pt-BR")} venda{t.orders === 1 ? "" : "s"}</span>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Group summary */}
      {!clientId && data && linhasFiltradas.length > 0 && totalsGrupo.length > 1 && (
        <Card><CardContent className="p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Resumo por grupo</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-border text-muted-foreground uppercase tracking-wider">
                <th className="text-left p-2 font-semibold">Grupo</th>
                <th className="text-right p-2 font-semibold">Investido</th>
                <th className="text-right p-2 font-semibold">Vendas</th>
                <th className="text-right p-2 font-semibold">Qtd</th>
                <th className="text-right p-2 font-semibold">ROI</th>
              </tr></thead>
              <tbody>
                {totalsGrupo.map((t) => (
                  <tr key={t.group.name} className="border-b border-border/30">
                    <td className="p-2 font-semibold"><span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.group.color }} />{t.group.name}</span></td>
                    <td className="p-2 text-right tabular-nums">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(t.spend)}</td>
                    <td className="p-2 text-right tabular-nums font-semibold">{t.revenue > 0 ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(t.revenue) : "—"}</td>
                    <td className="p-2 text-right tabular-nums">{t.orders > 0 ? String(t.orders) : "—"}</td>
                    <td className={cn("p-2 text-right tabular-nums font-bold", t.roas != null ? t.roas >= 1 ? "text-emerald-500" : "text-red-500" : "text-muted-foreground")}>{t.roas != null ? `${t.roas.toFixed(2)}x` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent></Card>
      )}
    </div>
  );
}
