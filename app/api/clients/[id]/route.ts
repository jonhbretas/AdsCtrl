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
    // "Could not find the 'brand_name' column" não diz nada a quem está usando
    // a tela. Aponta o arquivo que resolve.
    if (error && /brand_name/.test(error.message || "")) {
      return NextResponse.json(
        { error: "Rode supabase-migration-brand.sql no SQL Editor do Supabase para usar a marca por cliente." },
        { status: 503 }
      );
    }
    if (error && /report_weekday/.test(error.message || "")) {
      return NextResponse.json(
        { error: "Rode supabase-migration-report-schedule.sql no SQL Editor do Supabase para escolher o dia de envio por cliente." },
        { status: 503 }
      );
    }
    if (error && /report_cc/.test(error.message || "")) {
      return NextResponse.json(
        { error: "Rode supabase-migration-report-cc.sql no SQL Editor do Supabase para usar cópia (CC) no relatório." },
        { status: 503 }
      );
    }
    if (error && /facebook_page_id|instagram_business_id/.test(error.message || "")) {
      return NextResponse.json(
        { error: "Rode supabase-migration-social.sql no SQL Editor do Supabase para cadastrar Página/Instagram." },
        { status: 503 }
      );
    }
    if (error && /track_sales/.test(error.message || "")) {
      return NextResponse.json(
        { error: "Rode supabase-migration-vendas.sql no SQL Editor do Supabase para acompanhar vendas." },
        { status: 503 }
      );
    }
    if (error && /legal_name|cnpj|contact_name|contact_email|contact_phone|whatsapp_phone|drive_folder_url|contract_start_date|contract_end_date|contract_notice_days|person_type|cpf|address_|state_registration|municipal_registration|legal_representative_|billing_/.test(error.message || "")) {
      return NextResponse.json(
        { error: "Rode supabase-migration-client-contract-data.sql no SQL Editor do Supabase para usar os dados do contrato." },
        { status: 503 }
      );
    }
    if (error && /legal_name|cnpj|contact_name|contact_email|contact_phone|whatsapp_phone|drive_folder_url|contract_start_date|contract_end_date|contract_notice_days/.test(error.message || "")) {
      return NextResponse.json(
        { error: "Rode supabase-migration-client-profile.sql no SQL Editor do Supabase para usar o perfil operacional do cliente." },
        { status: 503 }
      );
    }
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

export async function DELETE(_req: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const sb = getServiceClient();
    const { data: client, error: clientError } = await sb.from("clients").select("id").eq("id", id).maybeSingle();
    if (clientError) throw clientError;
    if (!client) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

    // Exclusão operacional: não apaga contas de anúncio nem histórico financeiro.
    // Os vínculos ficam livres para serem associados ao cliente correto.
    const { error: unlinkError } = await sb.from("client_ad_accounts").delete().eq("client_id", id);
    if (unlinkError) throw unlinkError;
    const { error: archiveError } = await sb.from("clients").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", id);
    if (archiveError) throw archiveError;
    return NextResponse.json({ ok: true, archived: true, client_id: id });
  } catch (error: any) {
    const response = apiError(error, "Erro ao excluir cliente.");
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}
