# Monevo — WhatsApp-First AI Financial Assistant

## Product Goal

Monevo allows individuals and small businesses to manage simple financial records entirely through WhatsApp using text messages and voice notes. No app install. No dashboard login. Just chat.

Built for the AssemblyAI Voice Agent Hackathon.

---

## Architecture

```
WhatsApp User
     │
     ▼
Meta WhatsApp Cloud API
     │
     ▼
Express Webhook (POST /webhook)
     │
     ▼
Message Router
     ├── Text Message ──────────────────────────────┐
     │                                               │
     └── Voice Note                                  │
              │                                      │
              ▼                                      │
     Download Audio (Meta Media API)                 │
              │                                      │
              ▼                                      │
     AssemblyAI Transcription                        │
              │                                      │
              ▼                                      │
     Transcript ────────────────────────────────────►│
                                                     │
                                              AI Intent Extraction
                                             (Claude / GPT via SDK)
                                                     │
                                                     ▼
                                             Financial Tool Dispatch
                                    ┌────────────────┴───────────────┐
                                    ▼                                 ▼
                             MongoDB Tools                   Response Builder
                          (record/query/summarize)                    │
                                                                      ▼
                                                          WhatsApp Reply (text/image)
```

---

## Technology Stack

| Layer         | Technology                          |
|---------------|-------------------------------------|
| Runtime       | Node.js v22 LTS (project target)    |
| Language      | TypeScript 5 (strict mode)          |
| Framework     | Express.js                          |
| Database      | MongoDB Atlas + Mongoose            |
| AI            | Anthropic Claude API (tool use)     |
| Speech        | AssemblyAI (transcription)          |
| Messaging     | Meta WhatsApp Cloud API             |
| Images        | Sharp + SVG templates               |
| Validation    | Zod                                 |
| Environment   | dotenv                              |
| Linting       | ESLint + Prettier                   |
| Testing       | Jest + ts-jest                      |
| Deployment    | Railway                             |

> Note: System runs Node v26.5.0 — compatible, but production deployment will target Node 22 LTS.

---

## Database Collections

### `users`
```
whatsappId        string  (unique, indexed)
profileType       'personal' | 'business'
name              string
phone             string
businessName      string?
businessAddress   string?
currency          string  (default: 'NGN')
onboardingComplete boolean
createdAt         Date
updatedAt         Date
```

### `transactions`
```
userId            ObjectId → users
type              'income' | 'expense'
amount            number
currency          string
category          string  (extensible enum)
description       string
counterparty      string?
date              Date
source            'text' | 'voice'
transcript        string?
whatsappMessageId string  (unique — idempotency)
createdAt         Date
updatedAt         Date
```

### `receipts`
```
userId            ObjectId → users
transactionId     ObjectId → transactions
receiptNumber     string
imageUrl          string?
imageBuffer       Buffer?
createdAt         Date
```

### `conversation_states`
```
whatsappId        string  (unique, indexed)
state             string
context           object
expiresAt         Date
updatedAt         Date
```

### `weekly_reports`
```
userId            ObjectId → users
weekStart         Date
weekEnd           Date
totalIncome       number
totalExpenses     number
netBalance        number
transactionCount  number
topCategories     array
imageBuffer       Buffer?
createdAt         Date
```

---

## Income Categories
`sales | salary | freelance | payment | transfer | investment | other`

## Expense Categories
`food | transport | fuel | rent | utilities | inventory | salary | marketing | business | entertainment | health | education | shopping | transfer | other`

---

## AI Tool System

The AI may only interact with MongoDB through these controlled tools:

| Tool                   | Purpose                                  |
|------------------------|------------------------------------------|
| `record_transaction`   | Create a new transaction                 |
| `get_transactions`     | List/filter transactions                 |
| `get_balance`          | Current net balance                      |
| `get_period_summary`   | Income/expense totals for a time period  |
| `get_category_summary` | Breakdown by category                    |
| `get_largest_expense`  | Largest single expense                   |
| `get_receipt_data`     | Fetch transaction for receipt generation |
| `generate_receipt`     | Trigger receipt image creation           |
| `update_profile`       | Update user profile fields               |
| `get_user_profile`     | Fetch current user profile               |

