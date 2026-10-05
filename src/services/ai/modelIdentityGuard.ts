/**
 * Grounded Model Self-Identification & Anti-Hallucination Guard.
 *
 * Implements GitHub Issue #21 / Finding #6:
 * Prevents the assistant from hallucinating backend models or architecture
 * (e.g., claiming "I'm running on GPT-4 architecture" or disclosing temperature settings).
 */

export const MONEVO_IDENTITY_RESPONSE =
  "I am the Monevo financial assistant. I'm designed to help you track your income, expenses, and manage your financial records. I cannot disclose backend infrastructure or internal system settings.";

export const MODEL_IDENTITY_SYSTEM_PROMPT_INSTRUCTION =
  "You are the Monevo Financial Assistant. You must never speculate, claim, or disclose backend models, providers (e.g. OpenAI, GPT-4, Groq, Llama), or internal hyperparameter settings. Always state that you are the Monevo assistant.";

export const MODEL_INFRASTRUCTURE_PATTERNS: RegExp[] = [
  // 1. Model / LLM questions
  /\b(?:what|which|tell\s+me(?:\s+about)?)\s+(?:is\s+)?(?:your\s+)?(?:ai\s+)?(?:model|llm|base\s+model|foundation\s+model)\b/i,
  /\b(?:what|which|whose)\s+(?:model|llm|architecture|engine)\s+(?:are\s+you|is\s+this|do\s+you\s+use|powers?\s+you|drives?\s+you|runs?\s+you)\b/i,
  /\b(?:what|which)\s+(?:model|llm|architecture)\b/i,
  /\bwhat\s+(?:model|architecture)\s+are\s+you\s+(?:running|based)\s+on\b/i,
  /\b(?:model\s+(?:name|version|architecture)|llm\s+architecture)\b/i,
  /\b(?:what(?:'s|\s+is)\s+your\s+(?:model|llm|engine))\b/i,

  // 2. Architecture questions
  /\bwhat(?:'s|\s+is)\s+(?:your\s+)?(?:system\s+|backend\s+|underlying\s+)?architecture\b/i,
  /\b(?:(?:your|system|ai|model|llm|backend|software|underlying)\s+architecture)\b/i,
  /\b(?:architecture\s+of\s+(?:this\s+ai|the\s+bot|the\s+system|you|monevo))\b/i,
  /\b(?:tell\s+me\s+about\s+your\s+architecture|describe\s+your\s+architecture|explain\s+your\s+architecture)\b/i,

  // 3. Provider & Model names (GPT-4, Groq, OpenAI, Llama, Claude, etc.)
  /\b(?:are\s+you|is\s+this|do\s+you\s+use|powered\s+by|built\s+on|running\s+on|based\s+on)\s+(?:gpt-?4[a-z0-9]*|gpt-?3(?:\.5)?|chatgpt|openai|llama[a-z0-9-]*|claude[a-z0-9-]*|gemini[a-z0-9-]*|groq|anthropic|mistral)\b/i,
  /\b(?:gpt-?4[a-z0-9]*|gpt-?3(?:\.5)?|groq|openai|llama[a-z0-9-]*|claude[a-z0-9-]*|gemini[a-z0-9-]*)\s+(?:architecture|model|llm|engine|backend|api)\b/i,
  /\b(?:use|using)\s+(?:gpt-?4[a-z0-9]*|groq)\b/i,
  /\b(?:what\s+version\s+of\s+gpt)\b/i,

  // 4. Temperature & Hyperparameters
  /\b(?:temperature(?:\s+setting)?|hyperparameters?|top_p|max_tokens|sampling\s+temperature)\b/i,
  /\bwhat(?:'s|\s+is)\s+(?:your\s+)?temperature(?:\s+setting)?\b/i,

  // 5. System prompt & instructions
  /\b(?:system\s+prompt|developer\s+prompt|initial\s+prompt|system\s+instructions?)\b/i,
  /\b(?:what(?:'s|\s+is| are)\s+your\s+system\s+(?:prompt|instructions?))\b/i,
  /\b(?:reveal|show|display|print|share|leak)\s+(?:your\s+)?(?:system\s+prompt|instructions|developer\s+prompt)\b/i,

  // 6. Creator / Origin of AI
  /\bwho\s+(?:built|trained|created|developed|made|designed|programmed)\s+(?:your\s+ai|this\s+ai|your\s+model|this\s+model|you)\b/i,
  /\bwho\s+is\s+your\s+(?:creator|developer|maker|author)\b/i,

  // 7. General Backend / Infrastructure
  /\b(?:backend\s+(?:model|architecture|infrastructure|provider|settings?)|internal\s+system\s+settings?)\b/i,
  /\bwhat\s+(?:infrastructure|hardware|servers?)\s+(?:do\s+you\s+use|powers?\s+you|are\s+you\s+running\s+on)\b/i,
];

// Short exact or direct matches (case-insensitive)
const DIRECT_EXACT_MATCHES = new Set([
  'what model',
  'which model',
  'what llm',
  'which llm',
  'architecture',
  'what architecture',
  'gpt-4',
  'gpt4',
  'groq',
  'temperature setting',
  'temperature',
  'system prompt',
  'system instructions',
  'who built your ai',
  'who made your ai',
  'who created your ai',
]);

/**
 * Checks whether user input is inquiring about backend models, infrastructure,
 * hyperparameters, or system prompts.
 */
export function isModelInfrastructureQuery(text: string | null | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;

  // Clean punctuation for direct match check
  const normalized = trimmed.toLowerCase().replace(/^[?!.,;:]+|[?!.,;:]+$/g, '').trim();
  if (DIRECT_EXACT_MATCHES.has(normalized)) {
    return true;
  }

  return MODEL_INFRASTRUCTURE_PATTERNS.some((pattern) => pattern.test(trimmed));
}
