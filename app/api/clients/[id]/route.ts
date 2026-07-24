import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";
import { apiError, ClientInputError, clientPatchFromBody, fetchClients } from "../_shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    if (supabaseEnvMissing()) {
      return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    }

    const { clients } = await fetchClients(getServiceClient(), id);
    if (!clients[0]) {
      return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ client: clients[0] });
  } catch (error: any) {
    const response = apiError(error, "Erro ao consultar cliente.");
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    if (supabaseEnvMissing()) {
      return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    }

    const body = await req.json().catch(() => null);
    const patch = clientPatchFromBody(body);
    if (Object.keys(patch).length === 0) {
      throw new ClientInputError("Nenhum campo editável foi informado.");
    }
    patch.updated_at = new Date().toISOString();

    const sb = getServiceClient();
    const { data, error } = await sb
      .from("clients")
      .update(patch)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    }

    const { clients } = await fetchClients(sb, id);
    return NextResponse.json({ client: clients[0] });
  } catch (error: any) {
    const response = apiError(error, "Erro ao atualizar cliente.");
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}
