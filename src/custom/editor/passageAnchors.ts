import { Editor, Operation, Range, type BaseRange } from "slate";

function operationKey(operation: Operation): string {
  return JSON.stringify(operation, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value
  );
}

export type PassageAnchor<T> = {
  range: BaseRange | null;
  original: string;
  contextRange?: BaseRange | null;
  originalContext?: string;
  data: T;
};

/** A deleted value still belongs to its surviving sentence, never document start. */
export function getPassageNavigationRange<T>(editor: Editor, entry: PassageAnchor<T>): BaseRange | null {
  const candidates = entry.range && !Range.isCollapsed(entry.range)
    ? [entry.range, entry.contextRange] : [entry.contextRange, entry.range];
  for (const range of candidates) {
    if (!range) continue;
    try { Editor.string(editor, range); return range; } catch { /* Removed location. */ }
  }
  return null;
}

/** Keep identity even when a passage is removed; inverse operations restore it. */
export function createPassageAnchors<T>(editor: Editor) {
  const entries = new Map<string, PassageAnchor<T>>();
  const history: Array<{ inverse: Operation; ranges: Map<string, { range: BaseRange | null; contextRange?: BaseRange | null }> }> = [];
  return {
    entries,
    add(key: string, range: BaseRange, data: T, contextRange?: BaseRange) {
      if (!entries.has(key)) entries.set(key, {
        range: structuredClone(range), original: Editor.string(editor, range), data,
        contextRange: contextRange && structuredClone(contextRange),
        originalContext: contextRange && Editor.string(editor, contextRange),
      });
    },
    clear() { entries.clear(); history.length = 0; },
    transform(operation: Operation) {
      if (operation.type === "set_selection" || entries.size === 0) return;
      const previous = history.at(-1);
      const undo = previous && operationKey(previous.inverse) === operationKey(operation);
      const ranges = new Map([...entries].map(([key, entry]) => [key, { range: entry.range, contextRange: entry.contextRange }]));
      for (const [key, entry] of entries) {
        entry.range = undo && previous.ranges.has(key)
          ? previous.ranges.get(key)!.range
          : entry.range ? Range.transform(entry.range, operation, { affinity: "outward" }) : null;
        entry.contextRange = undo && previous.ranges.has(key)
          ? previous.ranges.get(key)!.contextRange
          : entry.contextRange ? Range.transform(entry.contextRange, operation, { affinity: "outward" }) : entry.contextRange;
      }
      if (undo) history.pop();
      else history.push({ inverse: Operation.inverse(operation), ranges });
    },
    read(entry: PassageAnchor<T>) {
      const text = entry.range ? Editor.string(editor, entry.range) : "";
      const context = entry.contextRange ? Editor.string(editor, entry.contextRange) : "";
      return { text, changed: text !== entry.original ||
        (entry.originalContext !== undefined && context !== entry.originalContext), deleted: !text };
    },
  };
}
