import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  try { if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 }); const { id } = await params; const { data, error } = await getServiceClient().from("client_approvals").select("*").eq("client_id", id).order("requested_at", { ascending: false }); if (error) throw error; return NextResponse.json({ approvals: data || [] }); }
  catch (error: any) { return NextResponse.json({ error: error?.message || "Falha ao carregar aprovações." }, { status: 500 }); }
}

export async function POST(req: Request, { params }: RouteContext) {
  try { if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 }); const { id } = await params; const body = await req.json().catch(() => ({})); if (!body.title?.trim()) return NextResponse.json({ error: "Informe um título." }, { status: 400 }); const { data, error } = await getServiceClient().from("client_approvals").insert({ client_id: id, kind: body.kind || "request", title: String(body.title).trim(), description: body.description || null, file_url: body.file_url || null, due_date: body.due_date || null }).select("*").single(); if (error) throw error; return NextResponse.json({ approval: data }, { status: 201 }); }
  catch (error: any) { return NextResponse.json({ error: error?.message || "Falha ao criar aprovação." }, { status: 500 }); }
}

export async function PATCH(req: Request, { params }: RouteContext) {
  try { if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 }); const { id } = await params; const body = await req.json().catch(() => ({})); const status = ["pending", "approved", "changes_requested", "rejected"].includes(body.status) ? body.status : null; if (!status || !body.id) return NextResponse.json({ error: "Status ou aprovação inválidos." }, { status: 400 }); const { data, error } = await getServiceClient().from("client_approvals").update({ status, response_note: body.response_note || null, responded_at: status === "pending" ? null : new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", body.id).eq("client_id", id).select("*").single(); if (error) throw error; return NextResponse.json({ approval: data }); }
  catch (error: any) { return NextResponse.json({ error: error?.message || "Falha ao atualizar aprovação." }, { status: 500 }); }
}
