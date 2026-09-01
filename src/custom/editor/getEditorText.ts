import { Text, type Descendant } from "slate";

function getNodeText(node: Descendant): string {
  if (Text.isText(node)) {
    return node.changeType === "deletion" ? "" : node.text;
  }

  return node.children.map(getNodeText).join("");
}

export function getEditorText(nodes: Descendant[]): string {
  return nodes.map(getNodeText).join("\n");
}
