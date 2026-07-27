// app/api/sales/route.ts
// Vendas reais por cliente e mês: o número que a plataforma não tem.
//
// GET  ?months=6   -> matriz de clientes acompanhados x últimos N meses, com
//                     investimento agregado do histórico diário e a venda
//                     informada à mão.
// PUT  { client_id, month: "2026-07", revenue, orders, note }
//
// O investimento vem de daily_account_metrics somado pelas contas do cliente
// (client_ad_accounts). Meses em que o histórico não cobre o mês inteiro são
// marcados: sem isso, o ROAS real de um mês com 7 dias de dado pareceria
// excelente e a comparação mês a mês mentiria.

import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_MONTHS = 24;

class InputError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** "2026-07" ou "2026-07-15" -> "2026-07-01". O mês é sempre o primeiro dia. */
function normalizeMonth(raw: unknown): string {
  const text = String(raw || "").trim();
  const match = /^(\d{4})-(\d{2})/.exec(text);
  if (!match) throw new InputError("month deve estar no formato AAAA-MM.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new InputError("Mês inválido.");
  if (year < 2000 || year > 2100) throw new InputError("Ano inválido.");
  return `${match[1]}-${match[2]}-01`;
}

/** Últimos N meses, do mais recente para o mais antigo, em UTC. */
function lastMonths(count: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function monthEnd(monthStart: string): string {
  const d = new Date(monthStart + "T00:00:00Z");
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

/** Dias que o mês tem, e quantos deles já passaram (o mês vigente é parcial
    por natureza, e isso não é falha de histórico). */
function monthShape(monthStart: string) {
  const end = monthEnd(monthStart);
  const total = Number(end.slice(8, 10));
  const hoje = new Date().toISOString().slice(0, 10);
  const decorridos = hoje < monthStart ? 0 : hoje > end ? total : Number(hoje.slice(8, 10));
  return { total, decorridos, end, emCurso: hoje >= monthStart && hoje <= end };
}

function fail(error: unknown) {
  const status = error instanceof InputError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Falha na operação.";
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: Request) {
  try {
    if (supabaseEnvMissing()) throw new InputError("Supabase não configurado.", 503);
    const { searchParams } = new URL(req.url);
    const pedido = Number(searchParams.get("months") || 6);
    const months = lastMonths(Math.max(1, Math.min(MAX_MONTHS, Number.isFinite(pedido) ? pedido : 6)));
    const desde = months[months.length - 1];
    const ate = monthEnd(months[0]);

    const sb = getServiceClient();

    const { data: clients, error: clientsError } = await sb
      .from("clients")
      .select("id, name, currency, track_sales")
      .order("name");
    // A coluna só existe depois da migração. Dizer qual arquivo rodar poupa
    // uma ida ao log do Supabase.
    if (clientsError && /track_sales/.test(clientsError.message || "")) {
      return NextResponse.json(
        { error: "Rode supabase-migration-vendas.sql no SQL Editor do Supabase para acompanhar vendas." },
        { status: 503 }
      );
    }
    if (clientsError) throw clientsError;

    const acompanhados = (clients || []).filter((c: any) => c.track_sales);
    const ids = acompanhados.map((c: any) => c.id);
    if (!ids.length) {
      return NextResponse.json({ months, clients: [], allClients: clients || [], rows: [] });
    }

    const [{ data: vinculos }, { data: vendas, error: vendasError }] = await Promise.all([
      sb.from("client_ad_accounts").select("client_id, account_id").in("client_id", ids),
      sb.from("client_monthly_sales").select("client_id, month, revenue, orders, note").in("client_id", ids).gte("month", desde),
    ]);
    if (vendasError && /client_monthly_sales/.test(vendasError.message || "")) {
      return NextResponse.json(
        { error: "Rode supabase-migration-vendas.sql no SQL Editor do Supabase para acompanhar vendas." },
        { status: 503 }
      );
    }
    if (vendasError) throw vendasError;

    const contasPorCliente = new Map<string, string[]>();
    for (const v of vinculos || []) {
      const lista = contasPorCliente.get(v.client_id) || [];
      lista.push(v.account_id);
      contasPorCliente.set(v.client_id, lista);
    }
    const todasContas = [...new Set((vinculos || []).map((v: any) => v.account_id))];

    // Um SELECT para todas as contas e todo o intervalo; o agrupamento por mês
    // é feito aqui. Puxar por cliente x mês seriam dezenas de idas ao banco.
    const { data: diarios } = todasContas.length
      ? await sb
          .from("daily_account_metrics")
          .select("account_id, metric_date, spend")
          .in("account_id", todasContas)
          .gte("metric_date", desde)
          .lte("metric_date", ate)
      : { data: [] as any[] };

    const gastoPorConta = new Map<string, Map<string, { spend: number; dias: Set<string> }>>();
    for (const linha of diarios || []) {
      const mes = String(linha.metric_date).slice(0, 7) + "-01";
      const porMes = gastoPorConta.get(linha.account_id) || new Map();
      const atual = porMes.get(mes) || { spend: 0, dias: new Set<string>() };
      atual.spend += Number(linha.spend || 0);
      atual.dias.add(String(linha.metric_date));
      porMes.set(mes, atual);
      gastoPorConta.set(linha.account_id, porMes);
    }

    const vendaPorChave = new Map<string, any>();
    for (const v of vendas || []) {
      vendaPorChave.set(`${v.client_id}::${String(v.month).slice(0, 10)}`, v);
    }

    const rows = acompanhados.map((cliente: any) => {
      const contas = contasPorCliente.get(cliente.id) || [];
      const meses = months.map((mes) => {
        let spend = 0;
        const dias = new Set<string>();
        for (const conta of contas) {
          const registro = gastoPorConta.get(conta)?.get(mes);
          if (!registro) continue;
          spend += registro.spend;
          for (const dia of registro.dias) dias.add(dia);
        }
        const forma = monthShape(mes);
        const venda = vendaPorChave.get(`${cliente.id}::${mes}`);
        return {
          month: mes,
          spend,
          // Dias com dado x dias que já passaram. Menos que isso significa
          // histórico furado, e o ROAS do mês não é comparável.
          daysWithData: dias.size,
          daysElapsed: forma.decorridos,
          inProgress: forma.emCurso,
          partial: dias.size > 0 && dias.size < forma.decorridos,
          revenue: venda?.revenue != null ? Number(venda.revenue) : null,
          orders: venda?.orders != null ? Number(venda.orders) : null,
          note: venda?.note ?? null,
        };
      });
      return {
        client_id: cliente.id,
        name: cliente.name,
        currency: cliente.currency || "BRL",
        accounts: contas.length,
        months: meses,
      };
    });

    return NextResponse.json({ months, clients: acompanhados, allClients: clients || [], rows });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(req: Request) {
  try {
    if (supabaseEnvMissing()) throw new InputError("Supabase não configurado.", 503);
    const body = await req.json().catch(() => ({}));
    const clientId = String(body.client_id || "").trim();
    if (!clientId) throw new InputError("client_id é obrigatório.");
    const month = normalizeMonth(body.month);

    // Campo vazio significa "não sei", e não zero: null preserva a diferença
    // entre "não vendi nada" e "não informei ainda".
    const parseNumber = (raw: unknown, nome: string, inteiro = false): number | null => {
      if (raw === null || raw === undefined || String(raw).trim() === "") return null;
      const limpo = String(raw).trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
      const valor = Number(limpo);
      if (!Number.isFinite(valor)) throw new InputError(`${nome} não é um número.`);
      if (valor < 0) throw new InputError(`${nome} não pode ser negativo.`);
      return inteiro ? Math.round(valor) : Math.round(valor * 100) / 100;
    };

    const revenue = parseNumber(body.revenue, "Vendas");
    const orders = parseNumber(body.orders, "Pedidos", true);
    const note = body.note == null ? null : String(body.note).slice(0, 300) || null;

    const sb = getServiceClient();
    // O cliente tem de existir: sem isto, um id trocado cria linha órfã que
    // nunca aparece na tela e nunca é limpa.
    const { data: cliente, error: clienteError } = await sb
      .from("clients").select("id").eq("id", clientId).maybeSingle();
    if (clienteError) throw clienteError;
    if (!cliente) throw new InputError("Cliente não encontrado.", 404);

    // Tudo nulo = apagar o registro, em vez de guardar uma linha sem conteúdo.
    if (revenue === null && orders === null && !note) {
      const { error } = await sb.from("client_monthly_sales").delete()
        .eq("client_id", clientId).eq("month", month);
      if (error) throw error;
      return NextResponse.json({ ok: true, cleared: true, month });
    }

    const { error } = await sb.from("client_monthly_sales").upsert(
      { client_id: clientId, month, revenue, orders, note, updated_at: new Date().toISOString() },
      { onConflict: "client_id,month" }
    );
    if (error && /client_monthly_sales/.test(error.message || "")) {
      return NextResponse.json(
        { error: "Rode supabase-migration-vendas.sql no SQL Editor do Supabase para acompanhar vendas." },
        { status: 503 }
      );
    }
    if (error) throw error;

    return NextResponse.json({ ok: true, month, revenue, orders });
  } catch (error) {
    return fail(error);
  }
}
