import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";
import { asaasConfigured, scheduleAsaasInvoice } from "@/lib/asaas";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { id } = await params; const { data, error } = await getServiceClient().from("client_billing_invoices").select("*").eq("client_id", id).order("created_at", { ascending: false });
    if (error) throw error; return NextResponse.json({ invoices: data || [] });
  } catch (error: any) { return NextResponse.json({ error: error?.message || "Falha ao consultar NFS-e." }, { status: 500 }); }
}

export async function POST(req: Request, { params }: RouteContext) {
  try {
    if (!asaasConfigured()) return NextResponse.json({ error: "Configure ASAAS_API_KEY antes de emitir NFS-e." }, { status: 503 });
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { id } = await params; const body = await req.json().catch(() => ({})); const sb = getServiceClient();
    const { data: client, error: clientError } = await sb.from("clients").select("id,name,asaas_customer_id").eq("id", id).maybeSingle();
    if (clientError) throw clientError; if (!client) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    if (!client.asaas_customer_id) return NextResponse.json({ error: "Crie primeiro a cobrança recorrente do cliente." }, { status: 400 });
    const description = String(body.service_description || `Gestão de tráfego pago - ${client.name}`).trim();
    const value = Number(body.value); const effectiveDate = String(body.effective_date || new Date().toISOString().slice(0, 10));
    if (!description || !Number.isFinite(value) || value <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return NextResponse.json({ error: "Informe descrição, valor e data de emissão válidos." }, { status: 400 });
    const invoice = await scheduleAsaasInvoice({ customer: client.asaas_customer_id, payment: body.payment_id || undefined, value, effectiveDate, serviceDescription: description, externalReference: id });
    const { data, error } = await sb.from("client_billing_invoices").insert({ client_id: id, asaas_invoice_id: invoice.id, asaas_payment_id: body.payment_id || null, status: invoice.status || "SCHEDULED", service_description: description, value, effective_date: effectiveDate, pdf_url: invoice.pdfUrl || null, xml_url: invoice.xmlUrl || null, raw: invoice }).select("*").single();
    if (error) throw error; return NextResponse.json({ invoice: data, asaas: invoice }, { status: 201 });
  } catch (error: any) { return NextResponse.json({ error: error?.message || "Falha ao agendar NFS-e." }, { status: 500 }); }
}
