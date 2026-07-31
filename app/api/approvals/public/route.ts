import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";
import { verifyDashboardToken } from "@/lib/report-token";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try { if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 }); const body = await req.json().catch(() => ({})); const payload = await verifyDashboardToken(body.token); if (!payload || !body.id) return NextResponse.json({ error: "Link inválido." }, { status: 401 }); const status = ["approved", "changes_requested", "rejected"].includes(body.status) ? body.status : null; if (!status) return NextResponse.json({ error: "Status inválido." }, { status: 400 }); const { data, error } = await getServiceClient().from("client_approvals").update({ status, response_note: body.response_note || null, responded_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", body.id).eq("client_id", payload.clientId).select("id,status,response_note,responded_at").single(); if (error) throw error; return NextResponse.json({ approval: data }); }
  catch (error: any) { return NextResponse.json({ error: error?.message || "Falha ao registrar resposta." }, { status: 500 }); }
}
