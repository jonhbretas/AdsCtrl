// lib/alerts.ts
// Motor de alertas: transforma dados crus em avisos acionáveis.

import {
  AdAccountRaw,
  AccountInsight,
  RejectedAd,
  BroadLocationAdSet,
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
    | "cpa_spike"
    | "roas_drop"
    | "rejected_creative"
    | "creative_issue"
    | "no_spend"
    | "stalled"
    | "broad_location";
  title: string;
  detail: string;
  // O que o alerta encontrou, quando isso é uma lista de entidades. Existe para
  // a tarefa automática poder abrir a tela certa já filtrada: sem os IDs, o
  // cartão "3 criativos reprovados" obriga a procurar quais são na mão.
  entities?: {
    adIds: string[];
    adNames: string[];
    // Campanhas envolvidas (localização ampla), para o cartão cair na tela de
    // campanhas já com a campanha aberta/destacada.
    campaignIds?: string[];
    campaignNames?: string[];
  };
}

interface BuildAlertsInput {
  account: AdAccountRaw;
  insight7d: AccountInsight | null;
  insightPrev7d: AccountInsight | null; // 7 dias anteriores, para comparar quedas
  rejected: RejectedAd[];
  // Conjuntos rodando o país inteiro sem recorte — marca de campanha
  // duplicada onde a localização não foi trocada. Ver fetchBroadLocationAdSets.
  broadLocation?: BroadLocationAdSet[];
  // limiar configurável de saldo baixo, na moeda da conta
  lowBalanceThreshold?: number;
  guardrails?: { target_roas?: number | null; max_cpa?: number | null; max_daily_spend?: number | null };
  // Série diária do período coletado (até "ontem"), para detectar entrega
  // parada há 24h+ mesmo quando os agregados de 7d ainda são > 0.
  daily?: { date: string; spend: number }[];
  // Última data esperada da série (a coleta olha até ontem, não hoje).
  seriesUntil?: string;
  // Conta pausada de propósito: o alerta de "sem rodar" não deve soar.
  onHold?: boolean;
}

export function buildAlertsForAccount(input: BuildAlertsInput): Alert[] {
  const { account, insight7d, insightPrev7d, rejected, broadLocation = [] } = input;
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

  // 7. Conjunto ativo mirando o país inteiro, sem nenhum recorte de
  // localização. Sintoma clássico de campanha duplicada onde ninguém trocou
  // o público: a cópia nasce com o targeting da origem, e "país inteiro"
  // sem cidade/região/raio é o padrão de quem nunca mexeu naquele campo —
  // gasto correndo fora da praça do cliente é o tipo de coisa que só se
  // percebe tarde demais se não houver aviso.
  if (broadLocation.length > 0) {
    const campanhas = [...new Set(broadLocation.map((b) => b.campaign_name).filter(Boolean))];
    const campaignIds = [...new Set(broadLocation.map((b) => b.campaign_id).filter(Boolean))];
    alerts.push({
      account_id: id,
      account_name: name,
      level: "warning",
      type: "broad_location",
      title: `${campanhas.length} campanha(s) rodando o país inteiro, sem recorte de localização`,
      detail:
        campanhas.slice(0, 3).join(" · ") +
        " — confira se a localização foi mesmo trocada; é o sintoma mais comum de duplicação esquecida.",
      entities: {
        adIds: broadLocation.map((b) => b.adset_id),
        adNames: broadLocation.map((b) => b.adset_name),
        campaignIds,
        campaignNames: campanhas,
      },
    });
  }

  // 8. Conta ativa que costuma gastar, mas parou de entregar há 24h+. O
  // "no_spend" acima só olha a janela de 7 dias (e é informativo); este é o
  // alerta MÁXIMO para quem parou ontem e não foi avisado — cliente não pode
  // ficar sem anúncio no ar sem que alguém saiba. A conta marcada como
  // "em pausa combinada" (onHold) não dispara: parou de propósito.
  const stalled = buildStalledAlert(account, input.daily, input.seriesUntil, input.onHold);
  if (stalled) alerts.push(stalled);

  const guardrails = input.guardrails;
  const guardedAverageDailySpend = (insight7d?.spend || 0) / 7;
  if (guardrails?.max_daily_spend != null && guardedAverageDailySpend > guardrails.max_daily_spend) {
    alerts.push({
      account_id: id, account_name: name, level: "warning", type: "spend_spike",
      title: "Gasto diário acima do limite do cliente",
      detail: `Média de ${guardedAverageDailySpend.toFixed(2)} por dia; limite configurado de ${guardrails.max_daily_spend.toFixed(2)} (${account.currency}).`,
    });
  }
  if (guardrails?.max_cpa != null && insight7d && insight7d.conversions > 0) {
    const cpa = insight7d.spend / insight7d.conversions;
    if (cpa > guardrails.max_cpa) alerts.push({
      account_id: id, account_name: name, level: "warning", type: "cpa_spike",
      title: "CPA acima do limite do cliente",
      detail: `CPA atual de ${cpa.toFixed(2)}; limite configurado de ${guardrails.max_cpa.toFixed(2)} (${account.currency}).`,
    });
  }
  if (guardrails?.target_roas != null && insight7d && insight7d.spend > 0 && insight7d.purchaseValue > 0) {
    const roas = insight7d.purchaseValue / insight7d.spend;
    if (roas < guardrails.target_roas) alerts.push({
      account_id: id, account_name: name, level: "warning", type: "roas_drop",
      title: "ROAS abaixo da meta do cliente",
      detail: `ROAS atual de ${roas.toFixed(2)}x; meta configurada de ${guardrails.target_roas.toFixed(2)}x.`,
    });
  }

  return alerts;
}

// Ordena alertas: críticos primeiro.
export function sortAlerts(alerts: Alert[]): Alert[] {
  const order: Record<AlertLevel, number> = { critical: 0, warning: 1, info: 2 };
  return [...alerts].sort((a, b) => order[a.level] - order[b.level]);
}

function daysBetween(aIso: string, bIso: string): number {
  return Math.round((Date.parse(aIso) - Date.parse(bIso)) / 86400000);
}

// Alerta MÁXIMO de entrega parada: a conta está ativa, gastou no passado
// recente, mas não teve NENHUM gasto no dia mais recente coberto pela série
// (a coleta olha até "ontem") — ou seja, já se passaram mais de 24h sem
// anúncio no ar. Requer histórico de gasto na janela: conta nova sem nenhum
// gasto fica por conta do no_spend, não deste cartão.
export function buildStalledAlert(
  account: { account_id: string; name: string; currency: string },
  daily: { date: string; spend: number }[] | undefined,
  seriesUntil: string | undefined,
  onHold: boolean | undefined
): Alert | null {
  if (onHold) return null;
  if (!daily?.length || !seriesUntil) return null;
  let lastSpendDay: string | null = null;
  for (const row of daily) {
    if (row.spend > 0 && (!lastSpendDay || row.date > lastSpendDay)) lastSpendDay = row.date;
  }
  if (!lastSpendDay) return null; // nunca gastou na janela — coberto pelo no_spend
  if (daysBetween(seriesUntil, lastSpendDay) < 1) return null; // entregou até ontem
  return {
    account_id: account.account_id,
    account_name: account.name,
    level: "critical",
    type: "stalled",
    title: "Sem rodar há mais de 24h",
    detail:
      `Último gasto em ${lastSpendDay.split("-").reverse().join("-")}. A conta está ativa, mas sem entrega. ` +
      "Verifique urgente: cliente não pode ficar sem anúncio no ar. Se a parada for combinada, marque a conta como em pausa.",
  };
}
