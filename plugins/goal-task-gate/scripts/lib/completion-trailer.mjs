/**
 * GOAL_TASK_DONE trailer parse / format / validate.
 */

export const TRAILER_RE =
  /^GOAL_TASK_DONE\s+run_id=([A-Za-z0-9._-]+)\s+status=completed\s+close_seq=(\d+)\s+tip_hash=([0-9a-fA-F]{8,64})\s*$/mu;

/**
 * @returns {{ runId: string, status: 'completed', closeSeq: number, tipHash: string } | null}
 */
export function parseCompletionTrailer(text) {
  const raw = String(text ?? "");
  if (!raw.trim()) return null;
  // Prefer last matching line
  const lines = raw.split(/\r?\n/u);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim();
    const m = line.match(
      /^GOAL_TASK_DONE\s+run_id=([A-Za-z0-9._-]+)\s+status=completed\s+close_seq=(\d+)\s+tip_hash=([0-9a-fA-F]{8,64})\s*$/u,
    );
    if (m) {
      return {
        runId: m[1],
        status: "completed",
        closeSeq: Number(m[2]),
        tipHash: m[3].toLowerCase(),
      };
    }
  }
  return null;
}

export function formatCompletionTrailer({ runId, closeSeq, tipHash }) {
  return `GOAL_TASK_DONE run_id=${runId} status=completed close_seq=${closeSeq} tip_hash=${String(tipHash).toLowerCase()}`;
}

/**
 * @param {object|null} trailer
 * @param {{ runId: string, closeSeq: number, tipHash: string, kind?: string, chainValid?: boolean }} trailTip
 */
export function validateTrailerAgainstTrail(trailer, trailTip) {
  const findings = [];
  if (!trailer) {
    findings.push("missing GOAL_TASK_DONE trailer");
    return { ok: false, findings };
  }
  if (!trailTip) {
    findings.push("no trail tip to validate against");
    return { ok: false, findings };
  }
  if (trailer.runId !== trailTip.runId) {
    findings.push(
      `trailer run_id=${trailer.runId} != active run_id=${trailTip.runId}`,
    );
  }
  if (Number(trailer.closeSeq) !== Number(trailTip.closeSeq)) {
    findings.push(
      `trailer close_seq=${trailer.closeSeq} != trail seq=${trailTip.closeSeq}`,
    );
  }
  const tip = String(trailTip.tipHash ?? "").toLowerCase();
  if (trailer.tipHash !== tip) {
    findings.push(`trailer tip_hash mismatch`);
  }
  if (trailTip.kind && trailTip.kind !== "close") {
    findings.push(`trail tip kind=${trailTip.kind} (need close)`);
  }
  if (trailTip.chainValid === false) {
    findings.push("trail hash chain invalid");
  }
  return { ok: findings.length === 0, findings };
}
