import { languageDriftReport } from "./language.mjs";
import { readState, writeState } from "../lib/state-store.mjs";

export function finalText(event) { return [event?.last_assistant_message, event?.lastAssistantMessage, event?.assistant_response, event?.assistantResponse, event?.final_output, event?.finalOutput, event?.response, event?.message?.content].find((value) => typeof value === "string") ?? ""; }
function reasoningPrompt(event) { return [event?.prompt, event?.user_prompt, event?.userPrompt, event?.last_user_message, event?.lastUserMessage].filter((value) => typeof value === "string").join("\n"); }
function guarantee(text) { return /(?:最终答案|必然|保证|最坏情况|下界|上界|一定|100%|guarantee|worst.case|lower bound|upper bound)/iu.test(text); }
function reasoningGate(event, text) { const prompt = reasoningPrompt(event), isReasoning = /(?:为什么|根因|证明|保证|确保|一定|100%|逻辑|算法|推理|反例|why|prove|guarantee|ensure|root cause)/iu.test(prompt), guaranteeAnswer = guarantee(text); if (!isReasoning && !guaranteeAnswer) return null; const markers = text.match(/(?:因为|所以|假设|证据|反例|验证|风险|边界|推导|下界|上界|最坏情况|therefore|because|assum|evidence|counterexample|verify|risk|lower bound|upper bound|worst.case)/giu)?.length ?? 0, state = readState("reasoning-stop", event, { depthDenies: 0, reviewDenies: 0 });
  if (markers >= 2) { if (guaranteeAnswer && state.reviewDenies === 0 && !event?.stop_hook_active && !event?.stopHookActive) { writeState("reasoning-stop", event, { ...state, reviewDenies: 1 }); return "[Reasoning Verification Gate] 精确推理答案定稿前需要一次独立复核：检查可控维度、最坏情况上下界、边界/退化情形，并用不同路径重算；最后以‘最终答案’明确定稿。"; } return null; }
  const depthDenies = state.depthDenies + 1; if (depthDenies > 3) return null; writeState("reasoning-stop", event, { ...state, depthDenies }); return `[Reasoning Depth Gate] 当前完成态缺少可检验的推理链（深度标记 ${markers}，要求至少 2）。请用 reasoning-discipline 重新分析：明确事实、假设、推导、反例和独立验证，再给结论。`;
}
export function stopViolation(event) { if (event?.stop_hook_active || event?.stopHookActive) return null; const text = finalText(event); return languageDriftReport(event, text, "stop", true) || reasoningGate(event, text); }
