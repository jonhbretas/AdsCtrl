// lib/report-email.ts
// HTML do e-mail semanal. Cliente de e-mail não é navegador: nada de flex,
// grid, <style> externo ou SVG — só tabelas aninhadas e estilo inline, que é
// o que Gmail e Outlook renderizam igual. As barras dos gráficos são células
// de tabela com largura percentual e cor de fundo.

import { money, num, pct, pickVal, PURCHASE_KEYS, LINKCLICK_KEYS, RESULT_FAMILY_BY_SLUG } from "./format";
import type { ReportPayloadData } from "./report-data";

const INK = "#12161f";
const MUTED = "#6f7787";
const LINE = "#e6e8ee";
const GREEN = "#1f9254";
const RED = "#cf4a45";
const BLUE = "#2f6fe4";
const TEAL = "#17a99a";
const FONT = "Arial, Helvetica, sans-serif";

const MESSAGE_KEYS = RESULT_FAMILY_BY_SLUG.mensagens.keys;
const LEAD_KEYS = RESULT_FAMILY_BY_SLUG.leads.keys;
const REGISTER_KEYS = RESULT_FAMILY_BY_SLUG.cadastros.keys;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const brDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const shortDay = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

interface Metric {
  label: string;
  value: string;
  cur?: number;
  prev?: number;
  invert?: boolean;
  neutral?: boolean;
}

function deltaCell(metric: Metric): string {
  if (metric.cur == null || metric.prev == null || !metric.prev) {
    return `<div style="font-size:11px;color:${MUTED};font-family:${FONT};">—</div>`;
  }
  const change = ((metric.cur - metric.prev) / metric.prev) * 100;
  const up = change >= 0;
  const good = metric.invert ? !up : up;
  const color = metric.neutral || Math.abs(change) < 0.05 ? MUTED : good ? GREEN : RED;
  const arrow = up ? "&#9650;" : "&#9660;";
  return `<div style="font-size:11px;font-weight:bold;color:${color};font-family:${FONT};">${arrow} ${Math.abs(change)
    .toFixed(1)
    .replace(".", ",")}%</div>`;
}

function metricCell(metric: Metric): string {
  return `
    <td width="33%" valign="top" style="padding:0 5px 10px 5px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="border:1px solid ${LINE};border-radius:8px;background:#ffffff;">
        <tr><td style="padding:11px 12px;">
          <div style="font-size:10px;font-weight:bold;letter-spacing:.4px;text-transform:uppercase;color:${MUTED};font-family:${FONT};">${escapeHtml(
            metric.label
          )}</div>
          <div style="font-size:19px;font-weight:bold;color:${INK};font-family:${FONT};padding:4px 0 2px;">${escapeHtml(
            metric.value
          )}</div>
          ${deltaCell(metric)}
        </td></tr>
      </table>
    </td>`;
}

