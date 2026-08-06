/**
 * Brief-echo detection: high line overlap between message and parent brief.
 * Short briefs (< 3 lines) never flag C_echo.
 */

function normalizeLine(line) {
  return line.replace(/\s+/gu, " ").trim().toLowerCase();
}

function nonEmptyLines(text) {
  if (typeof text !== "string" || !text) return [];
  return text
    .split(/\r?\n/u)
    .map(normalizeLine)
    .filter(Boolean);
}

/** Strip fenced code blocks for echo comparison. */
export function stripFences(text) {
  if (typeof text !== "string") return "";
  return text.replace(/```[\s\S]*?(?:```|$)/gu, "").replace(/~~~[\s\S]*?(?:~~~|$)/gu, "");
}

/**
 * @returns {{ echo: boolean, echoRatio: number, msgLineCount: number, briefLineCount: number }}
 */
export function detectBriefEcho(message, parentBrief, echoThreshold = 0.72) {
  const briefLines = nonEmptyLines(parentBrief);
  const msgLines = nonEmptyLines(stripFences(message));
  const briefLineCount = briefLines.length;
  const msgLineCount = msgLines.length;

  if (briefLineCount < 3 || msgLineCount < 3) {
    return { echo: false, echoRatio: 0, msgLineCount, briefLineCount };
  }

  const briefSet = new Set(briefLines);
  let overlap = 0;
  for (const line of msgLines) {
    if (briefSet.has(line)) {
      overlap += 1;
      continue;
    }
    // Long substring of a brief line also counts as restatement.
    if (line.length >= 40) {
      for (const b of briefLines) {
        if (b.length >= 40 && (b.includes(line) || line.includes(b))) {
          overlap += 1;
          break;
        }
      }
    }
  }

  const echoRatio = overlap / msgLineCount;
  return {
    echo: echoRatio >= echoThreshold,
    echoRatio,
    msgLineCount,
    briefLineCount,
  };
}
