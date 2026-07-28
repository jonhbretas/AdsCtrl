"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui";
import { cn } from "@/lib/utils";
import { RefreshCw, Settings, AlertTriangle, CheckCircle2 } from "lucide-react";

interface MesDoCliente { month: string; spend: number; daysWithData: number; daysElapsed: number; inProgress: boolean; partial: boolean; revenue: number | null; orders: number | null; note: string | null; }
interface LinhaCliente { client_id: string; name: string; currency: string; accounts: number; group?: { name: string; color: string } | null; months: MesDoCliente[]; }
interface Payload { months: string[]; rows: LinhaCliente[]; allClients: { id: string; name: string; track_sales?: boolean }[]; }

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function SeloGrupo({ grupo }: { grupo: { name: string; color: string } }) {
  return <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap" style={{ backgroundColor: grupo.color + "22", color: grupo.color }}>{grupo.name}</span>;
}
function rotuloMes(iso: string, longo = false) { const [ano, mes] = iso.split("-"); const nome = MESES[Number(mes) - 1] || mes; return longo ? `${nome}/${ano}` : `${nome}/${ano.slice(2)}`; }
function paraNumero(texto: string): number | null { const limpo = texto.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", "."); if (!limpo) return null; const valor = Number(limpo); return Number.isFinite(valor) ? valor : null; }
function paraTexto(valor: number | null, emEdicao: boolean): string { if (valor == null) return ""; if (emEdicao) return String(valor).replace(".", ","); return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
const ticketMedio = (r: number | null, o: number | null) => r != null && o != null && o > 0 ? r / o : null;
const custoPorVenda = (s: number, o: number | null) => o != null && o > 0 && s > 0 ? s / o : null;

export default function VendasPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [meses, setMeses] = useState(6);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [emFoco, setEmFoco] = useState<string | null>(null);

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

  const semClientes = !!data && data.rows.length === 0;

  function chave(clienteId: string, mes: string, campo: string) { return `${clienteId}::${mes}::${campo}`; }

  return (
    <div className="p-4 md:p-6 md:ml-56 pb-20 md:pb-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vendas reais</h1>
          <p className="text-sm text-muted-foreground mt-0.5">O valor que de fato entrou, mês a mês, contra o investido.</p>
        </div>
        <div className="flex items-center gap-2">
          {data && <Badge variant="secondary" className="text-[11px]">{data.rows.length} cliente(s)</Badge>}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-semibold">Meses</span>
            <select value={meses} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMeses(Number(e.target.value))} className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm">{[3, 6, 12, 24].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </label>
          <Button variant="ghost" size="sm" onClick={() => carregar()} disabled={carregando}><RefreshCw className={cn("h-3.5 w-3.5 mr-1", carregando && "animate-spin")} /> Atualizar</Button>
          <Link href="/admin#clients"><Button variant="secondary" size="sm"><Settings className="h-3.5 w-3.5 mr-1" /> Clientes</Button></Link>
        </div>
      </div>

      {erro && <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/20 bg-red-500/10 text-sm text-red-500"><AlertTriangle className="h-4 w-4 shrink-0" />{erro}<button onClick={() => setErro(null)} className="ml-auto bg-transparent border-none cursor-pointer">✕</button></div>}
      {aviso && <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-sm text-emerald-500"><CheckCircle2 className="h-4 w-4 shrink-0" />{aviso}<button onClick={() => setAviso(null)} className="ml-auto bg-transparent border-none cursor-pointer">✕</button></div>}

      {carregando && !data && <div className="space-y-3"><Skeleton className="h-20 rounded-lg" /><Skeleton className="h-28 rounded-lg" /></div>}

      {semClientes && (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          <p className="text-lg mb-1">◷</p>
          <p className="font-semibold text-foreground">Nenhum cliente marcado para acompanhar vendas</p>
          <p className="text-xs mt-1">Em Configurações, marque "Acompanhar vendas reais" em cada cliente.</p>
          <Link href="/admin#clients"><Button variant="default" size="sm" className="mt-3"><Settings className="h-3.5 w-3.5 mr-1" /> Configurações</Button></Link>
        </CardContent></Card>
      )}

      {/* Current month entry */}
      {data && data.rows.length > 0 && mesVigente && (
        <section>
          <h2 className="text-base font-semibold mb-1">Lançar vendas de {rotuloMes(mesVigente, true)}</h2>
          <p className="text-xs text-muted-foreground mb-3">Qualquer mês é editável — na tabela abaixo também.</p>
          <Card><CardContent className="p-4 space-y-3">
            {data.rows.map((linha) => {
              const m = linha.months.find((x) => x.month === mesVigente);
              if (!m) return null;
              const ch = `${linha.client_id}::${mesVigente}`;
              const roas = m.revenue != null && m.spend > 0 ? m.revenue / m.spend : null;
              return (
                <div key={linha.client_id} className="grid grid-cols-[1.4fr_150px_110px_auto_auto] gap-3 items-end pb-3 border-b border-border/50 last:pb-0 last:border-b-0">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{linha.name}{linha.group && <SeloGrupo grupo={linha.group} />}</div>
                    <div className="text-[11px] text-muted-foreground">investido {new Intl.NumberFormat("pt-BR", { style: "currency", currency: linha.currency }).format(m.spend)}{m.inProgress && " · mês em curso"}</div>
                  </div>
                  <label className="grid gap-1 min-w-0"><span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Vendas (R$)</span>
                    <input inputMode="decimal" placeholder="—" value={rascunho[`${ch}::r`] ?? paraTexto(m.revenue, emFoco === `${ch}::r`)}
                      onFocus={() => setEmFoco(`${ch}::r`)}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRascunho((p) => ({ ...p, [`${ch}::r`]: e.target.value }))}
                      onBlur={(e: React.FocusEvent<HTMLInputElement>) => { setEmFoco(null); setRascunho((p) => { const n = { ...p }; delete n[`${ch}::r`]; return n; }); const t = e.target.value; const novo = paraNumero(t); if (novo !== m.revenue) salvar(linha.client_id, mesVigente, "revenue", t); }}
                      className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm text-right" />
                  </label>
                  <label className="grid gap-1 min-w-0"><span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Vendas (qtd)</span>
                    <input inputMode="numeric" placeholder="—" value={rascunho[`${ch}::o`] ?? (m.orders != null ? String(m.orders) : "")}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRascunho((p) => ({ ...p, [`${ch}::o`]: e.target.value }))}
                      onBlur={(e: React.FocusEvent<HTMLInputElement>) => { setRascunho((p) => { const n = { ...p }; delete n[`${ch}::o`]; return n; }); const novo = paraNumero(e.target.value); if (novo !== m.orders) salvar(linha.client_id, mesVigente, "orders", e.target.value); }}
                      className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm text-right" />
                  </label>
                  <div className="text-right min-w-[108px]">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Retorno</div>
                    <div className={cn("text-base font-bold", roas == null ? "text-muted-foreground" : roas >= 1 ? "text-emerald-500" : "text-red-500")}>{roas == null ? "—" : `${roas.toFixed(2)}x`}</div>
                    <div className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">
                      {ticketMedio(m.revenue, m.orders) != null && <div title="Ticket médio">ticket {new Intl.NumberFormat("pt-BR", { style: "currency", currency: linha.currency }).format(ticketMedio(m.revenue, m.orders)!)}</div>}
                      {custoPorVenda(m.spend, m.orders) != null && <div title="Custo por venda">custo/venda {new Intl.NumberFormat("pt-BR", { style: "currency", currency: linha.currency }).format(custoPorVenda(m.spend, m.orders)!)}</div>}
                    </div>
                  </div>
                  <div className="w-14 text-right text-[11px] text-muted-foreground">{salvando === ch ? "salvando…" : ""}</div>
                </div>
              );
            })}
          </CardContent></Card>
        </section>
      )}

      {/* Month-by-month table */}
      {data && data.rows.length > 0 && (
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
                {data.rows.map((linha) => (
                  <tr key={linha.client_id} className="border-b border-border/30 last:border-b-0">
                    <th className="text-left p-2 font-semibold text-foreground whitespace-nowrap">{linha.name}{linha.group && <SeloGrupo grupo={linha.group} />}</th>
                    {linha.months.map((m) => {
                      const ch = `${linha.client_id}::${m.month}`;
                      const roas = m.revenue != null && m.spend > 0 ? m.revenue / m.spend : null;
                      const semDado = m.spend === 0 && m.revenue == null;
                      return (
                        <td key={m.month} className={cn("p-2 align-top", semDado && "bg-muted/10")}>
                          <div className="grid gap-1 justify-items-end">
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
      {data && data.rows.some((l) => l.months.some((m) => m.orders != null)) && (
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
                {data.rows.map((linha) => (
                  <tr key={linha.client_id} className="border-b border-border/30">
                    <th className="text-left p-2 font-semibold text-foreground whitespace-nowrap">{linha.name}{linha.group && <SeloGrupo grupo={linha.group} />}</th>
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
    </div>
  );
}
