import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";
import { uploadClientDriveFile } from "@/lib/google-drive";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: RouteContext) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { id } = await params;
    const form = await req.formData();
    const file = form.get("file");
    const category = String(form.get("category") || "other");
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Selecione um arquivo." }, { status: 400 });
    if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "O arquivo deve ter no máximo 25 MB." }, { status: 400 });
    const sb = getServiceClient();
    const { data: client, error } = await sb.from("clients").select("id,drive_folder_url").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!client) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    if (!client.drive_folder_url) return NextResponse.json({ error: "Crie ou vincule a pasta do Drive antes de enviar arquivos." }, { status: 400 });
    const uploaded = await uploadClientDriveFile(client.drive_folder_url, category, file);
    const { data: document, error: documentError } = await sb.from("client_documents").insert({ client_id: id, category, name: uploaded.name || file.name, drive_file_url: uploaded.webViewLink || `https://drive.google.com/open?id=${uploaded.id}`, notes: "Enviado pelo AdsCtrl." }).select("*").single();
    if (documentError) throw documentError;
    return NextResponse.json({ document, file: uploaded }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Falha ao enviar arquivo." }, { status: 500 });
  }
}
