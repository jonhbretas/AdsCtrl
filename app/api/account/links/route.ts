import { NextResponse } from "next/server";
import { tokenByIndex } from "@/lib/meta";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const GRAPH = "https://graph.facebook.com/v25.0";

export async function GET(req: Request) {
  try {
    if (supabaseEnvMissing()) {
      return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    }
    const requested = new URL(req.url).searchParams.get("account_id")?.trim() || "";
    const accountId = requested.replace(/^act_/, "").replace(/^google:/, "");
    if (!accountId) {
      return NextResponse.json({ error: "account_id é obrigatório." }, { status: 400 });
    }

    const { data: account, error } = await getServiceClient()
      .from("ad_accounts")
      .select("platform,token_ref,hidden")
      .eq("account_id", requested.replace(/^act_/, ""))
      .maybeSingle();
    if (error) throw error;
    if (!account) {
      return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
    }
    if (account.hidden) {
      return NextResponse.json({ error: "Conta oculta." }, { status: 403 });
    }
    if (account.platform !== "meta") {
      return NextResponse.json({ account_id: accountId, business_id: null, business_name: null });
    }

    const token = tokenByIndex(typeof account.token_ref === "number" ? account.token_ref : 0);
    const url = new URL(`${GRAPH}/act_${accountId}`);
    url.searchParams.set("fields", "business{id,name}");
    url.searchParams.set("access_token", token);
    const response = await fetch(url, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));

    return NextResponse.json({
      account_id: accountId,
      business_id: response.ok ? payload?.business?.id || null : null,
      business_name: response.ok ? payload?.business?.name || null : null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Não foi possível identificar a BM da conta." },
      { status: 500 }
    );
  }
}
