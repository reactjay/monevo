# Monevo — WhatsApp AI Financial Assistant

A voice-first WhatsApp assistant that lets individuals and micro-businesses manage their financial records entirely through chat — no app install, no complex spreadsheets, no dashboard logins.

Built for the **AssemblyAI Voice Agent Hackathon**.

---

## 🌟 Key Features

- 🎙️ **Voice-First Tracking**: Send audio notes in English or Nigerian Pidgin. Transcribed via **AssemblyAI** with high accuracy.
- ⚡ **AI Intent Extraction**: Powered by **Groq** (Llama 3.3) with Claude 3.5 Sonnet fallback. Recognizes income, expenses, category breakdown, and balance queries.
- 🧾 **Instant Digital Receipts**: Dynamically creates professional branded receipts as downloadable images using **Sharp** and SVG templates.
- 📊 **Automated Weekly Financial Reports**: Generates visual spending charts and delivers them directly into WhatsApp chats on schedule.
- 💬 **WhatsApp Cloud API & Kapso**: Seamlessly handles webhooks, incoming audio, interactive messaging, and quick replies.

---

## 🏗️ Architecture

```
WhatsApp User
     │
     ▼
Meta WhatsApp Cloud API / Kapso
     │
     ▼
Railway Express Webhook (POST /webhook/whatsapp)
     │
     ▼
Message Router
     ├── Text Message ──────────────────────────────┐
     │                                               │
     └── Voice Note                                  │
              │                                      │
              ▼                                      │
     AssemblyAI Audio Transcription                  │
              │                                      │
              ▼                                      │
     Transcript ────────────────────────────────────►│
                                                     │
                                              AI Intent Extraction
                                              (Groq / Claude)
                                                     │
                                                     ▼
                                            Financial Tool Dispatch
                                    ┌────────────────┴───────────────┐
                                    ▼                                 ▼
                             MongoDB Atlas                    Visual Generators
                         (record/query/balance)             (Receipts & Reports)
                                                                      │
                                                                      ▼
                                                          WhatsApp Delivery (Media/Text)
```

---

## 🚀 Deploying to Railway (Production)

Deploying Monevo to Railway takes less than 2 minutes:

### 1. Connect Repository
1. Log in to [Railway.app](https://railway.app).
2. Click **New Project** → **Deploy from GitHub repo**.
3. Select `reactjay/monevo`.

### 2. Configure Environment Variables
Set the following variables in Railway under **Variables**:

| Variable | Description |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | Set automatically by Railway (defaults to 3000) |
| `MONGODB_URI` | MongoDB Atlas connection string (`mongodb+srv://...`) |
| `ASSEMBLYAI_API_KEY` | Your AssemblyAI API key |
| `GROQ_API_KEY` | Your Groq API key |
| `GROQ_MODEL` | `openai/gpt-oss-120b` (or `llama-3.3-70b-versatile`) |
| `KAPSO_API_KEY` | Kapso project API key |
| `KAPSO_PROJECT_ID` | Kapso Project ID |
| `KAPSO_WHATSAPP_CONFIG_ID` | Kapso WhatsApp Configuration ID |
| `META_WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Business Phone Number ID |
| `META_WHATSAPP_VERIFY_TOKEN` | Webhook verification challenge token |
| `META_WHATSAPP_BUSINESS_ACCOUNT_ID` | WhatsApp Business Account ID |

### 3. Webhook Setup
Once Railway provides your public URL (e.g., `https://monevo-production.up.railway.app`):
1. In your Kapso or Meta WhatsApp Developer Console, set the Webhook URL to:
   ```
   https://<your-railway-domain>/webhook/whatsapp
   ```
2. Verify token: enter the same token defined in `META_WHATSAPP_VERIFY_TOKEN`.

---

## 💻 Local Development

```bash
# 1. Install dependencies
npm install

# 2. Setup environment
cp .env.example .env
# Fill in your credentials

# 3. Start local server with hot reload
npm run dev

# 4. Start public tunnel (for webhook testing)
outray 3000 # or ngrok http 3000
```

---

## 🛠️ Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start development server with nodemon |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run production compiled server |
| `npm run typecheck` | Type-check without emitting files |
| `npm run lint` | Run ESLint |
| `npm test` | Run full Jest test suite (246+ tests) |

---

## 🩺 Health Check

```bash
curl https://<your-railway-domain>/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "whatsapp-financial-agent",
  "database": "connected"
}
```

---

## 🔒 Security & Privacy

- All sensitive keys are managed via environment variables.
- Webhook signature verification and idempotency safeguards prevent duplicate transaction entries.
- Unprivileged user (`node`) execution in containerized environments.
