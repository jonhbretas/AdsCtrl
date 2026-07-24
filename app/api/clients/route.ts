import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";
import {
  apiError,
  CLIENT_KPIS,
  CLIENT_OBJECTIVES,
  CLIENT_STATUSES,
  clientPatchFromBody,
  fetchClients,
} from "./_shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    if (supabaseEnvMissing()) {
      return NextResponse.json(
        { clients: [], unassigned_accounts: [], error: "Supabase não configurado." },
        { status: 503 }
      );
    }

    const requestedStatus = new URL(req.url).searchParams.get("status");
    if (requestedStatus && !CLIENT_STATUSES.includes(requestedStatus as any)) {
      return NextResponse.json(
        { error: `status deve ser: ${CLIENT_STATUSES.join(", ")}.` },
        { status: 400 }
      );
    }

    const { clients, unassignedAccounts } = await fetchClients(getServiceClient());
    return NextResponse.json({
      clients: requestedStatus
        ? clients.filter((client: any) => client.status === requestedStatus)
        : clients,
      unassigned_accounts: unassignedAccounts,
      options: {
        statuses: CLIENT_STATUSES,
        objectives: CLIENT_OBJECTIVES,
        kpis: CLIENT_KPIS,
      },
    });
  } catch (error: any) {
    const response = apiError(error, "Erro ao listar clientes.");
    return NextResponse.json(
      { clients: [], unassigned_accounts: [], error: response.message },
      { status: response.status }
    );
  }
}

export async function POST(req: Request) {
  try {
    if (supabaseEnvMissing()) {
      return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    }

    const body = await req.json().catch(() => null);
    const row = clientPatchFromBody(body, true);
    const sb = getServiceClient();
    const { data, error } = await sb
      .from("clients")
      .insert(row)
      .select("*")
      .single();
    if (error) throw error;

    return NextResponse.json({ client: { ...data, accounts: [] } }, { status: 201 });
  } catch (error: any) {
    const response = apiError(error, "Erro ao criar cliente.");
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}
