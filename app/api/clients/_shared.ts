import type { SupabaseClient } from "@supabase/supabase-js";

export const CLIENT_STATUSES = ["active", "paused", "archived"] as const;
export const CLIENT_OBJECTIVES = [
  "awareness",
  "traffic",
  "engagement",
  "leads",
  "sales",
  "app",
  "other",
] as const;
export const CLIENT_KPIS = [
  "cpa",
  "cpl",
  "roas",
  "revenue",
  "conversions",
  "ctr",
  "cpc",
  "cpm",
  "custom",
] as const;
export const CLIENT_RESULT_FAMILIES = [
  "conversoes",
  "vendas",
  "leads",
  "mensagens",
  "cadastros",
  "cliques",
  "lpv",
  "engajamento",
] as const;

export class ClientInputError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ClientInputError";
    this.status = status;
  }
}

function nullableText(value: unknown, field: string, maxLength: number): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new ClientInputError(`${field} deve ser texto ou null.`);
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    throw new ClientInputError(`${field} deve ter no máximo ${maxLength} caracteres.`);
  }
  return normalized;
}

function nullableNonNegativeNumber(value: unknown, field: string): number | null {
  if (value === null || value === "") return null;
  const normalized = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new ClientInputError(`${field} deve ser um número maior ou igual a zero.`);
  }
  return normalized;
}

function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function clientPatchFromBody(body: unknown, creating = false): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ClientInputError("O corpo da requisição precisa ser um objeto JSON.");
  }

  const input = body as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if (creating || Object.prototype.hasOwnProperty.call(input, "name")) {
    if (typeof input.name !== "string" || !input.name.trim()) {
      throw new ClientInputError("name é obrigatório.");
    }
    const name = input.name.trim();
    if (name.length > 160) throw new ClientInputError("name deve ter no máximo 160 caracteres.");
    patch.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(input, "status")) {
    if (!CLIENT_STATUSES.includes(input.status as (typeof CLIENT_STATUSES)[number])) {
      throw new ClientInputError(`status deve ser: ${CLIENT_STATUSES.join(", ")}.`);
    }
    patch.status = input.status;
  }

  if (Object.prototype.hasOwnProperty.call(input, "objective")) {
    const objective = nullableText(input.objective, "objective", 40);
    if (objective && !CLIENT_OBJECTIVES.includes(objective as (typeof CLIENT_OBJECTIVES)[number])) {
      throw new ClientInputError(`objective deve ser: ${CLIENT_OBJECTIVES.join(", ")}.`);
    }
    patch.objective = objective;
  }

  if (Object.prototype.hasOwnProperty.call(input, "primary_kpi")) {
    const primaryKpi = nullableText(input.primary_kpi, "primary_kpi", 40);
    if (primaryKpi && !CLIENT_KPIS.includes(primaryKpi as (typeof CLIENT_KPIS)[number])) {
      throw new ClientInputError(`primary_kpi deve ser: ${CLIENT_KPIS.join(", ")}.`);
    }
    patch.primary_kpi = primaryKpi;
  }

  if (Object.prototype.hasOwnProperty.call(input, "result_family")) {
    const resultFamily = nullableText(input.result_family, "result_family", 40);
    if (resultFamily && !CLIENT_RESULT_FAMILIES.includes(resultFamily as (typeof CLIENT_RESULT_FAMILIES)[number])) {
      throw new ClientInputError(`result_family deve ser: ${CLIENT_RESULT_FAMILIES.join(", ")}.`);
    }
    patch.result_family = resultFamily;
  }

  for (const field of ["target_value", "monthly_budget", "monthly_conversion_goal"] as const) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      patch[field] = nullableNonNegativeNumber(input[field], field);
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "currency")) {
    if (typeof input.currency !== "string" || !/^[A-Za-z]{3}$/.test(input.currency.trim())) {
      throw new ClientInputError("currency deve ser um código ISO de três letras, como BRL ou USD.");
    }
    patch.currency = input.currency.trim().toUpperCase();
  }

  if (Object.prototype.hasOwnProperty.call(input, "timezone")) {
    if (typeof input.timezone !== "string" || !validTimezone(input.timezone.trim())) {
      throw new ClientInputError("timezone deve ser um fuso IANA válido, como America/Sao_Paulo.");
    }
    patch.timezone = input.timezone.trim();
  }

  if (Object.prototype.hasOwnProperty.call(input, "budget_start_day")) {
    const day = Number(input.budget_start_day);
    if (!Number.isInteger(day) || day < 1 || day > 28) {
      throw new ClientInputError("budget_start_day deve ser um número inteiro entre 1 e 28.");
    }
    patch.budget_start_day = day;
  }

  if (Object.prototype.hasOwnProperty.call(input, "notes")) {
    patch.notes = nullableText(input.notes, "notes", 5000);
  }

  return patch;
}

export async function fetchClients(
  sb: SupabaseClient,
  clientId?: string
): Promise<{ clients: any[]; unassignedAccounts: any[] }> {
  let clientsQuery = sb.from("clients").select("*").order("name");
  if (clientId) clientsQuery = clientsQuery.eq("id", clientId);

  const [{ data: clients, error: clientsError }, { data: links, error: linksError }, { data: accounts, error: accountsError }] =
    await Promise.all([
      clientsQuery,
      sb.from("client_ad_accounts").select("client_id, account_id, is_primary, created_at"),
      sb.from("ad_accounts").select("*").order("platform").order("name"),
    ]);

  if (clientsError) throw clientsError;
  if (linksError) throw linksError;
  if (accountsError) throw accountsError;

  const accountById = new Map((accounts || []).map((account: any) => [account.account_id, account]));
  const assignedAccountIds = new Set((links || []).map((link: any) => link.account_id));
  const linksByClient = new Map<string, any[]>();

  for (const link of links || []) {
    const account = accountById.get(link.account_id);
    if (!account) continue;
    const item = {
      ...account,
      is_primary: Boolean(link.is_primary),
      linked_at: link.created_at,
    };
    const current = linksByClient.get(link.client_id) || [];
    current.push(item);
    linksByClient.set(link.client_id, current);
  }

  const enriched = (clients || []).map((client: any) => {
    const clientAccounts = linksByClient.get(client.id) || [];
    clientAccounts.sort((a, b) => {
      if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
      if (a.platform !== b.platform) return String(a.platform).localeCompare(String(b.platform));
      return String(a.name).localeCompare(String(b.name));
    });
    return { ...client, accounts: clientAccounts };
  });

  return {
    clients: enriched,
    unassignedAccounts: (accounts || []).filter(
      (account: any) => !assignedAccountIds.has(account.account_id)
    ),
  };
}

export function apiError(error: any, fallback: string): { message: string; status: number } {
  if (error instanceof ClientInputError) {
    return { message: error.message, status: error.status };
  }
  if (error?.code === "23505") {
    return { message: "Este registro já existe ou a conta já está vinculada a outro cliente.", status: 409 };
  }
  if (error?.code === "23503") {
    return { message: "Cliente ou conta de anúncios não encontrado.", status: 404 };
  }
  return { message: error?.message || fallback, status: 500 };
}
