import React, { useMemo } from "react";
import { Node, type Descendant,Element as SlateElement } from "slate";
import type { Inconsistency } from "../../ai/consistencyChecker";
import type { Fact } from "../../types/facts";
import './../../assets/css/editorNav.css';

type NavigationSegment = {
  path: number[];
  characterCount: number;
  hasInconsistency: boolean;
};

type EditorNavigationProps = {
  document: Descendant[];
  inconsistentPaths: number[][];
  onNavigate: (path: number[]) => void;
};

const MIN_HEIGHT = 12;
const MAX_HEIGHT = 140;
const HEIGHT_PER_CHARACTER = 0.35;

function getSegmentHeight(characterCount: number): number {
  return Math.min(
    MAX_HEIGHT,
    Math.max(
      MIN_HEIGHT,
      characterCount * HEIGHT_PER_CHARACTER
    )
  );
}

function getNodeText(node: Descendant): string {
  return Node.string(node).replace(/\s+/g, " ").trim();
}

function getFactText(fact: Fact): string[] {
  const values: string[] = [];

  if (fact.subject !== undefined && fact.subject !== null) {
    values.push(String(fact.subject));
  }

  if (fact.object !== undefined && fact.object !== null) {
    values.push(String(fact.object));
  }

  if (fact.value !== undefined && fact.value !== null) {
    values.push(String(fact.value));
  }

  return values
    .map((value) => value.trim())
    .filter(Boolean);
}

function paragraphContainsFact(
  paragraphText: string,
  fact: Fact
): boolean {
  const normalizedParagraph = paragraphText.toLowerCase();

  return getFactText(fact).some((factText) =>
    normalizedParagraph.includes(factText.toLowerCase())
  );
}

function paragraphHasInconsistency(
  paragraphText: string,
  inconsistencies: Inconsistency[]
): boolean {
  if (!paragraphText) {
    return false;
  }

  return inconsistencies.some((inconsistency) =>
    inconsistency.facts.some((fact) =>
      paragraphContainsFact(paragraphText, fact)
    )
  );
}

function createNavigationSegments(
  document: Descendant[],
  inconsistentPaths: number[][]
): NavigationSegment[] {
  const inconsistentPathSet = new Set(
    inconsistentPaths.map((path) =>
      path.join(".")
    )
  );

  const items: NavigationSegment[] = [];

  document.forEach((node, index) => {
    if (!SlateElement.isElement(node)) {
      return;
    }

    if (
      node.type !== "paragraph" &&
      node.type !== "heading-one"
    ) {
      return;
    }

    const text = getNodeText(node);
    const path = [index];

    items.push({
      path,
      characterCount: text.length,
      hasInconsistency: inconsistentPathSet.has(
        path.join(".")
      ),
    });
  });

  return items;
}
export default function EditorNavigation({
  document,
  inconsistentPaths,
  onNavigate,
}: EditorNavigationProps) {
  const items = useMemo(
    () =>
      createNavigationSegments(
        document,
        inconsistentPaths
      ),
    [document, inconsistentPaths]
  );

  return (
    <nav
      className="editor-navigation"
      aria-label="Dokumentübersicht"
    >
      <div className="editor-navigation-items">
        {items.map((item) => {
          const height = getSegmentHeight(
            item.characterCount
          );

          return (
            <button
              key={item.path.join("-")}
              type="button"
              className={[
                "editor-navigation-segment",
                item.hasInconsistency
                  ? "has-inconsistency"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{
                height: `${height}px`,
              }}
              onClick={() => onNavigate(item.path)}
            />
          );
        })}
      </div>
    </nav>
  );
}