defineRouteMeta({
  openAPI: {
    description: 'What this deployment can do: the models it can answer with, dictation, GitHub sign-in.',
    tags: ['ai']
  }
})

// server/utils/capabilities.ts says what is offered and why.
export default defineEventHandler(event => capabilitiesFor(useRuntimeConfig(event).oauth?.github))
