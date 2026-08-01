// lib/whatsapp-report.ts
// Resumo de mídia pronto para copiar e colar no WhatsApp: formatação nativa
// do app (*negrito*), emojis e frases curtas. A pedido dos clientes no
// fechamento mensal: quanto foi gasto, onde (objetivo/região/plataforma) e o
// resultado — sem jargão de plataforma.

export interface ReportRow {
  key: string;
  spend: number;
}

const OBJECTIVE_LABELS: Record<string, string> = {
  OUTCOME_AWARENESS: "Reconhecimento",
  OUTCOME_TRAFFIC: "Tráfego (visitas ao link)",
  OUTCOME_ENGAGEMENT: "Engajamento (seguidores/grupo)",
  OUTCOME_LEADS: "Leads (cadastros)",
  OUTCOME_SALES: "Vendas (e-commerce)",
  OUTCOME_APP_PROMOTION: "Promoção de app",
  OUTCOME_VIDEO_VIEWS: "Views de vídeo",
  OUTCOME_CONVERSIONS: "Conversões",
  OUTCOME_MESSENGER: "Mensagens",
  OUTCOME_OTHER: "Outros",
};

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  messenger: "Messenger",
  audience_network: "Rede de audiência",
};

export function objectiveLabel(objective?: string): string {
  if (!objective) return "Outros";
  return OBJECTIVE_LABELS[objective] || objective.toLowerCase().replace(/_/g, " ");
}

function money(value: number, currency: string): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL", maximumFractionDigits: 0 }).format(value || 0);
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
  platforms: ReportRow[];
  totalSpend: number;
  results: number | null;
  cpr: number | null;
  roas: number | null;
}): string {
  const { accountName, currency, periodLabel, campaigns, regions, platforms, totalSpend, results, cpr, roas } = input;
  const lines: string[] = [];

  lines.push(`📊 *Resumo de Mídia — ${accountName}*`);
  lines.push(`📅 ${periodLabel}`);
  lines.push("");
  lines.push(`💰 *Investimento total:* ${money(totalSpend, currency)}`);

  // Por objetivo (o "de que forma": link, seguidores, grupo, vendas...).
  const byObjective = new Map<string, number>();
  for (const campaign of campaigns) {
    const label = objectiveLabel(campaign.objective);
    byObjective.set(label, (byObjective.get(label) || 0) + campaign.spend);
  }
  const objectives = [...byObjective.entries()].map(([key, spend]) => ({ key, spend })).sort((a, b) => b.spend - a.spend);
  const visibleObjectives = topRows(objectives, 4);
  if (visibleObjectives.length > 0) {
    lines.push("");
    lines.push("📌 *Onde foi investido:*");
    for (const item of visibleObjectives) {
      lines.push(`• 🎯 ${item.key} — ${money(item.spend, currency)} (${pct(item.spend, totalSpend)})`);
    }
  }

  // Por região (pedido recorrente no fechamento mensal).
  const visibleRegions = topRows(regions, 4);
  if (visibleRegions.length > 0) {
    lines.push("");
    lines.push("📍 *Por região (top 4):*");
    for (const item of visibleRegions) {
      lines.push(`• ${item.key} — ${money(item.spend, currency)} (${pct(item.spend, totalSpend)})`);
    }
  }

  // Por plataforma (Facebook × Instagram × rede de audiência).
  const visiblePlatforms = topRows(platforms, 3);
  if (visiblePlatforms.length > 0) {
    lines.push("");
    lines.push("📱 *Plataformas:*");
    for (const item of visiblePlatforms) {
      lines.push(`• ${PLATFORM_LABELS[item.key] || item.key} — ${pct(item.spend, totalSpend)}`);
    }
  }

  if (results != null) {
    lines.push("");
    lines.push(`🎯 *Resultados:* ${new Intl.NumberFormat("pt-BR").format(results)}${cpr ? ` · custo por resultado ${money(cpr, currency)}` : ""}${roas ? ` · ROAS ${roas.toFixed(1)}x` : ""}`);
  }

  // Leitura rápida em uma linha, sem jargão.
  const topObjective = visibleObjectives[0];
  const topRegion = visibleRegions[0];
  if (topObjective) {
    const parte = topRegion
      ? `A maior parte da verba (${pct(topObjective.spend, totalSpend)}) foi para *${topObjective.key.toLowerCase()}*, concentrada em *${topRegion.key}*.`
      : `A maior parte da verba (${pct(topObjective.spend, totalSpend)}) foi para *${topObjective.key.toLowerCase()}*.`;
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
