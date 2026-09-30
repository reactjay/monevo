// ─────────────────────────────────────────────────────────────────────────────
// Monevo Weekly Financial Intelligence Report — 1080 × 1350 WhatsApp Format
// Luxury Gradient Design with Official Monevo Logo & Dynamic Financial Visuals
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

// ── Ultra-Sleek Gradient Fintech Palette ──────────────────────────────────────
const C = {
  bg:           '#FFFFFF',
  surface:      '#F8FAFC',
  cardBg:       '#FFFFFF',
  border:       '#E2E8F0',
  borderFaint:  '#F1F5F9',
  textPrimary:  '#0F172A',
  textMid:      '#334155',
  textMuted:    '#64748B',
  textGhost:    '#94A3B8',
  blue:         '#1A6EFF',
  blueDark:     '#1D4ED8',
  blueDim:      '#93C5FD',
  bluePanel:    '#EFF6FF',
  indigo:       '#6366F1',
  indigoDark:   '#4338CA',
  cyan:         '#06B6D4',
  green:        '#10B981',
  greenDark:    '#059669',
  greenLight:   '#34D399',
  greenBg:      '#ECFDF5',
  red:          '#F43F5E',
  redDark:      '#E11D48',
  redLight:     '#FB7185',
  redBg:        '#FFF1F2',
  amber:        '#F59E0B',
  purple:       '#8B5CF6',
};

export function renderMonevoLogoSvg(x: number, y: number, showBadge = true): string {
  return `
  <!-- Monevo Logo Mark -->
  <g transform="translate(${x}, ${y})">
    <rect width="48" height="48" rx="14" fill="url(#logoGrad)"/>
    <!-- Dynamic 'M' ribbon -->
    <path d="M 14 34 V 20 C 14 17.5 15.8 15.5 18 15.5 C 19.3 15.5 20.5 16.2 21.2 17.3 L 24 21.5 L 26.8 17.3 C 27.5 16.2 28.7 15.5 30 15.5 C 32.2 15.5 34 17.5 34 20 V 34"
      fill="none" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="24" cy="31" r="2.2" fill="#38BDF8"/>
  </g>
  <!-- Wordmark -->
  <text x="${x + 62}" y="${y + 35}" font-size="32" font-weight="800" fill="${C.textPrimary}" letter-spacing="-0.8">monevo<tspan fill="${C.blue}">.</tspan></text>
  ${
    showBadge
      ? `<rect x="${x + 224}" y="${y + 12}" width="34" height="20" rx="6" fill="${C.bluePanel}" stroke="${C.blueDim}" stroke-width="1"/>
  <text x="${x + 241}" y="${y + 26}" font-size="10" font-weight="800" fill="${C.blueDark}" text-anchor="middle" letter-spacing="1">AI</text>`
      : ''
  }`;
}

// ── Category gradient palettes ────────────────────────────────────────────────
const CAT_COLORS = [
  '#1A6EFF', // Blue
  '#10B981', // Green
  '#8B5CF6', // Purple
  '#F59E0B', // Amber
  '#06B6D4', // Cyan
];

const CAT_GRAD_PAIRS = [
  ['#60A5FA', '#1A6EFF'],  // Blue
  ['#34D399', '#10B981'],  // Green
  ['#C4B5FD', '#8B5CF6'],  // Purple
  ['#FCD34D', '#F59E0B'],  // Amber
  ['#67E8F9', '#06B6D4'],  // Cyan
];

// ── Category SVG icons ────────────────────────────────────────────────────────

