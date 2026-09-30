const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const issues = [
  {
    title: '[Enterprise/Infra] Scalable Asynchronous Queue Architecture (BullMQ + Redis) for 1000+ Concurrent Global Users',
    labels: ['enterprise', 'scaling', 'enhancement'],
    body: `## 🚀 Enterprise Scaling & Queue Architecture

### 1. Executive Summary & Problem Statement
Currently, Monevo handles WhatsApp webhooks, AssemblyAI transcription, Groq AI inference, and Sharp receipt/report rendering **synchronously inside the Express HTTP request-response cycle**. 

Under enterprise load (1,000+ simultaneous global users sending voice notes, requesting receipts, and logging expenses):
- Meta WhatsApp webhooks will timeout (Meta requires \`< 15s\` or 200 OK within 5s, otherwise it aggressively retries deliveries, causing duplicate processing).
- Memory-heavy operations (Sharp PNG rendering, Puppeteer PDF generation, voice conversion) will cause Node.js event-loop lag and OOM crashes.
- Concurrent rate limits on external APIs (Groq, AssemblyAI, Kapso) will trigger cascading failures without resilient backoff retry queues.

---

### 2. Architecture & Technical Specifications
Transition the architecture to a **decoupled producer-consumer queue system** powered by **BullMQ and Redis**:

\`\`\`
[WhatsApp / Kapso Webhook]
          │ (Immediate HTTP 200 OK + HMAC validation)
          ▼
   [Redis BullMQ]
   ├── Queue: \`incoming-messages\` (Priority routing: text vs voice)
   ├── Queue: \`ai-inference\` (Groq intent extraction & tool dispatching)
   ├── Queue: \`document-rendering\` (Receipts PNG/PDF, Weekly Reports)
   └── Queue: \`outbound-notifications\` (WhatsApp rate-limited sending)
          │
     [Worker Pool] ────> [MongoDB Replica Set / Read Replicas]
\`\`\`

#### Key Requirements:
1. **Immediate Webhook ACK**:
   - The webhook endpoint verifies HMAC signatures, logs raw payload, enqueues the job to Redis \`incoming-messages\`, and immediately responds \`200 OK\` within < 200ms.
2. **Worker Separation**:
   - \`AudioTranscriptionWorker\`: Downloads WhatsApp voice notes, streams to AssemblyAI with exponential backoff.
   - \`AiProcessingWorker\`: Manages Groq API context, token budget, and fallback models (e.g. Llama-3.3-70b -> Llama-3.1-8b).
   - \`DocumentRenderingWorker\`: Isolates CPU-heavy image/PDF operations so they don't block API throughput.
   - \`WhatsAppDispatchWorker\`: Implements token-bucket rate limiting (e.g. 50-80 msg/sec adhering to Meta Graph API quotas).
3. **Idempotency & Dead Letter Queue (DLQ)**:
   - Redis-backed idempotency keys using \`message_id\` with 24-hour TTL.
   - Failed jobs retry 3 times with exponential backoff; unresolvable jobs route to \`dlq:failed-transactions\` with alert hooks for the admin dashboard.

---

### 3. Implementation Checklist
- [ ] Install \`bullmq\` and \`ioredis\` dependencies.
- [ ] Create Redis connection factory in \`src/config/redis.ts\` with reconnection resilience.
- [ ] Implement queues and job schemas in \`src/queues/\`.
- [ ] Refactor \`webhookController.ts\` to act solely as a light-weight producer.
- [ ] Build isolated worker processes in \`src/workers/\`.
- [ ] Add queue telemetry and health metrics to \`/health\` and the Admin Dashboard.
- [ ] Write integration and stress tests simulating 100 concurrent webhook bursts.

---

### 4. Acceptance Criteria
- [ ] Webhook response time stays below 150ms under a burst of 500 requests/sec.
- [ ] Zero dropped messages during simulated 10-second external API downtime (auto-retry via BullMQ).
- [ ] Outbound WhatsApp messages strictly respect Meta rate limits without 429 errors.
`
  },
  {
    title: '[Feature/Receipts] Enterprise Multi-Format Receipts: Vector PDF Generation, Inbound Receipt OCR & Custom Branding',
    labels: ['enterprise', 'receipts', 'enhancement'],
    body: `## 🧾 Enterprise Multi-Format Receipts & Inbound OCR

### 1. Executive Summary & Problem Statement
Currently, Monevo generates receipt images as a 1080×1350 PNG via SVG and Sharp. While visually stunning on mobile screens, enterprise businesses and international users need:
1. **Official Vector PDF Invoices**: Printable, compliant tax invoices with line items, tax ID/VAT, and verifiable digital signatures.
2. **Inbound Receipt Photo OCR**: Small businesses receive physical paper receipts and invoices from vendors. Users should simply photograph a paper receipt on WhatsApp and have Monevo parse, categorize, and record the expense automatically.
3. **Custom Merchant Branding**: Business tier users must be able to upload their own corporate logo, brand colors, tax registrations, and footer terms.

---

### 2. Architecture & Technical Specifications

#### Component A: Inbound Paper Receipt OCR (Vision AI)
- When a user sends an **image** via WhatsApp:
  - Check user state; detect if the image contains an invoice/receipt.
  - Send the image buffer to Groq Vision API (e.g., \`llama-3.2-11b-vision-preview\` / \`llama-3.2-90b-vision-preview\`).
  - Extract structured JSON:
    \`\`\`json
    {
      "merchant": "Office Supplies Ltd",
      "date": "2026-09-30",
      "totalAmount": 42500,
      "currency": "NGN",
      "taxAmount": 3187.50,
      "category": "equipment",
      "lineItems": [
        { "name": "Printer Toner", "quantity": 2, "price": 21250 }
      ]
    }
    \`\`\`
  - Reply with an interactive confirmation: *"Found receipt from Office Supplies Ltd for ₦42,500. Recorded under Equipment. Reply [1] to view or [2] to edit."*

#### Component B: Vector PDF Invoice Engine
- Implement a server-side PDF generator using Puppeteer / PDFKit / React-PDF.
- Generate standard A4 vector PDFs with:
  - High-res vector company logo
  - Invoice Number & Barcode / QR Code for digital verification
  - Itemized table with quantities, unit price, discounts, and VAT/Sales Tax
  - Payment status badge (\`PAID\`, \`DUE\`, \`PENDING\`)
  - Bank payment details & terms
- Store generated PDFs in S3/Cloudflare R2 and return secure time-limited signed download links to the user.

#### Component C: Custom Merchant Branding
- Extend \`User\` schema:
  - \`brandLogoUrl\`: string
  - \`brandPrimaryColor\`: string (hex)
  - \`taxId\` / \`vatNumber\`: string
  - \`invoiceFooterNotes\`: string

---

### 3. Implementation Checklist
- [ ] Add image inbound handler in \`src/handlers/imageHandler.ts\` and connect to WhatsApp router.
- [ ] Implement OCR extraction prompt and schema in \`src/services/ai/receiptOcrService.ts\`.
- [ ] Build vector PDF generator service in \`src/services/receipts/pdfReceiptService.ts\`.
- [ ] Add S3 / Cloudflare R2 client for persisting PDF and image assets with signed URLs.
- [ ] Update \`Receipt\` model to store line items, tax, and PDF download URLs.
- [ ] Provide WhatsApp interactive option for users to download PDF vs image receipt.
- [ ] Add branding customization inputs in the Admin Dashboard user profile.

---

### 4. Acceptance Criteria
- [ ] Photographing a paper receipt automatically extracts merchant, date, amount, and items with > 90% accuracy.
- [ ] Generated PDF invoices are crisp, printable at 300 DPI, and pass PDF/A standards.
- [ ] Signed PDF links expire after configured TTL (e.g. 7 days).
`
  },
  {
    title: '[Enterprise/Core] Global Multi-Currency FX Engine, ISO 4217 Auto-Conversion & Timezone-Aware Localization',
    labels: ['enterprise', 'scaling', 'enhancement'],
    body: `## 🌍 Global Multi-Currency FX Engine & Timezone Localization

### 1. Executive Summary & Problem Statement
Monevo is scaling to users worldwide across North America, Europe, Africa, Asia, and Latin America. 
Currently:
- Currency defaults to single static strings (primarily \`NGN\`), and balance summaries assume all recorded transactions share the user's primary currency without conversion.
- Scheduled jobs (e.g. weekly reports) run on a single fixed server cron timezone rather than the user's local timezone.
- Text & voice responses do not auto-localize to the user's country code or language preference.

---

### 2. Architecture & Technical Specifications

#### Component A: Multi-Currency & Real-Time FX Conversion
- Implement \`FxExchangeService\` with cached rates (Redis TTL 1 hour) using reliable providers (ECB, Open Exchange Rates, or CoinGecko for stablecoins/crypto).
- Support transactions in multiple currencies per user wallet:
  - Each transaction retains its original \`amount\` and \`currency\` (e.g., 50 USD, 30 EUR, 50,000 NGN).
  - Calculations (\`getBalance\`, \`getPeriodSummary\`, \`WeeklyReport\`) compute:
    1. Base balance in user's default preferred currency (e.g. converted to USD).
    2. Breakdown by original holding currencies.
- Provide natural language FX conversion:
  - User: *"How much is $150 in Cedis?"* or *"Convert my weekly spend to Euros."*

#### Component B: Timezone-Aware Scheduling
- Infer user's timezone from WhatsApp phone country code during onboarding (or allow manual selection).
- Store \`timezone\` (e.g., \`Africa/Lagos\`, \`America/New_York\`, \`Europe/London\`) in the \`User\` document.
- Migrate \`weeklyReportJob.ts\` from a single global cron to timezone-bucketed execution queues (running every hour, picking users whose local time is 9:00 AM Monday).

#### Component C: Global Number & Phone Formatting
- Use \`libphonenumber-js\` to parse international MSISDNs accurately.
- Adapt amount parsers to accept diverse number notations (e.g. European \`1.250,50 €\` vs US \`$1,250.50\`).

---

### 3. Implementation Checklist
- [ ] Create \`src/services/fx/fxService.ts\` with Redis caching and rate provider fallback.
- [ ] Update \`Transaction\` schema with \`exchangeRateToBase\` and \`baseCurrencyEquivalent\`.
- [ ] Refactor \`getBalance.ts\` and \`getPeriodSummary.ts\` to aggregate converted totals.
- [ ] Add \`timezone\` and \`locale\` fields to \`User\` model.
- [ ] Refactor \`weeklyReportJob.ts\` to dispatch jobs per timezone bucket.
- [ ] Add unit tests for foreign currency inputs and currency conversion arithmetic.

---

### 4. Acceptance Criteria
- [ ] Users can record transactions in USD, EUR, GBP, KES, GHS, ZAR, etc., and see unified portfolio totals.
- [ ] Weekly reports arrive at 9:00 AM in the user's local timezone regardless of where the server is hosted.
- [ ] Currency conversion handles API downtime gracefully using fallback cached rates.
`
  },
  {
    title: '[Dashboard/Security] Enterprise Admin Hub: RBAC Authentication, Real-Time WebSockets, AI Cost Telemetry & Live Support Handover',
    labels: ['enterprise', 'dashboard', 'security'],
    body: `## 🛡️ Enterprise Admin Hub & Live Operations Portal

### 1. Executive Summary & Problem Statement
The current Admin Dashboard (\`/admin\`) provides high-level KPIs, user lists, and transaction viewing, but lacks enterprise governance:
1. **No Authentication / Access Control**: Endpoints under \`/api/admin/*\` are unprotected; enterprise deployments require secure multi-role authentication (RBAC).
2. **Polling Instead of Real-Time Streaming**: Live events (incoming voice notes, new transactions, AI failures) require manual page refreshes or polling.
3. **No AI Token & Cost Telemetry**: Administrators cannot monitor Groq / AssemblyAI costs, token consumption, or latency benchmarks per user.
4. **No Live Human Agent Handover**: When a user needs customer support or complex human resolution, administrators cannot pause the AI agent and chat directly with the WhatsApp user from the dashboard.

---

### 2. Architecture & Technical Specifications

#### Component A: Role-Based Access Control (RBAC) & Auth
- Implement JWT and Session authentication for the admin panel.
- Define Admin Roles:
  - \`SuperAdmin\`: Full system access, API keys, user quota modifications.
  - \`ComplianceOfficer\`: View transactions, run audit reports, export sanitized CSVs.
  - \`SupportAgent\`: View conversations, toggle human takeover mode, send manual replies.
- Secure all \`/api/admin/*\` routes with role validation middleware.

#### Component B: Real-Time Telemetry via WebSocket (Socket.io / ws)
- Establish authenticated WebSocket connection between admin frontend and backend.
- Emit events in real-time:
  - \`transaction:created\`: Flashes on live ticker.
  - \`voice:transcribed\`: Displays user audio duration and transcription confidence.
  - \`ai:error\`: Alerts admins to rate limits or hallucination clarifications.

#### Component C: AI Cost & Token Usage Analytics
- Track token metrics on every Groq call:
  - Prompt tokens, completion tokens, model name, latency (ms), estimated USD cost.
- Dashboard view:
  - Token burn rate chart (hourly/daily).
  - Cost per active user.
  - Latency p50 / p95 / p99 percentiles.

#### Component D: Live Human Handover (Human-in-the-Loop)
- In the User CRM drawer, add a **"Take Over Chat"** toggle:
  - Sets \`user.botPaused = true\` for 30 minutes (or until released).
  - Enables a direct WhatsApp chat box inside the admin UI.
  - Messages typed by the admin agent are sent directly to the user's WhatsApp via Kapso.
  - Incoming user messages appear instantly in the admin chat console without triggering the AI router.

---

### 3. Implementation Checklist
- [ ] Create \`AdminUser\` model with bcrypt passwords, 2FA, and roles.
- [ ] Add auth routes (\`/api/admin/auth/login\`, \`/refresh\`, \`/logout\`) and \`authMiddleware\`.
- [ ] Mount WebSocket server on the Express HTTP instance in \`src/server.ts\`.
- [ ] Log token usage and model execution latency in \`src/services/ai/groqService.ts\`.
- [ ] Add \`botPaused\` and \`assignedAgentId\` fields to \`User\` model.
- [ ] Build Live Chat & Takeover interface in \`public/admin/index.html\` & \`admin.js\`.
- [ ] Add automated tests for admin role enforcement and token tracking.

---

### 4. Acceptance Criteria
- [ ] Unauthenticated requests to \`/api/admin/*\` return \`401 Unauthorized\`.
- [ ] Live transactions appear on the dashboard in < 1 second via WebSockets without page reload.
- [ ] Admin can pause bot and exchange 2-way WhatsApp messages seamlessly with any registered user.
`
  },
  {
    title: '[UX/WhatsApp] Interactive WhatsApp Flows, Button Quick-Actions & Proactive Predictive Financial Alerts',
    labels: ['enterprise', 'ui/ux', 'enhancement'],
    body: `## ✨ Enterprise WhatsApp Conversational UX: Interactive Menus & Predictive Alerts

### 1. Executive Summary & Problem Statement
Currently, user interactions are purely unstructured free-form text or audio. While the AI is conversational, users must type out queries repeatedly. Modern WhatsApp Business API features allow rich **interactive buttons, list pickers, and native WhatsApp Flows**, which dramatically lower friction and prevent input ambiguity.

Furthermore, Monevo should not just be reactive (answering questions); it should be **proactively intelligent**—alerting users before they overspend or when recurring bills are due.

---

### 2. Architecture & Technical Specifications

#### Component A: WhatsApp Interactive Buttons & List Messages
- Implement helper methods in \`src/services/whatsapp/client.ts\`:
  - \`sendButtonMessage(to, bodyText, buttons)\`: Up to 3 quick-reply buttons (e.g., \`[🧾 Get Receipt]\`, \`[📊 Weekly Report]\`, \`[⚙️ Settings]\`).
  - \`sendListMessage(to, title, buttonText, sections)\`: Interactive dropdowns for category selection, period filtering (Today, This Week, This Month).
- Integrate with tool responses:
  - After recording an income transaction: attach a quick button \`[Generate Receipt]\`.
  - When clarification is needed (e.g., category ambiguity): send a 3-button choice instead of asking the user to type.

#### Component B: WhatsApp Flows for Onboarding & Budgeting
- Utilize WhatsApp Flows (native multi-screen form sheet inside WhatsApp):
  - Onboarding Flow: Select Profile Type (Personal / Business), Currency, Weekly Report Day, and Notification Preferences in one interactive form.
  - Budget Setup Flow: Set monthly spending limits per category with visual sliders.

#### Component C: Proactive Financial Health Alerts (Cron / Event-Driven)
- **Budget Threshold Alert**:
  - When an expense transaction is logged, check against category budget. If spending reaches 80% or 100%, immediately send an alert with advice:
    - *"⚠️ Alert: You've reached 85% of your Dining budget this month (₦85,000 / ₦100,000). Consider pacing for the next 8 days."*
- **Recurring Subscription Detector**:
  - Run background anomaly detection on transactions. Detect recurring patterns (e.g. Netflix, Spotify, AWS, Office Rent). Alert user 24h prior to expected charge.
- **Unusual Spending Spike**:
  - If a transaction is > 3x the 30-day average for that category, flag it gently for confirmation.

---

### 3. Implementation Checklist
- [ ] Implement Meta Interactive Message payload generators in \`src/services/whatsapp/interactive.ts\`.
- [ ] Handle \`interactive\` webhook payload type in \`messageParser.ts\` and \`messageRouter.ts\`.
- [ ] Create \`Budget\` model and budget checking service in \`src/services/analytics/budgetService.ts\`.
- [ ] Add proactive alert triggers to \`recordTransaction.ts\`.
- [ ] Create recurring charge prediction job in \`src/jobs/subscriptionDetectorJob.ts\`.
- [ ] Test button click interactions in end-to-end webhook integration tests.

---

### 4. Acceptance Criteria
- [ ] Users can trigger common actions with 1 tap using native WhatsApp buttons.
- [ ] An interactive button response executes within 500ms.
- [ ] Budget warnings trigger immediately upon crossing 80% / 100% spending caps.
`
  },
  {
    title: '[Enterprise/Fintech] Bank Statement Ingestion (PDF/CSV Parsing) & Automatic Reconciliation Engine',
    labels: ['enterprise', 'enhancement'],
    body: `## 🏦 Bank Statement Ingestion & Automated Reconciliation

### 1. Executive Summary & Problem Statement
For businesses and high-volume individual users, manually logging every single coffee, transfer, or invoice via text/voice is tedious. To truly advance Monevo to enterprise scale, users must be able to **upload a bank statement (PDF or CSV)** from any major bank and have Monevo ingest hundreds of transactions in seconds, reconciling them against existing receipts and entries.

---

### 2. Architecture & Technical Specifications

#### Component A: Statement Upload & Preprocessing
- Accept document uploads via:
  1. WhatsApp document attachment (\`.pdf\` or \`.csv\`).
  2. Admin / Business portal file uploader.
- Security & Validation:
  - Enforce virus scanning / file signature checks.
  - Limit file size to 15MB.

#### Component B: Parsing Engine
- **CSV Parser**: Auto-detect delimiter, date formats, debit/credit columns using flexible schema heuristics (PapaParse + Zod).
- **PDF Parser**: Extract tabular text using \`pdf-parse\` or Llama-3.2 Vision OCR for scanned statements.
- **AI Normalizer**:
  - Feed raw transaction descriptions (e.g. \`POS 092823 WTRFRT IKOYI NG 39201\`) through Groq LLM to sanitize clean merchant names (\`Waterfront Restaurant\`) and assign standardized categories (\`Food & Dining\`).

#### Component C: Intelligent Deduplication & Reconciliation
- Compare each parsed statement entry against existing MongoDB transactions for that user:
  - Match Criteria: Same date (± 24 hours), exact amount, matching direction (debit/credit).
  - Flags:
    - \`NEW\`: Automatically inserted into database.
    - \`MATCHED\`: Linked to existing manually recorded transaction or receipt.
    - \`POTENTIAL_DUPLICATE\`: Flagged for user confirmation.
- Reply to user with a comprehensive Reconciliation Summary:
  - *"Processed Zenith Bank Statement: 142 transactions ingested (₦1,240,000 Inflow, ₦890,000 Outflow). 12 matched existing receipts. 130 new transactions added to your ledger."*

---

### 3. Implementation Checklist
- [ ] Add document webhook handler in \`src/handlers/documentHandler.ts\`.
- [ ] Implement CSV and PDF parser modules in \`src/services/ingestion/\`.
- [ ] Build reconciliation algorithm in \`src/services/ingestion/reconciliationService.ts\`.
- [ ] Add batch transaction insertion with Mongo bulkWrite for performance.
- [ ] Deliver interactive WhatsApp summary with option to undo or view statement report.
- [ ] Add Statement Ingestion tab to the Admin Dashboard.

---

### 4. Acceptance Criteria
- [ ] Ingests a 200-line bank statement CSV/PDF in < 10 seconds.
- [ ] 100% duplicate prevention when statement contains already-recorded transactions.
- [ ] Clean merchant normalization on obscure bank memo strings.
`
  },
  {
    title: '[Security/Compliance] Multi-Tenant Organization Isolation, PII Masking & Enterprise Audit Logging (SOC2/GDPR)',
    labels: ['enterprise', 'security'],
    body: `## 🔐 Enterprise Multi-Tenancy, Data Privacy (PII Masking) & Audit Compliance

### 1. Executive Summary & Problem Statement
As Monevo scales to enterprise teams, SMEs, and thousands of global users, financial data governance is paramount. Enterprise customers require:
1. **Multi-Tenant Team Accounts**: Multiple team members (Accountant, Founder, Operations) accessing a shared company ledger with varying permissions.
2. **PII Masking & Privacy Guard**: Sensitive data (Bank Account Numbers, BVN/SSN, full card numbers) must be masked **before** being passed to third-party LLMs (Groq) or external APIs.
3. **Immutable Audit Trails**: Every financial record modification, receipt deletion, or manual adjustment must be permanently recorded with timestamp, IP, and actor identity for SOC2 / audit compliance.
4. **GDPR / Data Subject Rights**: Self-service data export (Right to Portability) and account purge (Right to be Forgotten).

---

### 2. Architecture & Technical Specifications

#### Component A: Multi-Tenant Organization Model
- Introduce \`Organization\` and \`Membership\` schemas:
  - \`Organization\`: \`{ name, plan: 'enterprise', baseCurrency, settings }\`
  - \`Membership\`: \`{ userId, organizationId, role: 'owner' | 'admin' | 'member' | 'viewer' }\`
- Link transactions, receipts, and budgets to \`organizationId\` when users belong to a team.
- Support WhatsApp team access: Allow multiple WhatsApp numbers to post expenses to the same corporate ledger with author attribution.

#### Component B: PII Sanitization Middleware
- Add \`src/services/ai/piiSanitizer.ts\` executed prior to any Groq LLM inference:
  - Regex & NER patterns to redact:
    - Credit/Debit card numbers (Luhn check) -> \`[REDACTED_CARD]\`
    - International Bank Account Numbers (IBAN) / Account numbers -> \`[REDACTED_ACCOUNT]\`
    - Tax identification numbers / SSN / BVN -> \`[REDACTED_ID]\`
- Ensure raw sensitive PII is never stored in plain text or logged to standard output.

#### Component C: Immutable Audit Log
- Create \`AuditLog\` collection:
  \`\`\`typescript
  {
    action: 'TRANSACTION_UPDATE' | 'RECEIPT_DELETE' | 'EXPORT_DATA' | 'ROLE_CHANGE',
    actorId: Types.ObjectId,
    targetResource: string,
    resourceId: Types.ObjectId,
    previousState: Record<string, any>,
    newState: Record<string, any>,
    ipAddress: string,
    userAgent: string,
    createdAt: Date
  }
  \`\`\`
- Append-only collection (no updates or deletes permitted at MongoDB schema level).

#### Component D: Data Portability & Erasure
- Provide command / webhook trigger: \`EXPORT MY DATA\` -> compiles encrypted ZIP of all transactions, receipts, reports, and audit logs.
- Provide compliance endpoint for verified account deletion with cryptographic erasure of financial records.

---

### 3. Implementation Checklist
- [ ] Implement \`Organization\` and \`Membership\` schemas in \`src/models/\`.
- [ ] Build \`piiSanitizer.ts\` with zero-allocation regex replacement and integrate into \`groqService.ts\`.
- [ ] Create \`AuditLog\` model and Mongoose audit plugin.
- [ ] Implement automated data export service in \`src/services/compliance/exportService.ts\`.
- [ ] Add enterprise organization switcher in the Admin Dashboard.
- [ ] Write security unit tests verifying that sensitive financial identifiers never reach third-party LLMs.

---

### 4. Acceptance Criteria
- [ ] 0% PII leakage to third-party LLM logs during penetration testing.
- [ ] Multiple team members can record expenses into a shared organization ledger with clear attribution.
- [ ] Tamper-proof audit logs verify all manual financial adjustments for compliance auditors.
`
  }
];

// Write issues to temporary files and run gh issue create
for (let i = 0; i < issues.length; i++) {
  const issue = issues[i];
  const tmpFile = path.join(__dirname, `issue_${i + 1}.md`);
  fs.writeFileSync(tmpFile, issue.body);

  const labelsArg = issue.labels.map(l => `--label "${l}"`).join(' ');
  const cmd = `gh issue create --title "${issue.title.replace(/"/g, '\\"')}" --body-file "${tmpFile}" ${labelsArg}`;
  
  console.log(`Creating Issue ${i + 1}/${issues.length}: ${issue.title}`);
  try {
    const output = execSync(cmd, { encoding: 'utf8' });
    console.log(`✓ Created: ${output.trim()}`);
  } catch (err) {
    console.error(`Error creating issue:`, err.message);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (e) {}
  }
}

console.log('All enterprise issues created successfully!');
