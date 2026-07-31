import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";
import { createClientDriveFolder } from "@/lib/google-drive";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: RouteContext) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { id } = await params;
    const sb = getServiceClient();
    const { data: client, error: clientError } = await sb.from("clients").select("id,name,drive_folder_url").eq("id", id).maybeSingle();
    if (clientError) throw clientError;
    if (!client) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    if (client.drive_folder_url) return NextResponse.json({ client, created: false });
    const folder = await createClientDriveFolder(client.name);
    const { data, error } = await sb.from("clients").update({ drive_folder_url: folder.url, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
    if (error) throw error;
    return NextResponse.json({ client: data, folder, created: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Não foi possível criar a pasta do cliente." }, { status: 500 });
  }
}
