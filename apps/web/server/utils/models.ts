import type { H3Event } from 'h3'
import { createError } from 'h3'
import type { LanguageModel } from 'ai'
import { gateway } from 'ai'
import { createWorkersAI } from 'workers-ai-provider'
import type { ChatModel } from '#shared/utils/models'
import { DEFAULT_MODEL, MODELS, WORKERS_AI_MODELS } from '#shared/utils/models'

// The AI Gateway's key, when its owner has set it as a Worker secret
// (`wrangler secret put AI_GATEWAY_API_KEY`). Without it only Workers AI's
// models are offered, and dictation is off.
export function gatewayConfigured(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY)
}

// The models a request may use: Workers AI's always, the gateway's with its key.
export function availableModels(): ChatModel[] {
  return gatewayConfigured() ? MODELS : WORKERS_AI_MODELS
}

// A model id the request may not use — a gateway model with no key, or one
// nobody lists — falls back to the default Workers AI model rather than
// failing the chat.
export function resolveModelId(modelId: string): string {
  return availableModels().some(m => m.value === modelId) ? modelId : DEFAULT_MODEL
}

export function isWorkersAiModel(modelId: string): boolean {
  return WORKERS_AI_MODELS.some(m => m.value === modelId)
}

// Workers AI through the Worker's own `AI` binding (wrangler.jsonc). No key:
// the binding is the credential. Read per request — the binding lives on the
// request's Cloudflare context, not at module scope.
function workersAi(event: H3Event) {
  const ai = event.context.cloudflare?.env?.AI
  if (!ai) {
    throw createError({
      statusCode: 500,
      statusMessage: 'AI binding missing',
      message: 'The AI binding is missing: wrangler.jsonc must declare "ai": { "binding": "AI" }'
    })
  }
  return createWorkersAI({ binding: ai })
}

// The language model for an id that resolveModelId has already resolved.
export function languageModel(event: H3Event, modelId: string): LanguageModel {
  return isWorkersAiModel(modelId) ? workersAi(event)(modelId) : gateway(modelId)
}

// Workers AI's reasoning switch, for models that think: per call, under the
// provider's own key (workers-ai-provider).
export function workersAiOptions(thinking: boolean) {
  return { 'workers-ai': { chat_template_kwargs: { enable_thinking: thinking } } }
}
