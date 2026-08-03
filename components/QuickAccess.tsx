"use client";

// components/QuickAccess.tsx
// Acessos rápidos de uma conta: links diretos para Ads Manager, saldo e
// pagamento, faturas, acessos e Business Manager (Meta) ou Google Ads (Google),
// com o saldo pré-pago e a "pista" de quanto ele dura quando a conta é prepaid.
// Vivia dentro da visão geral e foi extraído para poder ser reutilizado.

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { cn, readJson } from "@/lib/utils";
import { brDate } from "@/lib/format";

export default function QuickAccess({ accountId, accountName, platform, balance, currency, compact = false }: {
  accountId: string;
  accountName: string;
  platform: "meta" | "google";
  balance: number | null;
  currency: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [business, setBusiness] = useState<{ id: string; name: string | null } | null>(null);
  const [finance, setFinance] = useState<{ is_prepaid: boolean; balance: number | null; spend_7d: number; average_daily_spend: number; runway_days: number | null; estimated_depletion_date: string | null } | null>(null);
  const bareId = accountId.replace(/^act_/, "").replace(/^google:/, "");
  const isMeta = platform === "meta";

  useEffect(() => {
    if (!isMeta) return;
    let alive = true;
    fetch(`/api/account/links?account_id=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then(readJson)
      .then((p) => {
        if (alive && p?.business_id) setBusiness({ id: p.business_id, name: p.business_name || null });
        if (alive && p?.finance) setFinance(p.finance);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [accountId, isMeta]);

  const businessParam = business?.id ? `&business_id=${encodeURIComponent(business.id)}` : "";
  const billingUrl = isMeta
    ? `https://business.facebook.com/billing_hub/payment_settings?asset_id=${encodeURIComponent(bareId)}${businessParam}&placement=standalone`
    : `https://ads.google.com/aw/billing/summary?ocid=${encodeURIComponent(bareId)}`;
  const links = isMeta
    ? [
        { label: "Ads Manager", url: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent(bareId)}`, accent: false },
        { label: "Saldo / pagamento", url: billingUrl, accent: true },
        { label: "Faturas", url: `https://business.facebook.com/billing_hub/accounts/details?asset_id=${encodeURIComponent(bareId)}${businessParam}&placement=standalone`, accent: false },
        { label: "Conta e acessos", url: `https://business.facebook.com/settings/ad-accounts/${encodeURIComponent(bareId)}${business?.id ? `?business_id=${encodeURIComponent(business.id)}` : ""}`, accent: false },
        { label: "Business Manager", url: business?.id ? `https://business.facebook.com/settings?business_id=${encodeURIComponent(business.id)}` : "https://business.facebook.com/settings", accent: false },
      ]
    : [
        { label: "Google Ads", url: `https://ads.google.com/aw/overview?ocid=${encodeURIComponent(bareId)}`, accent: false },
        { label: "Campanhas", url: `https://ads.google.com/aw/campaigns?ocid=${encodeURIComponent(bareId)}`, accent: false },
        { label: "Faturamento", url: billingUrl, accent: true },
        { label: "Acessos", url: `https://ads.google.com/aw/accountaccess/users?ocid=${encodeURIComponent(bareId)}`, accent: false },
      ];
  const effectiveBalance = finance ? finance.balance : balance;
  const runwayDays = finance?.runway_days ?? null;
  const formatCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL" }).format(v);
  const runwayText = runwayDays == null ? null : runwayDays < 1 ? `${Math.max(1, Math.round(runwayDays * 24))}h` : runwayDays < 10 ? `${runwayDays.toFixed(1)} dias` : `${Math.round(runwayDays)} dias`;
  const depletionText = finance?.estimated_depletion_date ? brDate(finance.estimated_depletion_date) : null;

  async function copy(value: string, key: string) {
    try { await navigator.clipboard.writeText(value); setCopied(key); setTimeout(() => setCopied(null), 1800); }
    catch { window.prompt("Copie:", value); }
  }

  const balTone = runwayDays != null && runwayDays <= 1 ? "danger" : runwayDays != null && runwayDays <= 5 ? "warn" : "ok";

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", compact ? "py-1.5" : "py-1")}>
      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mr-1">
        Acesso rápido{business?.name ? ` · ${business.name}` : ""}
      </span>
      {isMeta && finance?.is_prepaid && effectiveBalance != null && (
        <span className={cn(
          "px-2 py-1 text-[10px] font-bold rounded-md border",
          balTone === "danger" ? "bg-red-500/10 border-red-500/30 text-red-500" :
          balTone === "warn" ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400" :
          "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
        )}>
          Saldo {formatCurrency(effectiveBalance)} · {runwayText ? `dura ${runwayText}` : "sem gasto 7d"}
          {depletionText ? ` · até ${depletionText}` : ""}
        </span>
      )}
      {links.map((link) => (
        <a key={link.label} href={link.url} target="_blank" rel="noreferrer"
          className={cn(
            "px-2 py-1 text-[10px] font-semibold rounded-md border transition-colors inline-flex items-center gap-1 no-underline",
            link.accent
              ? "bg-primary/10 border-primary/20 text-primary hover:bg-primary/20"
              : "bg-muted/30 border-border/50 text-muted-foreground hover:text-foreground hover:bg-accent/50"
          )}>
          {link.label} <ExternalLink className="h-2.5 w-2.5" />
        </a>
      ))}
      <button onClick={() => copy(billingUrl, "billing")}
        className="px-2 py-1 text-[10px] font-semibold rounded-md border border-dashed border-primary/30 text-primary hover:bg-primary/10 transition-colors cursor-pointer bg-transparent">
        {copied === "billing" ? <><Check className="h-2.5 w-2.5 inline" /> Copiado</> : <><Copy className="h-2.5 w-2.5 inline" /> Copiar link</>}
      </button>
      <button onClick={() => copy(bareId, "id")}
        className="px-2 py-1 text-[10px] rounded-md text-muted-foreground hover:text-foreground transition-colors cursor-pointer bg-transparent border-none">
        {copied === "id" ? "✓ ID" : `ID ${bareId}`}
      </button>
    </div>
  );
}
