import type { ReactNode } from "react";

import Prism from "prismjs";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-css";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-json";
import "prismjs/components/prism-python";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-go";
import "prismjs/components/prism-java";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-yaml";

import { canHighlightCode } from "./codeLanguages";

type PrismToken = string | Prism.Token;
type HighlightSegment = {
  text: string;
  className: string | null;
};

export function renderHighlightedCodeLines(
  code: string,
  language: string | null,
): ReactNode[][] | null {
  if (!canHighlightCode(language)) return null;
  if (language === null) return null;

  const grammar = Prism.languages[language];
  if (!grammar) return null;

  try {
    return renderSegmentLines(flattenTokens(Prism.tokenize(code, grammar)));
  } catch {
    return null;
  }
}

function flattenTokens(tokens: PrismToken[], inheritedClasses: string[] = []): HighlightSegment[] {
  return tokens.flatMap((token) => flattenToken(token, inheritedClasses));
}

function flattenToken(token: PrismToken, inheritedClasses: string[]): HighlightSegment[] {
  if (typeof token === "string") {
    return [{ text: token, className: classNameFromParts(inheritedClasses) }];
  }

  const tokenClasses = Array.isArray(token.alias)
    ? ["token", token.type, ...token.alias]
    : ["token", token.type, token.alias].filter(Boolean);
  const classes = dedupeClasses([...inheritedClasses, ...tokenClasses]);

  if (typeof token.content === "string") {
    return [{ text: token.content, className: classNameFromParts(classes) }];
  }

  if (Array.isArray(token.content)) {
    return flattenTokens(token.content as PrismToken[], classes);
  }

  return flattenToken(token.content as Prism.Token, classes);
}

function renderSegmentLines(segments: HighlightSegment[]): ReactNode[][] {
  const lines: HighlightSegment[][] = [[]];
  for (const segment of segments) {
    const parts = segment.text.split(/\r\n|\n|\r/);
    parts.forEach((part, index) => {
      if (index > 0) {
        lines.push([]);
      }
      if (part.length > 0) {
        lines[lines.length - 1].push({ ...segment, text: part });
      }
    });
  }

  return lines.map((line, lineIndex) =>
    line.map((segment, segmentIndex) =>
      segment.className ? (
        <span className={segment.className} key={`${lineIndex}-${segmentIndex}`}>
          {segment.text}
        </span>
      ) : (
        segment.text
      ),
    ),
  );
}

function classNameFromParts(parts: string[]) {
  return parts.length > 0 ? dedupeClasses(parts).join(" ") : null;
}

function dedupeClasses(parts: (string | null | undefined)[]) {
  return [...new Set(parts.filter((part): part is string => Boolean(part)))];
}
