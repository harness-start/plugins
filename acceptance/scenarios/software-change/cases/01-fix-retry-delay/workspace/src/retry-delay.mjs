export function retryDelay(
  attempt,
  { baseDelayMs = 100, maxDelayMs = 1600 } = {},
) {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new RangeError("attempt must be a positive integer");
  }
  if (baseDelayMs <= 0 || maxDelayMs < baseDelayMs) {
    throw new RangeError("delay bounds are invalid");
  }

  return Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
}
