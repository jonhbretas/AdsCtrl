import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = { params: Promise<{ id: string }> };
const CONTRACT_STATUSES = ["draft", "active", "expired", "cancelled"] as const;

function text(value: unknown, field: string, max = 500): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) throw new Error(`${field} inválido.`);
  return value.trim() || null;
}

function date(value: unknown, field: string): string | null {
  const valueText = text(value, field, 10);
  if (!valueText) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valueText)) throw new Error(`${field} deve estar no formato AAAA-MM-DD.`);
  return valueText;
}

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { id } = await params;
    const sb = getServiceClient();
    const [{ data: contracts, error: contractsError }, { data: documents, error: documentsError }] = await Promise.all([
      sb.from("client_contracts").select("*").eq("client_id", id).order("end_date", { ascending: false, nullsFirst: false }),
      sb.from("client_documents").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    ]);
    if (contractsError || documentsError) throw contractsError || documentsError;
    return NextResponse.json({ contracts: contracts || [], documents: documents || [] });
  } catch (error: any) {
    const missing = /relation .*client_(contracts|documents).* does not exist/i.test(error?.message || "");
    return NextResponse.json({ error: missing ? "Rode supabase-migration-client-contracts.sql no Supabase." : error?.message || "Erro ao listar documentos." }, { status: missing ? 503 : 500 });
  }
}

export async function POST(req: Request, { params }: RouteContext) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { id } = await params;
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
    const kind = body.kind === "contract" ? "contract" : body.kind === "document" ? "document" : body.kind === "renewal" ? "renewal" : null;
    if (!kind) return NextResponse.json({ error: "kind deve ser contract ou document." }, { status: 400 });
    const sb = getServiceClient();
    if (kind === "renewal") {
      const contractId = text(body.contract_id, "contract_id", 80);
      if (!contractId) return NextResponse.json({ error: "Contrato de origem não informado." }, { status: 400 });
      const { data: source, error: sourceError } = await sb.from("client_contracts").select("*").eq("id", contractId).eq("client_id", id).maybeSingle();
      if (sourceError) throw sourceError;
      if (!source) return NextResponse.json({ error: "Contrato de origem não encontrado." }, { status: 404 });
      const nextVersion = source.version ? `${source.version}-renovação` : "renovação";
      const { data, error } = await sb.from("client_contracts").insert({ client_id: id, title: `Renovação - ${source.title}`, version: nextVersion, status: "draft", start_date: source.end_date ? new Date(`${source.end_date}T00:00:00Z`).toISOString().slice(0, 10) : null, monthly_fee: source.monthly_fee, notes: `Rascunho criado a partir do contrato ${source.title}.` }).select("*").single();
      if (error) throw error;
      return NextResponse.json({ contract: data }, { status: 201 });
    }
    const common = { client_id: id, name: text(body.name, "name", 180), drive_file_url: text(body.drive_file_url, "drive_file_url", 500), notes: text(body.notes, "notes", 2000), updated_at: new Date().toISOString() };
    if (!common.name) return NextResponse.json({ error: "Informe o nome do arquivo ou contrato." }, { status: 400 });
    const row = kind === "contract"
      ? { ...common, title: common.name, version: text(body.version, "version", 40), status: CONTRACT_STATUSES.includes(body.status as any) ? body.status : "draft", start_date: date(body.start_date, "start_date"), end_date: date(body.end_date, "end_date"), monthly_fee: body.monthly_fee === "" || body.monthly_fee == null ? null : Number(body.monthly_fee), signed_at: body.signed_at ? new Date(String(body.signed_at)).toISOString() : null }
      : { ...common, category: text(body.category, "category", 40) || "other", visible_to_client: Boolean(body.visible_to_client), document_date: date(body.document_date, "document_date"), expires_at: date(body.expires_at, "expires_at") };
    const table = kind === "contract" ? "client_contracts" : "client_documents";
    // Os dois inserts têm schemas distintos; a escolha da tabela é validada
    // acima pelo kind e o cast evita forçar o tipo gerado do Supabase a uma
    // união impossível entre as duas tabelas.
    const { data, error } = await (sb.from(table) as any).insert(row).select("*").single();
    if (error) throw error;
    return NextResponse.json({ [kind]: data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Erro ao salvar documento." }, { status: 500 });
  }
}
