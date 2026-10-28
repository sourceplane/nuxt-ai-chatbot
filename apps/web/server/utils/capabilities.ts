import { DEFAULT_MODEL } from '#shared/utils/models'
import { availableModels, gatewayConfigured } from './models'

// What the interface offers is what this deployment has: Workers AI's models
// always, the gateway's models and dictation once AI_GATEWAY_API_KEY is set,
// and GitHub sign-in once its OAuth app's id and secret are both set
// (NUXT_OAUTH_GITHUB_CLIENT_ID, NUXT_OAUTH_GITHUB_CLIENT_SECRET — the runtime
// config's `oauth.github`). The picker, the microphone and the sign-in button
// read this (app/composables/useCapabilities.ts).
export function capabilitiesFor(github?: { clientId?: string, clientSecret?: string }) {
  return {
    models: availableModels(),
    defaultModel: DEFAULT_MODEL,
    dictation: gatewayConfigured(),
    githubSignIn: Boolean(github?.clientId && github?.clientSecret)
  }
}