function getCategoryIcon(category: string, x: number, y: number, color: string): string {
  const lc = category.toLowerCase();

  const icons: Record<string, string> = {
    food: `<g transform="translate(${x},${y})">
      <circle cx="9" cy="10" r="6" fill="none" stroke="${color}" stroke-width="1.4"/>
      <path d="M5.5 3v4.5c0 .5.4.8.8.8h.4L6.5 14h1.2l.2-5.7h.4c.4 0 .8-.3.8-.8V3" fill="none" stroke="${color}" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M12.5 3c0 0-1 .5-1 2.5s1 2.5 1 2.5v6" fill="none" stroke="${color}" stroke-width="1.2" stroke-linecap="round"/>
    </g>`,

    transport: `<g transform="translate(${x},${y})">
      <path d="M3 10.5l1.2-4c.3-.7.9-1.1 1.6-1.1h6.4c.7 0 1.3.4 1.6 1.1l1.2 4v3H3v-3z" fill="none" stroke="${color}" stroke-width="1.3" stroke-linejoin="round"/>
      <circle cx="5.5" cy="13.5" r="1.2" fill="${color}"/>
      <circle cx="12.5" cy="13.5" r="1.2" fill="${color}"/>
    </g>`,

    fuel: `<g transform="translate(${x},${y})">
      <rect x="3" y="4.5" width="8" height="10" rx="1.2" fill="none" stroke="${color}" stroke-width="1.3"/>
      <rect x="4.5" y="6" width="5" height="3.5" rx="0.6" fill="${color}" opacity="0.2"/>
      <path d="M11 7l2 1.5v4c0 .6.4 1 .9 1s.9-.4.9-1V9" fill="none" stroke="${color}" stroke-width="1.2" stroke-linecap="round"/>
    </g>`,

    rent: `<g transform="translate(${x},${y})">
      <path d="M2.5 9L9 3.5 15.5 9" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M4.5 9.5v5.5h3.5v-3.5h2v3.5h3.5V9.5" fill="none" stroke="${color}" stroke-width="1.3"/>
    </g>`,

    utilities: `<g transform="translate(${x},${y})">
      <path d="M10.5 2L6 9h3.5L8 16l6-8h-3.5L10.5 2z" fill="${color}" opacity="0.85"/>
    </g>`,

    salary: `<g transform="translate(${x},${y})">
      <rect x="2.5" y="4.5" width="13" height="9" rx="1.5" fill="none" stroke="${color}" stroke-width="1.3"/>
      <circle cx="9" cy="9" r="2.2" fill="none" stroke="${color}" stroke-width="1.2"/>
    </g>`,

    freelance: `<g transform="translate(${x},${y})">
      <rect x="2.5" y="5" width="13" height="8.5" rx="1.2" fill="none" stroke="${color}" stroke-width="1.3"/>
      <path d="M6 5V3.5c0-.6.4-1 1-1h4c.6 0 1 .4 1 1V5" fill="none" stroke="${color}" stroke-width="1.2"/>
    </g>`,

    shopping: `<g transform="translate(${x},${y})">
      <path d="M4 6h10l-1 8H5L4 6z" fill="none" stroke="${color}" stroke-width="1.3"/>
      <path d="M6.5 6V4.5a2.5 2.5 0 0 1 5 0V6" fill="none" stroke="${color}" stroke-width="1.2"/>
    </g>`,
  };

  const defaultIcon = `<g transform="translate(${x},${y})">
    <circle cx="9" cy="9" r="6.5" fill="none" stroke="${color}" stroke-width="1.3"/>
    <text x="9" y="13" font-size="10" font-weight="700" fill="${color}" text-anchor="middle">•</text>
  </g>`;

  return icons[lc] || defaultIcon;
}

