import { NextResponse } from "next/server";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const fallbackName = (value: unknown, id: string, prefix: string) => String(value || "").trim() || `${prefix} · ${id}`;

export async function GET(req: Request) {
  try {
    if (supabaseEnvMissing()) return NextResponse.json({ results: [], error: "Supabase não configurado." }, { status: 503 });
    const raw = new URL(req.url).searchParams.get("q") || "";
    const query = raw.trim().replace(/[%_]/g, "").slice(0, 80);
    if (query.length < 2) return NextResponse.json({ results: [] });
    const sb = getServiceClient();
    const pattern = `%${query}%`;
    const [{ data: accounts, error: accountsError }, { data: clients, error: clientsError }] = await Promise.all([
      sb.from("ad_accounts").select("account_id,name,platform,status,hidden").or(`name.ilike.${pattern},account_id.ilike.${pattern}`).order("name").limit(12),
      sb.from("clients").select("id,name,status").ilike("name", pattern).order("name").limit(8),
    ]);
    if (accountsError || clientsError) throw accountsError || clientsError;
    const results = [
      ...(accounts || []).map((account: any) => ({ id: `account:${account.account_id}`, kind: "Conta de anúncio", title: fallbackName(account.name, account.account_id, "Conta sem nome"), subtitle: `${account.platform === "google" ? "Google Ads" : "Meta Ads"} · ${account.account_id}${account.hidden ? " · ocultada" : ""}`, href: `/?account=${encodeURIComponent(account.account_id)}` })),
      ...(clients || []).map((client: any) => ({ id: `client:${client.id}`, kind: "Cliente", title: fallbackName(client.name, client.id, "Cliente sem nome"), subtitle: client.status === "active" ? "Carteira ativa · metas e contas" : `Cliente ${client.status}`, href: `/clientes?client=${encodeURIComponent(client.id)}&tab=metas` })),
    ];
    return NextResponse.json({ results });
  } catch (error: any) {
    return NextResponse.json({ results: [], error: error?.message || "Falha na busca rápida." }, { status: 500 });
  }
}
