import { createError, defineEventHandler } from 'nuxt/server'
import { gateway } from 'ai'

defineRouteMeta({
  openAPI: {
    description: 'Create a short-lived token to stream dictation audio to the transcription model.',
    tags: ['ai']
  }
})

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  // Dictation streams to the AI Gateway's transcription model, so it exists
  // only once the gateway's key is set (the microphone is hidden until then).
  if (!gatewayConfigured()) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Dictation unavailable',
      message: 'Dictation needs the AI Gateway: set the AI_GATEWAY_API_KEY Worker secret'
    })
  }

  // Each token lets the browser stream audio for up to 5 minutes on the project's gateway credit,
  // consider rate limiting this route if your users are not trusted
  return gateway.experimental_transcription.getToken({
    model: TRANSCRIPTION_MODEL,
    expiresAfterSeconds: 300
  })
})
