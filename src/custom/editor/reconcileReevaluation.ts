import type { Inconsistency } from "../../ai/consistencyChecker";

/** Keep an issue actionable when extraction drops it but passages remain open. */
export function reconcileReevaluation(
  detected: Inconsistency[],
  checked: Inconsistency | undefined,
  refreshed: Inconsistency | undefined,
  remainingOccurrenceCount: number,
): Inconsistency[] {
  if (checked && !refreshed && remainingOccurrenceCount > 0) {
    return [...detected, checked];
  }
  return detected;
}
