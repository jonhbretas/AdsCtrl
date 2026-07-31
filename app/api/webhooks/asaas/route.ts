import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const expected = process.env.ASAAS_WEBHOOK_TOKEN?.trim();
    const received = req.headers.get("asaas-access-token");
    if (expected && received !== expected) return NextResponse.json({ error: "Webhook não autorizado." }, { status: 401 });
    const payload = await req.json(); const eventId = String(payload.id || `${payload.event}-${payload.payment?.id || Date.now()}`); const eventName = String(payload.event || "UNKNOWN"); const paymentId = payload.payment?.id || null; const sb = getServiceClient();
    const { error: eventError } = await sb.from("asaas_webhook_events").insert({ event_id: eventId, event_name: eventName, payment_id: paymentId, payload });
    if (eventError?.code === "23505") return NextResponse.json({ received: true, duplicate: true });
    if (eventError) throw eventError;
    if (paymentId) {
      const payment = payload.payment || {};
      const statusMap: Record<string, string> = { PAYMENT_CREATED: "PENDING", PAYMENT_CONFIRMED: "CONFIRMED", PAYMENT_RECEIVED: "RECEIVED", PAYMENT_OVERDUE: "OVERDUE", PAYMENT_REFUNDED: "REFUNDED", PAYMENT_DELETED: "DELETED" };
      const { data: subscription } = await sb.from("client_billing_subscriptions").select("id,client_id").eq("asaas_subscription_id", payment.subscription || "").maybeSingle();
      const { data: client } = await sb.from("clients").select("id").eq("asaas_customer_id", payment.customer || "").maybeSingle();
      const clientId = subscription?.client_id || client?.id;
      if (clientId) {
        await sb.from("client_billing_charges").upsert({ client_id: clientId, subscription_id: subscription?.id || null, asaas_payment_id: paymentId, status: statusMap[eventName] || payment.status || eventName, value: payment.value ?? null, due_date: payment.dueDate || null, payment_url: payment.invoiceUrl || payment.bankSlipUrl || null, invoice_url: payment.invoiceUrl || null, paid_at: eventName === "PAYMENT_RECEIVED" ? new Date().toISOString() : null, raw: payment, updated_at: new Date().toISOString() }, { onConflict: "asaas_payment_id" });
        if (eventName === "PAYMENT_RECEIVED" && Number(payment.value) > 0) {
          const { data: category } = await sb.from("financial_categories").select("id").eq("name", "Mensalidades de clientes").eq("kind", "revenue").maybeSingle();
          await sb.from("financial_entries").upsert({ client_id: clientId, category_id: category?.id || null, kind: "revenue", status: "confirmed", description: `Mensalidade Asaas - ${payment.description || paymentId}`, amount: Number(payment.value), due_date: payment.dueDate || new Date().toISOString().slice(0, 10), paid_at: new Date().toISOString(), source: "asaas", external_id: paymentId, notes: "Lançamento criado automaticamente pelo webhook do Asaas.", updated_at: new Date().toISOString() }, { onConflict: "source,external_id" });
        }
      }
    }
    if (eventName.startsWith("INVOICE_") && payload.invoice?.id) {
      const invoice = payload.invoice;
      const { data: client } = await sb.from("clients").select("id").eq("asaas_customer_id", invoice.customer || "").maybeSingle();
      if (client) await sb.from("client_billing_invoices").upsert({ client_id: client.id, asaas_invoice_id: invoice.id, asaas_payment_id: invoice.payment || null, status: invoice.status || eventName, service_description: invoice.serviceDescription || "", value: invoice.value ?? null, effective_date: invoice.effectiveDate || null, pdf_url: invoice.pdfUrl || null, xml_url: invoice.xmlUrl || null, raw: invoice, updated_at: new Date().toISOString() }, { onConflict: "asaas_invoice_id" });
    }
    return NextResponse.json({ received: true });
  } catch (error: any) { return NextResponse.json({ error: error?.message || "Falha ao processar webhook." }, { status: 500 }); }
}
