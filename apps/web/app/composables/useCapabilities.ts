export interface Capabilities {
  models: ChatModel[]
  defaultModel: string
  dictation: boolean
  githubSignIn: boolean
}

// What this deployment can do (server/api/capabilities.get.ts), read once
// before the first render (app/plugins/capabilities.ts): the models it can
// answer with, whether dictation and GitHub sign-in are connected.
export function useCapabilities() {
  return useState<Capabilities>('capabilities', () => ({
    models: WORKERS_AI_MODELS,
    defaultModel: DEFAULT_MODEL,
    dictation: false,
    githubSignIn: false
  }))
}
