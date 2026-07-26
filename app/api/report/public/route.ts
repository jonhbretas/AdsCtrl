// app/api/report/public/route.ts
// Relatório aberto pelo link assinado que o cliente recebe por e-mail.
// A autorização é o próprio token: ele fixa conta, período e validade.
// Nada aqui aceita account_id solto — senão o link viraria uma porta para
// consultar qualquer conta do catálogo.

import { NextResponse } from "next/server";
import { buildReportCached, ReportError, resultFamilyForAccount } from "@/lib/report-data";
import { verifyReportToken } from "@/lib/report-token";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  try {
    const token = new URL(req.url).searchParams.get("token") || "";
    const payload = await verifyReportToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: "Este link de relatório é inválido ou expirou. Peça um novo à agência." },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }
    // Cache: o mesmo link pode ser aberto várias vezes (e período fechado não
    // muda mais). Sem isso, cada recarga custaria dezenas de chamadas de API.
    const [{ report }, result_family] = await Promise.all([
      buildReportCached(payload.accountId, payload.since, payload.until),
      resultFamilyForAccount(payload.accountId),
    ]);
    // Fora do payload cacheado: o foco muda no admin e vale na hora.
    return NextResponse.json({ ...report, result_family }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    const status = e instanceof ReportError ? e.status : 500;
    return NextResponse.json({ error: e?.message ?? "Erro ao montar o relatório." }, { status });
  }
}
