// Read what this deployment can do before the first render, so the server
// renders the picker, the microphone and the sign-in button as they will stay.
export default defineNuxtPlugin(async () => {
  const capabilities = useCapabilities()
  if (import.meta.server || !useNuxtApp().payload.serverRendered) {
    capabilities.value = await useRequestFetch()('/api/capabilities')
  }
})
