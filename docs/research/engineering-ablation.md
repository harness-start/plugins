# Engineering ablation evidence

> Date: 2026-09-03
> Status: runtime method implemented; live baseline/treatment comparison pending acceptance-image availability

## Claim under test

A short instruction to "perform an ablation" is not itself evidence of better engineering output. The testable mechanism is bounded one-factor removal: preserve the task, observable contract, model, host, budget, and outcome gate; remove one candidate abstraction or harness component; then keep the simpler variant only when the same gate still passes.

## External evidence

- Anthropic reports that radically cutting a harness made it difficult to identify load-bearing components, while removing one component at a time made the impact reviewable. It also recommends re-examining scaffolding as model capability changes: <https://www.anthropic.com/engineering/harness-design-long-running-apps>.
- OpenAI recommends removing one instruction, example, or tool group at a time and rerunning the same evaluations. Its internal coding-agent sample found directional quality and efficiency gains from leaner prompts, while warning teams to validate on their own workload: <https://developers.openai.com/api/docs/guides/latest-model>.
- Self-Refine provides evidence that feedback-and-refinement loops can improve code and other outputs, but also reports that weaker models may fail to apply refinement reliably: <https://arxiv.org/abs/2303.17651>.

These sources support controlled refinement and component ablation. They do not establish a universal community consensus or prove that the phrase "perform an ablation experiment" causes a large quality increase.

## Local experiment contract

The `practice-07-ablation-simplifies` case measures whether a normal refactor removes redundant single-use layers while preserving its public export, behavior, dependency set, and file scope. The `practice-08-ablation-preserves-contract` counterexample measures whether simplification preserves load-bearing platform behavior.

For a runtime prompt expansion, run each case three times on both Claude Code and Codex before and after the change. Publish the expansion only if the treatment has no correctness or scope regression, the preservation case passes 6/6, and the simplification case passes at least 5/6 while improving on baseline by at least two runs. A baseline already at 5/6 or better is evidence that another always-on prompt is unnecessary.

## Current evidence

- Offline public-seam contract tests produced the expected RED before the Skill change.
- Neither Docker attempt reached a model session. The first stalled on the 211.55 MB `node:20-bookworm` layer; the retry downloaded that layer and the first dependency set, then made no progress while fetching `fonts-noto-cjk` for more than three observation intervals. Both runs were stopped rather than counted as model failures.
- Because no valid baseline exists, the always-on SessionStart and UserPromptSubmit text remains unchanged. The method is integrated only into the already-routed, bundled `engineering-judgment` Skill, avoiding unproven context growth.
