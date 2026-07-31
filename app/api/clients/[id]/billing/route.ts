import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";
import { asaasConfigured, createAsaasCustomer, createAsaasSubscription } from "@/lib/asaas";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { id } = await params; const sb = getServiceClient();
    const [{ data: subscriptions, error: subscriptionsError }, { data: charges, error: chargesError }] = await Promise.all([
      sb.from("client_billing_subscriptions").select("*").eq("client_id", id).order("created_at", { ascending: false }),
      sb.from("client_billing_charges").select("*").eq("client_id", id).order("due_date", { ascending: false }).limit(12),
    ]);
    if (subscriptionsError || chargesError) throw subscriptionsError || chargesError;
    return NextResponse.json({ configured: asaasConfigured(), subscriptions: subscriptions || [], charges: charges || [] });
  } catch (error: any) { return NextResponse.json({ error: error?.message || "Falha ao consultar cobrança." }, { status: 500 }); }
}

export async function POST(req: Request, { params }: RouteContext) {
  try {
    if (!asaasConfigured()) return NextResponse.json({ error: "Configure ASAAS_API_KEY antes de criar cobranças." }, { status: 503 });
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { id } = await params; const body = await req.json().catch(() => ({})); const sb = getServiceClient();
    const { data: client, error: clientError } = await sb.from("clients").select("*").eq("id", id).maybeSingle();
    if (clientError) throw clientError; if (!client) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    const value = Number(body.value ?? client.monthly_budget);
    if (!Number.isFinite(value) || value <= 0) return NextResponse.json({ error: "Informe um valor mensal maior que zero." }, { status: 400 });
    const dueDate = String(body.next_due_date || new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10));
    const billingType = ["PIX", "BOLETO", "CREDIT_CARD", "UNDEFINED"].includes(body.billing_type) ? body.billing_type : "UNDEFINED";
    let customerId = client.asaas_customer_id;
    if (!customerId) { const customer = await createAsaasCustomer(client); customerId = customer.id; const { error } = await sb.from("clients").update({ asaas_customer_id: customerId, updated_at: new Date().toISOString() }).eq("id", id); if (error) throw error; }
    const subscription = await createAsaasSubscription(customerId, value, dueDate, billingType, body.description || `Gestão de tráfego - ${client.name}`, id);
    const { data, error } = await sb.from("client_billing_subscriptions").insert({ client_id: id, asaas_subscription_id: subscription.id, billing_type: billingType, cycle: subscription.cycle || "MONTHLY", value, next_due_date: dueDate, status: subscription.status || "ACTIVE", description: subscription.description || null }).select("*").single();
    if (error) throw error;
    return NextResponse.json({ subscription: data, asaas: subscription }, { status: 201 });
  } catch (error: any) { return NextResponse.json({ error: error?.message || "Falha ao criar assinatura." }, { status: 500 }); }
}
