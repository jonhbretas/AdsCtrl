import type { SupabaseClient } from "@supabase/supabase-js";

export const CLIENT_STATUSES = ["active", "paused", "archived"] as const;
export const CLIENT_OBJECTIVES = [
  "awareness",
  "traffic",
  "engagement",
  "leads",
  "messages",
  "profile",
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

// Lista de e-mails separada por vírgula ou ponto e vírgula. Devolve a lista
// normalizada (vírgula + espaço) ou null. Qualquer item inválido recusa tudo.
function reportEmailList(value: unknown, field: string): string | null {
  const raw = nullableText(value, field, 500);
  if (!raw) return null;
  const parts = raw.split(/[,;]/).map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;
  for (const part of parts) {
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(part)) {
      throw new ClientInputError(`${field} deve conter apenas e-mails válidos separados por vírgula.`);
    }
  }
  return parts.join(", ");
}

function nullableNonNegativeNumber(value: unknown, field: string): number | null {
  if (value === null || value === "") return null;
  const normalized = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new ClientInputError(`${field} deve ser um número maior ou igual a zero.`);
  }
  return normalized;
}

function nullableDate(value: unknown, field: string): string | null {
  const normalized = nullableText(value, field, 10);
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(Date.parse(`${normalized}T00:00:00Z`))) {
    throw new ClientInputError(`${field} deve ser uma data válida no formato AAAA-MM-DD.`);
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

  for (const field of ["target_roas", "max_cpa", "max_daily_spend"] as const) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      patch[field] = nullableNonNegativeNumber(input[field], field);
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "max_budget_change_percent")) {
    const value = Number(input.max_budget_change_percent);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new ClientInputError("max_budget_change_percent deve ficar entre 0 e 100.");
    }
    patch.max_budget_change_percent = value;
  }

  if (Object.prototype.hasOwnProperty.call(input, "automation_mode")) {
    if (!["observe", "approval", "autonomous"].includes(String(input.automation_mode))) {
      throw new ClientInputError("automation_mode deve ser observe, approval ou autonomous.");
    }
    patch.automation_mode = input.automation_mode;
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

  if (Object.prototype.hasOwnProperty.call(input, "person_type")) {
    if (input.person_type !== "fisica" && input.person_type !== "juridica") {
      throw new ClientInputError("person_type deve ser fisica ou juridica.");
    }
    patch.person_type = input.person_type;
  }

  for (const field of [
    "cpf", "address_street", "address_number", "address_complement",
    "address_neighborhood", "address_city", "address_state", "address_zip_code",
    "address_country", "state_registration", "municipal_registration",
    "legal_representative_name", "legal_representative_cpf", "legal_representative_role",
    "billing_email", "billing_phone",
  ] as const) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      patch[field] = nullableText(input[field], field, field === "address_complement" ? 120 : 180);
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "billing_email")) {
    const email = patch.billing_email as string | null;
    if (email && !/^[^@\s]+@[^@\s.]+\.[^@\s.]+$/.test(email)) {
      throw new ClientInputError("billing_email deve ser um endereço de e-mail válido.");
    }
  }

  for (const field of ["legal_name", "cnpj", "contact_name", "contact_email", "contact_phone", "whatsapp_phone", "drive_folder_url"] as const) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      patch[field] = nullableText(input[field], field, field === "drive_folder_url" ? 500 : 180);
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "contact_email")) {
    const email = patch.contact_email as string | null;
    if (email && !/^[^@\s]+@[^@\s.]+\.[^@\s.]+$/.test(email)) {
      throw new ClientInputError("contact_email deve ser um endereço de e-mail válido.");
    }
  }

  for (const field of ["contract_start_date", "contract_end_date"] as const) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      patch[field] = nullableDate(input[field], field);
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "contract_notice_days")) {
    const days = Number(input.contract_notice_days);
    if (!Number.isInteger(days) || days < 0 || days > 365) {
      throw new ClientInputError("contract_notice_days deve ser um inteiro entre 0 e 365.");
    }
    patch.contract_notice_days = days;
  }

  // Destinatários do relatório: um ou vários, separados por vírgula (ex.: os
  // sócios do cliente). A lista inteira é aceita ou recusada — um endereço
  // inválido não pode derrubar um envio que passa o endereço como um texto.
  if (Object.prototype.hasOwnProperty.call(input, "report_email")) {
    patch.report_email = reportEmailList(input.report_email, "report_email");
  }

  // Cópia (CC) do relatório: opcional, também aceita lista separada por vírgula.
  if (Object.prototype.hasOwnProperty.call(input, "report_cc")) {
    patch.report_cc = reportEmailList(input.report_cc, "report_cc");
  }

  if (Object.prototype.hasOwnProperty.call(input, "report_enabled")) {
    if (typeof input.report_enabled !== "boolean") {
      throw new ClientInputError("report_enabled deve ser true ou false.");
    }
    patch.report_enabled = input.report_enabled;
  }

  // Dia do envio do relatório, avaliado no fuso do próprio cliente. O horário
  // NÃO é por cliente: é um só, em app_settings.report_hour (Config › Envio).
  if (Object.prototype.hasOwnProperty.call(input, "report_weekday")) {
    const weekday = Number(input.report_weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      throw new ClientInputError("report_weekday deve ser um inteiro de 0 (domingo) a 6 (sábado).");
    }
    patch.report_weekday = weekday;
  }

  // Marca que o CLIENTE vê (relatório, painel e e-mail). Vazio = APP_BRAND_NAME.
  if (Object.prototype.hasOwnProperty.call(input, "brand_name")) {
    patch.brand_name = nullableText(input.brand_name, "brand_name", 60);
  }

  // Entra na tela de vendas reais. Fora dela, nenhuma linha é pedida.
  if (Object.prototype.hasOwnProperty.call(input, "track_sales")) {
    if (typeof input.track_sales !== "boolean") {
      throw new ClientInputError("track_sales deve ser true ou false.");
    }
    patch.track_sales = input.track_sales;
  }

  // Orgânico (Página/Instagram Business): puro dado, sem formato específico
  // a validar — a Meta usa IDs numéricos para Página e para o usuário
  // comercial do Instagram. Preenchido só quando o cliente tem as duas
  // atribuídas ao usuário de sistema na BM (ver lib/meta-social.ts).
  if (Object.prototype.hasOwnProperty.call(input, "facebook_page_id")) {
    patch.facebook_page_id = nullableText(input.facebook_page_id, "facebook_page_id", 60);
  }
  if (Object.prototype.hasOwnProperty.call(input, "instagram_business_id")) {
    patch.instagram_business_id = nullableText(input.instagram_business_id, "instagram_business_id", 60);
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
    return { ...client, name: String(client.name || "").trim() || `Cliente sem nome · ${client.id}`, accounts: clientAccounts.map((account: any) => ({ ...account, name: String(account.name || "").trim() || `Conta sem nome · ${account.account_id}` })) };
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
