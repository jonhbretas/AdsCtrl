import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const params = new URL(req.url).searchParams; const from = params.get("from") || new Date().toISOString(); const until = params.get("until") || new Date(Date.now() + 31 * 86400000).toISOString(); const sb = getServiceClient();
    const [{ data: meetings, error: meetingsError }, { data: clients, error: clientsError }] = await Promise.all([
      sb.from("client_meetings").select("*, clients(id,name)").gte("starts_at", from).lte("starts_at", until).order("starts_at"),
      sb.from("clients").select("id,name").eq("status", "active").order("name"),
    ]);
    if (meetingsError || clientsError) throw meetingsError || clientsError;
    return NextResponse.json({ meetings: meetings || [], clients: clients || [] });
  } catch (error: any) { return NextResponse.json({ error: error?.message || "Falha ao carregar agenda." }, { status: 500 }); }
}

export async function POST(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const body = await req.json().catch(() => ({})); if (!body.title || !body.starts_at || !body.ends_at) return NextResponse.json({ error: "Informe título, início e fim." }, { status: 400 });
    const startsAt = new Date(body.starts_at); const endsAt = new Date(body.ends_at); if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) return NextResponse.json({ error: "O horário final precisa ser depois do inicial." }, { status: 400 });
    const row = { client_id: body.client_id || null, title: String(body.title).trim().slice(0, 180), description: body.description || null, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), meeting_type: body.meeting_type || "follow_up", location: body.location || null, meeting_url: body.meeting_url || null, attendees: body.attendees || null, reminder_minutes: Number(body.reminder_minutes) || 30, notes: body.notes || null, updated_at: new Date().toISOString() };
    const { data, error } = await getServiceClient().from("client_meetings").insert(row).select("*").single(); if (error) throw error; return NextResponse.json({ meeting: data }, { status: 201 });
  } catch (error: any) { return NextResponse.json({ error: error?.message || "Falha ao criar reunião." }, { status: 500 }); }
}

export async function PATCH(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 }); const body = await req.json().catch(() => ({})); if (!body.id) return NextResponse.json({ error: "Reunião não informada." }, { status: 400 }); const status = ["scheduled", "completed", "cancelled", "no_show"].includes(body.status) ? body.status : null; if (!status) return NextResponse.json({ error: "Status inválido." }, { status: 400 }); const { data, error } = await getServiceClient().from("client_meetings").update({ status, updated_at: new Date().toISOString() }).eq("id", body.id).select("*").single(); if (error) throw error; return NextResponse.json({ meeting: data });
  } catch (error: any) { return NextResponse.json({ error: error?.message || "Falha ao atualizar reunião." }, { status: 500 }); }
}
