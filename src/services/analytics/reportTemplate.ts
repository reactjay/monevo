// ─────────────────────────────────────────────────────────────────────────────
// Monevo Weekly Financial Intelligence Report — 1080 × 1350 WhatsApp Format
// Premium editorial-fintech design system
// ─────────────────────────────────────────────────────────────────────────────

import { ITopCategory } from '../../types/models';
import { escapeXml, wrapText } from '../receipts/receiptTemplate';

export interface WeeklyReportTemplateData {
  recipientName: string;
  isBusiness: boolean;
  businessName?: string;
  currency: string;
  periodLabel: string;    // e.g. "7 Sep — 13 Sep 2026"
  totalIncome: number;
  formattedIncome: string;
  totalExpenses: number;
  formattedExpenses: string;
  net: number;
  formattedNet: string;
  transactionCount: number;
  topCategories: ITopCategory[];
  generatedAtStr: string;
  aiInsight?: string;     // optional override; generated from data if absent
}

// ── Pure White / Light Theme Palette (consistent with receipt) ──────────────
const C = {
  bg:           '#FFFFFF',
  surface:      '#F8FAFC',
  border:       '#E2E8F0',
  borderFaint:  '#F1F5F9',
  textPrimary:  '#0F172A',
  textMid:      '#334155',
  textMuted:    '#64748B',
  textGhost:    '#94A3B8',
  blue:         '#1A6EFF',
  blueDim:      '#2563EB',
  green:        '#16A34A',
  greenBg:      '#DCFCE7',
  greenText:    '#16A34A',
  red:          '#DC2626',
  redBg:        '#FEE2E2',
  redText:      '#DC2626',
};

