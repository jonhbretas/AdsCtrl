// app/api/account/detail/route.ts
// Detalhe ao vivo. A plataforma é resolvida pelo banco (fonte autoritativa).
// Ex: /api/account/detail?account_id=act_123&since=2026-07-13&until=2026-07-20
// O payload inteiro fica em account_detail_cache: período fechado (mês
// passado, 14D de ontem pra trás...) não muda mais — serve do banco por 24h
// sem tocar na Meta. Período que inclui hoje vale 15min. ?fresh=1 ignora
// (usado pelo botão "Atualizar").

import { NextResponse } from "next/server";
import { getAccountDetail, tokenByIndex } from "@/lib/meta";
import { getGoogleAccountDetail } from "@/lib/google-ads";
import { resultFamilyForAccount } from "@/lib/report-data";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Período fechado (terminou ontem ou antes) não muda mais: vale por um dia.
// Período que inclui hoje ainda recebe dados: vale por poucos minutos.
const FRESH_CLOSED_MS = 24 * 60 * 60 * 1000;
const FRESH_OPEN_MS = 15 * 60 * 1000;
const CACHE_RETENTION_DAYS = 7;

function defaultRange() {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const until = new Date();
  const since = new Date();
  since.setDate(until.getDate() - 7);
  return { since: fmt(since), until: fmt(until) };
}

function cacheWindow(until: string): number {
  const today = new Date().toISOString().slice(0, 10);
  return until < today ? FRESH_CLOSED_MS : FRESH_OPEN_MS;
}

async function purgeStale(supabase: ReturnType<typeof getServiceClient>) {
  const cutoff = new Date(Date.now() - CACHE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from("account_detail_cache").delete().lt("fetched_at", cutoff).then(() => undefined, () => undefined);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    let actId = (searchParams.get("account_id") || "").trim();
    if (!actId) return NextResponse.json({ error: "account_id é obrigatório." }, { status: 400 });
    const def = defaultRange();
    const since = searchParams.get("since") || def.since;
    const until = searchParams.get("until") || def.until;
    const fresh = searchParams.get("fresh") === "1";

    if (supabaseEnvMissing()) {
      return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    }
    const supabase = getServiceClient();
    const lookupId = actId.replace(/^act_/, "");
    const cacheKey = { account_id: lookupId, range_since: since, range_until: until };

    if (!fresh) {
      const { data: cached } = await supabase
        .from("account_detail_cache")
        .select("payload,fetched_at,hits")
        .match(cacheKey)
        .maybeSingle();
      if (cached?.payload) {
        const age = Date.now() - new Date(cached.fetched_at).getTime();
        if (age < cacheWindow(until)) {
          // Contador só para enxergar uso; falha aqui não pode derrubar a leitura.
          supabase
            .from("account_detail_cache")
            .update({ hits: (cached.hits || 0) + 1 })
            .match(cacheKey)
            .then(() => undefined, () => undefined);
          return NextResponse.json({ ...cached.payload, cached: true });
        }
      }
    }

    const { data: account, error } = await supabase
      .from("ad_accounts")
      .select("platform,hidden,token_ref")
      .eq("account_id", lookupId)
      .maybeSingle();
    if (error) throw error;
    if (!account) {
      return NextResponse.json({ error: "Conta não encontrada no catálogo." }, { status: 404 });
    }
    if (account.hidden) {
      return NextResponse.json({ error: "Conta oculta. Reative-a antes de consultar dados." }, { status: 403 });
    }
    let detail;
    if (account.platform === "google") {
      detail = await getGoogleAccountDetail(actId, since, until);
    } else {
      // Meta aceita tanto "act_123" quanto "123".
      if (!actId.startsWith("act_")) actId = `act_${actId}`;
      const token = tokenByIndex(typeof account.token_ref === "number" ? account.token_ref : 0);
      // O foco do cliente define qual resultado o painel abre selecionado — a
      // mesma âncora que o relatório usa. Sem isso a heurística escolhe pela
      // ordem da lista e mede uma conta de conversas por leads de carona.
      const [metaDetail, result_family] = await Promise.all([
        getAccountDetail(actId, since, until, token),
        resultFamilyForAccount(lookupId),
      ]);
      detail = { ...metaDetail, result_family };
    }

    // Só cacheia sucesso. Escrita é rara (uma vez por janela) — a limpeza de
    // linhas velhas paga o preço nela, não na leitura quente.
    await supabase
      .from("account_detail_cache")
      .upsert({ ...cacheKey, payload: detail, fetched_at: new Date().toISOString(), hits: 0 })
      .then(() => undefined, () => undefined);
    await purgeStale(supabase);
    return NextResponse.json({ ...detail, cached: false });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao buscar detalhe." }, { status: 500 });
  }
}
