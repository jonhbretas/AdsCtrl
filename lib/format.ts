// lib/format.ts — helpers de formatação e resultado.

export const brl = (v: number, digits = 2) =>
  `R$ ${(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export const brlShort = (v: number) =>
  `R$ ${(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

export const num = (v: number) => (v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export const pct = (v: number) => `${(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

// Prioridade para escolher o "resultado" principal de uma conta.
const RESULT_PRIORITY = [
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "lead",
  "offsite_conversion.fb_pixel_lead",
  "complete_registration",
  "onsite_conversion.messaging_conversation_started_7d",
  "landing_page_view",
  "link_click",
  "page_engagement",
  "post_engagement",
  "video_view",
];

export function pickPrimaryResult(available: string[]): string | null {
  for (const p of RESULT_PRIORITY) if (available.includes(p)) return p;
  return available[0] ?? null;
}

// Ordena os action_types disponíveis: prioritários primeiro, resto alfabético.
export function orderedResults(available: string[]): string[] {
  const inPri = RESULT_PRIORITY.filter((p) => available.includes(p));
  const rest = available.filter((a) => !RESULT_PRIORITY.includes(a)).sort();
  return [...inPri, ...rest];
}

// Rótulos amigáveis para action_types da Meta (client-safe).
export const ACTION_LABELS: Record<string, string> = {
  purchase: "Compras",
  "offsite_conversion.fb_pixel_purchase": "Compras (pixel)",
  lead: "Leads",
  "offsite_conversion.fb_pixel_lead": "Leads (pixel)",
  onsite_web_lead: "Leads (site)",
  complete_registration: "Cadastros",
  landing_page_view: "Views de LP",
  link_click: "Cliques no link",
  post_engagement: "Engajamento",
  page_engagement: "Engaj. na página",
  "onsite_conversion.messaging_conversation_started_7d": "Conversas iniciadas",
  "onsite_conversion.messaging_first_reply": "Primeiras respostas",
  video_view: "Views de vídeo",
  "onsite_conversion.post_save": "Salvamentos",
  post_reaction: "Reações",
  comment: "Comentários",
  add_to_cart: "Adições ao carrinho",
};

export function resultLabel(actionType: string): string {
  if (ACTION_LABELS[actionType]) return ACTION_LABELS[actionType];
  // fallback: limpa prefixos e underscores
  return actionType
    .replace(/^offsite_conversion\.|^onsite_conversion\.|^omni_|^fb_pixel_/g, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const dayLabel = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
};
