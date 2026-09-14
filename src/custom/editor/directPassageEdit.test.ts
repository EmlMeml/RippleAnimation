import { describe, expect, it } from "vitest";
import { createEditor, Editor, Transforms } from "slate";
import { withHistory } from "slate-history";
import { createPassageAnchors } from "./passageAnchors";
import { captureDirectPassageEdit } from "./directPassageEdit";
import { getEditorText } from "./getEditorText";

function setup() {
  const editor = withHistory(createEditor());
  editor.children = [{ type: "paragraph", children: [{ text: "Alice was 20 years old." }] }];
  const anchors = createPassageAnchors(editor);
  const apply = editor.apply;
  editor.apply = (operation) => { anchors.transform(operation); apply(operation); };
  anchors.add("age", { anchor: { path: [0, 0], offset: 10 }, focus: { path: [0, 0], offset: 12 } }, {}, Editor.range(editor, [0]));
  return { editor, anchor: anchors.entries.get("age")! };
}

describe("direct edit tracking snapshots", () => {
  it("retains old and new text after the successful recheck resets the baseline", () => {
    const { editor, anchor } = setup();
    Transforms.insertText(editor, "39", { at: anchor.range! });
    const snapshot = captureDirectPassageEdit(editor, anchor)!;
    anchor.original = "39";
    anchor.originalContext = Editor.string(editor, anchor.contextRange!);
    expect(captureDirectPassageEdit(editor, anchor)).toBeNull();
    expect(snapshot.before).toBe("Alice was 20 years old.");
    expect(snapshot.after).toBe("Alice was 39 years old.");
  });

  it("does not inject deleted history into text sent to the AI", () => {
    const { editor, anchor } = setup();
    Transforms.insertText(editor, "39", { at: anchor.range! });
    const current = getEditorText(editor.children);
    captureDirectPassageEdit(editor, anchor);
    expect(getEditorText(editor.children)).toBe(current);
    expect(current).not.toContain("20");
  });

  it("records a deletion, including deletion of the entire source paragraph", () => {
    const { editor, anchor } = setup();
    Transforms.removeNodes(editor, { at: [0] });
    expect(captureDirectPassageEdit(editor, anchor)).toEqual({ before: "Alice was 20 years old.", after: "", range: null });
  });

  it("does not show a change after undo restores the original text", () => {
    const { editor, anchor } = setup();
    Transforms.insertText(editor, "39", { at: anchor.range! });
    expect(captureDirectPassageEdit(editor, anchor)).not.toBeNull();
    editor.undo();
    expect(captureDirectPassageEdit(editor, anchor)).toBeNull();
  });

  it("keeps later edits separate from an immutable earlier snapshot", () => {
    const { editor, anchor } = setup();
    Transforms.insertText(editor, "39", { at: anchor.range! });
    const first = captureDirectPassageEdit(editor, anchor)!;
    anchor.original = "39";
    anchor.originalContext = first.after;
    Transforms.insertText(editor, "40", { at: anchor.range! });
    const second = captureDirectPassageEdit(editor, anchor)!;
    expect(first.after).toBe("Alice was 39 years old.");
    expect(second.before).toBe(first.after);
    expect(second.after).toBe("Alice was 40 years old.");
  });
});
