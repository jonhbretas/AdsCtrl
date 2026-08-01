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
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL", maximumFractionDigits: 0 }).format(value || 0);
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
  campaigns: { name: string; objective?: string; spend: number }[];
  regions: ReportRow[];
  creatives: { total: number; active: number };
  totalSpend: number;
  results: number | null;
  cpr: number | null;
  /** Valor faturado no período (vendas informadas), quando houver. */
  revenue: number | null;
}): string {
  const { accountName, currency, periodLabel, campaigns, regions, creatives, totalSpend, results, cpr, revenue } = input;
  const lines: string[] = [];

  lines.push(`📊 *Resumo de Mídia — ${accountName}*`);
  lines.push(`📅 ${periodLabel}`);
  lines.push("");
  lines.push(`💰 *Investimento total:* ${money(totalSpend, currency)}`);

  // Por campanha (o nome já diz o tipo; o rótulo do objetivo reforça).
  const visibleCampaigns = topRows(campaigns.map((campaign) => ({ key: campaign.name, spend: campaign.spend })), 5);
  if (visibleCampaigns.length > 0) {
    lines.push("");
    lines.push("📌 *Campanhas (top 5):*");
    for (const item of visibleCampaigns) {
      const campaign = campaigns.find((entry) => entry.name === item.key);
      lines.push(`• 🎯 ${item.key}${campaign?.objective ? ` (${objectiveLabel(campaign.objective)})` : ""} — ${money(item.spend, currency)} (${pct(item.spend, totalSpend)})`);
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
  lines.push(`🎬 *Criativos:* ${num(creatives.active)} ativo(s) · ${num(creatives.total)} no total`);

  // Faturado e ROI (vendas informadas ÷ investimento).
  if (revenue != null && revenue > 0) {
    lines.push("");
    lines.push(`💰 *Valor faturado:* ${money(revenue, currency)}`);
    lines.push(`📈 *ROI:* ${totalSpend > 0 ? (revenue / totalSpend).toFixed(2).replace(".", ",") : "—"}x (faturamento ÷ investimento)`);
  }

  if (results != null) {
    lines.push("");
    lines.push(`🎯 *Resultados:* ${num(results)}${cpr ? ` · custo por resultado ${money(cpr, currency)}` : ""}`);
  }

  // Leitura rápida em uma linha, sem jargão.
  const topCampaign = visibleCampaigns[0];
  const topRegion = visibleRegions[0];
  if (topCampaign) {
    const parte = topRegion
      ? `A maior parte da verba (${pct(topCampaign.spend, totalSpend)}) foi para *${topCampaign.key.toLowerCase()}*, concentrada em *${topRegion.key}*.`
      : `A maior parte da verba (${pct(topCampaign.spend, totalSpend)}) foi para *${topCampaign.key.toLowerCase()}*.`;
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
