import { NextResponse } from "next/server";
import {
  AdAccountRaw,
  availableBalance,
  centsToUnit,
  isPrepaidAccount,
  listAdAccountsForToken,
  mapAccountStatus,
  tokenByIndex,
  tokenCount,
} from "@/lib/meta";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const GRAPH = "https://graph.facebook.com/v25.0";

type MetaBusiness = {
  id: string;
  name: string;
  verification_status?: string;
  created_time?: string;
};

type ConnectionResult = {
  index: number;
  user_id: string | null;
  name: string;
  status: "ok" | "partial" | "error";
  error: string | null;
  accounts: AdAccountRaw[];
  businesses: MetaBusiness[];
};

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function safeMetaError(status: number, payload: any): string {
  return `Meta API ${status}: ${payload?.error?.message || "falha na consulta"}`;
}

async function graphObject<T>(
  path: string,
  fields: string,
  token: string
): Promise<T> {
  const url = new URL(`${GRAPH}/${path}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", token);
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(safeMetaError(response.status, payload));
  return payload as T;
}

async function graphEdge<T>(
  path: string,
  fields: string,
  token: string
): Promise<T[]> {
  const rows: T[] = [];
  const first = new URL(`${GRAPH}/${path}`);
  first.searchParams.set("fields", fields);
  first.searchParams.set("limit", "200");
  first.searchParams.set("access_token", token);
  let next: string | undefined = first.toString();
  while (next) {
    const response: Response = await fetch(next, { cache: "no-store" });
    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(safeMetaError(response.status, payload));
    rows.push(...(payload?.data || []));
    next = payload?.paging?.next;
  }
  return rows;
}

async function loadConnection(index: number): Promise<ConnectionResult> {
  const token = tokenByIndex(index);
  const profilePromise = graphObject<{ id?: string; name?: string }>(
    "me",
    "id,name",
    token
  );
  const accountsPromise = listAdAccountsForToken(token);
  const businessesPromise = graphEdge<MetaBusiness>(
    "me/businesses",
    "id,name,verification_status,created_time",
    token
  ).catch(async () => graphEdge<MetaBusiness>("me/businesses", "id,name", token));
  const [profile, accounts, businesses] = await Promise.allSettled([
    profilePromise,
    accountsPromise,
    businessesPromise,
  ]);
  const errors = [profile, accounts, businesses]
    .filter((item): item is PromiseRejectedResult => item.status === "rejected")
    .map((item) => item.reason?.message || "Falha desconhecida");
  const accountRows = accounts.status === "fulfilled" ? accounts.value : [];
  const businessRows = businesses.status === "fulfilled" ? [...businesses.value] : [];
  const knownBusinesses = new Set(businessRows.map((business) => business.id));
  for (const account of accountRows) {
    const business = account.business;
    if (business?.id && !knownBusinesses.has(business.id)) {
      knownBusinesses.add(business.id);
      businessRows.push({
        id: business.id,
        name: business.name || account.business_name || `BM ${business.id}`,
      });
    }
  }
  return {
    index,
    user_id: profile.status === "fulfilled" ? profile.value.id || null : null,
    name:
      profile.status === "fulfilled"
        ? profile.value.name || `Conexão Meta ${index + 1}`
        : `Conexão Meta ${index + 1}`,
    status:
      errors.length === 0
        ? "ok"
        : accounts.status === "rejected"
          ? "error"
          : "partial",
    error: errors.length ? errors.join(" · ") : null,
    accounts: accountRows,
    businesses: businessRows,
  };
}

type SpendRollup = { today: number; last7: number; available: boolean };

async function batchSpend(
  accountIds: string[],
  token: string,
  since: string,
  until: string
): Promise<Map<string, SpendRollup>> {
  const output = new Map<string, SpendRollup>();
  for (let start = 0; start < accountIds.length; start += 45) {
    const ids = accountIds.slice(start, start + 45);
    const timeRange = JSON.stringify({ since, until });
    const batch = ids.map((accountId) => ({
      method: "GET",
      relative_url:
        `act_${accountId}/insights?fields=spend,date_start&time_increment=1&time_range=` +
        encodeURIComponent(timeRange),
    }));
    const body = new URLSearchParams({
      access_token: token,
      batch: JSON.stringify(batch),
      include_headers: "false",
    });
    const response = await fetch(GRAPH, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    const payload: any[] = await response.json().catch(() => []);
    ids.forEach((accountId, index) => {
      const item = payload[index];
      if (!item || item.code < 200 || item.code >= 300) {
        output.set(accountId, { today: 0, last7: 0, available: false });
        return;
      }
      const parsed = JSON.parse(item.body || "{}");
      const rows = parsed?.data || [];
      output.set(accountId, {
        today: rows.find((row: any) => row.date_start === until)?.spend
          ? Number(rows.find((row: any) => row.date_start === until).spend)
          : 0,
        last7: rows.reduce(
          (sum: number, row: any) => sum + Number(row.spend || 0),
          0
        ),
        available: true,
      });
    });
  }
  return output;
}

export async function GET() {
  try {
    if (supabaseEnvMissing()) {
      return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    }
    const count = tokenCount();
    if (!count) {
      return NextResponse.json(
        { error: "Nenhuma conexão Meta configurada no servidor." },
        { status: 503 }
      );
    }

    const connections = await Promise.all(
      Array.from({ length: count }, (_, index) => loadConnection(index))
    );
    const accountMap = new Map<
      string,
      { raw: AdAccountRaw; connection_indexes: number[] }
    >();
    for (const connection of connections) {
      for (const raw of connection.accounts) {
        const existing = accountMap.get(raw.account_id);
        if (existing) {
          if (!existing.connection_indexes.includes(connection.index)) {
            existing.connection_indexes.push(connection.index);
          }
        } else {
          accountMap.set(raw.account_id, {
            raw,
            connection_indexes: [connection.index],
          });
        }
      }
    }

    const accountIds = [...accountMap.keys()];
    const { data: catalogRows } = accountIds.length
      ? await getServiceClient()
          .from("ad_accounts")
          .select("account_id,hidden,status")
          .in("account_id", accountIds)
      : { data: [] as any[] };
    const catalog = new Map(
      (catalogRows || []).map((row: any) => [row.account_id, row])
    );
    const since = isoDaysAgo(6);
    const until = isoDaysAgo(0);
    const items = [...accountMap.entries()];
    const idsByConnection = new Map<number, string[]>();
    for (const [accountId, entry] of items) {
      const tokenIndex = entry.connection_indexes[0] || 0;
      const ids = idsByConnection.get(tokenIndex) || [];
      ids.push(accountId);
      idsByConnection.set(tokenIndex, ids);
    }
    const spendByAccount = new Map<string, SpendRollup>();
    await Promise.all(
      [...idsByConnection.entries()].map(async ([tokenIndex, ids]) => {
        const metrics = await batchSpend(
          ids,
          tokenByIndex(tokenIndex),
          since,
          until
        ).catch(() => new Map<string, SpendRollup>());
        for (const [accountId, values] of metrics) {
          spendByAccount.set(accountId, values);
        }
      })
    );
    const accounts = items.map(([accountId, entry]) => {
      const spend = spendByAccount.get(accountId) || {
        today: 0,
        last7: 0,
        available: false,
      };
      const raw = entry.raw;
      const spendCap = centsToUnit(raw.spend_cap);
      const amountSpent = centsToUnit(raw.amount_spent);
      const prepaid = raw.is_prepay_account ?? isPrepaidAccount(raw);
      const business = raw.business || raw.owner_business || null;
      const stored = catalog.get(accountId);
      return {
        account_id: accountId,
        name: raw.name,
        status: mapAccountStatus(raw.account_status),
        status_code: raw.account_status,
        disable_reason: raw.disable_reason || null,
        currency: raw.currency,
        timezone: raw.timezone_name || null,
        business: business
          ? {
              id: business.id || null,
              name: business.name || raw.business_name || null,
            }
          : null,
        connection_indexes: entry.connection_indexes,
        is_prepaid: prepaid,
        available_balance: prepaid ? availableBalance(raw) : null,
        billing_balance: centsToUnit(raw.balance),
        payment_summary: raw.funding_source_details?.display_string || null,
        spend_today: spend.today,
        spend_7d: spend.last7,
        metrics_available: spend.available,
        amount_spent: amountSpent,
        spend_cap: spendCap > 0 ? spendCap : null,
        spend_cap_remaining:
          spendCap > 0 ? Math.max(0, spendCap - amountSpent) : null,
        min_daily_budget:
          raw.min_daily_budget == null
            ? null
            : centsToUnit(String(raw.min_daily_budget)),
        permissions: raw.user_tasks || [],
        catalog: stored
          ? { synced: true, hidden: Boolean(stored.hidden), status: stored.status }
          : { synced: false, hidden: null, status: null },
      };
    });

    const businessMap = new Map<
      string,
      MetaBusiness & { connection_indexes: number[] }
    >();
    for (const connection of connections) {
      for (const business of connection.businesses) {
        const existing = businessMap.get(business.id);
        if (existing) {
          if (!existing.connection_indexes.includes(connection.index)) {
            existing.connection_indexes.push(connection.index);
          }
        } else {
          businessMap.set(business.id, {
            ...business,
            connection_indexes: [connection.index],
          });
        }
      }
    }

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      range: { since, until },
      limitations: {
        daily_spend_limit:
          "O limite diário imposto internamente pela Meta não é exposto pela API oficial. spend_cap é o limite total da conta.",
        secrets:
          "Tokens e cookies permanecem no servidor e nunca são retornados por este endpoint.",
      },
      connections: connections.map((connection) => ({
        index: connection.index,
        user_id: connection.user_id,
        name: connection.name,
        status: connection.status,
        error: connection.error,
        account_count: connection.accounts.length,
        business_count: connection.businesses.length,
      })),
      businesses: [...businessMap.values()].sort((left, right) =>
        left.name.localeCompare(right.name, "pt-BR")
      ),
      accounts: accounts.sort((left, right) =>
        left.name.localeCompare(right.name, "pt-BR")
      ),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Falha ao montar o raio-X Meta." },
      { status: 500 }
    );
  }
}
