const API_ROOT = process.env.ASAAS_ENVIRONMENT === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";

export function asaasConfigured() { return Boolean(process.env.ASAAS_API_KEY?.trim()); }

export async function asaasRequest(path: string, init: RequestInit = {}) {
  const token = process.env.ASAAS_API_KEY?.trim();
  if (!token) throw new Error("Configure ASAAS_API_KEY para usar cobranças.");
  const response = await fetch(`${API_ROOT}${path}`, { ...init, headers: { "Content-Type": "application/json", access_token: token, ...(init.headers || {}) } });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json?.errors?.map((e: any) => e.description).join(" ") || json?.message || "Erro na API do Asaas.");
  return json;
}

export async function createAsaasCustomer(client: any) {
  return asaasRequest("/customers", { method: "POST", body: JSON.stringify({ name: client.legal_name || client.name, cpfCnpj: (client.cnpj || client.cpf || "").replace(/\D/g, "") || undefined, email: client.billing_email || client.contact_email || undefined, mobilePhone: (client.billing_phone || client.whatsapp_phone || client.contact_phone || "").replace(/\D/g, "") || undefined, postalCode: client.address_zip_code?.replace(/\D/g, "") || undefined, address: client.address_street || undefined, addressNumber: client.address_number || undefined, complement: client.address_complement || undefined, province: client.address_neighborhood || undefined, city: client.address_city || undefined, state: client.address_state || undefined, externalReference: client.id }) });
}

export async function createAsaasSubscription(customer: string, value: number, dueDate: string, billingType: string, description: string, externalReference: string) {
  return asaasRequest("/subscriptions", { method: "POST", body: JSON.stringify({ customer, billingType, cycle: "MONTHLY", value, nextDueDate: dueDate, description, externalReference }) });
}

export async function scheduleAsaasInvoice(input: { customer: string; payment?: string; value: number; effectiveDate: string; serviceDescription: string; externalReference: string }) {
  return asaasRequest("/invoices", { method: "POST", body: JSON.stringify(input) });
}
