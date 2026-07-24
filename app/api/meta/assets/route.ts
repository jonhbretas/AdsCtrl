import { NextResponse } from "next/server";
import {
  AdAccountRaw,
  availableBalance,
  centsToUnit,
  isPrepaidAccount,
  listAdAccountsForToken,
  mapAccountStatus,
  META_AD_ACCOUNT_FIELDS,
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

type DateRange = { since: string; until: string };

function dateInTimeZone(timeZone: string | undefined, daysAgo: number): string {
  const formatter = (zone: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = formatter(timeZone || "America/Sao_Paulo").formatToParts(new Date());
  } catch {
    parts = formatter("America/Sao_Paulo").formatToParts(new Date());
  }
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
  const date = new Date(Date.UTC(values.year, values.month - 1, values.day));
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function rangeForTimeZone(timeZone?: string): DateRange {
  return {
    since: dateInTimeZone(timeZone, 6),
    until: dateInTimeZone(timeZone, 0),
  };
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

async function loadSpecificConnection(
  index: number,
  accountId: string
): Promise<ConnectionResult> {
  const token = tokenByIndex(index);
  const [profile, account] = await Promise.allSettled([
    graphObject<{ id?: string; name?: string }>("me", "id,name", token),
    graphObject<AdAccountRaw>(
      `act_${accountId}`,
      META_AD_ACCOUNT_FIELDS.join(","),
      token
    ),
  ]);
  const errors = [profile, account]
    .filter((item): item is PromiseRejectedResult => item.status === "rejected")
    .map((item) => item.reason?.message || "Falha desconhecida");
  const accountResult = account.status === "fulfilled" ? account.value : null;
  const accounts = accountResult ? [accountResult] : [];
  const business = accountResult?.business;
  return {
    index,
    user_id: profile.status === "fulfilled" ? profile.value.id || null : null,
    name:
      profile.status === "fulfilled"
        ? profile.value.name || `Conexão Meta ${index + 1}`
        : `Conexão Meta ${index + 1}`,
    status:
      account.status === "rejected"
        ? "error"
        : errors.length
          ? "partial"
          : "ok",
    error: errors.length ? errors.join(" · ") : null,
    accounts,
    businesses:
      business?.id
        ? [{
            id: business.id,
            name: business.name || accountResult?.business_name || `BM ${business.id}`,
          }]
        : [],
  };
}

type SpendTarget = { accountId: string; range: DateRange };
type SpendRollup = {
  today: number;
  last7: number;
  available: boolean;
  range: DateRange;
};

async function batchSpend(
  targets: SpendTarget[],
  token: string
): Promise<Map<string, SpendRollup>> {
  const output = new Map<string, SpendRollup>();
  for (let start = 0; start < targets.length; start += 45) {
    const chunk = targets.slice(start, start + 45);
    const batch = chunk.map(({ accountId, range }) => ({
      method: "GET",
      relative_url:
        `act_${accountId}/insights?fields=spend,date_start&time_increment=1&time_range=` +
        encodeURIComponent(JSON.stringify(range)),
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
    chunk.forEach(({ accountId, range }, index) => {
      const item = payload[index];
      if (!item || item.code < 200 || item.code >= 300) {
        output.set(accountId, {
          today: 0,
          last7: 0,
          available: false,
          range,
        });
        return;
      }
      const parsed = JSON.parse(item.body || "{}");
      const rows = parsed?.data || [];
      output.set(accountId, {
        today: rows.find((row: any) => row.date_start === range.until)?.spend
          ? Number(
              rows.find((row: any) => row.date_start === range.until).spend
            )
          : 0,
        last7: rows.reduce(
          (sum: number, row: any) => sum + Number(row.spend || 0),
          0
        ),
        available: true,
        range,
      });
    });
  }
  return output;
}

export async function GET(req: Request) {
  try {
    if (supabaseEnvMissing()) {
      return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    }
    const params = new URL(req.url).searchParams;
    const mode = params.get("mode");
    const requestedAccount = (params.get("account_id") || "")
      .trim()
      .replace(/^act_/, "");
    const supabase = getServiceClient();

    if (mode === "catalog") {
      const { data: rows, error } = await supabase
        .from("ad_accounts")
        .select("account_id,name,status,hidden,currency")
        .eq("platform", "meta")
        .eq("hidden", false)
        .order("name");
      if (error) throw error;
      return NextResponse.json({
        mode: "catalog",
        accounts: rows || [],
      });
    }

    const count = tokenCount();
    if (!count) {
      return NextResponse.json(
        { error: "Nenhuma conexão Meta configurada no servidor." },
        { status: 503 }
      );
    }

    const { data: hiddenRows, error: hiddenError } = await supabase
      .from("ad_accounts")
      .select("account_id")
      .eq("platform", "meta")
      .eq("hidden", true);
    if (hiddenError) throw hiddenError;
    const hiddenAccountIds = new Set(
      (hiddenRows || []).map((row: any) => String(row.account_id))
    );

    let connections: ConnectionResult[];
    if (requestedAccount) {
      const { data: selected, error } = await supabase
        .from("ad_accounts")
        .select("account_id,platform,token_ref,hidden")
        .eq("account_id", requestedAccount)
        .maybeSingle();
      if (error) throw error;
      if (!selected || selected.platform !== "meta") {
        return NextResponse.json(
          { error: "Conta Meta não encontrada no catálogo." },
          { status: 404 }
        );
      }
      if (selected.hidden) {
        return NextResponse.json(
          {
            error: "Esta conta está oculta. Desoculte-a para consultar a Meta.",
          },
          { status: 409 }
        );
      }
      const storedIndex =
        typeof selected.token_ref === "number" &&
        selected.token_ref >= 0 &&
        selected.token_ref < count
          ? selected.token_ref
          : 0;
      const candidateIndexes = [
        storedIndex,
        ...Array.from({ length: count }, (_, index) => index).filter(
          (index) => index !== storedIndex
        ),
      ];
      let selectedConnection: ConnectionResult | null = null;
      const attemptErrors: string[] = [];
      for (const tokenIndex of candidateIndexes) {
        const attempt = await loadSpecificConnection(tokenIndex, requestedAccount);
        if (attempt.accounts.length) {
          selectedConnection = attempt;
          break;
        }
        if (attempt.error) attemptErrors.push(attempt.error);
      }
      if (!selectedConnection) {
        return NextResponse.json(
          {
            error:
              attemptErrors[0] ||
              "As conexões Meta não conseguiram acessar a conta selecionada.",
          },
          { status: 502 }
        );
      }
      connections = [selectedConnection];
    } else {
      connections = await Promise.all(
        Array.from({ length: count }, (_, index) => loadConnection(index))
      );
      connections = connections.map((connection) => ({
        ...connection,
        accounts: connection.accounts.filter(
          (account) => !hiddenAccountIds.has(account.account_id)
        ),
      }));
    }
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
      ? await supabase
          .from("ad_accounts")
          .select("account_id,hidden,status")
          .in("account_id", accountIds)
      : { data: [] as any[] };
    const catalog = new Map(
      (catalogRows || []).map((row: any) => [row.account_id, row])
    );
    const items = [...accountMap.entries()];
    const targetsByConnection = new Map<number, SpendTarget[]>();
    for (const [accountId, entry] of items) {
      const tokenIndex = entry.connection_indexes[0] || 0;
      const targets = targetsByConnection.get(tokenIndex) || [];
      targets.push({
        accountId,
        range: rangeForTimeZone(entry.raw.timezone_name),
      });
      targetsByConnection.set(tokenIndex, targets);
    }
    const spendByAccount = new Map<string, SpendRollup>();
    await Promise.all(
      [...targetsByConnection.entries()].map(async ([tokenIndex, targets]) => {
        const metrics = await batchSpend(
          targets,
          tokenByIndex(tokenIndex)
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
        range: rangeForTimeZone(entry.raw.timezone_name),
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
        metric_range: spend.range,
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

    const responseRange =
      requestedAccount && accounts[0]
        ? accounts[0].metric_range
        : rangeForTimeZone("America/Sao_Paulo");

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      scope: requestedAccount ? "account" : "all",
      requested_account_id: requestedAccount || null,
      range: responseRange,
      range_uses_account_timezone: true,
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
