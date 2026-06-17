import { useMemo, useState } from "react";

import { copyTextToClipboard } from "../../shared/api/learningContentApi";
import type { MaterialPreview } from "../../shared/types";
import { renderHighlightedCodeLines } from "./codeHighlighter";

type CopyState = "idle" | "copied" | "failed";

export function CodePreview({ preview }: { preview: MaterialPreview }) {
  const code = preview.text ?? "";
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const shouldHighlight = preview.highlightingMode === "highlight";
  const lines = useMemo(() => splitCodeLines(code), [code]);
  const highlightedLines = useMemo(
    () => (shouldHighlight ? renderHighlightedCodeLines(code, preview.language) : null),
    [code, preview.language, shouldHighlight],
  );

  async function copyCode() {
    try {
      await copyTextToClipboard(code);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  const isPlain = highlightedLines === null || highlightedLines.some((line) => line === null);

  return (
    <section className="code-preview" aria-label="代码预览">
      <header className="code-preview-header">
        <div className="code-preview-meta">
          <span className="code-preview-language">{preview.languageLabel ?? "纯文本代码"}</span>
          {preview.encoding ? <span>{preview.encoding}</span> : null}
          {preview.lineCount !== null ? <span>{preview.lineCount} 行</span> : null}
        </div>
        <button className="secondary-button compact-button" type="button" onClick={copyCode}>
          {copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制"}
        </button>
      </header>

      {preview.isTruncated ? (
        <p className="code-preview-notice">文件较大，已截断显示前 2MB 或前 20000 行。</p>
      ) : null}
      {isPlain && preview.highlightingMode !== "highlight" ? (
        <p className="code-preview-notice">{plainModeMessage(preview.highlightingMode)}</p>
      ) : null}

      <div className="code-preview-scroll">
        <pre className={`code-preview-body ${isPlain ? "code-preview-body-plain" : ""}`}>
          <code>
            {lines.map((line, index) => (
              <span className="code-preview-line" key={index}>
                <span className="code-preview-line-number" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="code-preview-line-content">
                  {highlightedLines?.[index] ?? (line || " ")}
                </span>
              </span>
            ))}
          </code>
        </pre>
      </div>
    </section>
  );
}

function splitCodeLines(code: string) {
  const lines = code.split(/\r\n|\n|\r/);
  return lines.length > 0 ? lines : [""];
}

function plainModeMessage(mode: MaterialPreview["highlightingMode"]) {
  if (mode === "plain_too_large") return "文件较大，已使用纯文本模式显示。";
  if (mode === "plain_decode_lossy") return "编码识别不完全可靠，已使用纯文本模式显示。";
  if (mode === "plain_unknown_language") return "暂不支持该语言高亮，已使用纯文本模式显示。";
  return "已使用纯文本模式显示。";
}
