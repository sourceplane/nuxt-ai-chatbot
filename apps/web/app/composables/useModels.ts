export function useModels() {
  const capabilities = useCapabilities()
  const model = useCookie<string>('model', { default: () => capabilities.value.defaultModel })

  // Only what this deployment can answer with (shared/utils/models.ts): a
  // model it cannot use — a gateway model without its key, or one an earlier
  // deployment offered — shows as the default, which is what the server
  // answers with anyway.
  const models = computed(() => capabilities.value.models)
  if (!models.value.some(m => m.value === model.value)) {
    model.value = capabilities.value.defaultModel
  }

  return {
    models,
    model
  }
}
