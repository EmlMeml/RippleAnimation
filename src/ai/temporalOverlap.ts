import type { Fact } from "../types/facts";

export function temporalRangesOverlap(
  a: Fact,
  b: Fact
): boolean {
  /*
   * Fehlt bei einem Fact der zeitliche Kontext,
   * gehen wir davon aus, dass er grundsätzlich
   * mit dem anderen Fact überlappen kann.
   */
  if (!a.temporal || !b.temporal) {
    return true;
  }

  const aFrom = a.temporal.from;
  const aTo = a.temporal.to;

  const bFrom = b.temporal.from;
  const bTo = b.temporal.to;

  /*
   * Ohne vollständige Zeitangaben können wir
   * keine sichere Nicht-Überschneidung feststellen.
   */
  if (!aFrom || !aTo || !bFrom || !bTo) {
    return true;
  }

  /*
   * Keine Überschneidung, wenn A vollständig
   * vor B liegt.
   *
   * Beispiel:
   * A: 14.08. - 20.08.
   * B: 21.08. - 25.08.
   */
  if (aTo < bFrom) {
    return false;
  }

  /*
   * Keine Überschneidung, wenn B vollständig
   * vor A liegt.
   */
  if (bTo < aFrom) {
    return false;
  }

  /*
   * In allen anderen Fällen überschneiden
   * sich die Zeiträume.
   */
  return true;
}