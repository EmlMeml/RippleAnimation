import React, { useMemo } from "react";
import { Node, type Descendant } from "slate";
import type { Inconsistency } from "../../ai/consistencyChecker";
import type { Fact } from "../../types/facts";
import './../../assets/css/editorNav.css';

type NavigationSegment = {
  path: number[];
  characterCount: number;
  hasInconsistency: boolean;
};

type EditorNavigationProps = {
  /**
   * Die aktuelle Slate-Dokumentstruktur.
   * Die Komponente selbst muss nicht innerhalb von <Slate> liegen.
   */
  document: Descendant[];

  /**
   * Inkonsistenzen aus der bestehenden Konsistenzanalyse.
   */
  inconsistencies?: Inconsistency[];

  /**
   * Wird beim Anklicken eines Segments mit dem Slate-Path aufgerufen.
   * Die eigentliche Navigation zum Slate-Element bleibt damit außerhalb
   * dieser rein visuellen Komponente.
   */
  onNavigate?: (path: number[]) => void;

  className?: string;
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
  inconsistencies: Inconsistency[]
): NavigationSegment[] {
  return document
    .map((node, index) => {
      const text = getNodeText(node);

      return {
        path: [index],
        characterCount: text.length,
        hasInconsistency: paragraphHasInconsistency(
          text,
          inconsistencies
        ),
      };
    });
}

export default function EditorNavigation({
  document,
  inconsistencies = [],
  onNavigate,
  className,
}: EditorNavigationProps) {
  const segments = useMemo(
    () =>
      createNavigationSegments(
        document,
        inconsistencies
      ),
    [document, inconsistencies]
  );

  return (
    <nav
      className={
        className ?? "editor-navigation"
      }
      aria-label="Dokumentübersicht"
    >
      <div className="editor-navigation-items">
        {segments.map((segment) => {
          const height = getSegmentHeight(
            segment.characterCount
          );

          return (
            <button
              key={segment.path.join("-")}
              type="button"
              aria-label={
                segment.hasInconsistency
                  ? "Absatz mit Inkonsistenz"
                  : "Absatz"
              }
              className={[
                "editor-navigation-segment",
                segment.hasInconsistency
                  ? "has-inconsistency"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{
                height: `${height}px`,
              }}
              onClick={() =>
                onNavigate?.(segment.path)
              }
            />
          );
        })}
      </div>
    </nav>
  );
}