// ── Cashflow bar colors ───────────────────────────────────────────────────────
const CAT_COLORS = [
  '#1A6EFF', // blue
  '#16A34A', // green
  '#8B5CF6', // purple
  '#F59E0B', // amber
  '#06B6D4', // cyan
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function amtFontSize(formatted: string): number {
  const len = formatted.length;
  if (len <= 8)  return 96;
  if (len <= 10) return 80;
  if (len <= 12) return 68;
  return 58;
}

function capitalize(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// ── Deterministic AI insight ──────────────────────────────────────────────────
// Rule-based; never invents numbers or facts not in the data
// Returns { brief: one short phrase, full: complete sentence }

interface InsightText { brief: string; full: string; }

function generateInsight(data: WeeklyReportTemplateData): InsightText {
  const { totalIncome, totalExpenses, net, transactionCount, topCategories } = data;
  const { formattedIncome, formattedExpenses, formattedNet, currency } = data;
  const totalVolume = totalIncome + totalExpenses;

  if (transactionCount === 0) {
    return {
      brief: 'No transactions recorded this week.',
      full:  'Start logging income and expenses to see your weekly financial intelligence report.',
    };
  }

  const top = topCategories[0];
  const catStr = top ? ` Top category: ${capitalize(top.category)}.` : '';

  if (totalIncome === 0) {
    return {
      brief: `Only expenses this week: ${formattedExpenses}.`,
      full:  `Only expenses were recorded this week, totalling ${formattedExpenses}.${catStr}`,
    };
  }

  if (totalExpenses === 0) {
    return {
      brief: `Income only: ${formattedIncome}. No expenses tracked.`,
      full:  `Only income was recorded this week, totalling ${formattedIncome}. No expenses tracked.`,
    };
  }

  const netPct = totalVolume > 0 ? Math.round((Math.abs(net) / totalVolume) * 100) : 0;

  if (net > 0) {
    if (netPct >= 88) {
      return {
        brief: `Cashflow strongly positive this week.`,
        full:  `Income greatly exceeded expenses. Net cashflow of ${formattedNet} ${currency} represents a ${netPct}% positive balance.${catStr}`,
      };
    }
    if (netPct >= 50) {
      return {
        brief: `Positive cashflow. Net: ${formattedNet}.`,
        full:  `Income of ${formattedIncome} outpaced expenses of ${formattedExpenses}, leaving a net of ${formattedNet}.${catStr}`,
      };
    }
    return {
      brief: `Slightly positive this week. Net: ${formattedNet}.`,
      full:  `Cashflow was slightly positive with net ${formattedNet}. Consider reviewing expenses to improve your surplus.${catStr}`,
    };
  }

  if (net < 0) {
    if (netPct >= 50) {
      return {
        brief: `Expenses exceeded income. Net outflow: ${formattedNet}.`,
        full:  `Expenses significantly exceeded income. Net outflow of ${formattedNet}. Review spending to improve your position.${catStr}`,
      };
    }
    return {
      brief: `Slightly negative cashflow. Net outflow: ${formattedNet}.`,
      full:  `Expenses slightly exceeded income with a net outflow of ${formattedNet}.${catStr}`,
    };
  }

  return {
    brief: `Perfectly balanced this week at ${formattedIncome}.`,
    full:  `Income and expenses balanced exactly this week at ${formattedIncome}. A perfect equilibrium.`,
  };
}

// ── Category bar renderer ─────────────────────────────────────────────────────

function renderCategories(
  cats: ITopCategory[],
  totalExpenses: number,
  currency: string,
  startY: number
): { svg: string; endY: number } {
  const visible = cats.slice(0, 5);
  const totalExp = totalExpenses > 0 ? totalExpenses : 1;
  const ROW_H = 58;
  const BAR_X = 250;
  const BAR_W = 570;
  const AMT_X = BAR_X + BAR_W + 20;

  if (visible.length === 0) {
    const svg = `
  <text x="80" y="${startY + 36}"
    font-size="22" font-weight="400" fill="${C.textMuted}"
    >No expense transactions recorded this week.</text>`;
    return { svg, endY: startY + 60 };
  }

  let svg = '';
  visible.forEach((cat, idx) => {
    const fy = startY + idx * ROW_H;
    const pct = Math.round((cat.amount / totalExp) * 100);
    const barW = Math.max(6, Math.round((pct / 100) * BAR_W));
    const color = CAT_COLORS[idx % CAT_COLORS.length];
    const catName = escapeXml(capitalize(cat.category));
    const amtStr = escapeXml(`${currency === 'NGN' ? '₦' : currency + ' '}${cat.amount.toLocaleString('en-US')}`);

    svg += `
  <!-- Category: ${catName} -->
  <text x="80" y="${fy + 22}"
    font-size="15" font-weight="600" fill="${C.textPrimary}">${catName}</text>
  <rect x="${BAR_X}" y="${fy + 10}" width="${BAR_W}" height="10" rx="5" fill="${C.borderFaint}"/>
  <rect x="${BAR_X}" y="${fy + 10}" width="${barW}" height="10" rx="5" fill="${color}"/>
  <text x="${AMT_X}" y="${fy + 22}"
    font-size="14" font-weight="700" fill="${C.textPrimary}">${amtStr}</text>
  <text x="${AMT_X + 140}" y="${fy + 22}"
    font-size="13" font-weight="500" fill="${C.textMuted}">${pct}%</text>`;
  });

  return { svg, endY: startY + visible.length * ROW_H };
}

// ── Cashflow bar renderer ─────────────────────────────────────────────────────

function renderCashflowBars(
  totalIncome: number,
  totalExpenses: number,
  _formattedIncome: string,
  _formattedExpenses: string,
  currency: string,
  startY: number
): string {
  const totalVol = totalIncome + totalExpenses;
  const BAR_X = 200;
  const BAR_W = 540;
  const MAX_BAR = BAR_W;

  let incW = 0;
  let expW = 0;
  let incPct = 0;
  let expPct = 0;

  if (totalVol > 0) {
    incPct = Math.round((totalIncome / totalVol) * 100);
    expPct = 100 - incPct;
    incW = Math.max(4, Math.round((incPct / 100) * MAX_BAR));
    expW = Math.max(4, Math.round((expPct / 100) * MAX_BAR));
  }

  const cur = currency === 'NGN' ? '₦' : currency + ' ';
  const incStr = escapeXml(`+${cur}${totalIncome.toLocaleString('en-US')}`);
  const expStr = escapeXml(`−${cur}${totalExpenses.toLocaleString('en-US')}`);

  return `
  ${totalVol === 0 ? `
  <text x="80" y="${startY + 20}"
    font-size="14" font-weight="400" fill="${C.textMuted}"
    >No cashflow activity recorded this period.</text>` : `
  <!-- Income bar row -->
  <text x="80" y="${startY + 20}"
    font-size="12" font-weight="700" fill="${C.textMuted}" letter-spacing="2">INCOME</text>
  <rect x="${BAR_X}" y="${startY + 8}" width="${BAR_W}" height="14" rx="7" fill="${C.borderFaint}"/>
  <rect x="${BAR_X}" y="${startY + 8}" width="${incW}" height="14" rx="7" fill="${C.green}"/>
  <text x="${BAR_X + BAR_W + 20}" y="${startY + 20}"
    font-size="15" font-weight="700" fill="${C.green}">${incStr}</text>
  <text x="${BAR_X + BAR_W + 20}" y="${startY + 38}"
    font-size="12" font-weight="500" fill="${C.textMuted}">${incPct}%</text>

  <!-- Expenses bar row -->
  <text x="80" y="${startY + 70}"
    font-size="12" font-weight="700" fill="${C.textMuted}" letter-spacing="2">EXPENSES</text>
  <rect x="${BAR_X}" y="${startY + 58}" width="${BAR_W}" height="14" rx="7" fill="${C.borderFaint}"/>
  <rect x="${BAR_X}" y="${startY + 58}" width="${expW}" height="14" rx="7" fill="${C.red}"/>
  <text x="${BAR_X + BAR_W + 20}" y="${startY + 70}"
    font-size="15" font-weight="700" fill="${C.red}">${expStr}</text>
  <text x="${BAR_X + BAR_W + 20}" y="${startY + 88}"
    font-size="12" font-weight="500" fill="${C.textMuted}">${expPct}%</text>`}`;
}

// ── Main SVG generator ────────────────────────────────────────────────────────

export function generateWeeklyReportSvg(data: WeeklyReportTemplateData): string {
  const W  = 1080;
  const H  = 1350;
  const MX = 80;
  const RX = W - MX;

  const currency = escapeXml(data.currency || 'NGN');
  const period   = escapeXml(data.periodLabel);
  const displayName = escapeXml(
    data.isBusiness
      ? data.businessName || data.recipientName
      : data.recipientName
  );

  const isNetPositive = data.net >= 0;
  const netSign  = data.net > 0 ? '+' : data.net < 0 ? '−' : '';
  const netColor = isNetPositive ? C.green : C.red;

  const formattedAmount = escapeXml(data.formattedNet);
  const netFS = amtFontSize(data.formattedNet);

  // Compute insight texts (brief for primary metric, full for MONEVO SAYS)
  const insight = generateInsight(data);
  const briefText  = data.aiInsight ? data.aiInsight : insight.brief;
  const fullLines  = wrapText(data.aiInsight || insight.full, 70).slice(0, 3);

  // ── Sequential Y layout ────────────────────────────────────────────────────
  // HEADER: 80-172 (rule at 172)
  const HEADER_RULE = 172;

  // NET CASHFLOW SECTION
  const NET_LABEL_Y  = HEADER_RULE + 46;              // 218
  const NET_AMT_Y    = NET_LABEL_Y + 16 + netFS;      // label + gap + amount baseline
  const SPLIT_Y      = NET_AMT_Y + 52;                // income/expense amounts
  const SPLIT_LBL_Y  = SPLIT_Y + 26;                  // INCOME / EXPENSES micro-labels
  const BRIEF_Y      = SPLIT_LBL_Y + 42;              // brief one-liner insight
  const RULE1_Y      = BRIEF_Y + 32;                  // section rule after brief insight

  // CASHFLOW BREAKDOWN
  const CF_LABEL_Y   = RULE1_Y + 34;
  const CF_BAR_Y     = CF_LABEL_Y + 20;               // bars start
  const CF_END_Y     = CF_BAR_Y + 102;                // income row (50) + expense row (52)
  const RULE2_Y      = CF_END_Y + 22;

  // WHERE YOUR MONEY WENT
  const CAT_LABEL_Y  = RULE2_Y + 36;
  const CAT_START_Y  = CAT_LABEL_Y + 30;
  const { svg: catSvg, endY: catEndY } = renderCategories(
    data.topCategories, data.totalExpenses, data.currency, CAT_START_Y
  );
  const RULE3_Y      = catEndY + 24;

  // MONEVO SAYS
  const AI_LABEL_Y   = RULE3_Y + 36;
  const AI_TEXT_Y    = AI_LABEL_Y + 40;
  const AI_END_Y     = AI_TEXT_Y + fullLines.length * 34;

  // FOOTER
  const FOOTER_RULE  = Math.max(AI_END_Y + 46, H - 98);
  const FOOTER_TXT   = FOOTER_RULE + 40;

  // Pre-render cashflow bars
  const cashflowSvg = renderCashflowBars(
    data.totalIncome, data.totalExpenses,
    data.formattedIncome, data.formattedExpenses,
    data.currency,
    CF_BAR_Y
  );

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
  font-family="-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif">

  <defs>
    <radialGradient id="amb" cx="0" cy="0" r="800" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#F8FAFC"/>
      <stop offset="100%" stop-color="#FFFFFF"/>
    </radialGradient>
    <radialGradient id="amb2" cx="${W}" cy="${H}" r="600" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#F1F5F9"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Canvas -->
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <rect width="${W}" height="${H}" fill="url(#amb)" opacity="0.6"/>
  <rect width="${W}" height="${H}" fill="url(#amb2)" opacity="0.5"/>

  <!-- ── HEADER ───────────────────────────────────────────────────────────── -->

  <text x="${MX}" y="116"
    font-size="28" font-weight="700" fill="${C.textPrimary}" letter-spacing="-0.5"
    >monevo<tspan fill="${C.blue}">.</tspan></text>

  <text x="${RX}" y="98"
    font-size="10" font-weight="700" fill="${C.textMuted}" text-anchor="end" letter-spacing="3"
    >WEEKLY FINANCIAL INTELLIGENCE</text>

  <text x="${RX}" y="120"
    font-size="14" font-weight="600" fill="${C.textMid}" text-anchor="end"
    >${period}</text>

  <!-- Recipient name -->
  <text x="${MX}" y="140"
    font-size="14" font-weight="600" fill="${C.textMid}"
    >${displayName}</text>

  <!-- Currency badge -->
  <rect x="${MX}" y="154" width="52" height="22" rx="11" fill="${C.borderFaint}" stroke="${C.border}" stroke-width="1"/>
  <text x="${MX + 26}" y="169"
    font-size="10" font-weight="700" fill="${C.textMuted}" text-anchor="middle" letter-spacing="1.5"
    >${currency}</text>

  <line x1="${MX}" y1="${HEADER_RULE}" x2="${RX}" y2="${HEADER_RULE}" stroke="${C.border}" stroke-width="1"/>

  <!-- ── NET CASHFLOW ──────────────────────────────────────────────────────── -->

  <text x="${MX}" y="${NET_LABEL_Y}"
    font-size="10" font-weight="700" fill="${C.textMuted}" letter-spacing="3"
    >NET CASHFLOW</text>

  <text x="${MX}" y="${NET_AMT_Y}"
    font-size="${netFS}" font-weight="700" fill="${netColor}" letter-spacing="-1.5"
    >${netSign}${formattedAmount}</text>

  <!-- Income column -->
  <text x="${MX}" y="${SPLIT_Y}"
    font-size="22" font-weight="700" fill="${C.green}"
    >+${escapeXml(data.formattedIncome)}</text>
  <text x="${MX + 12}" y="${SPLIT_LBL_Y}"
    font-size="10" font-weight="700" fill="${C.textMuted}" letter-spacing="2"
    >INCOME</text>

  <!-- Expense column -->
  <text x="${MX + 360}" y="${SPLIT_Y}"
    font-size="22" font-weight="700" fill="${C.red}"
    >−${escapeXml(data.formattedExpenses)}</text>
  <text x="${MX + 372}" y="${SPLIT_LBL_Y}"
    font-size="10" font-weight="700" fill="${C.textMuted}" letter-spacing="2"
    >EXPENSES</text>

  <!-- Brief insight -->
  <text x="${MX}" y="${BRIEF_Y}"
    font-size="17" font-weight="400" fill="${C.textMuted}" font-style="italic"
    >${escapeXml(briefText)}</text>

  <line x1="${MX}" y1="${RULE1_Y}" x2="${RX}" y2="${RULE1_Y}" stroke="${C.border}" stroke-width="1"/>

  <!-- ── CASHFLOW BREAKDOWN ────────────────────────────────────────────────── -->

  <text x="${MX}" y="${CF_LABEL_Y}"
    font-size="10" font-weight="700" fill="${C.textMuted}" letter-spacing="3"
    >CASHFLOW BREAKDOWN</text>
  ${cashflowSvg}

  <line x1="${MX}" y1="${RULE2_Y}" x2="${RX}" y2="${RULE2_Y}" stroke="${C.border}" stroke-width="1"/>

  <!-- ── WHERE YOUR MONEY WENT ────────────────────────────────────────────── -->

  <text x="${MX}" y="${CAT_LABEL_Y}"
    font-size="10" font-weight="700" fill="${C.textMuted}" letter-spacing="3"
    >WHERE YOUR MONEY WENT</text>
  ${catSvg}

  <line x1="${MX}" y1="${RULE3_Y}" x2="${RX}" y2="${RULE3_Y}" stroke="${C.border}" stroke-width="1"/>

  <!-- ── MONEVO SAYS ──────────────────────────────────────────────────────── -->

  <text x="${MX}" y="${AI_LABEL_Y}"
    font-size="10" font-weight="700" fill="${C.blue}" letter-spacing="3"
    >MONEVO SAYS</text>

  ${fullLines.map((line, i) =>
    `<text x="${MX}" y="${AI_TEXT_Y + i * 34}"
    font-size="20" font-weight="500" fill="${C.textPrimary}"
    >${escapeXml(line)}</text>`
  ).join('\n  ')}

  <!-- ── FOOTER ────────────────────────────────────────────────────────────── -->

  <line x1="${MX}" y1="${FOOTER_RULE}" x2="${RX}" y2="${FOOTER_RULE}" stroke="${C.border}" stroke-width="1"/>

  <text x="${MX}" y="${FOOTER_TXT}"
    font-size="12" font-weight="400" fill="${C.textGhost}"
    >${data.transactionCount} transaction${data.transactionCount === 1 ? '' : 's'} · ${period}</text>

  <text x="${MX}" y="${FOOTER_TXT + 24}"
    font-size="11" font-weight="400" fill="${C.textGhost}"
    >Generated ${escapeXml(data.generatedAtStr)} · Monevo Financial Intelligence</text>

  <text x="${RX}" y="${FOOTER_TXT}"
    font-size="16" font-weight="700" fill="${C.textGhost}" text-anchor="end" letter-spacing="-0.3"
    >monevo<tspan fill="${C.blue}">.</tspan></text>

</svg>`;
}


