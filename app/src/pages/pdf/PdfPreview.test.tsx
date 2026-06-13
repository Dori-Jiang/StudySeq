import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PdfPreview } from "./PdfPreview";

const pdfGetPageMock = vi.fn(() =>
  Promise.resolve({
    getViewport: () => ({ width: 100, height: 140 }),
    render: () => ({ promise: Promise.resolve() }),
  }),
);
const pdfGetOutlineMock = vi.fn();
const pdfGetPageIndexMock = vi.fn((ref: unknown) =>
  Promise.resolve((ref as { num: number }).num),
);
const pdfGetDocumentMock = vi.fn(() => ({
  promise: Promise.resolve({
    numPages: 5,
    getPage: pdfGetPageMock,
    getOutline: pdfGetOutlineMock,
    getPageIndex: pdfGetPageIndexMock,
  }),
}));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {
    workerSrc: "",
  },
  getDocument: pdfGetDocumentMock,
}));

afterEach(cleanup);

let dataUrlCounter = 0;

function uniqueDataUrl() {
  dataUrlCounter += 1;
  return `data:application/pdf;base64,${window.btoa(`outline-test-${dataUrlCounter}`)}`;
}

beforeEach(() => {
  pdfGetOutlineMock.mockReset();
});

describe("PdfPreview 目录接线", () => {
  it("点击目录按钮展开面板并展示大纲条目", async () => {
    const user = userEvent.setup();
    pdfGetOutlineMock.mockResolvedValue([
      { title: "第一章", dest: [{ num: 1 }], items: [] },
    ]);
    render(<PdfPreview dataUrl={uniqueDataUrl()} />);

    await user.click(screen.getByRole("button", { name: "目录" }));

    expect(await screen.findByRole("button", { name: "第一章" })).toBeInTheDocument();
  });

  it("用二进制数据加载 data URL，避免 PDF 读取被 CSP connect-src 拦截", async () => {
    pdfGetOutlineMock.mockResolvedValue(null);
    render(<PdfPreview dataUrl={uniqueDataUrl()} />);

    await screen.findByText("第 1 / 5 页");

    expect(pdfGetDocumentMock).toHaveBeenCalledWith({
      data: expect.any(Uint8Array),
    });
  });

  it("加载真实页数前不显示过期页码和默认总页数的错误组合", async () => {
    pdfGetOutlineMock.mockResolvedValue(null);
    render(<PdfPreview dataUrl={uniqueDataUrl()} initialPageNumber={8} />);

    expect(screen.queryByText("第 8 / 1 页")).not.toBeInTheDocument();
    expect(screen.getByText("正在加载 PDF")).toBeInTheDocument();
    expect(await screen.findByText("第 5 / 5 页")).toBeInTheDocument();
  });

  it("点击大纲条目跳转到对应页", async () => {
    const user = userEvent.setup();
    pdfGetOutlineMock.mockResolvedValue([
      { title: "第三章", dest: [{ num: 2 }], items: [] },
    ]);
    render(<PdfPreview dataUrl={uniqueDataUrl()} />);

    await user.click(screen.getByRole("button", { name: "目录" }));
    await user.click(await screen.findByRole("button", { name: "第三章" }));

    expect(await screen.findByText("第 3 / 5 页")).toBeInTheDocument();
  });

  it("无大纲 PDF 展示空状态", async () => {
    const user = userEvent.setup();
    pdfGetOutlineMock.mockResolvedValue(null);
    render(<PdfPreview dataUrl={uniqueDataUrl()} />);

    await user.click(screen.getByRole("button", { name: "目录" }));

    expect(await screen.findByText("该 PDF 没有目录")).toBeInTheDocument();
  });

  it("阅读区变窄时 PDF 页面按适应宽度缩小", async () => {
    let resizeCallback: ResizeObserverCallback | null = null;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }

        observe() {}

        unobserve() {}

        disconnect() {}
      },
    );
    pdfGetOutlineMock.mockResolvedValue(null);

    try {
      render(<PdfPreview dataUrl={uniqueDataUrl()} />);

      act(() => {
        resizeCallback?.(
          [{ contentRect: { width: 456 } } as ResizeObserverEntry],
          {} as ResizeObserver,
        );
      });

      // 456px 阅读区减去页面舞台 56px 内边距 → 页面宽 400px（100% = 适应宽度）
      expect(screen.getByLabelText("A4 PDF 页面").style.width).toBe("400px");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("再次点击目录按钮收起面板", async () => {
    const user = userEvent.setup();
    pdfGetOutlineMock.mockResolvedValue([
      { title: "第一章", dest: [{ num: 1 }], items: [] },
    ]);
    render(<PdfPreview dataUrl={uniqueDataUrl()} />);

    await user.click(screen.getByRole("button", { name: "目录" }));
    await screen.findByRole("button", { name: "第一章" });
    await user.click(screen.getByRole("button", { name: "目录" }));

    expect(screen.queryByRole("button", { name: "第一章" })).not.toBeInTheDocument();
  });
});
