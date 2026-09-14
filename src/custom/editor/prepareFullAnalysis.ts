import { Editor, Text, Transforms } from "slate";

/** Start a new review of the current visible text, preserving ordinary formatting. */
export function prepareFullAnalysis(editor: Editor): void {
  Editor.withoutNormalizing(editor, () => {
    // Remove historical deletion leaves, which are already excluded from the AI input.
    for (const [node, path] of Array.from(Editor.nodes(editor, { at: [], match: Text.isText })).reverse()) {
      if (Text.isText(node) && node.changeType === "deletion") {
        Transforms.removeNodes(editor, { at: path });
      }
    }
    Transforms.unsetNodes(editor,
      ["changeId", "changeType", "changeAccepted", "confirmedCorrect", "reopenedInconsistencyId", "inconsistent"],
      { at: [], match: Text.isText },
    );
    // New typing must not inherit a previous confirmation from the selection.
    if (editor.marks) {
      const marks = { ...editor.marks };
      delete marks.changeId;
      delete marks.changeType;
      delete marks.changeAccepted;
      delete marks.confirmedCorrect;
      delete marks.reopenedInconsistencyId;
      delete marks.inconsistent;
      editor.marks = marks;
    }
  });
}
