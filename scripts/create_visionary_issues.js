const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const issues = [
  {
    title: '[Fintech/Payments] WhatsApp Native In-Chat Payments, Peer-to-Peer (P2P) Split Bills & Payment Links',
    labels: ['enterprise', 'ui/ux', 'enhancement'],
    body: `## 💳 WhatsApp Native In-Chat Payments & P2P Bill Splitting

### 1. Executive Summary & Vision
To be the **undisputed #1 financial product on WhatsApp**, Monevo must evolve from an accounting assistant into a **complete transactional engine**. Users should be able to not only track money, but **send, split, and collect real money** without ever leaving WhatsApp.

---

### 2. Architecture & Technical Specifications

#### Component A: Peer-to-Peer (P2P) Bill Splitting
- User sends: *"Split ₦36,000 dinner with @Chidi (+2348011111111) and @Amaka (+2348022222222)"*
- Monevo calculates:
  - ₦12,000 per person.
  - Generates interactive WhatsApp payment request cards sent to Chidi and Amaka with a **[Pay ₦12,000 Now]** button.
  - Automatically updates the sender's ledger when each recipient settles their share.

#### Component B: Hosted Instant Checkout Links (Paystack / Flutterwave / Stripe)
- Generate one-time dynamic payment links with webhooks:
  - Supports Apple Pay, Google Pay, Cards, Bank Transfer, and USSD.
  - Automatically detects when a payment link is paid and delivers instant WhatsApp receipts to both payer and payee.

#### Component C: WhatsApp Pay Native Integration
- Integrate with Meta's native WhatsApp Pay API (in supported jurisdictions: Brazil, India, Singapore) enabling frictionless 1-tap in-chat checkout.

---

### 3. Implementation Checklist for Developers
- [ ] Implement \`PaymentLinkService\` supporting multi-gateway providers (Paystack, Flutterwave, Stripe).
- [ ] Create \`BillSplit\` model to track multi-party debt obligations and payment status.
- [ ] Build intent parser for natural language split requests (*"split X among Y people"*).
- [ ] Set up incoming payment webhook listener in \`src/routes/payments.ts\` to auto-reconcile paid splits.
- [ ] Deliver interactive confirmation cards with instant payment status updates.
`
  },
  {
    title: '[Enterprise/Invoicing] WhatsApp Merchant Invoicing, PDF Quotations & Automated Gentle Debt Collection Reminders',
    labels: ['enterprise', 'receipts', 'enhancement'],
    body: `## 📑 WhatsApp Merchant Invoicing & Automated Dunning Engine

### 1. Executive Summary & Vision
Millions of freelancers, contractors, and small business owners run their entire business operations on WhatsApp. Monevo will become their **autonomous Accounts Receivable department**—generating professional client quotes, invoices, and handling gentle debt collection follow-ups automatically.

---

### 2. Architecture & Technical Specifications

#### Component A: Conversational Invoice Creation
- Merchant types or speaks:
  - *"Send invoice to Acorn Media for ₦650,000 for Brand Identity Design due on Oct 15"*
- Monevo:
  1. Compiles a high-resolution, branded PDF invoice.
  2. Generates an embedded payment link.
  3. Sends the invoice directly to the client's WhatsApp (or generates a shareable link) with buttons:
     - \`[💳 Pay Invoice Online]\`
     - \`[📥 Download PDF]\`
     - \`[💬 Ask Merchant a Question]\`

#### Component B: Automated Gentle Dunning & Follow-ups
- Configurable automated reminder cadence (e.g., 3 days before due, on due date, 3 days overdue).
- AI crafts polite, friendly reminders tailored to the relationship:
  - *"Hi Sarah! Just a gentle reminder that Invoice #INV-2026-084 for ₦650,000 is due tomorrow. Here is your quick pay link: [link]. Thank you!"*
- Merchant dashboard to pause, snooze, or mark invoices as paid manually.

---

### 3. Implementation Checklist for Developers
- [ ] Create \`Invoice\` model with items, status (\`DRAFT\`, \`SENT\`, \`PAID\`, \`OVERDUE\`), and dunning settings.
- [ ] Build conversational quote/invoice generator in \`src/services/invoicing/\`.
- [ ] Create scheduled cron job \`src/jobs/invoiceDunningJob.ts\` to dispatch polite reminders.
- [ ] Add WhatsApp template message integration for outside-24-hour customer service window delivery.
- [ ] Add Invoice Management section to the Admin Dashboard.
`
  },
  {
    title: '[AI/Advisory] Autonomous Proactive Wealth Coach, Goal-Based Micro-Savings & Smart Budget Guardrails',
    labels: ['enterprise', 'ui/ux', 'enhancement'],
    body: `## 🧠 Autonomous AI Wealth Coach & Goal-Based Micro-Savings

### 1. Executive Summary & Vision
Monevo should not just record the past—it should **actively improve the user's financial future**. The AI acts as a 24/7 personal wealth coach that provides daily morning briefings, detects wasteful spending leaks, and helps users achieve savings goals automatically.

---

### 2. Architecture & Technical Specifications

#### Component A: Daily Morning Financial Briefing (Opt-in)
- Every morning at 8:00 AM (in the user's local timezone):
  - Sends a bite-sized WhatsApp card:
    \`\`\`
    ☀️ Good morning Japheth!
    💵 Safe-to-Spend Today: ₦18,500
    🎯 MacBook Goal: ₦420k / ₦800k (52.5% - On Track 🚀)
    💡 Pro-Tip: You spent ₦15k on Uber yesterday. Consider carpooling today to stay under budget!
    \`\`\`

#### Component B: Goal-Based Savings Vaults
- Users set goals: *"I want to save ₦500,000 for rent by December"*
- Monevo calculates required weekly savings rate and visualizes progress bar in ASCII or generated SVG cards.
- **Round-Up Micro-Savings**: Automatically round up every logged expense to the nearest ₦100 / ₦1,000 and allocate the virtual difference to the savings vault.

#### Component C: Real-Time Impulsive Spending Interventions
- When a user logs a luxury or high-discretionary expense:
  - If it exceeds 50% of their remaining monthly discretionary budget, Monevo gently responds with empathy and awareness:
    - *"Got it, recorded ₦85,000 for Sneakers. Note: This leaves you with ₦22,000 for entertainment for the rest of the month."*

---

### 3. Implementation Checklist for Developers
- [ ] Create \`SavingsGoal\` and \`BudgetVault\` schemas.
- [ ] Build safe-to-spend calculation algorithm in \`src/services/analytics/safeToSpend.ts\`.
- [ ] Implement \`dailyBriefingJob.ts\` scheduled per user timezone.
- [ ] Add conversational intent for savings goals (*"Save 50k towards vacation"*).
- [ ] Add automated visual goal progress card generator.
`
  },
  {
    title: '[AI/Voice] Hyper-Localized Polyglot Voice Intelligence: Multilingual Code-Switching & Dialect Comprehension',
    labels: ['enterprise', 'scaling', 'enhancement'],
    body: `## 🎙️ Hyper-Localized Polyglot Voice Intelligence (Pidgin & Global Dialects)

### 1. Executive Summary & Vision
WhatsApp's global superpower is **voice notes**. In emerging and global markets, users communicate in a blend of languages (Pidgin, Yoruba, Hausa, Igbo, Swahili, French, Spanish, Hindi, Tagalog). Monevo will be the world's first financial AI that natively understands code-switching and accented voice notes with 99% accuracy.

---

### 2. Architecture & Technical Specifications

#### Component A: Code-Switching & Dialect Normalization
- Support natural multilingual inputs:
  - **West African Pidgin**: *"Abeg record 3500 for bole and fish wey I chop for afternoon"*
  - **Yoruba-English**: *"Mo na 15k fun transport lo si Ikeja today"*
  - **Hausa-English**: *"Na biya dubu goma for repairs"*
  - **French-African**: *"J'ai payé 25 000 FCFA pour le supermarché"*
  - **Swahili**: *"Nimelipa elfu tatu ya mafuta ya gari"*

#### Component B: Advanced Audio Pipeline
- Leverage AssemblyAI Best-of-Speech with custom financial vocabulary dictionaries (Naira, Cedi, Kobo, Shillings, Francs, K, M, 'chaff', 'kpa').
- Multi-tier LLM normalization: If speech-to-text contains colloquial slang, an AI slang translator maps it into standardized financial categories before intent extraction.

#### Component C: Localized Dialect Neural TTS Responses
- Allow users to choose their voice assistant persona:
  - *Standard Professional English*
  - *Warm Nigerian Pidgin / Afrobeat Tone*
  - *French / Swahili / Spanish regional accents*

---

### 3. Implementation Checklist for Developers
- [ ] Expand \`src/services/assemblyai/client.ts\` with custom financial word boosts.
- [ ] Create slang dictionary and normalization layer in \`src/services/ai/slangNormalizer.ts\`.
- [ ] Add audio pre-processing (noise reduction, opus transcode via ffmpeg) for low-quality WhatsApp microphones.
- [ ] Benchmark voice transcription accuracy across 50 diverse regional test voice samples.
- [ ] Support custom voice persona selector in user settings.
`
  },
  {
    title: '[UX/Social] WhatsApp Group Expense Hub: Shared Ledgers, Event Budgets & Automated Debt Settlement',
    labels: ['enterprise', 'ui/ux', 'enhancement'],
    body: `## 👥 WhatsApp Group Financial Hub: Shared Ledgers & Splitwise in Chat

### 1. Executive Summary & Vision
WhatsApp groups are the heart of human collaboration—from wedding committees and family budgets to group trips and shared apartment flatmates. Monevo in WhatsApp Groups allows any group member to log shared expenses, with Monevo maintaining an **automated, transparent group ledger**.

---

### 2. Architecture & Technical Specifications

#### Component A: Group Bot Addition & Permissions
- When Monevo is added to a WhatsApp Group:
  - Greets the group and explains how it tracks expenses.
  - Automatically identifies members by their phone number / sender ID.
  - Commands:
    - *"@Monevo Japheth paid ₦45,000 for groceries for everyone"*
    - *"@Monevo Tunde paid $120 for Airbnb"*
    - *"@Monevo Who owes what?"*

#### Component B: Debt Simplification Algorithm
- Computes minimum number of cash transfers to settle all group debts (using graph-based flow simplification, similar to Splitwise).
- Example Output:
  \`\`\`
  📊 Kigali Trip Group Settlement:
  • Total Group Spend: ₦340,000
  • Chidi owes Japheth: ₦18,000
  • Amaka owes Japheth: ₦12,500
  • Tunde is all settled up! ✅
  [Click to Settle Debts via WhatsApp Pay]
  \`\`\`

#### Component C: Group Visual Reports & PDF Export
- Generate end-of-trip or monthly group summary cards and downloadable PDF statements showing the full breakdown of who paid for what.

---

### 3. Implementation Checklist for Developers
- [ ] Support group webhook payloads (\`message.groupId\`) in \`webhookController.ts\`.
- [ ] Create \`GroupLedger\` and \`GroupMember\` schemas in \`src/models/\`.
- [ ] Implement debt simplification algorithm in \`src/services/analytics/debtSettlement.ts\`.
- [ ] Add group mentions / command trigger parsing.
- [ ] Add automated group settlement test suite.
`
  },
  {
    title: '[Enterprise/Tax] One-Click Tax Preparation, Deductible Expense Tagging & Formal Profit & Loss (P&L) Reports',
    labels: ['enterprise', 'receipts', 'enhancement'],
    body: `## 📊 One-Click Tax Filing Preparation & Formal Business P&L

### 1. Executive Summary & Vision
Tax season is a nightmare for small business owners and independent contractors. Monevo will automatically organize every transaction into tax-deductible buckets throughout the year. With a single command (*"Send my 2026 tax report"*), Monevo produces an audit-ready tax pack ready for their accountant or government filing.

---

### 2. Architecture & Technical Specifications

#### Component A: Automated Tax Deductibility Tagging
- Automatically tags business expenses as tax-deductible based on local tax rules (e.g., Office Rent, Travel & Subsistence, Software Subscriptions, Professional Development, Equipment Depreciation).
- Prompts user when ambiguous: *"Was this flight to Abuja personal or business-related?"*

#### Component B: Institutional Financial Statements (P&L & Cash Flow)
- Generate standard accounting financial statements:
  - **Statement of Profit or Loss (Income Statement)**: Gross Revenue, Cost of Goods Sold (COGS), Operating Expenses, Net Operating Profit.
  - **Cash Flow Statement**: Inflows vs Outflows.
  - Export formats: Signed Vector PDF, Excel (.xlsx) with formulas intact, and CSV.

#### Component C: Audit Receipt Vault ZIP
- Bundle all generated and uploaded receipt images/PDFs for the tax year into an encrypted, downloadable ZIP file organized by category and date.

---

### 3. Implementation Checklist for Developers
- [ ] Add \`taxDeductible: boolean\` and \`taxCategory\` fields to \`Transaction\` schema.
- [ ] Build \`ProfitAndLossService\` producing standardized GAAP/IFRS P&L summaries.
- [ ] Implement Excel generator using \`exceljs\` with pre-formatted balance sheets and P&L tabs.
- [ ] Build receipt archiver job to bundle receipts into organized ZIP archives.
- [ ] Add Tax & Accounting tab to the Admin Dashboard.
`
  },
  {
    title: '[Web3/Fintech] Global Stablecoin Micro-Wallets (USDC/USDT): Cross-Border Remittances & Inflation Hedging',
    labels: ['enterprise', 'scaling', 'enhancement'],
    body: `## 🪙 Stablecoin Micro-Wallets (USDC/USDT) & Cross-Border Remittances

### 1. Executive Summary & Vision
In inflation-prone emerging markets, holding local currency leads to purchasing power decay, and traditional cross-border money transfers (Western Union, wire transfers) charge 5-10% fees. By embedding non-custodial or smart-contract stablecoin accounts (USDC on Stellar / Polygon) into Monevo, users can hedge inflation and send money globally in seconds for under $0.01.

---

### 2. Architecture & Technical Specifications

#### Component A: Embedded Keyless Wallets (Account Abstraction / Passkeys)
- Generate a secure Stellar or Polygon smart-contract address linked to the user's phone number and verified WhatsApp identity.
- User can check: *"What is my USDC balance?"* -> *"You have 342.50 USDC ($342.50) in your Monevo vault."*

#### Component B: Instant Global Remittance via WhatsApp
- Senders can transfer stablecoins instantly:
  - *"Send $25 USDC to +254712345678 for project freelance work"*
  - The recipient receives a WhatsApp notification with instant settlement confirmation.
  - Integrates with local on/off ramps (e.g. M-Pesa in Kenya, Bank transfer in Nigeria) so recipients can cash out directly to their local bank in minutes.

#### Component C: Auto-Hedge Inflation
- Optional rule: *"Automatically convert 30% of my business income to USDC on receipt to preserve value against inflation."*

---

### 3. Implementation Checklist for Developers
- [ ] Integrate Stellar SDK / Polygon SDK for USDC transaction building and signing.
- [ ] Create \`CryptoWallet\` schema mapped securely to user accounts.
- [ ] Implement on-chain transfer verification and webhook listeners.
- [ ] Integrate local on/off-ramp liquidity partners.
- [ ] Add comprehensive security audits and encryption for wallet credentials.
`
  },
  {
    title: '[Security/Trust] WhatsApp Zero-Trust Security: Transaction PIN Verification, Session Timeout & Suspicious Activity Shield',
    labels: ['enterprise', 'security'],
    body: `## 🛡️ WhatsApp Zero-Trust Security: Transaction PIN, Session Locks & Fraud Shield

### 1. Executive Summary & Vision
Because WhatsApp accounts can be subject to phone theft, SIM swapping, or shared family devices, enterprise financial applications must implement **banking-grade zero-trust defense**. Sensitive operations (large transactions, account deletions, bank exports) must be guarded with step-up authentication and real-time fraud detection.

---

### 2. Architecture & Technical Specifications

#### Component A: 4-Digit Secure Transaction PIN (Hashed with Argon2/Bcrypt)
- Users set a confidential 4-digit PIN during onboarding or security setup.
- Step-up authentication triggers when:
  - A transaction over a user-configured threshold (e.g. > ₦100,000) is recorded or transferred.
  - A full data export or statement is requested.
  - The user requests to wipe their ledger.
- The PIN is verified in a temporary ephemeral session (valid for 5 minutes).

#### Component B: Auto-Expiring WhatsApp Interactive Sessions
- WhatsApp chat sessions auto-lock after 15 minutes of inactivity.
- Any attempt to view balance or financial reports displays:
  - *"🔒 Monevo is locked. Reply with your PIN to unlock your dashboard."*

#### Component C: Real-Time Fraud & Anomaly Shield
- Anomaly detection engine checks:
  - **Velocity**: More than 5 transactions recorded within 60 seconds.
  - **Spike**: Expense > 500% above 30-day average.
  - **Geographic / Device Anomaly**: Webhook requests originating from flagged IP ranges.
- Triggers instant freeze and alerts user: *"⚠️ Suspicious activity detected. Your account is temporarily frozen for your safety. Text UNLOCK to verify your identity."*

---

### 3. Implementation Checklist for Developers
- [ ] Add \`securityPinHash\`, \`sessionLocked\`, and \`pinTimeout\` to \`User\` schema.
- [ ] Create step-up verification middleware in \`src/middleware/pinAuth.ts\`.
- [ ] Build Velocity and Anomaly Shield service in \`src/services/security/fraudDetector.ts\`.
- [ ] Add security lock/unlock commands in conversational message router.
- [ ] Provide Security Incident Alerting panel in the Admin Dashboard.
`
  }
];

for (let i = 0; i < issues.length; i++) {
  const issue = issues[i];
  const tmpFile = path.join(__dirname, `vision_issue_${i + 1}.md`);
  fs.writeFileSync(tmpFile, issue.body);

  const labelsArg = issue.labels.map(l => `--label "${l}"`).join(' ');
  const cmd = `gh issue create --title "${issue.title.replace(/"/g, '\\"')}" --body-file "${tmpFile}" ${labelsArg}`;
  
  console.log(`Creating Visionary Issue ${i + 1}/${issues.length}: ${issue.title}`);
  try {
    const output = execSync(cmd, { encoding: 'utf8' });
    console.log(`✓ Created: ${output.trim()}`);
  } catch (err) {
    console.error(`Error creating issue:`, err.message);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (e) {}
  }
}

console.log('All visionary issues created successfully!');
