// lib/format.ts — helpers de formatação e resultado.

export const brl = (v: number, digits = 2) =>
  `R$ ${(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export const brlShort = (v: number) =>
  `R$ ${(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

export const num = (v: number) => (v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export const pct = (v: number) => `${(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

// Prioridade para escolher o "resultado" principal de uma conta.
const RESULT_PRIORITY = [
  "conversions",
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
  conversions: "Conversões",
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

// "Foco" do negócio para os KPIs/coluna principal do overview. Cada família
// agrupa as variações de action_type da Meta que representam o mesmo resultado.
// (compartilhado entre servidor — coleta/overview — e cliente — labels/seletor).
export interface ResultFamily {
  slug: string;
  label: string;
  keys: string[];
  sales?: boolean; // habilita valor de compra + ROAS
}
export const RESULT_FAMILIES: ResultFamily[] = [
  { slug: "conversoes", label: "Conversões reportadas", keys: [] },
  { slug: "vendas", label: "Vendas / Compras", sales: true, keys: ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"] },
  { slug: "mensagens", label: "Mensagens (conversas)", keys: ["onsite_conversion.messaging_conversation_started_7d", "onsite_conversion.total_messaging_connection", "onsite_conversion.messaging_first_reply"] },
  { slug: "leads", label: "Leads", keys: ["lead", "offsite_conversion.fb_pixel_lead", "onsite_web_lead", "onsite_conversion.lead_grouped", "leadgen_grouped"] },
  { slug: "cadastros", label: "Cadastros", keys: ["complete_registration", "offsite_conversion.fb_pixel_complete_registration"] },
  { slug: "cliques", label: "Cliques no link", keys: ["link_click"] },
  { slug: "lpv", label: "Views de página de destino", keys: ["landing_page_view"] },
  { slug: "engajamento", label: "Engajamento", keys: ["post_engagement", "page_engagement"] },
];
export const RESULT_FAMILY_BY_SLUG: Record<string, ResultFamily> = Object.fromEntries(
  RESULT_FAMILIES.map((f) => [f.slug, f])
);

// Chaves de action_type para métricas de e-commerce (a Meta usa variações).
export const PURCHASE_KEYS = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];
export const ATC_KEYS = ["omni_add_to_cart", "add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"];
export const CHECKOUT_KEYS = [
  "omni_initiated_checkout",
  "initiate_checkout",
  "offsite_conversion.fb_pixel_initiate_checkout",
];
export const LINKCLICK_KEYS = ["link_click"];

// Pega o primeiro valor presente entre várias chaves possíveis.
export function pickVal(map: Record<string, number> | undefined, keys: string[]): number {
  if (!map) return 0;
  for (const k of keys) if (map[k]) return map[k];
  return 0;
}

// Variação percentual vs período anterior.
export function delta(cur: number, prev: number): { pct: number; hasPrev: boolean } {
  if (!prev || prev === 0) return { pct: 0, hasPrev: false };
  return { pct: ((cur - prev) / prev) * 100, hasPrev: true };
}

export const roas = (value: number, spend: number) => (spend > 0 ? value / spend : 0);

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const weekdayLabel = (iso: string) => WEEKDAYS[new Date(iso + "T00:00:00").getDay()];

export const dayLabel = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
};
