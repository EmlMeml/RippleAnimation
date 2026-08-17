import type { Fact } from "../types/facts";

export function temporalRangesOverlap(
  a: Fact,
  b: Fact
): boolean {
  const aFrom = a.temporal?.from;
  const aTo = a.temporal?.to;

  const bFrom = b.temporal?.from;
  const bTo = b.temporal?.to;

  /*
   * Wenn einer der beiden Facts keinen
   * vollständigen Zeitbereich besitzt,
   * können wir keinen sicheren Konflikt
   * feststellen.
   */
  if (!aFrom || !aTo || !bFrom || !bTo) {
    return true;
  }

  /*
   * A liegt vollständig vor B.
   */
  if (aTo < bFrom) {
    return false;
  }

  /*
   * B liegt vollständig vor A.
   */
  if (bTo < aFrom) {
    return false;
  }

  return true;
}