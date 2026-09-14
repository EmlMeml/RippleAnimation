import { describe, expect, it } from "vitest";
import { createEditor, Editor, Transforms } from "slate";
import { withHistory } from "slate-history";
import { createPassageAnchors, getPassageNavigationRange } from "./passageAnchors";

function setup() {
  const editor = withHistory(createEditor());
  editor.children = [
    { type: "paragraph", children: [{ text: "Anna is 28 years old." }] },
    { type: "paragraph", children: [{ text: "Anna is 30 years old." }] },
  ];
  const anchors = createPassageAnchors(editor);
  const apply = editor.apply;
  editor.apply = (op) => { anchors.transform(op); apply(op); };
  anchors.add("age", {
    anchor: { path: [1, 0], offset: 8 }, focus: { path: [1, 0], offset: 10 },
  }, {});
  const entry = anchors.entries.get("age")!;
  return { editor, anchors, entry };
}

describe("persistent passage anchors", () => {
  it.each(["occupation", "parent_of", "owns", "knowledge", "belief", "memory"])(
    "keeps a marker/navigation location and changed status for %s after direct deletion", (kind) => {
      const editor = withHistory(createEditor());
      editor.children = [{ type: "paragraph", children: [
        { text: "Earlier context. Alice " },
        { text: "disagrees", bold: true },
        { text: " with the earlier statement." },
      ] }];
      const anchors = createPassageAnchors(editor);
      const apply = editor.apply;
      editor.apply = (operation) => { anchors.transform(operation); apply(operation); };
      anchors.add(kind, Editor.range(editor, [0, 1]), { kind }, Editor.range(editor, [0]));
      const entry = anchors.entries.get(kind)!;
      Transforms.delete(editor, { at: entry.range! });
      expect(anchors.read(entry).changed).toBe(true);
      expect(anchors.read(entry).deleted).toBe(true);
      const markerRange = getPassageNavigationRange(editor, entry);
      expect(markerRange).not.toBeNull();
      expect(Editor.string(editor, markerRange!)).toContain("with the earlier statement");
      editor.undo();
      expect(anchors.read(entry).changed).toBe(false);
      expect(Editor.string(editor, getPassageNavigationRange(editor, entry)!)).toBe("disagrees");
    },
  );

  it("keeps a collapsed navigation position after the entire quoted sentence is deleted", () => {
    const editor = withHistory(createEditor());
    editor.children = [{ type: "paragraph", children: [{ text: "Alice knew the answer." }] }];
    const anchors = createPassageAnchors(editor);
    const apply = editor.apply;
    editor.apply = (operation) => { anchors.transform(operation); apply(operation); };
    anchors.add("character", Editor.range(editor, [0]), {}, Editor.range(editor, [0]));
    const entry = anchors.entries.get("character")!;
    Transforms.delete(editor, { at: entry.range! });
    expect(anchors.read(entry).deleted).toBe(true);
    expect(getPassageNavigationRange(editor, entry)).not.toBeNull();
  });

  it("navigates to the surviving sentence after the marked Location is deleted", () => {
    const editor = withHistory(createEditor());
    editor.children = [
      { type: "paragraph", children: [{ text: "Document start." }] },
      { type: "paragraph", children: [{ text: "Alice was born in Bellwick." }] },
    ];
    const anchors = createPassageAnchors(editor);
    const apply = editor.apply;
    editor.apply = (operation) => { anchors.transform(operation); apply(operation); };
    anchors.add("location", {
      anchor: { path: [1, 0], offset: 18 }, focus: { path: [1, 0], offset: 26 },
    }, {}, Editor.range(editor, [1]));
    const entry = anchors.entries.get("location")!;
    Transforms.delete(editor, { at: entry.range! });
    expect(anchors.read(entry).deleted).toBe(true);
    const target = getPassageNavigationRange(editor, entry)!;
    expect(target.anchor.path[0]).toBe(1);
    expect(Editor.string(editor, target)).toBe("Alice was born in .");
    editor.undo();
    expect(Editor.string(editor, getPassageNavigationRange(editor, entry)!)).toBe("Bellwick");
  });

  it("has no fake document-start navigation target after a whole paragraph is removed", () => {
    const { editor, entry } = setup();
    Transforms.removeNodes(editor, { at: [1] });
    expect(getPassageNavigationRange(editor, entry)).toBeNull();
    editor.undo();
    expect(getPassageNavigationRange(editor, entry)?.anchor.path[0]).toBe(1);
  });
  it("follows text inserted before a passage without marking it changed", () => {
    const { editor, anchors, entry } = setup();
    Transforms.insertText(editor, "Later, ", { at: { path: [1, 0], offset: 0 } });
    expect(entry.range?.anchor.offset).toBe(15);
    expect(anchors.read(entry)).toEqual({ text: "30", changed: false, deleted: false });
  });

  it("keeps a replacement attached and resets its status on undo", () => {
    const { editor, anchors, entry } = setup();
    Transforms.insertText(editor, "31", { at: entry.range! });
    expect(anchors.read(entry)).toEqual({ text: "31", changed: true, deleted: false });
    editor.undo();
    expect(anchors.read(entry)).toEqual({ text: "30", changed: false, deleted: false });
    editor.redo();
    expect(anchors.read(entry).text).toBe("31");
  });

  it("retains a completely deleted passage", () => {
    const { editor, anchors, entry } = setup();
    Transforms.delete(editor, { at: entry.range! });
    expect(anchors.entries.size).toBe(1);
    expect(anchors.read(entry)).toEqual({ text: "", changed: true, deleted: true });
    editor.undo();
    expect(anchors.read(entry).changed).toBe(false);
  });

  it("restores a removed paragraph on undo and supports redo", () => {
    const { editor, anchors, entry } = setup();
    Transforms.removeNodes(editor, { at: [1] });
    expect(entry.range).toBeNull();
    expect(anchors.read(entry).deleted).toBe(true);
    editor.undo();
    expect(anchors.read(entry).text).toBe("30");
    editor.redo();
    expect(entry.range).toBeNull();
  });

  it("follows paragraph insertion and removal before the passage", () => {
    const { editor, anchors, entry } = setup();
    Transforms.removeNodes(editor, { at: [0] });
    expect(entry.range?.anchor.path).toEqual([0, 0]);
    expect(anchors.read(entry).changed).toBe(false);
    editor.undo();
    expect(entry.range?.anchor.path).toEqual([1, 0]);
  });

  it("keeps the passage through a paragraph split and merge", () => {
    const { editor, anchors, entry } = setup();
    Transforms.splitNodes(editor, { at: { path: [1, 0], offset: 5 } });
    expect(entry.range?.anchor.path[0]).toBe(2);
    expect(anchors.read(entry).text).toBe("30");
    editor.undo();
    expect(anchors.read(entry).changed).toBe(false);
  });

  it("handles a passage spanning formatted leaves", () => {
    const { editor, anchors, entry } = setup();
    Transforms.setNodes(editor, { bold: true }, {
      at: { anchor: { path: [1, 0], offset: 9 }, focus: { path: [1, 0], offset: 10 } },
      match: (node) => "text" in node, split: true,
    });
    expect(Editor.string(editor, entry.range!)).toBe("30");
    expect(anchors.read(entry).changed).toBe(false);
  });

  it("clears old anchors when a new document or analysis starts", () => {
    const { editor, anchors } = setup();
    Transforms.removeNodes(editor, { at: [1] });
    anchors.clear();
    editor.undo();
    expect(anchors.entries.size).toBe(0);
  });

  it("notices edits to the surrounding sentence even if the fact is unchanged", () => {
    const { editor, anchors } = setup();
    anchors.add("sentence", {
      anchor: { path: [1, 0], offset: 8 }, focus: { path: [1, 0], offset: 10 },
    }, {}, Editor.range(editor, [1]));
    const entry = anchors.entries.get("sentence")!;
    Transforms.insertText(editor, "really ", { at: { path: [1, 0], offset: 5 } });
    expect(anchors.read(entry).text).toBe("30");
    expect(anchors.read(entry).changed).toBe(true);
    editor.undo();
    expect(anchors.read(entry).changed).toBe(false);
  });

  it("does not attach a removed passage to another identical occurrence", () => {
    const { editor, anchors, entry } = setup();
    Transforms.insertNodes(editor, {
      type: "paragraph", children: [{ text: "Anna is 30 years old." }],
    }, { at: [2] });
    Transforms.removeNodes(editor, { at: [1] });
    expect(entry.range).toBeNull();
    expect(anchors.read(entry).deleted).toBe(true);
    expect(Editor.string(editor, [1])).toContain("30");
  });
});
