import { Editor, type BaseRange } from "slate";
import type { PassageAnchor } from "./passageAnchors";

/** Capture the diff before a successful recheck advances the anchor's baseline. */
export function captureDirectPassageEdit<T>(editor: Editor, anchor: PassageAnchor<T>): {
  before: string; after: string; range: BaseRange | null;
} | null {
  const before = anchor.originalContext ?? anchor.original;
  const range = anchor.originalContext !== undefined ? anchor.contextRange ?? null : anchor.range;
  const after = range ? Editor.string(editor, range) : "";
  return before === after ? null : { before, after, range };
}
