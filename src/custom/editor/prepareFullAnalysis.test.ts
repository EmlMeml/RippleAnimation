import { describe, expect, it } from "vitest";
import { createEditor, Node, Text, Transforms } from "slate";
import { prepareFullAnalysis } from "./prepareFullAnalysis";
import { getEditorText } from "./getEditorText";
import { getFactValuePattern } from "./factTextMatching";

describe("full analysis starts a fresh passage review", () => {
  it("makes both ages searchable again after replacement and Looks good", () => {
    const editor = createEditor();
    editor.children = [
      { type: "paragraph", children: [
        { text: "Alice was " },
        { text: "thirty-two", changeType: "deletion", changeId: "old-change", changeAccepted: true },
        { text: "20", changeType: "insertion", changeId: "old-change", changeAccepted: true },
        { text: " years old." },
      ] },
      { type: "paragraph", children: [
        { text: "Alice was " },
        { text: "thirty-nine", confirmedCorrect: true, changeId: "old-confirmation", changeAccepted: true },
        { text: " years old." },
      ] },
    ];
    const before = getEditorText(editor.children);
    prepareFullAnalysis(editor);
    expect(getEditorText(editor.children)).toBe(before);
    expect(Node.string(editor)).not.toContain("thirty-two");
    for (const age of [20, 39]) {
      const matches = [...Node.texts(editor)].filter(([leaf]) =>
        !leaf.confirmedCorrect && !leaf.changeType && getFactValuePattern(age)!.test(leaf.text)
      );
      expect(matches).toHaveLength(1);
    }
  });

  it("preserves formatting and links while removing old review metadata", () => {
    const editor = createEditor();
    editor.isInline = (node) => node.type === "link";
    editor.children = [{ type: "paragraph", children: [
      { text: "Alice ", bold: true, confirmedCorrect: true },
      { type: "link", url: "https://example.com", children: [{ text: "39", italic: true, changeType: "insertion" }] },
      { text: "." },
    ] }];
    prepareFullAnalysis(editor);
    const leaves = [...Node.texts(editor)].map(([leaf]) => leaf);
    expect(leaves).toContainEqual({ text: "Alice ", bold: true });
    expect(leaves).toContainEqual({ text: "39", italic: true });
    expect(JSON.stringify(editor.children)).toContain("https://example.com");
  });

  it("does not propagate a prior confirmation into new typing", () => {
    const editor = createEditor();
    editor.children = [{ type: "paragraph", children: [{ text: "Alice was " }] }];
    Transforms.select(editor, { path: [0, 0], offset: 10 });
    editor.marks = { bold: true, confirmedCorrect: true, changeId: "old" };
    prepareFullAnalysis(editor);
    editor.insertText("39");
    expect([...Node.texts(editor)].some(([leaf]) => leaf.confirmedCorrect || leaf.changeId)).toBe(false);
    expect([...Node.texts(editor)].some(([leaf]) => leaf.text === "39" && leaf.bold)).toBe(true);
  });

  it("leaves an editable empty paragraph when only historical deleted text remains", () => {
    const editor = createEditor();
    editor.children = [{ type: "paragraph", children: [{ text: "old", changeType: "deletion" }] }];
    prepareFullAnalysis(editor);
    expect(editor.children).toEqual([{ type: "paragraph", children: [{ text: "" }] }]);
    expect(Text.isText(Node.get(editor, [0, 0]))).toBe(true);
  });

  it("is repeatable for Analyze Text results served from the cache too", () => {
    const editor = createEditor();
    editor.children = [{ type: "paragraph", children: [{ text: "39", confirmedCorrect: true }] }];
    prepareFullAnalysis(editor);
    const clean = structuredClone(editor.children);
    prepareFullAnalysis(editor);
    expect(editor.children).toEqual(clean);
  });
});
