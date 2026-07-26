// app/api/clients/[id]/dashboard-link/route.ts
// Gera o link do painel do cliente para a agência copiar e enviar.
// Rota do painel logado (o middleware exige sessão).

import { NextResponse } from "next/server";
import { dashboardLink, reportLinkConfigured } from "@/lib/report-token";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    if (!reportLinkConfigured()) {
      return NextResponse.json(
        { error: "Configure REPORT_LINK_SECRET (ou SESSION_SECRET) com 32+ caracteres." },
        { status: 503 }
      );
    }
    if (supabaseEnvMissing()) {
      return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    }
    const { id } = await ctx.params;
    const { data: client, error } = await getServiceClient()
      .from("clients")
      .select("id,name")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!client) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

    return NextResponse.json({ client: client.name, url: await dashboardLink(client.id) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Falha ao gerar o link." }, { status: 500 });
  }
}
