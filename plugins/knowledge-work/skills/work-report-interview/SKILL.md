---
name: work-report-interview
description: Fill evidence gaps in a work report with a bounded one-question-at-a-time interview. Use during daily, weekly, or summary authoring when data gaps remain; do not use as a standalone grilling session or to write the saved report.
---

# Work report interview

This Skill is a **read-only** gap interview. It cannot save the report, stamp TL verification, or invent tool facts.

Ask **one question at a time**. Daily: at most 3 questions. Weekly or summary: at most 5. Wait for the answer before the next question.

## Rules

1. Ask only what local Git, transcript, and optional remote collectors cannot answer.
2. Finding facts from the workspace is your job. Do not ask the employee for a commit hash you can read.
3. Decisions belong to the employee. Offer a recommended answer when it helps, then wait.
4. Mark every employee answer `employee-attested`. Never disguise it as a collector fact.
5. Stop when the remaining gaps are documented or the question budget is spent.

## Question shape

```
Q<n> — <title>
<body>
Recommended: <one recommended answer>
```

Do not emit a numbered frontier of several questions in one turn.
