// Laboratório de Criativos Meta.
//
// GET /api/creatives/meta?since=2026-07-01&until=2026-07-23
// GET /api/creatives/meta?account_id=123&since=...&until=...
//
// A seleção do banco é autoritativa: somente contas platform=meta, ACTIVE e
// hidden=false são consultadas. Um ID Google nunca chega à Graph API.

import { NextResponse } from "next/server";
import {
  getMetaCreativeLab,
  META_CREATIVE_METRIC_DEFINITIONS,
  MetaCreativeLabResult,
} from "@/lib/meta-creatives";
import { tokenByIndex } from "@/lib/meta";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type SelectedMetaAccount = {
  account_id: string;
  name: string;
  currency: string | null;
  token_ref: number | null;
};

const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 93;

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultRange(): { since: string; until: string } {
  const until = new Date();
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - 29);
  return { since: formatDate(since), until: formatDate(until) };
}

function parseDate(value: string, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} deve estar no formato YYYY-MM-DD.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || formatDate(date) !== value) {
    throw new Error(`${field} contém uma data inválida.`);
  }
  return date;
}

function validateRange(since: string, until: string) {
  const start = parseDate(since, "since");
  const end = parseDate(until, "until");
  if (start.getTime() > end.getTime()) {
    throw new Error("since não pode ser posterior a until.");
  }
  const days = Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
  if (days > MAX_RANGE_DAYS) {
    throw new Error(
      `O período máximo do laboratório é de ${MAX_RANGE_DAYS} dias.`
    );
  }
}

async function inBatches<T, R>(
  items: T[],
  size: number,
  task: (item: T) => Promise<R>
): Promise<R[]> {
  const output: R[] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(
      ...(await Promise.all(items.slice(index, index + size).map(task)))
    );
  }
  return output;
}

export async function GET(req: Request) {
  if (supabaseEnvMissing()) {
    return NextResponse.json(
      { error: "Supabase não configurado." },
      { status: 503 }
    );
  }

  try {
    const params = new URL(req.url).searchParams;
    const fallback = defaultRange();
    const since = params.get("since") || fallback.since;
    const until = params.get("until") || fallback.until;
    validateRange(since, until);

    const requestedAccount = (params.get("account_id") || "")
      .trim()
      .replace(/^act_/, "");
    const supabase = getServiceClient();
    let query = supabase
      .from("ad_accounts")
      .select("account_id,name,currency,token_ref")
      .eq("platform", "meta")
      .eq("hidden", false)
      .eq("status", "ACTIVE")
      .order("name");
    if (requestedAccount) query = query.eq("account_id", requestedAccount);

    const { data, error } = await query;
    if (error) throw error;
    const selected = (data || []) as SelectedMetaAccount[];
    if (requestedAccount && selected.length === 0) {
      return NextResponse.json(
        {
          error:
            "Conta Meta ativa e visível não encontrada. Confira o vínculo, status e a opção de ocultar.",
        },
        { status: 404 }
      );
    }

    const results = await inBatches(selected, 3, async (account) => {
      try {
        const result = await getMetaCreativeLab({
          accountId: account.account_id,
          accountName: account.name,
          currency: account.currency || "BRL",
          since,
          until,
          token: tokenByIndex(
            typeof account.token_ref === "number" ? account.token_ref : 0
          ),
        });
        return { ok: true as const, result };
      } catch (error: any) {
        return {
          ok: false as const,
          account_id: account.account_id,
          account_name: account.name,
          error:
            error?.message || "Erro ao consultar os criativos desta conta.",
        };
      }
    });

    const accounts: MetaCreativeLabResult[] = [];
    const errors: {
      account_id: string;
      account_name: string;
      error: string;
    }[] = [];
    for (const item of results) {
      if (item.ok) accounts.push(item.result);
      else
        errors.push({
          account_id: item.account_id,
          account_name: item.account_name,
          error: item.error,
        });
    }

    return NextResponse.json({
      platform: "meta",
      range: { since, until },
      accountCount: accounts.length,
      errors,
      definitions: META_CREATIVE_METRIC_DEFINITIONS,
      accounts,
    });
  } catch (error: any) {
    const message =
      error?.message || "Erro ao montar o laboratório de criativos.";
    const invalidInput =
      message.includes("YYYY-MM-DD") ||
      message.includes("data inválida") ||
      message.includes("since não pode") ||
      message.includes("período máximo");
    return NextResponse.json(
      { error: message },
      { status: invalidInput ? 400 : 500 }
    );
  }
}
