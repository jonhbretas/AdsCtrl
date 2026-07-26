// app/api/report/route.ts
// Relatório completo da conta logada. A montagem vive em lib/report-data.ts
// para o link público e o e-mail semanal usarem exatamente os mesmos números.
// Ex: /api/report?account_id=act_123&since=2026-07-14&until=2026-07-20

import { NextResponse } from "next/server";
import { buildReport, defaultRange, ReportError, resultFamilyForAccount } from "@/lib/report-data";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const requested = (searchParams.get("account_id") || "").trim();
    if (!requested) {
      return NextResponse.json({ error: "account_id é obrigatório." }, { status: 400 });
    }
    const def = defaultRange();
    const since = searchParams.get("since") || def.since;
    const until = searchParams.get("until") || def.until;
    const [report, result_family] = await Promise.all([
      buildReport(requested, since, until),
      resultFamilyForAccount(requested),
    ]);
    return NextResponse.json({ ...report, result_family });
  } catch (e: any) {
    const status = e instanceof ReportError ? e.status : 500;
    return NextResponse.json({ error: e?.message ?? "Erro ao montar o relatório." }, { status });
  }
}
