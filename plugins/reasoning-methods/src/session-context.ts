export function reasoningMethodsContext(): string {
  return [
    "[Reasoning Methods] Selective first-principles and verification routing",
    "For exact, causal, decision, or factual work whose answer can be wrong, load this plugin's `reasoning-methods` or `first-principles` Skill before answering.",
    "Use the cheapest structure that can falsify the conclusion. Extra model turns are not evidence.",
    "Keep easy lookups, translations, and already-determined implementation tasks direct.",
  ].join("\n");
}
