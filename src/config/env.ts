import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  // ── Required now ──────────────────────────────────────────
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // ── Required before Phase 2 ───────────────────────────────
  MONGODB_URI: z.string().optional(),

  // ── Required before Phase 6 ───────────────────────────────
  ASSEMBLYAI_API_KEY: z.string().optional(),

  // ── Required before Phase 7 / Groq AI ─────────────────────
  ANTHROPIC_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('openai/gpt-oss-120b'),

  // ── Kapso WhatsApp Integration ────────────────────────────
  KAPSO_API_KEY: z.string().optional(),
  KAPSO_API_BASE_URL: z.string().default('https://api.kapso.ai'),
  KAPSO_PROJECT_ID: z.string().optional(),
  KAPSO_WHATSAPP_CONFIG_ID: z.string().optional(),
  KAPSO_WEBHOOK_SECRET: z.string().optional(),

  // ── Meta WhatsApp Cloud API / Proxy ───────────────────────
  META_WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  META_WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  META_WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  META_WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  META_GRAPH_API_VERSION: z.string().default('v24.0'),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('❌ Environment validation failed:');
  result.error.issues.forEach((issue) => {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}

export const env = result.data;

export type Env = typeof env;
