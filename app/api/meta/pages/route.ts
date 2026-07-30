// app/api/meta/pages/route.ts
// Páginas (e Instagram vinculado) que o(s) token(s) de sistema já enxergam —
// alimenta o dropdown em /clientes › Orgânico, pra não precisar copiar ID
// nenhum na mão. Consulta TODOS os tokens configurados (cada um é uma BM),
// porque a Página de um cliente pode estar atribuída em qualquer uma delas.
//
// Lista vazia não é erro: é o estado até a Página ser atribuída ao usuário de
// sistema na Business Manager (ver lib/meta-social.ts).

import { NextResponse } from "next/server";
import { META_TOKENS } from "@/lib/meta";
import { listAvailablePages } from "@/lib/meta-social";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  try {
    if (!META_TOKENS.length) {
      return NextResponse.json({ pages: [], issues: ["Nenhum META_ACCESS_TOKEN configurado."] });
    }
    const issues: string[] = [];
    const results = await Promise.all(
      META_TOKENS.map((token, index) =>
        listAvailablePages(token, index).catch((e: any) => {
          issues.push(`token #${index + 1}: ${e?.message || "falha ao listar Páginas"}`);
          return [];
        })
      )
    );
    const pages = results.flat();
    return NextResponse.json({ pages, issues });
  } catch (e: any) {
    return NextResponse.json({ pages: [], issues: [e?.message || "Falha ao listar Páginas."] }, { status: 500 });
  }
}
