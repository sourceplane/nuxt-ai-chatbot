// WHERE THE MODELS COME FROM. Upstream sends every model call through the
// Vercel AI Gateway, which needs a key nobody brokers. Here the default is
// Workers AI, through the Worker's own `AI` binding (wrangler.jsonc): it needs
// no key, so a fresh deployment chats with nothing configured. The gateway's
// models — upstream's list, unchanged — are offered only when
// AI_GATEWAY_API_KEY is set (a Worker secret), and the picker shows exactly
// what is available (server/api/capabilities.get.ts), never a model that would
// fail. A model id that is not available falls back to DEFAULT_MODEL
// (server/utils/models.ts).
export interface ChatModel {
  label: string
  value: string
  icon: string
  // `workers-ai`: the AI binding; `gateway`: the AI Gateway (needs its key).
  via: 'workers-ai' | 'gateway'
}

// Workers AI text models with tool calling, run through workers-ai-provider.
export const WORKERS_AI_MODELS: ChatModel[] = [
  { label: 'Kimi K2.6', value: '@cf/moonshotai/kimi-k2.6', icon: 'i-simple-icons-cloudflare', via: 'workers-ai' },
  { label: 'GLM 4.7 Flash', value: '@cf/zai-org/glm-4.7-flash', icon: 'i-simple-icons-cloudflare', via: 'workers-ai' }
]

// Upstream's models, as upstream lists them. Offered only with
// AI_GATEWAY_API_KEY set.
export const GATEWAY_MODELS: ChatModel[] = [
  { label: 'Claude Haiku 4.5', value: 'anthropic/claude-haiku-4.5', icon: 'i-simple-icons-anthropic', via: 'gateway' },
  { label: 'Gemini 3 Flash', value: 'google/gemini-3-flash', icon: 'i-simple-icons-google', via: 'gateway' },
  { label: 'GPT-5 Nano', value: 'openai/gpt-5-nano', icon: 'i-simple-icons-openai', via: 'gateway' }
]

// Every model this app knows, in picker order.
export const MODELS: ChatModel[] = [...WORKERS_AI_MODELS, ...GATEWAY_MODELS]

// The model a fresh chat starts on, and the one an unavailable choice falls back to.
export const DEFAULT_MODEL = '@cf/moonshotai/kimi-k2.6'

// Titles: the fast Workers AI model, its reasoning turned off (upstream: a
// gateway model).
export const TITLE_MODEL = '@cf/zai-org/glm-4.7-flash'

// Streaming speech-to-text model used for dictation, served through the AI
// Gateway — so dictation is offered only with AI_GATEWAY_API_KEY set.
export const TRANSCRIPTION_MODEL = 'openai/gpt-realtime-whisper'
