# Monevo — Implementation TODO

Status key: ⬜ not started | 🔄 in progress | ✅ done | ❌ blocked

---

## Phase 0 — Project Planning & Environment Verification
- ✅ Inspect working directory
- ✅ Verify Node.js, npm, git versions
- ✅ Check for existing project files
- ✅ Confirm architecture
- ✅ Create PROJECT_PLAN.md
- ✅ Create TODO.md
- ✅ Create .env.example
- ⬜ Confirm all external service credentials are available before Phase 1

---

## Phase 1 — Initialize Node.js + TypeScript Backend
- ✅ `npm init` with correct metadata
- ✅ Install production dependencies
  - express, mongoose, dotenv, zod, @anthropic-ai/sdk, assemblyai, sharp, axios
- ✅ Install dev dependencies
  - typescript, ts-node, nodemon, eslint, prettier, jest, ts-jest, @types/*
- ✅ Create `tsconfig.json` (strict mode, ES2022 target, CommonJS)
- ✅ Create `.eslintrc` and `.prettierrc`
- ✅ Create directory structure: src/{config,controllers,models,routes,services,utils,middleware,types,jobs}
- ✅ Create `src/app.ts` (Express app setup)
- ✅ Create `src/server.ts` (HTTP server entry point)
- ✅ Create `src/config/env.ts` (environment validation with Zod)
- ✅ Create `.gitignore`
- ✅ Verify `npm run dev` starts the server
- ✅ Write smoke test (server responds on /health)

---

## Phase 2 — Connect MongoDB and Create Models
- ✅ Create `src/config/database.ts` (Mongoose connection with retry)
- ✅ Create `src/models/User.ts` (schema + indexes)
- ✅ Create `src/models/Transaction.ts` (schema + indexes + whatsappMessageId unique)
- ✅ Create `src/models/Receipt.ts`
- ✅ Create `src/models/ConversationState.ts`
- ✅ Create `src/models/WeeklyReport.ts`
- ✅ Create `src/types/models.ts` (TypeScript interfaces)
- ✅ Test MongoDB connection
- ✅ Write model validation tests

---

## Phase 3 — Build Meta WhatsApp Webhook
- ✅ Create `src/routes/webhook.ts`
- ✅ Implement GET /webhook (hub.verify_token challenge)
- ✅ Implement POST /webhook (incoming message handler)
- ✅ Create `src/middleware/webhookSecurity.ts` (signature verification)
- ✅ Create `src/utils/idempotency.ts` (check/store whatsappMessageId)
- ✅ Test webhook verification with Meta dashboard
- ✅ Write webhook tests

---

## Phase 4 — Receive and Send WhatsApp Text Messages
- ✅ Create `src/services/whatsapp/client.ts` (Meta API wrapper)
- ✅ Implement `sendTextMessage(to, text)`
- ✅ Implement `sendImageMessage(to, imageBuffer, caption?)`
- ✅ Create `src/services/whatsapp/messageParser.ts` (extract type, text, media)
- ✅ Create `src/controllers/webhookController.ts` & `src/services/messageRouter.ts`
- ✅ Route incoming text to welcome response
- ✅ Route incoming audio to voice placeholder response
- ✅ Test sending a message via API
- ✅ Write message parsing and routing tests

---

## Phase 5 — Build User Onboarding
- ✅ Create `src/services/onboarding/onboardingService.ts`
- ✅ Implement first-contact detection (new whatsappId → start onboarding)
- ✅ Implement conversation state machine (name → profileType → businessName → phone → address → currency)
- ✅ Persist state in `conversation_states`
- ✅ Create or update User on completion
- ✅ Set default currency (NGN) with custom currency support
- ✅ Handle restart, cancel, and invalid profile selections
- ✅ Write onboarding flow tests

---

## Phase 6 — AssemblyAI Voice Transcription
- ✅ Create `src/services/assemblyai/assemblyai.service.ts` & `src/services/assemblyai/client.ts`
- ✅ Implement `downloadWhatsAppAudio(mediaId)` & `getMediaInfo(mediaId)` (Meta Media API)
- ✅ Implement `transcribeAudio(audioBuffer, mimeType)` (AssemblyAI SDK)
- ✅ Handle audio formats (OGG/Opus, AAC, M4A, etc.) & limits (25MB, empty buffer)
- ✅ Handle transcription errors & sanitize API keys
- ✅ Connect `audioHandler.ts` to voice transcription pipeline
- ✅ Write transcription service & audio handler tests (mock AssemblyAI & Meta API)

---

## Phase 7 — AI Financial Intent Extraction
- ✅ Create Zod schemas for structured financial intents (`schemas.ts`)
- ✅ Implement timezone-aware natural language date parser (`dateParser.ts`, Africa/Lagos)
- ✅ Implement amount and currency extraction supporting shorthand, symbols, and spoken words (`amountParser.ts`)
- ✅ Implement natural language category inference (`categoryParser.ts`)
- ✅ Implement main intent extraction engine (`intentExtractor.ts`)
- ✅ Enforce critical safety rule (return `clarification_required` when amount is missing; never invent data)
- ✅ Validate all AI outputs with Zod before downstream consumption
- ✅ Write comprehensive unit test suite (`intentExtractor.test.ts`) covering all query and transaction variations

---

## Phase 8 — Transaction Tools and Financial Commands
- ✅ Create `src/services/tools/recordTransaction.ts` (validate, persist, calculate running balance)
- ✅ Create `src/services/tools/getTransactions.ts` (flexible query with pagination)
- ✅ Create `src/services/tools/getBalance.ts` (MongoDB aggregation pipeline)
- ✅ Create `src/services/tools/getPeriodSummary.ts` (MongoDB facet aggregation)
- ✅ Create `src/services/tools/getCategorySummary.ts` (grouped expense breakdown)
- ✅ Create `src/services/tools/getLargestExpense.ts` (top expense discovery)
- ✅ Create `src/services/tools/userProfile.ts` (`getUserProfile`, `updateUserProfile`)
- ✅ Create `src/services/tools/formatters.ts` & `dateRange.ts` (rich WhatsApp natural language responses)
- ✅ Create `src/services/tools/toolDispatcher.ts` (connect AI intents to controlled backend tools)
- ✅ Connect textHandler & audioHandler to AI pipeline and financial tools
- ✅ Write tool unit tests (`tools.test.ts`) and end-to-end integration tests (`pipeline.test.ts`)

---

## Phase 9 — Connect Voice Messages to Financial System
- ✅ Seamless voice transaction recording: audio download → AssemblyAI → intent extraction → validation → MongoDB transaction (`source: 'voice'`, `transcript`, `whatsappMessageId`) → natural WhatsApp confirmation
- ✅ Voice financial query support: "How much did I spend this week?" → AssemblyAI → MongoDB period aggregation → natural WhatsApp summary
- ✅ Multi-turn clarification state management with `ConversationState` (`saveClarificationState`, `handleClarificationResponse`, `clearClarificationState`)
- ✅ Voice clarification loop: "I spent money on fuel" ➔ "How much did you spend on fuel?" ➔ "Eight thousand" ➔ "Got it. I've recorded ₦8,000 for fuel today."
- ✅ Robust error handling for transcription failures, missing audioMediaId, silent notes, database errors, and cancellations
- ✅ Comprehensive test suite (`voiceFlow.test.ts`) covering all voice scenarios with 100% pass rate

---

## Phase 10 — Financial Analytics Queries
- ✅ Create `src/services/analytics/analyticsService.ts` with MongoDB `$facet` aggregations
- ✅ Support natural queries: "How much did I make this month?", "How much did I spend this month?", "How much did I spend on food?", "What is my biggest expense?", "Where am I spending the most money?", "Compare this month with last month"
- ✅ Calculate: total income, total expenses, net balance, transaction count, average expense, largest expense, top ranked categories with spend %, and period-over-period comparisons
- ✅ Format readable WhatsApp analytics reports with headers, emojis, lists, and spending trends
- ✅ Write comprehensive unit and integration test suite (`analytics.test.ts`) with deterministic datasets and date boundary verification

---

## Phase 11 — Receipt Generation
- ✅ Create `src/services/receipts/receiptService.ts`
- ✅ Create SVG receipt template (`src/services/receipts/receiptTemplate.ts`)
- ✅ Populate template with transaction and profile data (personal vs business)
- ✅ Convert SVG → PNG using Sharp
- ✅ Create `src/services/tools/generateReceiptTool.ts`
- ✅ Deterministic receipt numbering (`REC-YYYYMMDD-XXXX`)
- ✅ Store receipt metadata in MongoDB (`Receipt` collection)
- ✅ Send receipt image via WhatsApp Cloud API (`uploadMedia` -> `sendImageMessage`)
- ✅ Write comprehensive receipt generation tests (`src/__tests__/receipts.test.ts`)

---

## Phase 12 — Weekly Visual Analytics Reports
- ✅ Create `src/services/analytics/reportService.ts`
- ✅ Create SVG analytics template (`src/services/analytics/reportTemplate.ts` with income vs expense & category breakdown charts)
- ✅ Populate with MongoDB aggregated weekly data
- ✅ Convert SVG → PNG using Sharp
- ✅ Create `src/jobs/weeklyReportJob.ts` (cron-based automated scheduler + on-demand runner)
- ✅ Send report image via WhatsApp (`uploadMedia` -> `sendImageMessage`)
- ✅ Connect tool and intent commands ("Send my weekly report.", "Show my weekly analytics.")
- ✅ Write comprehensive report generation tests (`src/__tests__/weeklyReport.test.ts`)

---

## Phase 13 — Voice Responses
- ✅ Create `src/services/tts/ttsService.ts`
- ✅ Implement speech text normalization (`prepareTextForSpeech`: currency to spoken words, strip markdown & emojis)
- ✅ Implement text → audio speech synthesis (`synthesizeSpeech`)
- ✅ Send audio message via Meta WhatsApp Cloud API (`uploadMedia` -> `sendAudioMessage`)
- ✅ Add user response mode preference in `User` (`responseMode: 'text' | 'voice'`)
- ✅ Add mode switching commands ("Reply with voice.", "Text responses please.")
- ✅ Implement graceful fallback to text message when TTS / media upload fails
- ✅ Update `textHandler` and `audioHandler` with `sendUserResponse`
- ✅ Write comprehensive voice response tests (`src/__tests__/voiceResponse.test.ts`)

---

## Phase 14 — Reliability, Security, Edge Cases
- ✅ Complete security audit (secrets, environment variables, XML escaping, injection prevention)
- ✅ Strict multi-tenant user isolation (all queries, receipts, analytics, and reports scoped to authenticated user)
- ✅ Idempotency layer (fast in-memory TTL cache + MongoDB unique index against duplicate webhooks)
- ✅ AI safety & deterministic tool execution (controlled tool dispatch only, zero hallucinated transactions)
- ✅ Financial data integrity (explicit clarification on missing amounts/payers, no silent modifications)
- ✅ Resilient error handling across external services (Meta API, AssemblyAI, MongoDB, Sharp)
- ✅ Structured logging with secret token redaction
- ✅ Enhanced health check endpoint (`GET /health` with DB readiness, uptime, and memory metrics)
- ✅ Comprehensive end-to-end verification checklist suite (`src/__tests__/securityAndReliability.test.ts`)

---

## Phase 15 — Deployment
- ⬜ Create Railway project
- ⬜ Set all environment variables in Railway dashboard
- ⬜ Configure start command (`npm start`)
- ⬜ Set `NODE_ENV=production`
- ⬜ Point Meta webhook to Railway URL
- ⬜ Verify webhook challenge succeeds on Railway URL
- ⬜ Smoke test from real WhatsApp number

---

## Phase 16 — Full End-to-End Testing
- ⬜ Test: new user onboarding flow
- ⬜ Test: record expense via text
- ⬜ Test: record income via text
- ⬜ Test: record expense via voice note
- ⬜ Test: query balance
- ⬜ Test: query weekly summary
- ⬜ Test: query category breakdown
- ⬜ Test: generate receipt
- ⬜ Test: request analytics report
- ⬜ Test: duplicate webhook (idempotency)
- ⬜ Test: ambiguous message → clarification request
- ⬜ Test: AssemblyAI failure path
- ⬜ Test: MongoDB failure path

---

## Phase 17 — Hackathon Demo Preparation
- ⬜ Write demo script (exact message sequence)
- ⬜ Record demo video (2–3 min)
- ⬜ Prepare slide deck (problem, solution, tech stack, demo, future)
- ⬜ Write judge-facing README
- ⬜ Stress test with 5+ transactions before demo
- ⬜ Prepare fallback screenshots in case of live demo issues
- ⬜ Practice 90-second verbal pitch

---

## Blockers & Dependencies
- ⬜ MongoDB Atlas URI needed before Phase 2
- ⬜ AssemblyAI API key needed before Phase 6
- ⬜ Meta WhatsApp Cloud API credentials needed before Phase 3
- ⬜ Anthropic API key needed before Phase 7
- ⬜ Public HTTPS URL (ngrok/Railway) needed before Phase 3 webhook registration
