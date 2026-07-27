"use client";

// app/vendas/page.tsx
// Vendas reais informadas à mão, contra o investimento medido.
//
// Por que a tela existe: a plataforma reporta CONVERSÃO, não venda. Campanha
// de mensagem fecha o pedido no WhatsApp e nada volta para o Meta; serviço
// fecha no telefone. Sem este número, "como anda o cliente" é inferência.
//
// A tela tem duas partes de propósito:
//  - o lançamento do mês vigente, que é a tarefa recorrente (abrir, digitar,
//    salvar), com um campo por cliente e nada mais no caminho;
//  - a tabela mês a mês, que é a leitura: investido, vendido e o retorno real
//    lado a lado, para comparar cliente com cliente e mês com mês.
//
// Qualquer mês é editável, não só o vigente: sem poder preencher o passado a
// tabela histórica nunca sai do zero.

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, EmptyState, Notice, PageHeader, SkeletonCard } from "@/components/ui";
import { money, num } from "@/lib/format";

interface MesDoCliente {
  month: string;
  spend: number;
  daysWithData: number;
  daysElapsed: number;
  inProgress: boolean;
  partial: boolean;
  revenue: number | null;
  orders: number | null;
  note: string | null;
}
interface LinhaCliente {
  client_id: string;
  name: string;
  currency: string;
  accounts: number;
  months: MesDoCliente[];
}
interface Payload {
  months: string[];
  rows: LinhaCliente[];
  allClients: { id: string; name: string; track_sales?: boolean }[];
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function rotuloMes(iso: string, longo = false) {
  const [ano, mes] = iso.split("-");
  const nome = MESES[Number(mes) - 1] || mes;
  return longo ? `${nome}/${ano}` : `${nome}/${ano.slice(2)}`;
}

/** Aceita "12.500,50", "12500.5" e "12500". Vazio é ausência, não zero. */
function paraNumero(texto: string): number | null {
  const limpo = texto.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (!limpo) return null;
  const valor = Number(limpo);
  return Number.isFinite(valor) ? valor : null;
}

/** Como o número aparece quando a célula NÃO está em edição. Sem "R$": a
    coluna já é de dinheiro e o símbolo repetido 24 vezes só rouba largura. */
function paraTexto(valor: number | null, emEdicao: boolean): string {
  if (valor == null) return "";
  if (emEdicao) return String(valor).replace(".", ",");
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** As duas leituras que a quantidade abre, e que o valor sozinho não dá:
    quanto entra por venda, e quanto custa conquistar uma. Um retorno de 4x com
    ticket caindo é um negócio diferente de um retorno de 4x com ticket estável —
    e é a quantidade que separa os dois casos. */
const ticketMedio = (revenue: number | null, orders: number | null) =>
  revenue != null && orders != null && orders > 0 ? revenue / orders : null;
const custoPorVenda = (spend: number, orders: number | null) =>
  orders != null && orders > 0 && spend > 0 ? spend / orders : null;

export default function VendasPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [meses, setMeses] = useState(6);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  // Texto em edição por célula, para o campo não brigar com o valor salvo.
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  // Célula em foco. Fora do foco o número aparece formatado ("18.000,00");
  // dentro, cru — formatar enquanto se digita move o cursor de lugar.
  const [emFoco, setEmFoco] = useState<string | null>(null);

  async function carregar(qtd = meses) {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/sales?months=${qtd}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || `Falha (HTTP ${r.status}).`);
      setData(d);
      setRascunho({});
    } catch (e: any) {
      setErro(e?.message ?? "Erro ao carregar as vendas.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar(meses);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meses]);

  const mesVigente = data?.months?.[0];

  async function salvar(clientId: string, month: string, campo: "revenue" | "orders", texto: string) {
    const chave = `${clientId}::${month}`;
    setSalvando(chave);
    setAviso(null);
    try {
      const atual = data?.rows.find((r) => r.client_id === clientId)?.months.find((m) => m.month === month);
      const corpo: Record<string, unknown> = {
        client_id: clientId,
        month: month.slice(0, 7),
        // Manda os dois campos sempre: o PUT substitui a linha, e omitir um
        // apagaria o que já estava lá.
        revenue: campo === "revenue" ? paraNumero(texto) : atual?.revenue ?? null,
        orders: campo === "orders" ? paraNumero(texto) : atual?.orders ?? null,
      };
      const r = await fetch("/api/sales", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || `Falha (HTTP ${r.status}).`);
      // Atualiza em memória; recarregar tudo a cada campo seria pesado e
      // perderia o foco de quem está digitando a linha de baixo.
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          rows: prev.rows.map((linha) =>
            linha.client_id !== clientId
              ? linha
              : {
                  ...linha,
                  months: linha.months.map((m) =>
                    m.month !== month
                      ? m
                      : { ...m, revenue: corpo.revenue as number | null, orders: corpo.orders as number | null }
                  ),
                }
          ),
        };
      });
      setAviso(`Salvo: ${rotuloMes(month, true)}.`);
    } catch (e: any) {
      setAviso(e?.message ?? "Falha ao salvar.");
      setErro(null);
    } finally {
      setSalvando(null);
    }
  }

  const totaisPorMes = useMemo(() => {
    if (!data) return [];
    return data.months.map((mes) => {
      let spend = 0;
      let revenue = 0;
      let orders = 0;
      let temVenda = false;
      // Quantidade e valor são informados de forma independente: há mês com
      // valor e sem quantidade. Somar só quem informou evita um custo por venda
      // calculado com o gasto de todos sobre a quantidade de alguns.
      let temQtd = false;
      let clientesComQtd = 0;
      // Se QUALQUER cliente tem histórico furado no mês, o total também está
      // furado. Sem herdar a marca, a última linha mostrava 6,43x limpo num
      // mês com 7 dias de dado — exatamente o número que não se pode comparar.
      let parcial = false;
      // Venda informada num cliente e investimento vindo de outro produzem um
      // retorno que não é de ninguém. Vale avisar.
      let clientesComVenda = 0;
      let clientesComGasto = 0;
      for (const linha of data.rows) {
        const m = linha.months.find((x) => x.month === mes);
        if (!m) continue;
        spend += m.spend;
        if (m.spend > 0) clientesComGasto++;
        if (m.partial) parcial = true;
        if (m.revenue != null) { revenue += m.revenue; temVenda = true; clientesComVenda++; }
        if (m.orders != null) { orders += m.orders; temQtd = true; clientesComQtd++; }
      }
      return {
        mes,
        spend,
        revenue: temVenda ? revenue : null,
        orders: temQtd ? orders : null,
        parcial,
        incompleto: clientesComVenda > 0 && clientesComVenda < clientesComGasto,
        // Quantidade parcial tem o mesmo problema do valor parcial, e por um
        // motivo pior: o gasto do total é de todos os clientes.
        qtdIncompleta: clientesComQtd > 0 && clientesComQtd < clientesComGasto,
        clientesComVenda,
        clientesComQtd,
        clientesComGasto,
      };
    });
  }, [data]);

  const semClientes = !!data && data.rows.length === 0;

  return (
    <div className="ec-page ec-touchzone" style={{ maxWidth: 1320 }}>
      <PageHeader
        title="Vendas reais"
        subtitle="O que a plataforma não sabe: o valor que de fato entrou, mês a mês, contra o que foi investido."
        meta={
          data && data.rows.length > 0 ? (
            <Badge>{data.rows.length} cliente(s) acompanhado(s)</Badge>
          ) : undefined
        }
        actions={
          <>
            <label className="ec-inline-field">
              <span>Meses</span>
              <select className="ec-input" value={meses} onChange={(e) => setMeses(Number(e.target.value))} style={{ width: "auto" }}>
                {[3, 6, 12, 24].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <Button variant="ghost" size="sm" onClick={() => carregar()} disabled={carregando}>
              {carregando ? "Atualizando…" : "↻ Atualizar"}
            </Button>
            <a href="/admin#clients" className="ec-btn" data-variant="secondary" data-size="sm">
              ⚙ Escolher clientes
            </a>
          </>
        }
      />

      {erro && (
        <div style={{ marginBottom: "var(--sp-4)" }}>
          <Notice tone="danger" onDismiss={() => setErro(null)}>{erro}</Notice>
        </div>
      )}
      {aviso && (
        <div style={{ marginBottom: "var(--sp-4)" }}>
          <Notice tone="ok" onDismiss={() => setAviso(null)}>{aviso}</Notice>
        </div>
      )}

      {carregando && !data && (
        <div style={{ display: "grid", gap: "var(--sp-3)" }}>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={4} />
        </div>
      )}

      {semClientes && (
        <EmptyState
          icon="◷"
          title="Nenhum cliente marcado para acompanhar vendas"
          hint="Em Configurações, na faixa de cada cliente, marque “Acompanhar vendas reais”. Só os marcados aparecem aqui — linha vazia esperando número é ruído, não lembrete."
          action={<a href="/admin#clients" className="ec-btn" data-variant="primary" data-size="sm">Ir para Configurações</a>}
        />
      )}

      {/* LANÇAMENTO DO MÊS VIGENTE — a tarefa recorrente, sem nada no caminho */}
      {data && data.rows.length > 0 && mesVigente && (
        <section className="ec-section">
          <h2 className="ec-section__title">Lançar vendas de {rotuloMes(mesVigente, true)}</h2>
          <p className="ec-section__hint">
            O valor que você digitar hoje conta para {rotuloMes(mesVigente, true)}. Dá para voltar e corrigir quando
            quiser, aqui ou na tabela abaixo.
          </p>
          <div className="ec-card ec-card--padded" style={{ display: "grid", gap: "var(--sp-3)" }}>
            {data.rows.map((linha) => {
              // A rota sempre devolve todos os meses, mas uma resposta antiga
              // em cache não deve derrubar a tela inteira num "undefined".
              const m = linha.months.find((x) => x.month === mesVigente);
              if (!m) return null;
              const chave = `${linha.client_id}::${mesVigente}`;
              const roas = m.revenue != null && m.spend > 0 ? m.revenue / m.spend : null;
              return (
                <div key={linha.client_id} className="ec-salesrow">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 650, fontSize: 13.5 }}>{linha.name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                      investido {money(m.spend, linha.currency)}
                      {m.inProgress && " · mês em curso"}
                    </div>
                  </div>
                  <label className="ec-field" style={{ minWidth: 0 }}>
                    <span className="ec-field__label">Vendas (R$)</span>
                    <input
                      className="ec-input"
                      inputMode="decimal"
                      placeholder="—"
                      value={rascunho[`${chave}::r`] ?? paraTexto(m.revenue, emFoco === `${chave}::r`)}
                      onFocus={() => setEmFoco(`${chave}::r`)}
                      onChange={(e) => setRascunho((p) => ({ ...p, [`${chave}::r`]: e.target.value }))}
                      onBlur={(e) => {
                        setEmFoco(null);
                        // Sai do rascunho para o valor voltar formatado.
                        setRascunho((p) => {
                          const n = { ...p };
                          delete n[`${chave}::r`];
                          return n;
                        });
                        const texto = e.target.value;
                        const novo = paraNumero(texto);
                        if (novo === m.revenue) return;
                        salvar(linha.client_id, mesVigente, "revenue", texto);
                      }}
                    />
                  </label>
                  <label className="ec-field" style={{ minWidth: 0 }}>
                    <span className="ec-field__label">Vendas (qtd)</span>
                    <input
                      className="ec-input"
                      inputMode="numeric"
                      placeholder="—"
                      value={rascunho[`${chave}::o`] ?? (m.orders != null ? String(m.orders) : "")}
                      onChange={(e) => setRascunho((p) => ({ ...p, [`${chave}::o`]: e.target.value }))}
                      onBlur={(e) => {
                        // Sai do rascunho como no valor: se o salvamento falhar,
                        // o campo volta ao que está no banco em vez de mostrar
                        // um número que não foi gravado.
                        setRascunho((p) => {
                          const n = { ...p };
                          delete n[`${chave}::o`];
                          return n;
                        });
                        const novo = paraNumero(e.target.value);
                        if (novo === m.orders) return;
                        salvar(linha.client_id, mesVigente, "orders", e.target.value);
                      }}
                    />
                  </label>
                  <div style={{ textAlign: "right", minWidth: 108 }}>
                    <div className="ec-field__label">Retorno</div>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: roas == null ? "var(--text-faint)" : roas >= 1 ? "var(--ok-600)" : "var(--danger-600)" }}>
                      {roas == null ? "—" : `${roas.toFixed(2)}x`}
                    </div>
                    {/* Valor e quantidade lado a lado no momento do lançamento:
                        é ali que se percebe o ticket que caiu. */}
                    <div style={{ fontSize: 10.5, color: "var(--text-faint)", lineHeight: 1.45, marginTop: 2 }}>
                      {ticketMedio(m.revenue, m.orders) != null && (
                        <div title="Ticket médio: valor vendido ÷ quantidade de vendas">
                          ticket {money(ticketMedio(m.revenue, m.orders)!, linha.currency)}
                        </div>
                      )}
                      {custoPorVenda(m.spend, m.orders) != null && (
                        <div title="Custo por venda: investido ÷ quantidade de vendas">
                          custo/venda {money(custoPorVenda(m.spend, m.orders)!, linha.currency)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ width: 58, textAlign: "right", fontSize: 11, color: "var(--text-faint)" }}>
                    {salvando === chave ? "salvando…" : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* TABELA MÊS A MÊS — a leitura */}
      {data && data.rows.length > 0 && (
        <section className="ec-section">
          <h2 className="ec-section__title">Mês a mês</h2>
          <p className="ec-section__hint">
            Investido, vendido em <strong>valor</strong> e em <strong>quantidade</strong>, e as duas leituras que saem
            daí: retorno (×) e custo por venda. Qualquer mês é editável — clique no campo para corrigir ou preencher o
            passado. <strong>parcial</strong> marca mês em que o histórico de investimento não cobre todos os dias, e
            nesse caso o retorno não é comparável com os outros.
          </p>
          <div className="ec-card ec-scroll-x">
            <table className="ec-salestable">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Cliente</th>
                  {data.months.map((mes) => (
                    <th key={mes}>{rotuloMes(mes)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((linha) => (
                  <tr key={linha.client_id}>
                    <th scope="row" style={{ textAlign: "left" }}>
                      <span title={`${linha.accounts} conta(s) de anúncio`}>{linha.name}</span>
                    </th>
                    {linha.months.map((m) => {
                      const chave = `${linha.client_id}::${m.month}`;
                      const roas = m.revenue != null && m.spend > 0 ? m.revenue / m.spend : null;
                      const semDado = m.spend === 0 && m.revenue == null;
                      return (
                        <td key={m.month} data-empty={semDado ? "true" : undefined}>
                          <div className="ec-salescell">
                            <span className="ec-salescell__spend" title="Investido, somado das contas do cliente">
                              {m.spend > 0 ? money(m.spend, linha.currency) : "—"}
                            </span>
                            <input
                              className="ec-salescell__input"
                              inputMode="decimal"
                              placeholder="valor"
                              aria-label={`Valor vendido por ${linha.name} em ${rotuloMes(m.month, true)}`}
                              value={
                                rascunho[`${chave}::r`]
                                ?? paraTexto(m.revenue, emFoco === `${chave}::r`)
                              }
                              onFocus={() => setEmFoco(`${chave}::r`)}
                              onChange={(e) => setRascunho((p) => ({ ...p, [`${chave}::r`]: e.target.value }))}
                              onBlur={(e) => {
                                setEmFoco(null);
                                // Sai do rascunho para o valor voltar a ser
                                // exibido formatado depois de salvar.
                                setRascunho((p) => {
                                  const n = { ...p };
                                  delete n[`${chave}::r`];
                                  return n;
                                });
                                const novo = paraNumero(e.target.value);
                                if (novo === m.revenue) return;
                                salvar(linha.client_id, m.month, "revenue", e.target.value);
                              }}
                            />
                            {/* Quantidade na mesma célula do valor: sem isso o
                                passado só podia receber valor, e metrificar por
                                quantidade ficava preso ao mês vigente. */}
                            <input
                              className="ec-salescell__input"
                              data-kind="qty"
                              inputMode="numeric"
                              placeholder="qtd"
                              aria-label={`Quantidade de vendas de ${linha.name} em ${rotuloMes(m.month, true)}`}
                              value={rascunho[`${chave}::o`] ?? (m.orders != null ? String(m.orders) : "")}
                              onChange={(e) => setRascunho((p) => ({ ...p, [`${chave}::o`]: e.target.value }))}
                              onBlur={(e) => {
                                setRascunho((p) => {
                                  const n = { ...p };
                                  delete n[`${chave}::o`];
                                  return n;
                                });
                                const novo = paraNumero(e.target.value);
                                if (novo === m.orders) return;
                                salvar(linha.client_id, m.month, "orders", e.target.value);
                              }}
                            />
                            <span
                              className="ec-salescell__roas"
                              data-tone={roas == null ? undefined : roas >= 1 ? "ok" : "bad"}
                            >
                              {roas == null ? " " : `${roas.toFixed(2)}x`}
                              {m.partial && (
                                <em
                                  title={`Histórico cobre ${m.daysWithData} de ${m.daysElapsed} dias já decorridos deste mês`}
                                  style={{ fontStyle: "normal", color: "var(--warn-700)", marginLeft: 4 }}
                                >
                                  parcial
                                </em>
                              )}
                            </span>
                            {custoPorVenda(m.spend, m.orders) != null && (
                              <span
                                className="ec-salescell__unit"
                                title="Custo por venda: investido ÷ quantidade de vendas"
                              >
                                {money(custoPorVenda(m.spend, m.orders)!, linha.currency)}/venda
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="ec-salestable__total">
                  <th scope="row" style={{ textAlign: "left" }}>Todos</th>
                  {totaisPorMes.map((t) => {
                    const roas = t.revenue != null && t.spend > 0 ? t.revenue / t.spend : null;
                    return (
                      <td key={t.mes}>
                        <div className="ec-salescell">
                          <span className="ec-salescell__spend">{t.spend > 0 ? money(t.spend, "BRL") : "—"}</span>
                          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13 }}>
                            {t.revenue != null ? money(t.revenue, "BRL") : "—"}
                          </span>
                          <span className="ec-salescell__unit" style={{ fontWeight: 650 }}>
                            {t.orders != null ? `${num(t.orders)} venda${t.orders === 1 ? "" : "s"}` : " "}
                            {t.orders != null && t.qtdIncompleta && (
                              <em
                                title={`${t.clientesComQtd} de ${t.clientesComGasto} clientes com quantidade informada. O custo por venda usa o investimento de todos, então está superestimado.`}
                                style={{ fontStyle: "normal", color: "var(--warn-700)", marginLeft: 4 }}
                              >
                                {t.clientesComQtd}/{t.clientesComGasto}
                              </em>
                            )}
                          </span>
                          <span className="ec-salescell__roas" data-tone={roas == null ? undefined : roas >= 1 ? "ok" : "bad"}>
                            {roas == null ? " " : `${roas.toFixed(2)}x`}
                            {t.parcial && (
                              <em title="Algum cliente tem histórico de investimento incompleto neste mês" style={{ fontStyle: "normal", color: "var(--warn-700)", marginLeft: 4 }}>
                                parcial
                              </em>
                            )}
                            {!t.parcial && t.incompleto && (
                              <em
                                title={`${t.clientesComVenda} de ${t.clientesComGasto} clientes com venda informada. O investimento soma todos, então o retorno está subestimado.`}
                                style={{ fontStyle: "normal", color: "var(--warn-700)", marginLeft: 4 }}
                              >
                                {t.clientesComVenda}/{t.clientesComGasto}
                              </em>
                            )}
                          </span>
                          {custoPorVenda(t.spend, t.orders) != null && (
                            <span className="ec-salescell__unit" title="Custo por venda: investido ÷ quantidade de vendas">
                              {money(custoPorVenda(t.spend, t.orders)!, "BRL")}/venda
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: "var(--sp-3)", lineHeight: 1.5 }}>
            O total soma moedas diferentes como se fossem a mesma — se algum cliente não estiver em real, leia por
            cliente, não pela última linha. O investido vem do histórico diário coletado, que começou em{" "}
            {data.months.length ? "maio de 2026" : "—"}; antes disso não há de onde tirar.
          </p>
        </section>
      )}

      {/* A quantidade informada abre duas leituras que o valor sozinho não dá:
          quanto entra por venda e quanto custa comprar uma. Juntas explicam um
          retorno que caiu sem o faturamento cair. */}
      {data && data.rows.some((l) => l.months.some((m) => m.orders != null)) && (
        <section className="ec-section">
          <h2 className="ec-section__title">Por venda: ticket médio e custo</h2>
          <p className="ec-section__hint">
            Só aparece onde você informou a quantidade. <strong>Ticket</strong> é o valor vendido ÷ quantidade;{" "}
            <strong>custo</strong> é o investido ÷ quantidade. Quando o custo por venda passa o ticket, cada venda
            nova custa mais do que traz.
          </p>
          <div className="ec-card ec-scroll-x">
            <table className="ec-salestable">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Cliente</th>
                  {data.months.map((mes) => <th key={mes}>{rotuloMes(mes)}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((linha) => (
                  <tr key={linha.client_id}>
                    <th scope="row" style={{ textAlign: "left" }}>{linha.name}</th>
                    {linha.months.map((m) => {
                      const ticket = ticketMedio(m.revenue, m.orders);
                      const custo = custoPorVenda(m.spend, m.orders);
                      // Custo acima do ticket é o sinal que a tela existe para
                      // dar: aparece em vermelho porque a venda dá prejuízo
                      // antes de qualquer custo de produto.
                      const noPrejuizo = ticket != null && custo != null && custo > ticket;
                      return (
                        <td key={m.month}>
                          <div className="ec-salescell">
                            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13 }}>
                              {ticket != null ? money(ticket, linha.currency) : "—"}
                            </span>
                            {custo != null && (
                              <span
                                className="ec-salescell__unit"
                                data-tone={noPrejuizo ? "bad" : undefined}
                                title={
                                  noPrejuizo
                                    ? "O custo por venda está acima do ticket médio deste mês."
                                    : "Custo por venda: investido ÷ quantidade de vendas"
                                }
                              >
                                custo {money(custo, linha.currency)}
                              </span>
                            )}
                            {m.orders != null && (
                              <span className="ec-salescell__unit">
                                {num(m.orders)} venda{m.orders === 1 ? "" : "s"}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="ec-salestable__total">
                  <th scope="row" style={{ textAlign: "left" }}>Todos</th>
                  {totaisPorMes.map((t) => {
                    const ticket = ticketMedio(t.revenue, t.orders);
                    const custo = custoPorVenda(t.spend, t.orders);
                    return (
                      <td key={t.mes}>
                        <div className="ec-salescell">
                          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13 }}>
                            {ticket != null ? money(ticket, "BRL") : "—"}
                          </span>
                          {custo != null && (
                            <span
                              className="ec-salescell__unit"
                              data-tone={ticket != null && custo > ticket ? "bad" : undefined}
                            >
                              custo {money(custo, "BRL")}
                            </span>
                          )}
                          {t.orders != null && (
                            <span className="ec-salescell__unit">
                              {num(t.orders)} venda{t.orders === 1 ? "" : "s"}
                            </span>
                          )}
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
