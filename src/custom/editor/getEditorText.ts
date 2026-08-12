import type { Descendant } from "slate";

export function getEditorText(nodes: Descendant[]): string {
  return nodes
    .map((node) => {
      if ("children" in node) {
        return node.children
          .map((child) => {
            if ("text" in child) {
              return child.text;
            }

            return "";
          })
          .join("");
      }

      return "";
    })
    .join("\n");
}