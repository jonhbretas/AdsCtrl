// lib/whatsapp-report.ts
// Resumo de mídia pronto para copiar e colar no WhatsApp: formatação nativa
// do app (*negrito*), emojis e frases curtas. A pedido dos clientes no
// fechamento mensal: quanto foi gasto, por campanha, região, criativos,
// faturado e ROI — sem jargão de plataforma.

import { objectiveLabel } from "./format";

export interface ReportRow {
  key: string;
  spend: number;
}

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  messenger: "Messenger",
  audience_network: "Rede de audiência",
};

function money(value: number, currency: string): string {
  // Valores pequenos (ex.: CPR de R$ 0,06) não podem virar R$ 0 no texto.
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL", maximumFractionDigits: value < 10 ? 2 : 0 }).format(value || 0);
}

function num(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value || 0);
}

function pct(part: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function topRows(rows: ReportRow[], max: number, minShare = 0.03): { key: string; spend: number }[] {
  const total = rows.reduce((acc, row) => acc + row.spend, 0);
  return rows
    .filter((row) => row.spend > 0)
    .filter((row) => total === 0 || row.spend / total >= minShare)
    .slice(0, max);
}

export function buildWhatsAppReport(input: {
  accountName: string;
  currency: string;
  periodLabel: string;
  /** Datas exatas do período — entram no cabeçalho para ninguém se perder. */
  periodRange: { since: string; until: string };
  /** Número de dias do período (para a média diária). */
  days: number;
  campaigns: { name: string; objective?: string; spend: number; results?: number; resultNoun?: string }[];
  /** Resultado somado por tipo de campanha (rótulo do objetivo -> contagem). */
  campaignTypes: { label: string; results: number; familyLabel?: string }[];
  /** Criativos que rodaram: nome, gasto, resultado do objetivo e link do conteúdo. */
  creatives: { name: string; spend: number; results?: number; resultNoun?: string; permalink?: string }[];
  regions: ReportRow[];
  creativeCount: { total: number; active: number };
  totalSpend: number;
  /** Total de resultados e o rótulo real do que eles são (detectado por
   *  conta: conversas, vendas, leads...) — nunca "resultado" genérico. */
  results: number | null;
  resultsLabel: string;
  resultsNoun: string;
  cpr: number | null;
  /** Valor faturado no período (vendas informadas), quando houver. */
  revenue: number | null;
}): string {
  const { accountName, currency, periodLabel, periodRange, days, campaigns, campaignTypes, creatives, regions, creativeCount, totalSpend, results, resultsLabel, resultsNoun, cpr, revenue } = input;
  const lines: string[] = [];
  const fmtDate = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  lines.push(`📊 *Resumo de Mídia — ${accountName}*`);
  lines.push(`📅 ${periodLabel} · ${fmtDate(periodRange.since)} a ${fmtDate(periodRange.until)}`);
  lines.push("");
  lines.push(`💰 *Investimento total:* ${money(totalSpend, currency)}`);
  if (days > 0) {
    lines.push(`💳 *Média de investimento/dia:* ${money(totalSpend / days, currency)} (${num(days)} dia${days === 1 ? "" : "s"})`);
  }

  // Por campanha (o nome já diz o tipo; o rótulo do objetivo reforça).
  const visibleCampaigns = topRows(campaigns.map((campaign) => ({ key: campaign.name, spend: campaign.spend })), 5);
  if (visibleCampaigns.length > 0) {
    lines.push("");
    lines.push("📌 *Campanhas (top 5):*");
    for (const item of visibleCampaigns) {
      const campaign = campaigns.find((entry) => entry.name === item.key);
      const resultPart = campaign?.results ? ` · ${num(campaign.results)} ${campaign.resultNoun || "resultados"}` : "";
      lines.push(`• 🎯 ${item.key}${campaign?.objective ? ` (${objectiveLabel(campaign.objective)})` : ""} — ${money(item.spend, currency)} (${pct(item.spend, totalSpend)})${resultPart}`);
    }
  }

  // Resultado específico de cada tipo de campanha: além da contagem, diz o
  // que é o resultado (conversas iniciadas, vendas, leads...) — muda por
  // conta, então vem detectado nos dados e rotulado aqui.
  if (campaignTypes.length > 0) {
    lines.push("");
    lines.push("🧩 *Resultado por tipo de campanha:*");
    for (const type of campaignTypes) {
      lines.push(`• ${type.label}: ${num(type.results)}${type.familyLabel ? ` ${type.familyLabel.toLowerCase()}` : " resultados"}`);
    }
  }

  // Criativos que rodaram no período, com gasto, resultado e o link do
  // conteúdo (Facebook/Instagram) para conferir a peça.
  const visibleCreatives = topRows(creatives.map((c) => ({ key: c.name, spend: c.spend })), 5);
  if (visibleCreatives.length > 0) {
    lines.push("");
    lines.push("🎬 *Criativos que rodaram (top 5):*");
    for (const item of visibleCreatives) {
      const creative = creatives.find((entry) => entry.name === item.key);
      const resultPart = creative?.results ? ` · ${num(creative.results)} ${creative.resultNoun || "resultados"}` : "";
      lines.push(`• ${item.key} — ${money(item.spend, currency)} (${pct(item.spend, totalSpend)})${resultPart}`);
      if (creative?.permalink) lines.push(`🔗 ${creative.permalink}`);
    }
  }

  // Por região (pedido recorrente no fechamento mensal).
  const visibleRegions = topRows(regions, 4);
  if (visibleRegions.length > 0) {
    lines.push("");
    lines.push("📍 *Regiões (top 4):*");
    for (const item of visibleRegions) {
      lines.push(`• ${item.key} — ${money(item.spend, currency)} (${pct(item.spend, totalSpend)})`);
    }
  }

  // Criativos em veiculação.
  lines.push("");
  lines.push(`🎬 *Criativos:* ${num(creativeCount.active)} ativo(s) · ${num(creativeCount.total)} no total`);

  // Faturado e ROI (vendas informadas ÷ investimento).
  if (revenue != null && revenue > 0) {
    lines.push("");
    lines.push(`💰 *Valor faturado:* ${money(revenue, currency)}`);
    lines.push(`📈 *ROI:* ${totalSpend > 0 ? (revenue / totalSpend).toFixed(2).replace(".", ",") : "—"}x (faturamento ÷ investimento)`);
  }

  if (results != null) {
    lines.push("");
    lines.push(`🎯 *${resultsLabel}:* ${num(results)}${cpr ? ` · custo por ${resultsNoun} ${money(cpr, currency)}` : ""}`);
  }

  // Leitura rápida em uma linha, sem jargão. Mantém o nome como o cliente
  // conhece (sem forçar minúsculas).
  const topCampaign = visibleCampaigns[0];
  const topRegion = visibleRegions[0];
  if (topCampaign) {
    const parte = topRegion
      ? `A maior parte da verba (${pct(topCampaign.spend, totalSpend)}) foi para *${topCampaign.key}*, concentrada em *${topRegion.key}*.`
      : `A maior parte da verba (${pct(topCampaign.spend, totalSpend)}) foi para *${topCampaign.key}*.`;
    lines.push("");
    lines.push(`✍️ *Leitura rápida:* ${parte}`);
  }

  lines.push("");
  lines.push("Fico à disposição para detalhar qualquer ponto! 😊");

  return lines.join("\n");
}

export function monthPeriodLabel(): string {
  const now = new Date();
  return `Mês de ${now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`;
}