function capitalize(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function amtFontSize(formatted: string): number {
  const len = formatted.length;
  if (len <= 8)  return 74;
  if (len <= 11) return 64;
  if (len <= 14) return 54;
  return 44;
}

// ── AI Insight Generator ──────────────────────────────────────────────────────

function generateInsight(data: WeeklyReportTemplateData): { brief: string; full: string } {
  const { totalIncome, totalExpenses, net, formattedNet, formattedIncome, topCategories } = data;
  const topCat = topCategories.length > 0 ? topCategories[0] : null;
  const topCatName = topCat ? capitalize(topCat.category) : '';
  const topCatPct = topCat && totalExpenses > 0 ? Math.round((topCat.amount / totalExpenses) * 100) : 0;

  if (totalIncome === 0 && totalExpenses === 0) {
    return {
      brief: 'No financial activity was recorded during this period.',
      full:  'Start tracking your expenses and payments by dropping a quick message on WhatsApp anytime!',
    };
  }

  if (totalExpenses === 0 && totalIncome > 0) {
    return {
      brief: `Strong week! Total income recorded was ${formattedIncome} with 0 expenses logged.`,
      full:  `Outstanding financial momentum this week. You accumulated ${formattedIncome} with zero expenses logged.`,
    };
  }

  if (net > 0) {
    const savingsRate = Math.round((net / totalIncome) * 100);
    const catStr = topCat ? ` Top expense was ${topCatName} (${topCatPct}%).` : '';
    return {
      brief: `Positive net cashflow! Retained ${savingsRate}% of income with a surplus of ${formattedNet}.`,
      full:  `Excellent cash discipline this week. Your net cashflow was ${formattedNet} (${savingsRate}% retention).${catStr}`,
    };
  }

  if (net < 0) {
    const catStr = topCat ? ` ${topCatName} represented your biggest spend (${topCatPct}%).` : '';
    return {
      brief: `Expenses exceeded income by ${formattedNet}. Watch out for discretionary spends.`,
      full:  `Outflows exceeded inflows by ${formattedNet} this week.${catStr} Plan upcoming spending to restore surplus.`,
    };
  }

  return {
    brief: `Balanced week with equal inflow and outflow at ${formattedIncome}.`,
    full:  `Income and expenses balanced at ${formattedIncome}. Consider setting aside a 10% safety buffer next week.`,
  };
}

// ── Top Categories Renderer ───────────────────────────────────────────────────

function renderCategories(
  cats: ITopCategory[],
  totalExpenses: number,
  currency: string,
  startY: number
): { svg: string; endY: number } {
  const visible = cats.slice(0, 5);
  const totalExp = totalExpenses > 0 ? totalExpenses : 1;
  const ROW_H = 56;
  const ICON_X = 110;
  const NAME_X = 140;
  const BAR_X = 300;
  const BAR_W = 480;
  const AMT_X = BAR_X + BAR_W + 20;

  if (visible.length === 0) {
    const svg = `
    <text x="110" y="${startY + 30}" font-size="18" font-weight="500" fill="${C.textMuted}">
      No expense transactions recorded during this period.
    </text>`;
    return { svg, endY: startY + 50 };
  }

  let svg = '';
  visible.forEach((cat, idx) => {
    const fy = startY + idx * ROW_H;
    const pct = Math.round((cat.amount / totalExp) * 100);
    const barW = Math.max(8, Math.round((pct / 100) * BAR_W));
    const color = CAT_COLORS[idx % CAT_COLORS.length];
    const catName = escapeXml(capitalize(cat.category));
    const curSym = currency === 'NGN' ? '₦' : currency + ' ';
    const amtStr = escapeXml(`${curSym}${cat.amount.toLocaleString('en-US')}`);

    svg += `
    <!-- Category row: ${catName} -->
    <circle cx="${ICON_X}" cy="${fy + 14}" r="14" fill="${color}" fill-opacity="0.12"/>
    ${getCategoryIcon(cat.category, ICON_X - 9, fy + 5, color)}
    <text x="${NAME_X}" y="${fy + 19}" font-size="16" font-weight="700" fill="${C.textPrimary}">${catName}</text>
    
    <!-- Progress bar track -->
    <rect x="${BAR_X}" y="${fy + 8}" width="${BAR_W}" height="12" rx="6" fill="#F1F5F9"/>
    <!-- Progress bar fill -->
    <rect x="${BAR_X}" y="${fy + 8}" width="${barW}" height="12" rx="6" fill="url(#bar${idx})"/>
    
    <text x="${AMT_X}" y="${fy + 19}" font-size="15" font-weight="700" fill="${C.textPrimary}">${amtStr}</text>
    <rect x="${AMT_X + 115}" y="${fy + 2}" width="42" height="22" rx="6" fill="#F1F5F9"/>
    <text x="${AMT_X + 136}" y="${fy + 17}" font-size="11" font-weight="800" fill="${C.textMuted}" text-anchor="middle">${pct}%</text>`;
  });

  return { svg, endY: startY + visible.length * ROW_H };
}

// ── Main SVG generator ────────────────────────────────────────────────────────

export function generateWeeklyReportSvg(data: WeeklyReportTemplateData): string {
  const W  = 1080;
  const H  = 1350;
  const MX = 70;
  const RX = W - MX; // 1010
  const CARD_W = RX - MX; // 940

  const currency = escapeXml(data.currency || 'NGN');
  const period   = escapeXml(data.periodLabel);
  const displayName = escapeXml(
    data.isBusiness
      ? data.businessName || data.recipientName
      : data.recipientName
  );

  const isNetPositive = data.net >= 0;
  const netSign  = data.net > 0 ? '+' : data.net < 0 ? '−' : '';
  const netColor = isNetPositive ? C.greenDark : C.redDark;
  const netBgGrad = isNetPositive ? 'url(#netCardGradSurplus)' : 'url(#netCardGradDeficit)';

  const formattedNet = escapeXml(data.formattedNet);
  const netFS = amtFontSize(data.formattedNet);

  const insight = generateInsight(data);
  const briefText  = data.aiInsight ? data.aiInsight : insight.brief;
  const fullLines  = wrapText(data.aiInsight || insight.full, 68).slice(0, 3);

  // Category rendering start
  const CAT_START_Y = 668;
  const { svg: catSvg, endY: catEndY } = renderCategories(
    data.topCategories, data.totalExpenses, data.currency, CAT_START_Y
  );

  const AI_CARD_Y = Math.max(catEndY + 28, 970);
  const AI_CARD_H = 176;

  // Split calculations
  const totalVol = data.totalIncome + data.totalExpenses;
  const incPct = totalVol > 0 ? Math.round((data.totalIncome / totalVol) * 100) : 50;
  const expPct = 100 - incPct;
  const ratioBarW = CARD_W - 80;
  const incBarW = Math.max(8, Math.round((incPct / 100) * ratioBarW));

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
  font-family="'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif">

  <defs>
    <!-- Logo Gradient -->
    <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366F1"/>
      <stop offset="50%" stop-color="#1A6EFF"/>
      <stop offset="100%" stop-color="#06B6D4"/>
    </linearGradient>

    <!-- AI Mini Badge Gradient -->
    <linearGradient id="aiBadgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#6366F1"/>
      <stop offset="100%" stop-color="#06B6D4"/>
    </linearGradient>

    <!-- Hero Multi-Stop Banner Gradient -->
    <linearGradient id="heroGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#6366F1"/>
      <stop offset="35%" stop-color="#1A6EFF"/>
      <stop offset="70%" stop-color="#06B6D4"/>
      <stop offset="100%" stop-color="#10B981"/>
    </linearGradient>

    <!-- Ambient Mesh Gradients -->
    <radialGradient id="meshTop" cx="15%" cy="12%" r="600" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#EFF6FF" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="meshBottom" cx="85%" cy="88%" r="650" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#ECFDF5" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>

    <!-- Net Card Gradients -->
    <linearGradient id="netCardGradSurplus" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="70%" stop-color="#F8FAFC"/>
      <stop offset="100%" stop-color="#ECFDF5"/>
    </linearGradient>
    <linearGradient id="netCardGradDeficit" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="70%" stop-color="#F8FAFC"/>
      <stop offset="100%" stop-color="#FFF1F2"/>
    </linearGradient>

    <!-- Income Gradient -->
    <linearGradient id="incomeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#34D399"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>

    <!-- Expense Gradient -->
    <linearGradient id="expenseGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#FB7185"/>
      <stop offset="100%" stop-color="#E11D48"/>
    </linearGradient>

    <!-- Category Gradients -->
    ${CAT_GRAD_PAIRS.map((pair, i) => `<linearGradient id="bar${i}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${pair[0]}"/>
      <stop offset="100%" stop-color="${pair[1]}"/>
    </linearGradient>`).join('\n    ')}

    <!-- AI Card Left Accent Gradient -->
    <linearGradient id="aiCardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F8FAFC"/>
      <stop offset="100%" stop-color="#EEF2FF"/>
    </linearGradient>
    <linearGradient id="aiAccentGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#6366F1"/>
      <stop offset="50%" stop-color="#1A6EFF"/>
      <stop offset="100%" stop-color="#06B6D4"/>
    </linearGradient>

    <!-- Drop Shadow Filter -->
    <filter id="softShadow" x="-10%" y="-10%" width="120%" height="125%" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="6" stdDeviation="14" flood-color="#0F172A" flood-opacity="0.04"/>
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#0F172A" flood-opacity="0.02"/>
    </filter>
  </defs>

  <!-- ── 1. BACKGROUND & AMBIENT MESH ────────────────────────────────────── -->
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <rect width="${W}" height="${H}" fill="url(#meshTop)"/>
  <rect width="${W}" height="${H}" fill="url(#meshBottom)"/>

  <!-- Top Hero Color Ribbon -->
  <rect width="${W}" height="8" fill="url(#heroGrad)"/>

  <!-- ── 2. HEADER WITH OFFICIAL LOGO & REPORT PERIOD ────────────────────── -->
  ${renderMonevoLogoSvg(MX, 44, true)}

  <!-- Report Title & Period badge -->
  <g transform="translate(${RX - 320}, 40)">
    <rect width="320" height="58" rx="14" fill="#F8FAFC" stroke="${C.border}" stroke-width="1.2"/>
    <text x="302" y="24" font-size="10" font-weight="800" fill="${C.textMuted}" text-anchor="end" letter-spacing="2.5">WEEKLY FINANCIAL INTELLIGENCE</text>
    <text x="302" y="45" font-size="14" font-weight="700" fill="${C.blueDark}" text-anchor="end" letter-spacing="0.5">${period}</text>
  </g>

  <!-- Recipient Profile Tag -->
  <text x="${MX}" y="124" font-size="15" font-weight="700" fill="${C.textPrimary}">${displayName}</text>
  <rect x="${MX + 180}" y="110" width="60" height="20" rx="10" fill="#F1F5F9" stroke="${C.border}" stroke-width="1"/>
  <text x="${MX + 210}" y="124" font-size="10" font-weight="800" fill="${C.textMuted}" text-anchor="middle" letter-spacing="1">${currency}</text>

  <!-- ── 3. HERO NET CASHFLOW CARD ────────────────────────────────────────── -->
  <g filter="url(#softShadow)">
    <rect x="${MX}" y="146" width="${CARD_W}" height="200" rx="22" fill="${netBgGrad}" stroke="${isNetPositive ? '#A7F3D0' : '#FECDD3'}" stroke-width="1.4"/>
  </g>

  <!-- Net Cashflow Label & Status Pill -->
  <text x="${MX + 36}" y="186" font-size="11" font-weight="800" fill="${C.textMuted}" letter-spacing="3">NET CASHFLOW</text>
  
  <g transform="translate(${RX - 180}, 166)">
    <rect width="144" height="28" rx="14" fill="${isNetPositive ? 'url(#incomeGrad)' : 'url(#expenseGrad)'}"/>
    <text x="72" y="19" font-size="11" font-weight="800" fill="#FFFFFF" text-anchor="middle" letter-spacing="1.2">
      ${isNetPositive ? '↗ SURPLUS' : '↘ DEFICIT'}
    </text>
  </g>

  <!-- Hero Net Amount -->
  <text x="${MX + 36}" y="${192 + netFS}" font-size="${netFS}" font-weight="800" fill="${netColor}" letter-spacing="-2">
    ${netSign}${formattedNet}
  </text>

  <!-- Subtitle briefing -->
  <text x="${MX + 36}" y="324" font-size="14" font-weight="500" fill="${C.textMuted}">
    ${escapeXml(briefText)} • ${data.transactionCount} transactions logged
  </text>

  <!-- ── 4. INFLOW VS OUTFLOW SPLIT CARDS ─────────────────────────────────── -->
  <!-- Total Income Card -->
  <g filter="url(#softShadow)">
    <rect x="${MX}" y="362" width="${(CARD_W - 20) / 2}" height="120" rx="18" fill="#FFFFFF" stroke="#D1FAE5" stroke-width="1.2"/>
  </g>
  <circle cx="${MX + 34}" cy="396" r="14" fill="#ECFDF5"/>
  <text x="${MX + 34}" y="401" font-size="12" text-anchor="middle">🟢</text>
  <text x="${MX + 58}" y="400" font-size="11" font-weight="800" fill="${C.textMuted}" letter-spacing="2">TOTAL INFLOW</text>
  <text x="${MX + 34}" y="454" font-size="28" font-weight="800" fill="${C.greenDark}" letter-spacing="-1">
    +${escapeXml(data.formattedIncome)}
  </text>

  <!-- Total Expenses Card -->
  <g filter="url(#softShadow)">
    <rect x="${MX + (CARD_W + 20) / 2}" y="362" width="${(CARD_W - 20) / 2}" height="120" rx="18" fill="#FFFFFF" stroke="#FFE4E6" stroke-width="1.2"/>
  </g>
  <circle cx="${MX + (CARD_W + 20) / 2 + 34}" cy="396" r="14" fill="#FFF1F2"/>
  <text x="${MX + (CARD_W + 20) / 2 + 34}" y="401" font-size="12" text-anchor="middle">🔴</text>
  <text x="${MX + (CARD_W + 20) / 2 + 58}" y="400" font-size="11" font-weight="800" fill="${C.textMuted}" letter-spacing="2">TOTAL OUTFLOW</text>
  <text x="${MX + (CARD_W + 20) / 2 + 34}" y="454" font-size="28" font-weight="800" fill="${C.redDark}" letter-spacing="-1">
    −${escapeXml(data.formattedExpenses)}
  </text>

  <!-- ── 5. CASHFLOW RATIO DUAL-TONE BAR ─────────────────────────────────── -->
  <g filter="url(#softShadow)">
    <rect x="${MX}" y="498" width="${CARD_W}" height="90" rx="18" fill="#FFFFFF" stroke="${C.border}" stroke-width="1.2"/>
  </g>
  <text x="${MX + 36}" y="528" font-size="10" font-weight="800" fill="${C.textMuted}" letter-spacing="2.5">CASHFLOW BALANCE RATIO</text>
  ${totalVol === 0 ? `
  <text x="${MX + 36}" y="555" font-size="15" font-weight="500" fill="${C.textMuted}">
    No cashflow activity recorded this period.
  </text>` : `
  <text x="${RX - 36}" y="528" font-size="12" font-weight="700" fill="${C.textPrimary}" text-anchor="end">
    Inflow ${incPct}%  •  Outflow ${expPct}%
  </text>
  <!-- Dual progress bar -->
  <rect x="${MX + 36}" y="542" width="${ratioBarW}" height="16" rx="8" fill="#F1F5F9"/>
  <rect x="${MX + 36}" y="542" width="${incBarW}" height="16" rx="8" fill="url(#incomeGrad)"/>
  <rect x="${MX + 36 + incBarW}" y="542" width="${ratioBarW - incBarW}" height="16" rx="8" fill="url(#expenseGrad)"/>
  `}

  <!-- ── 6. TOP SPENDING CATEGORIES BREAKDOWN ────────────────────────────── -->
  <g filter="url(#softShadow)">
    <rect x="${MX}" y="604" width="${CARD_W}" height="${Math.max(340, catEndY - 570)}" rx="20" fill="#FFFFFF" stroke="${C.border}" stroke-width="1.2"/>
  </g>
  <text x="${MX + 36}" y="642" font-size="11" font-weight="800" fill="${C.textMuted}" letter-spacing="3">TOP EXPENSE CATEGORIES</text>
  <line x1="${MX + 36}" y1="656" x2="${RX - 36}" y2="656" stroke="${C.borderFaint}" stroke-width="1.2"/>
  
  ${catSvg}

  <!-- ── 7. MONEVO AI FINANCIAL INTELLIGENCE INSIGHT ─────────────────────── -->
  <g filter="url(#softShadow)">
    <rect x="${MX}" y="${AI_CARD_Y}" width="${CARD_W}" height="${AI_CARD_H}" rx="20" fill="url(#aiCardGrad)" stroke="#C7D2FE" stroke-width="1.4"/>
  </g>
  <!-- Iridescent left accent strip -->
  <rect x="${MX}" y="${AI_CARD_Y}" width="8" height="${AI_CARD_H}" rx="4" fill="url(#aiAccentGrad)"/>

  <!-- AI Badge -->
  <g transform="translate(${MX + 34}, ${AI_CARD_Y + 28})">
    <rect width="180" height="26" rx="13" fill="#EEF2FF" stroke="#C7D2FE" stroke-width="1"/>
    <text x="14" y="17" font-size="12">✨</text>
    <text x="32" y="17" font-size="10" font-weight="800" fill="${C.indigoDark}" letter-spacing="1.5">MONEVO AI INSIGHT</text>
  </g>

  <!-- AI Insight text lines -->
  <text x="${MX + 34}" y="${AI_CARD_Y + 84}" font-size="17" font-weight="600" fill="${C.textPrimary}">
    ${fullLines.map((l, i) => `<tspan x="${MX + 34}" dy="${i === 0 ? '0' : '26'}">${escapeXml(l)}</tspan>`).join('')}
  </text>

  <!-- ── 8. DIGITAL FOOTER ───────────────────────────────────────────────── -->
  <line x1="${MX}" y1="1264" x2="${RX}" y2="1264" stroke="${C.border}" stroke-width="1"/>
  <text x="${MX}" y="1300" font-size="12" font-weight="600" fill="${C.textMuted}">
    monevo.ai • Automated Financial Intelligence Report • ${escapeXml(data.generatedAtStr)}
  </text>
  <text x="${RX}" y="1300" font-size="12" font-weight="600" fill="${C.textMuted}" text-anchor="end">
    Confidential &amp; Verified
  </text>

  <!-- Bottom Gradient Accent Bar -->
  <rect y="${H - 6}" width="${W}" height="6" fill="url(#heroGrad)"/>
</svg>`;
}
