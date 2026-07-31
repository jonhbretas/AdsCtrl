// app/api/cnpj/[cnpj]/route.ts
// Proxy pra BrasilAPI (gratuita, sem token, sem limite rígido pra uso baixo) —
// evita CORS no navegador e mantém a URL da fonte só aqui, não espalhada no front.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ cnpj: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    const { cnpj } = await params;
    const digits = cnpj.replace(/\D/g, "");
    if (digits.length !== 14) return NextResponse.json({ error: "CNPJ precisa ter 14 dígitos." }, { status: 400 });

    // Sem User-Agent, o WAF da BrasilAPI devolve 403 pro fetch nativo do Node.
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, { headers: { "User-Agent": "AdsCtrl/1.0" }, signal: AbortSignal.timeout(10_000) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = response.status === 404 ? "CNPJ não encontrado na Receita Federal." : payload?.message || "Falha ao consultar CNPJ.";
      return NextResponse.json({ error: message }, { status: response.status === 404 ? 404 : 502 });
    }
    return NextResponse.json(payload);
  } catch (error: any) {
    const message = error?.name === "TimeoutError" ? "Consulta à Receita Federal demorou demais. Tente novamente." : (error?.message || "Falha ao consultar CNPJ.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
