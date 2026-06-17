import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Prism from "prismjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../shared/api/learningContentApi", () => ({
  copyTextToClipboard: vi.fn(),
}));

import { copyTextToClipboard } from "../../shared/api/learningContentApi";
import type { MaterialPreview } from "../../shared/types";
import { CodePreview } from "./CodePreview";

const copyTextToClipboardMock = vi.mocked(copyTextToClipboard);

beforeEach(() => {
  vi.clearAllMocks();
});

function buildCodePreview(overrides: Partial<MaterialPreview> = {}): MaterialPreview {
  return {
    materialId: "mat-code",
    kind: "code",
    mimeType: "application/x-typescript",
    text: "const value: string = '<script>alert(1)</script>';",
    dataUrl: null,
    assetPath: null,
    encoding: "utf-8",
    language: "typescript",
    languageLabel: "TypeScript",
    lineCount: 1,
    isTruncated: false,
    highlightingMode: "highlight",
    ...overrides,
  };
}

describe("CodePreview", () => {
  it("renders highlighted code with line numbers and metadata", () => {
    render(<CodePreview preview={buildCodePreview()} />);

    expect(screen.getByLabelText("代码预览")).toBeInTheDocument();
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("utf-8")).toBeInTheDocument();
    expect(screen.getByText("1 行")).toBeInTheDocument();
    expect(screen.getByText("const")).toHaveClass("token");
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("treats HTML-looking code as text instead of executable markup", () => {
    render(
      <CodePreview
        preview={buildCodePreview({
          text: "<img src=x onerror=alert(1)>\n</span><script>alert(1)</script>",
          language: "markup",
          languageLabel: "HTML",
        })}
      />,
    );

    expect(screen.getByText("img")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getAllByText("script")).toHaveLength(2);
  });

  it("falls back to plain text when the language is not highlighted", () => {
    render(
      <CodePreview
        preview={buildCodePreview({
          language: null,
          languageLabel: null,
          highlightingMode: "plain_unknown_language",
          text: "[package]\nname = \"studyseq\"",
          lineCount: 2,
        })}
      />,
    );

    expect(screen.getByText("纯文本代码")).toBeInTheDocument();
    expect(screen.getByText("暂不支持该语言高亮，已使用纯文本模式显示。")).toBeInTheDocument();
    expect(screen.getByText("[package]")).toBeInTheDocument();
  });

  it("shows truncation and large-file plain mode notices", () => {
    render(
      <CodePreview
        preview={buildCodePreview({
          highlightingMode: "plain_too_large",
          isTruncated: true,
          text: "print('large')",
          language: "python",
          languageLabel: "Python",
        })}
      />,
    );

    expect(screen.getByText("文件较大，已截断显示前 2MB 或前 20000 行。")).toBeInTheDocument();
    expect(screen.getByText("文件较大，已使用纯文本模式显示。")).toBeInTheDocument();
  });

  it("copies code text through the clipboard button", async () => {
    copyTextToClipboardMock.mockResolvedValueOnce(undefined);

    render(<CodePreview preview={buildCodePreview({ text: "console.log(42);" })} />);
    await userEvent.click(screen.getByRole("button", { name: "复制" }));

    expect(copyTextToClipboardMock).toHaveBeenCalledWith("console.log(42);");
    expect(screen.getByRole("button", { name: "已复制" })).toBeInTheDocument();
  });

  it("falls back to plain text when Prism tokenization fails", () => {
    const tokenize = vi.spyOn(Prism, "tokenize").mockImplementationOnce(() => {
      throw new Error("tokenize failed");
    });

    render(<CodePreview preview={buildCodePreview({ text: "const broken = true;" })} />);

    expect(screen.getByText("const broken = true;")).toBeInTheDocument();
    expect(document.querySelector(".code-preview .token")).not.toBeInTheDocument();
    tokenize.mockRestore();
  });
});
