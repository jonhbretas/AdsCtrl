// lib/alerts.ts
// Motor de alertas: transforma dados crus em avisos acionáveis.

import {
  AdAccountRaw,
  AccountInsight,
  RejectedAd,
  mapAccountStatus,
  availableBalance,
  isPrepaidAccount,
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
    | "creative_issue"
    | "no_spend";
  title: string;
  detail: string;
  // O que o alerta encontrou, quando isso é uma lista de entidades. Existe para
  // a tarefa automática poder abrir a tela certa já filtrada: sem os IDs, o
  // cartão "3 criativos reprovados" obriga a procurar quais são na mão.
  entities?: { adIds: string[]; adNames: string[] };
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

  // 3. Saldo baixo (contas pré-pagas: saldo disponível abaixo do limiar)
  const available = availableBalance(account);
  const threshold = input.lowBalanceThreshold ?? 50;
  const averageDailySpend = (insight7d?.spend || 0) / 7;
  const runwayDays =
    available != null && averageDailySpend > 0
      ? available / averageDailySpend
      : null;
  const lowByRunway = runwayDays != null && runwayDays <= 5;
  const lowByAmount = available != null && available < threshold;
  if (isPrepaidAccount(account) && available != null && (lowByRunway || lowByAmount)) {
    const urgent = runwayDays != null && runwayDays <= 1;
    alerts.push({
      account_id: id,
      account_name: name,
      level: urgent ? "critical" : "warning",
      type: "low_balance",
      title: urgent
        ? "Saldo pode acabar em menos de 1 dia"
        : runwayDays != null
          ? `Saldo para aproximadamente ${runwayDays.toFixed(1)} dias`
          : "Saldo baixo",
      detail:
        `Saldo disponível: ${account.currency} ${available.toFixed(2)}.` +
        (runwayDays != null
          ? ` Média diária dos últimos 7 dias: ${account.currency} ${averageDailySpend.toFixed(2)}.`
          : ""),
    });
  }

  // 4. Criativos com problema — mas problema não é tudo igual.
  //
  // A Meta usa dois effective_status nesta lista, com consequências opostas:
  //
  //   DISAPPROVED  — reprovação por infração de política. Esta pesa na
  //                  qualidade da conta e exige correção ou contestação.
  //   WITH_ISSUES  — erro de veiculação (pagamento, agendamento, peça
  //                  faltando…). NÃO é infração: não penaliza a conta e
  //                  costuma se resolver sem revisão manual.
  //
  // Misturar os dois num alerta de "reprovado" enchia o quadro de falsas
  // urgências — a maioria era só erro. Por isso reprovação vira tarefa e
  // erro vira ciência: aparece aqui, mas não abre tarefa (ver
  // ACTIONABLE_ALERTS na coleta).
  const policyRejected = rejected.filter((r) => r.effective_status === "DISAPPROVED");
  const deliveryIssues = rejected.filter((r) => r.effective_status !== "DISAPPROVED");

  if (policyRejected.length > 0) {
    alerts.push({
      account_id: id,
      account_name: name,
      level: "warning",
      type: "rejected_creative",
      title: `${policyRejected.length} criativo(s) reprovado(s)`,
      detail: policyRejected
        .slice(0, 3)
        .map((r) => `${r.ad_name}: ${r.reasons[0]}`)
        .join(" · "),
      entities: {
        adIds: policyRejected.map((r) => r.ad_id).filter(Boolean),
        adNames: policyRejected.map((r) => r.ad_name).filter(Boolean),
      },
    });
  }

  if (deliveryIssues.length > 0) {
    alerts.push({
      account_id: id,
      account_name: name,
      level: "info",
      type: "creative_issue",
      title: `${deliveryIssues.length} criativo(s) com erro de veiculação`,
      detail:
        deliveryIssues
          .slice(0, 3)
          .map((r) => `${r.ad_name}: ${r.reasons[0]}`)
          .join(" · ") +
        " — erro de veiculação não é infração de política e não penaliza a conta.",
      entities: {
        adIds: deliveryIssues.map((r) => r.ad_id).filter(Boolean),
        adNames: deliveryIssues.map((r) => r.ad_name).filter(Boolean),
      },
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