**Security invariant:** `userId` is ALWAYS derived from the authenticated WhatsApp sender ID. The AI never supplies or modifies `userId`.

---

## Development Phases

| Phase | Description                                    |
|-------|------------------------------------------------|
| 0     | Project planning and environment verification  |
| 1     | Initialize Node.js + TypeScript backend        |
| 2     | Connect MongoDB and create models              |
| 3     | Build Meta WhatsApp webhook                    |
| 4     | Receive and send WhatsApp text messages        |
| 5     | Build user onboarding                          |
| 6     | Build AssemblyAI voice transcription           |
| 7     | Build AI financial intent extraction           |
| 8     | Build transaction tools and financial commands |
| 9     | Connect voice messages to financial system     |
| 10    | Build financial analytics queries              |
| 11    | Build receipt generation                       |
| 12    | Build weekly visual analytics reports          |
| 13    | Build voice responses                          |
| 14    | Add reliability, security, and edge cases      |
| 15    | Deployment                                     |
| 16    | Full end-to-end testing                        |
| 17    | Hackathon demo preparation                     |

---

## MVP Scope — What We Build

- WhatsApp text message processing
- WhatsApp voice note transcription via AssemblyAI
- AI-powered financial intent extraction
- Transaction recording (income and expense)
- Balance and summary queries
- Category breakdowns
- Receipt image generation (PNG via Sharp + SVG)
- Weekly analytics image generation
- User onboarding flow (personal / business profile)
- Idempotent webhook processing

---

## Deliberately Excluded

- Mobile application
- Frontend dashboard / website
- Blockchain or cryptocurrency
- Payment processing
- Redis (unless a clear bottleneck emerges)
- Message queues (SQS, RabbitMQ, etc.)
- Kubernetes / Docker Swarm
- Complex accounting (double-entry, etc.)
- Multi-tenant business accounts
- File/document parsing
- Multi-currency conversion

---

## Required Environment Variables

```env
# MongoDB
MONGODB_URI=

# AssemblyAI
ASSEMBLYAI_API_KEY=

# Meta WhatsApp Cloud API
META_WHATSAPP_ACCESS_TOKEN=
META_WHATSAPP_PHONE_NUMBER_ID=
META_WHATSAPP_VERIFY_TOKEN=
META_WHATSAPP_BUSINESS_ACCOUNT_ID=
META_GRAPH_API_VERSION=v19.0

# AI (Anthropic Claude)
ANTHROPIC_API_KEY=

# App
PORT=3000
NODE_ENV=development
```

---

## 48-Hour Implementation Strategy

**Hours 0–4:** Phases 0–2 — environment, scaffolding, MongoDB models  
**Hours 4–10:** Phases 3–5 — webhook, text messaging, onboarding  
**Hours 10–16:** Phases 6–8 — voice transcription, AI extraction, transaction tools  
**Hours 16–22:** Phases 9–11 — voice-to-finance pipeline, analytics, receipts  
**Hours 22–30:** Phases 12–13 — analytics images, voice responses  
**Hours 30–36:** Phase 14 — reliability, security hardening, edge cases  
**Hours 36–42:** Phases 15–16 — deploy to Railway, end-to-end testing  
**Hours 42–48:** Phase 17 — demo script, polish, presentation prep  

---

## Credential Acquisition Guide

| Credential               | Where to get it                                              |
|--------------------------|--------------------------------------------------------------|
| `MONGODB_URI`            | MongoDB Atlas → Create cluster → Connect → Driver           |
| `ASSEMBLYAI_API_KEY`     | assemblyai.com → Dashboard → API Keys                       |
| `META_WHATSAPP_*`        | developers.facebook.com → App → WhatsApp → API Setup        |
| `ANTHROPIC_API_KEY`      | console.anthropic.com → API Keys                            |
| `META_WHATSAPP_VERIFY_TOKEN` | You choose this string — set it in both .env and Meta dashboard |
