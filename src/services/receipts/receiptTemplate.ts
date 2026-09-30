// ─────────────────────────────────────────────────────────────────────────────
// Monevo Receipt Template — 1080 × 1350 WhatsApp Visual Format
// Premium Gradient Fintech Design · Professional Worldwide Standard
// ─────────────────────────────────────────────────────────────────────────────

export interface ReceiptTemplateData {
  receiptNumber: string;
  date: string;           // e.g. "11 Sep 2026"
  time?: string;          // e.g. "09:30"
  payer: string;
  recipientName: string;
  isBusiness: boolean;
  businessName?: string;
  businessPhone?: string;
  businessAddress?: string;
  userPhone?: string;
  amount: number;
  formattedAmount: string;
  currency: string;
  description: string;
  status?: string;
}

// ── Premium Gradient Fintech Palette ─────────────────────────────────────────
const C = {
  bg:          '#FFFFFF',
  border:      '#E2E8F0',
  borderFaint: '#F1F5F9',
  textPrimary: '#0F172A',
  textMid:     '#1E293B',
  textMuted:   '#64748B',
  textGhost:   '#94A3B8',
  blue:        '#1A6EFF',
  blueDim:     '#93C5FD',
  blueDark:    '#2563EB',
  green:       '#16A34A',
  greenBg:     '#DCFCE7',
  amb1:        '#F8FAFC',
  indigo:      '#6366F1',
  cyan:        '#06B6D4',
  greenLight:  '#4ADE80',
  bluePanel:   '#EFF6FF',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function escapeXml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function wrapText(text: string, maxChars = 38): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length + (current ? 1 : 0) <= maxChars) {
      current = current ? `${current} ${word}` : word;
    } else {
      if (current) lines.push(current);
      if (word.length > maxChars) {
        for (let i = 0; i < word.length; i += maxChars) lines.push(word.slice(i, i + maxChars));
        current = '';
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

function truncate(text: string, max = 40): string {
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

// ── Dynamic amount font size ──────────────────────────────────────────────────

function amountFontSize(formatted: string): number {
  const len = formatted.length;
  if (len <= 8)  return 100;
  if (len <= 10) return 86;
  if (len <= 12) return 74;
  return 62;
}

// ── Transaction fingerprint waveform ─────────────────────────────────────────

function fingerprint(receiptNumber: string, x0: number, cy: number, width: number): string {
  const hexChars = receiptNumber.replace(/[^0-9A-Fa-f]/gi, '');
  if (hexChars.length < 4) return '';

  const N = 18;
  const amplitude = 16;
  const segW = width / (N - 1);

  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < N; i++) {
    const ci = Math.floor((i * hexChars.length) / N);
    const v = parseInt(hexChars[ci] || '0', 16);
    pts.push({ x: x0 + i * segW, y: cy + (v / 15) * amplitude * 2 - amplitude });
  }

  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const cp1x = (pts[i - 1].x + segW * 0.38).toFixed(1);
    const cp2x = (pts[i].x - segW * 0.38).toFixed(1);
    d += ` C ${cp1x} ${pts[i - 1].y.toFixed(1)}, ${cp2x} ${pts[i].y.toFixed(1)}, ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`;
  }

  return [
    `<path d="${d}" fill="none" stroke="url(#brandGrad)" stroke-width="3.5" opacity="0.1"/>`,
    `<path d="${d}" fill="none" stroke="${C.blue}" stroke-width="1.6" opacity="0.38"/>`,
  ].join('\n  ');
}

// ── Detail row renderer ───────────────────────────────────────────────────────

interface DetailField {
  label: string;
  lines: string[];
  height: number;
}

const ROW_BASE = 88;
const LINE_EXTRA = 32;

function buildFields(data: ReceiptTemplateData): DetailField[] {
  const fields: DetailField[] = [];

  const descLines = wrapText(data.description || 'General payment', 42);
  fields.push({ label: 'DESCRIPTION', lines: descLines, height: ROW_BASE + (descLines.length - 1) * LINE_EXTRA });

  fields.push({ label: 'PAYMENT CHANNEL', lines: ['Cash / Transfer'], height: ROW_BASE });

  const phone = data.isBusiness
    ? data.businessPhone || data.userPhone || ''
    : data.userPhone || '';
  if (phone) {
    fields.push({ label: 'CONTACT', lines: [truncate(phone, 28)], height: ROW_BASE });
  }

  if (data.isBusiness && data.businessAddress) {
    const addrLines = wrapText(data.businessAddress, 42);
    fields.push({ label: 'ADDRESS', lines: addrLines.slice(0, 2), height: ROW_BASE + (Math.min(addrLines.length, 2) - 1) * LINE_EXTRA });
  }

  return fields;
}

function renderFields(fields: DetailField[], startY: number): { svg: string; endY: number } {
  let svg = '';
  let y = startY;

  fields.forEach((field, idx) => {
    const isLast = idx === fields.length - 1;

    svg += `\n  <text x="80" y="${y}" font-size="11" font-weight="700" fill="${C.textMuted}" letter-spacing="3">${escapeXml(field.label)}</text>`;

    if (field.lines.length === 1) {
      svg += `\n  <text x="80" y="${y + 40}" font-size="28" font-weight="600" fill="${C.textPrimary}">${escapeXml(field.lines[0])}</text>`;
    } else {
      svg += `\n  <text x="80" y="${y + 40}" font-size="28" font-weight="600" fill="${C.textPrimary}">`;
      field.lines.forEach((line, li) => {
        const dy = li === 0 ? '0' : '34';
        svg += `<tspan x="80" dy="${dy}">${escapeXml(line)}</tspan>`;
      });
      svg += `</text>`;
    }

    if (!isLast) {
      const ruleY = y + field.height - 8;
      svg += `\n  <line x1="80" y1="${ruleY}" x2="1000" y2="${ruleY}" stroke="${C.borderFaint}" stroke-width="1.2"/>`;
    }

    y += field.height;
  });

  return { svg, endY: y };
}

// ── Main SVG generator ────────────────────────────────────────────────────────

export function generateReceiptSvg(data: ReceiptTemplateData): string {
  const W = 1080;
  const H = 1350;
  const MX = 80;       // horizontal margin
  const RX = W - MX;   // right edge = 1000

  const status     = escapeXml(data.status || 'PAID');
  const receiptNum = escapeXml(data.receiptNumber);
  const dateStr    = escapeXml(data.date);
  const timeStr    = escapeXml(data.time || '');
  const payer      = escapeXml(truncate(data.payer || 'Valued Customer', 30));
  const recipient  = escapeXml(
    truncate(
      data.isBusiness
        ? data.businessName || data.recipientName || 'Merchant'
        : data.recipientName || 'Account Holder',
      30
    )
  );
  const formattedAmount = escapeXml(data.formattedAmount);
  const amtFS = amountFontSize(data.formattedAmount);

  const fields = buildFields(data);
  const DETAILS_START = 616;
  const { svg: fieldsSvg, endY: detailsEnd } = renderFields(fields, DETAILS_START);

  const VERIF_Y    = Math.max(detailsEnd + 68, 1072);
  const FOOTER_Y   = Math.max(VERIF_Y + 158, 1248);
  const ATTR_Y     = Math.min(FOOTER_Y + 66, H - 28);
  const FINGERPRINT_Y = 538;

  const fpSvg = fingerprint(data.receiptNumber, MX, FINGERPRINT_Y, RX - MX);

  const dateTimeStr = timeStr
    ? `${dateStr} · ${timeStr} WAT`
    : dateStr;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
  font-family="'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif">

  <defs>
    <!-- Brand gradient: indigo → blue → cyan -->
    <linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${C.indigo}"/>
      <stop offset="50%" stop-color="${C.blue}"/>
      <stop offset="100%" stop-color="${C.cyan}"/>
    </linearGradient>

    <!-- Ambient background gradient -->
    <linearGradient id="amb" x1="0" y1="0" x2="0.2" y2="1">
      <stop offset="0%" stop-color="${C.amb1}"/>
      <stop offset="50%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="${C.amb1}"/>
    </linearGradient>

    <!-- Amount panel frosted gradient -->
    <linearGradient id="amtPanel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${C.bluePanel}"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>

    <!-- Status pill gradient -->
    <linearGradient id="statusGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${C.greenLight}"/>
      <stop offset="100%" stop-color="${C.green}"/>
    </linearGradient>

    <!-- Transaction flow line gradient -->
    <linearGradient id="flowGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${C.border}"/>
      <stop offset="25%" stop-color="${C.blueDim}"/>
      <stop offset="50%" stop-color="${C.blue}"/>
      <stop offset="75%" stop-color="${C.blueDim}"/>
      <stop offset="100%" stop-color="${C.border}"/>
    </linearGradient>

    <!-- Node glow radial -->
    <radialGradient id="nodeGlow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="${C.blue}"/>
      <stop offset="100%" stop-color="${C.blue}" stop-opacity="0"/>
    </radialGradient>

    <!-- Footer gradient rule -->
    <linearGradient id="footerGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${C.indigo}" stop-opacity="0.4"/>
      <stop offset="50%" stop-color="${C.blue}" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="${C.cyan}" stop-opacity="0.4"/>
    </linearGradient>
  </defs>

  <!-- ── 1. CANVAS BACKGROUND ────────────────────────────────────────────── -->
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <rect width="${W}" height="${H}" fill="url(#amb)" opacity="0.7"/>

  <!-- Premium brand gradient bar -->
  <rect width="${W}" height="6" fill="url(#brandGrad)"/>

  <!-- ── 2. HEADER ───────────────────────────────────────────────────────── -->
  <text x="${MX}" y="118"
    font-size="34" font-weight="800" fill="${C.textPrimary}" letter-spacing="-0.8"
    >monevo<tspan fill="${C.blue}">.</tspan></text>

  <text x="${RX}" y="100"
    font-size="11" font-weight="800" fill="${C.textMuted}" text-anchor="end" letter-spacing="3"
    >TRANSACTION RECEIPT</text>
  <text x="${RX}" y="122"
    font-size="14" font-weight="700" fill="${C.blueDark}" text-anchor="end" letter-spacing="0.8"
    >${receiptNum}</text>

  <!-- ── 3. AMOUNT DISPLAY ───────────────────────────────────────────────── -->
  <!-- Frosted amount panel -->
  <rect x="${MX - 20}" y="185" width="${RX - MX + 40}" height="${amtFS + 80}" rx="16" fill="url(#amtPanel)" opacity="0.5"/>

  <text x="${MX}" y="206"
    font-size="11" font-weight="800" fill="${C.textMuted}" letter-spacing="3"
    >AMOUNT</text>

  <text x="${MX}" y="${218 + amtFS}"
    font-size="${amtFS}" font-weight="800" fill="${C.textPrimary}" letter-spacing="-2.5"
    >${formattedAmount}</text>

  <!-- Gradient status pill -->
  <rect x="${MX}" y="${218 + amtFS + 22}" width="72" height="28" rx="14" fill="url(#statusGrad)"/>
  <text x="${MX + 36}" y="${218 + amtFS + 41}"
    font-size="11" font-weight="800" fill="#FFFFFF" text-anchor="middle" letter-spacing="2"
    >${status}</text>

  <text x="${MX + 92}" y="${218 + amtFS + 41}"
    font-size="16" font-weight="500" fill="${C.textMuted}"
    >${dateTimeStr}</text>

  <!-- ── 4. TRANSACTION FLOW ─────────────────────────────────────────────── -->
  <text x="${MX}" y="455"
    font-size="11" font-weight="800" fill="${C.textMuted}" letter-spacing="3">FROM</text>

  <text x="${RX}" y="455"
    font-size="11" font-weight="800" fill="${C.textMuted}" letter-spacing="3" text-anchor="end">TO</text>

  <text x="540" y="455"
    font-size="11" font-weight="800" fill="${C.textMuted}" letter-spacing="3" text-anchor="middle">VIA</text>

  <text x="${MX}" y="492"
    font-size="28" font-weight="700" fill="${C.textPrimary}">${payer}</text>

  <text x="540" y="492"
    font-size="22" font-weight="800" fill="${C.blue}" text-anchor="middle"
    letter-spacing="-0.3">monevo<tspan fill="${C.blueDim}">.</tspan></text>

  <text x="${RX}" y="492"
    font-size="28" font-weight="700" fill="${C.textPrimary}" text-anchor="end">${recipient}</text>
  <!-- Connecting ledger line -->
  <line x1="${MX}" y1="504" x2="${RX}" y2="504" stroke="url(#flowGrad)" stroke-width="1.8"/>

  <!-- Node dots with subtle glow -->
  <circle cx="${MX}" cy="504" r="5" fill="${C.indigo}"/>
  <circle cx="540" cy="504" r="16" fill="url(#nodeGlow)" opacity="0.3"/>
  <circle cx="540" cy="504" r="6" fill="${C.blue}"/>
  <circle cx="${RX}" cy="504" r="5" fill="${C.cyan}"/>

  <!-- Transaction fingerprint waveform -->
  ${fpSvg}

  <!-- Fingerprint label -->
  <text x="540" y="572"
    font-size="10" font-weight="600" fill="${C.textGhost}" text-anchor="middle" letter-spacing="2"
    >TRANSACTION SIGNATURE · ${receiptNum}</text>

  <!-- Section rule -->
  <line x1="${MX}" y1="590" x2="${RX}" y2="590" stroke="${C.border}" stroke-width="1.2"/>

  <!-- ── 5. TRANSACTION DETAILS ──────────────────────────────────────────── -->
  ${fieldsSvg}

  <!-- ── 6. VERIFICATION BLOCK ──────────────────────────────────────────── -->
  <!-- Verification rule -->
  <line x1="${MX}" y1="${VERIF_Y}" x2="${RX}" y2="${VERIF_Y}" stroke="${C.border}" stroke-width="1.2"/>

  <!-- Checkmark + VERIFIED label -->
  <g transform="translate(${MX}, ${VERIF_Y + 28})">
    <circle cx="12" cy="12" r="12" fill="${C.greenBg}" stroke="${C.green}" stroke-width="1.5"/>
    <path d="M 7.5 12 L 10.5 15 L 16.5 9"
      fill="none" stroke="${C.green}" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"/>
    <text x="34" y="16.5"
      font-size="11" font-weight="800" fill="${C.textMuted}" letter-spacing="3"
      >VERIFIED TRANSACTION</text>
  </g>

  <!-- Reference -->
  <text x="${MX}" y="${VERIF_Y + 88}"
    font-size="11" font-weight="700" fill="${C.textGhost}" letter-spacing="1.5">REFERENCE</text>
  <text x="${MX + 180}" y="${VERIF_Y + 88}"
    font-size="14" font-weight="700" fill="${C.blueDark}" letter-spacing="0.5">${receiptNum}</text>

  <!-- Timestamp -->
  <text x="${MX}" y="${VERIF_Y + 116}"
    font-size="11" font-weight="700" fill="${C.textGhost}" letter-spacing="1.5">TIMESTAMP</text>
  <text x="${MX + 180}" y="${VERIF_Y + 116}"
    font-size="14" font-weight="500" fill="${C.textMid}">${escapeXml(dateTimeStr)}</text>

  <!-- ── 7. FOOTER ────────────────────────────────────────────────────────── -->
  <line x1="${MX}" y1="${FOOTER_Y}" x2="${RX}" y2="${FOOTER_Y}" stroke="url(#footerGrad)" stroke-width="1.5"/>

  <text x="${MX}" y="${FOOTER_Y + 36}"
    font-size="13" font-weight="500" fill="${C.textGhost}"
    >Generated by Monevo · AI-powered financial records via WhatsApp</text>

  <text x="${RX}" y="${FOOTER_Y + 36}"
    font-size="16" font-weight="800" fill="${C.textPrimary}" text-anchor="end" letter-spacing="-0.3"
    >monevo<tspan fill="${C.blue}">.</tspan></text>

  <!-- Subtle hackathon attribution -->
  <text x="540" y="${ATTR_Y}"
    font-size="10" font-weight="500" fill="${C.textGhost}" text-anchor="middle" opacity="0.6"
    >Voice infrastructure: AssemblyAI</text>

</svg>`;
}