function metricRows(metrics: Metric[]): string {
  const rows: string[] = [];
  for (let i = 0; i < metrics.length; i += 3) {
    const group = metrics.slice(i, i + 3);
    const cells = group.map(metricCell).join("");
    const filler = group.length < 3 ? `<td width="33%">&nbsp;</td>`.repeat(3 - group.length) : "";
    rows.push(`<tr>${cells}${filler}</tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="margin:0 -5px;">${rows.join("")}</table>`;
}

// Barras horizontais em tabela: a única forma de "gráfico" que sobrevive ao Gmail.
function barChart(rows: { label: string; value: number; right: string }[], color: string): string {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const body = rows
    .map(
      (r) => `
      <tr>
        <td width="26%" style="padding:3px 8px 3px 0;font-size:11px;color:#4a5160;font-family:${FONT};white-space:nowrap;">${escapeHtml(
          r.label
        )}</td>
        <td width="52%" style="padding:3px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="background:#f1f3f7;border-radius:3px;">
            <tr><td width="${Math.max(1, Math.round((r.value / max) * 100))}%"
                    style="background:${color};border-radius:3px;font-size:0;line-height:0;height:9px;">&nbsp;</td>
                <td>&nbsp;</td></tr>
          </table>
        </td>
        <td width="22%" align="right" style="padding:3px 0 3px 8px;font-size:11px;font-weight:bold;color:${INK};font-family:${FONT};white-space:nowrap;">${escapeHtml(
          r.right
        )}</td>
      </tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table>`;
}

function sectionTitle(text: string): string {
  return `<div style="font-size:11px;font-weight:bold;letter-spacing:.6px;text-transform:uppercase;color:${MUTED};font-family:${FONT};padding:16px 0 8px;">${escapeHtml(
    text
  )}</div>`;
}

function card(inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="border:1px solid ${LINE};border-radius:8px;background:#ffffff;">
            <tr><td style="padding:12px 14px;">${inner}</td></tr>
          </table>`;
}

export interface ReportEmail {
  subject: string;
  html: string;
  text: string;
}

// Monta o e-mail a partir do MESMO payload que alimenta o relatório completo.
export function renderReportEmail(
  report: ReportPayloadData,
  options: { clientName: string; link: string; dryRun?: boolean }
): ReportEmail {
  const currency = report.account.currency || "BRL";
  const m = (v: number) => money(v, currency);
  const meta: any = report.meta && !report.meta.error ? report.meta : null;
  const k = meta?.kpis;
  const p = meta?.prevKpis;
  const googleTotals = report.google.reduce(
    (acc, g: any) => {
      const gk = g.detail?.kpis;
      if (!gk) return acc;
      acc.spend += gk.spend || 0;
      acc.clicks += gk.clicks || 0;
      acc.impressions += gk.impressions || 0;
      acc.conversions += gk.results?.conversions || 0;
      return acc;
    },
    { spend: 0, clicks: 0, impressions: 0, conversions: 0 }
  );

  const totalSpend = (k?.spend || 0) + googleTotals.spend;
  const metrics: Metric[] = [];

  if (k) {
    const linkClicks = pickVal(k.results, LINKCLICK_KEYS);
    const prevLinkClicks = pickVal(p.results, LINKCLICK_KEYS);
    const messages = pickVal(k.results, MESSAGE_KEYS);
    const prevMessages = pickVal(p.results, MESSAGE_KEYS);
    const leads = pickVal(k.results, LEAD_KEYS) + pickVal(k.results, REGISTER_KEYS);
    const prevLeads = pickVal(p.results, LEAD_KEYS) + pickVal(p.results, REGISTER_KEYS);
    const purchases = pickVal(k.results, PURCHASE_KEYS);
    const purchaseValue = pickVal(k.values, PURCHASE_KEYS);
    const prevPurchaseValue = pickVal(p.values, PURCHASE_KEYS);

    metrics.push(
      { label: "Investimento", value: m(k.spend), cur: k.spend, prev: p.spend, neutral: true },
      { label: "Alcance", value: num(k.reach), cur: k.reach, prev: p.reach },
      { label: "Impressões", value: num(k.impressions), cur: k.impressions, prev: p.impressions },
      { label: "Cliques no link", value: num(linkClicks), cur: linkClicks, prev: prevLinkClicks },
      {
        label: "CTR (link)",
        value: pct(k.impressions ? (linkClicks / k.impressions) * 100 : 0),
        cur: k.impressions ? (linkClicks / k.impressions) * 100 : 0,
        prev: p.impressions ? (prevLinkClicks / p.impressions) * 100 : 0,
      },
      {
        label: "CPC médio",
        value: k.clicks ? m(k.spend / k.clicks) : "—",
        cur: k.clicks ? k.spend / k.clicks : undefined,
        prev: p.clicks ? p.spend / p.clicks : undefined,
        invert: true,
      }
    );
    if (messages > 0) {
      metrics.push(
        { label: "Conversas iniciadas", value: num(messages), cur: messages, prev: prevMessages },
        {
          label: "Custo por conversa",
          value: m(k.spend / messages),
          cur: k.spend / messages,
          prev: prevMessages ? p.spend / prevMessages : undefined,
          invert: true,
        }
      );
    }
    if (leads > 0) {
      metrics.push(
        { label: "Leads / cadastros", value: num(leads), cur: leads, prev: prevLeads },
        {
          label: "Custo por lead",
          value: m(k.spend / leads),
          cur: k.spend / leads,
          prev: prevLeads ? p.spend / prevLeads : undefined,
          invert: true,
        }
      );
    }
    if (purchaseValue > 0) {
      metrics.push(
        { label: "Compras", value: num(purchases) },
        {
          label: "ROAS",
          value: k.spend ? `${(purchaseValue / k.spend).toFixed(2).replace(".", ",")}x` : "—",
          cur: k.spend ? purchaseValue / k.spend : undefined,
          prev: p.spend ? prevPurchaseValue / p.spend : undefined,
        }
      );
    }
  }
  if (googleTotals.spend > 0) {
    metrics.push(
      { label: "Google Ads · custo", value: m(googleTotals.spend), neutral: true },
      { label: "Google Ads · cliques", value: num(googleTotals.clicks) },
      { label: "Google Ads · conversões", value: num(googleTotals.conversions) }
    );
  }

  const dailyBars = (meta?.daily || []).map((d: any) => ({
    label: shortDay(d.date),
    value: d.spend,
    right: m(d.spend),
  }));

  const topCampaigns = (meta?.campaigns || []).slice(0, 3).map((c: any) => ({
    label: String(c.name).slice(0, 30),
    value: c.spend,
    right: m(c.spend),
  }));

  const periodo = `${brDate(report.range.since)} a ${brDate(report.range.until)}`;
  const subject = `${options.dryRun ? "[TESTE] " : ""}Relatório de mídia paga · ${options.clientName} · ${periodo}`;

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f5f7;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Resultados de ${escapeHtml(
    periodo
  )} — investimento de ${escapeHtml(m(totalSpend))}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f5f7;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
           style="width:600px;max-width:100%;background:#ffffff;border-radius:12px;border:1px solid ${LINE};">
      <tr><td style="padding:22px 22px 6px;">
        ${options.dryRun
          ? `<div style="background:#fff8e9;border:1px solid #edd49f;color:#8a6117;font-size:11px;font-family:${FONT};padding:7px 10px;border-radius:6px;margin-bottom:12px;">Envio de teste — o cliente não recebeu esta mensagem.</div>`
          : ""}
        <div style="font-size:10px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:${MUTED};font-family:${FONT};">Relatório de mídia paga</div>
        <div style="font-size:23px;font-weight:bold;color:${INK};font-family:${FONT};padding:6px 0 2px;">${escapeHtml(
          options.clientName
        )}</div>
        <div style="font-size:13px;color:${MUTED};font-family:${FONT};">${escapeHtml(periodo)} · comparado com ${escapeHtml(
          brDate(report.prevRange.since)
        )} a ${escapeHtml(brDate(report.prevRange.until))}</div>
      </td></tr>

      <tr><td style="padding:14px 17px 0;">
        ${metricRows(metrics)}
      </td></tr>

      ${dailyBars.length
        ? `<tr><td style="padding:0 22px;">${sectionTitle("Investimento por dia")}${card(barChart(dailyBars, TEAL))}</td></tr>`
        : ""}

      ${topCampaigns.length
        ? `<tr><td style="padding:0 22px;">${sectionTitle("Campanhas com maior investimento")}${card(
            barChart(topCampaigns, BLUE)
          )}</td></tr>`
        : ""}

      <tr><td align="center" style="padding:24px 22px 6px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" bgcolor="${INK}" style="border-radius:9px;">
            <a href="${escapeHtml(options.link)}"
               style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;font-family:${FONT};">
              Ver relatório completo
            </a>
          </td></tr>
        </table>
        <div style="font-size:11px;color:${MUTED};font-family:${FONT};padding-top:10px;">
          Campanhas, conjuntos, anúncios, públicos e horários — com opção de salvar em PDF.
        </div>
      </td></tr>

      <tr><td style="padding:18px 22px 22px;">
        <div style="border-top:1px solid ${LINE};padding-top:12px;font-size:10.5px;color:${MUTED};font-family:${FONT};line-height:1.6;">
          Dados consultados diretamente nas plataformas de anúncio.
          O link acima vale por 60 dias.<br>Relatório automático enviado por AdsCtrl.
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  const text = [
    `Relatório de mídia paga — ${options.clientName}`,
    `Período: ${periodo}`,
    "",
    ...metrics.map((metric) => `${metric.label}: ${metric.value}`),
    "",
    `Relatório completo: ${options.link}`,
  ].join("\n");

  return { subject, html, text };
}
