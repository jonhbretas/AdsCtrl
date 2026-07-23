// lib/alerts.ts
// Motor de alertas: transforma dados crus em avisos acionáveis.

import {
  AdAccountRaw,
  AccountInsight,
  RejectedAd,
  mapAccountStatus,
  centsToUnit,
} from "./meta";

export type AlertLevel = "critical" | "warning" | "info";

export interface Alert {
  account_id: string;
  account_name: string;
  level: AlertLevel;
  type:
    | "account_disabled"
    | "payment_issue"
    | "low_balance"
    | "spend_drop"
    | "spend_spike"
    | "rejected_creative"
    | "no_spend";
  title: string;
  detail: string;
}

interface BuildAlertsInput {
  account: AdAccountRaw;
  insight7d: AccountInsight | null;
  insightPrev7d: AccountInsight | null; // 7 dias anteriores, para comparar quedas
  rejected: RejectedAd[];
  // limiar configurável de saldo baixo, na moeda da conta
  lowBalanceThreshold?: number;
}

export function buildAlertsForAccount(input: BuildAlertsInput): Alert[] {
  const { account, insight7d, insightPrev7d, rejected } = input;
  const name = account.name;
  const id = account.account_id;
  const alerts: Alert[] = [];
  const status = mapAccountStatus(account.account_status);

  // 1. Conta desabilitada / em análise de risco -> crítico
  if (["DISABLED", "PENDING_RISK_REVIEW", "CLOSED", "PENDING_CLOSURE"].includes(status)) {
    alerts.push({
      account_id: id,
      account_name: name,
      level: "critical",
      type: "account_disabled",
      title: "Conta com problema de status",
      detail: `Status atual: ${status}. Anúncios podem estar parados.`,
    });
  }

  // 2. Problema de pagamento (não liquidado)
  if (["UNSETTLED", "IN_GRACE_PERIOD", "PENDING_SETTLEMENT"].includes(status)) {
    alerts.push({
      account_id: id,
      account_name: name,
      level: "critical",
      type: "payment_issue",
      title: "Problema de pagamento",
      detail: `Status ${status} — verifique cartão / forma de pagamento.`,
    });
  }

  // 3. Saldo baixo (só para contas pré-pagas que expõem balance)
  const balance = centsToUnit(account.balance);
  const threshold = input.lowBalanceThreshold ?? 50;
  const isPrepaid = account.funding_source_details?.type === 1; // 1 costuma indicar prepaid/saldo
  if (isPrepaid && balance > 0 && balance < threshold) {
    alerts.push({
      account_id: id,
      account_name: name,
      level: "warning",
      type: "low_balance",
      title: "Saldo baixo",
      detail: `Saldo restante: ${account.currency} ${balance.toFixed(2)}.`,
    });
  }

  // 4. Criativos reprovados
  if (rejected.length > 0) {
    alerts.push({
      account_id: id,
      account_name: name,
      level: "warning",
      type: "rejected_creative",
      title: `${rejected.length} criativo(s) reprovado(s)`,
      detail: rejected
        .slice(0, 3)
        .map((r) => `${r.ad_name}: ${r.reasons[0]}`)
        .join(" · "),
    });
  }

  // 5. Queda de gasto relevante (>40% vs 7 dias anteriores)
  if (insight7d && insightPrev7d && insightPrev7d.spend > 0) {
    const drop = 1 - insight7d.spend / insightPrev7d.spend;
    if (drop >= 0.4) {
      alerts.push({
        account_id: id,
        account_name: name,
        level: "warning",
        type: "spend_drop",
        title: `Queda de gasto de ${Math.round(drop * 100)}%`,
        detail: `De ${insightPrev7d.spend.toFixed(2)} para ${insight7d.spend.toFixed(
          2
        )} (${account.currency}).`,
      });
    }
  }

  // 6. Conta ativa mas sem gasto nos últimos 7 dias
  if (status === "ACTIVE" && insight7d && insight7d.spend === 0) {
    alerts.push({
      account_id: id,
      account_name: name,
      level: "info",
      type: "no_spend",
      title: "Sem gasto nos últimos 7 dias",
      detail: "Conta ativa mas sem investimento no período.",
    });
  }

  return alerts;
}

// Ordena alertas: críticos primeiro.
export function sortAlerts(alerts: Alert[]): Alert[] {
  const order: Record<AlertLevel, number> = { critical: 0, warning: 1, info: 2 };
  return [...alerts].sort((a, b) => order[a.level] - order[b.level]);
}
