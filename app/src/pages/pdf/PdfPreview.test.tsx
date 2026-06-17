import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PdfPreview } from "./PdfPreview";
import * as learningContentApi from "../../shared/api/learningContentApi";

let mockedPageSize = { width: 100, height: 140 };
const pdfGetPageMock = vi.fn(() =>
  Promise.resolve({
    getViewport: ({ scale }: { scale: number }) => ({
      width: mockedPageSize.width * scale,
      height: mockedPageSize.height * scale,
    }),
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

vi.mock("../../shared/api/learningContentApi", () => ({
  deletePdfPageAnnotation: vi.fn(),
  getPdfPageAnnotation: vi.fn(),
  savePdfPageAnnotation: vi.fn(),
}));

const deletePdfPageAnnotationMock = vi.mocked(learningContentApi.deletePdfPageAnnotation);
const getPdfPageAnnotationMock = vi.mocked(learningContentApi.getPdfPageAnnotation);
const savePdfPageAnnotationMock = vi.mocked(learningContentApi.savePdfPageAnnotation);

afterEach(cleanup);

let sourceCounter = 0;

function uniquePdfSourceUrl() {
  sourceCounter += 1;
  return `asset://localhost/C%3A%2Fapp%2Foutline-test-${sourceCounter}.pdf`;
}

function uniqueDataUrl() {
  sourceCounter += 1;
  return `data:application/pdf;base64,${window.btoa(`outline-test-${sourceCounter}`)}`;
}

function largeDataUrl() {
  return `data:application/pdf;base64,${"A".repeat(12 * 1024 * 1024)}`;
}

beforeEach(() => {
  mockedPageSize = { width: 100, height: 140 };
  pdfGetOutlineMock.mockReset();
  deletePdfPageAnnotationMock.mockReset();
  getPdfPageAnnotationMock.mockReset();
  savePdfPageAnnotationMock.mockReset();
  getPdfPageAnnotationMock.mockResolvedValue(null);
  savePdfPageAnnotationMock.mockResolvedValue({
    id: "annotation-1",
    materialId: "mat-pdf",
    pageNumber: 1,
    strokeDataJson: '{"schemaVersion":1,"coordinateSpace":"normalized","strokes":[]}',
    strokeSchemaVersion: 1,
    pageWidth: 100,
    pageHeight: 140,
    createdAt: "2026-06-17T00:00:00Z",
    updatedAt: "2026-06-17T00:00:00Z",
  });
  deletePdfPageAnnotationMock.mockResolvedValue(undefined);
});

describe("PdfPreview 目录接线", () => {
  it("点击目录按钮展开面板并展示大纲条目", async () => {
    const user = userEvent.setup();
    pdfGetOutlineMock.mockResolvedValue([
      { title: "第一章", dest: [{ num: 1 }], items: [] },
    ]);
    render(<PdfPreview sourceUrl={uniquePdfSourceUrl()} />);

    await user.click(screen.getByRole("button", { name: "目录" }));

    expect(await screen.findByRole("button", { name: "第一章" })).toBeInTheDocument();
  });

  it("用 asset URL 加载 PDF，避免大文件整本 base64 解码", async () => {
    pdfGetOutlineMock.mockResolvedValue(null);
    const sourceUrl = uniquePdfSourceUrl();
    const atobSpy = vi.spyOn(window, "atob");
    render(<PdfPreview sourceUrl={sourceUrl} />);

    await screen.findByText("第 1 / 5 页");

    expect(pdfGetDocumentMock).toHaveBeenCalledWith({
      url: sourceUrl,
    });
    expect(atobSpy).not.toHaveBeenCalled();
    atobSpy.mockRestore();
  });

  it("保留 data URL 二进制加载兼容路径", async () => {
    pdfGetOutlineMock.mockResolvedValue(null);
    render(<PdfPreview sourceUrl={uniqueDataUrl()} />);

    await screen.findByText("第 1 / 5 页");

    expect(pdfGetDocumentMock).toHaveBeenCalledWith({
      data: expect.any(Uint8Array),
    });
  });

  it("大型 data URL 不在主线程解码，避免异常 payload 卡死", async () => {
    pdfGetOutlineMock.mockResolvedValue(null);
    const sourceUrl = largeDataUrl();
    const atobSpy = vi.spyOn(window, "atob");
    render(<PdfPreview sourceUrl={sourceUrl} />);

    await screen.findByText("第 1 / 5 页");

    expect(pdfGetDocumentMock).toHaveBeenCalledWith({
      url: sourceUrl,
    });
    expect(atobSpy).not.toHaveBeenCalled();
    atobSpy.mockRestore();
  });

  it("加载真实页数前不显示过期页码和默认总页数的错误组合", async () => {
    pdfGetOutlineMock.mockResolvedValue(null);
    render(<PdfPreview sourceUrl={uniquePdfSourceUrl()} initialPageNumber={8} />);

    expect(screen.queryByText("第 8 / 1 页")).not.toBeInTheDocument();
    expect(screen.getByText("正在加载 PDF")).toBeInTheDocument();
    expect(await screen.findByText("第 5 / 5 页")).toBeInTheDocument();
  });

  it("点击大纲条目跳转到对应页", async () => {
    const user = userEvent.setup();
    pdfGetOutlineMock.mockResolvedValue([
      { title: "第三章", dest: [{ num: 2 }], items: [] },
    ]);
    render(<PdfPreview sourceUrl={uniquePdfSourceUrl()} />);

    await user.click(screen.getByRole("button", { name: "目录" }));
    await user.click(await screen.findByRole("button", { name: "第三章" }));

    expect(await screen.findByText("第 3 / 5 页")).toBeInTheDocument();
  });

  it("无大纲 PDF 展示空状态", async () => {
    const user = userEvent.setup();
    pdfGetOutlineMock.mockResolvedValue(null);
    render(<PdfPreview sourceUrl={uniquePdfSourceUrl()} />);

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
      render(<PdfPreview sourceUrl={uniquePdfSourceUrl()} />);
      await screen.findByText("第 1 / 5 页");

      act(() => {
        resizeCallback?.(
          [{ contentRect: { width: 456 } } as ResizeObserverEntry],
          {} as ResizeObserver,
        );
      });

      // 456px 阅读区减去页面舞台 56px 内边距 → 页面宽 400px（100% = 适应宽度）
      const page = screen.getByLabelText("PDF 页面");
      expect(page.style.width).toBe("400px");
      expect(page.style.height).toBe("560px");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("横版 PDF 页面按真实页面比例适配阅读区", async () => {
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
    mockedPageSize = { width: 160, height: 90 };
    pdfGetOutlineMock.mockResolvedValue(null);

    try {
      render(<PdfPreview sourceUrl={uniquePdfSourceUrl()} />);
      await screen.findByText("第 1 / 5 页");

      act(() => {
        resizeCallback?.(
          [{ contentRect: { width: 696 } } as ResizeObserverEntry],
          {} as ResizeObserver,
        );
      });

      const page = screen.getByLabelText("PDF 页面");
      expect(page.style.width).toBe("640px");
      expect(page.style.height).toBe("360px");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("初始缩放低于阅读下限时按下限打开", async () => {
    pdfGetOutlineMock.mockResolvedValue(null);

    render(
      <PdfPreview
        sourceUrl={uniquePdfSourceUrl()}
        initialScale={0.7}
        minimumInitialScale={1.4}
      />,
    );
    await screen.findByText("第 1 / 5 页");

    expect(screen.getByText("140%")).toBeInTheDocument();
  });

  it("再次点击目录按钮收起面板", async () => {
    const user = userEvent.setup();
    pdfGetOutlineMock.mockResolvedValue([
      { title: "第一章", dest: [{ num: 1 }], items: [] },
    ]);
    render(<PdfPreview sourceUrl={uniquePdfSourceUrl()} />);

    await user.click(screen.getByRole("button", { name: "目录" }));
    await screen.findByRole("button", { name: "第一章" });
    await user.click(screen.getByRole("button", { name: "目录" }));

    expect(screen.queryByRole("button", { name: "第一章" })).not.toBeInTheDocument();
  });

  it("loads PDF page annotations by material and page", async () => {
    pdfGetOutlineMock.mockResolvedValue(null);
    getPdfPageAnnotationMock.mockResolvedValueOnce({
      id: "annotation-1",
      materialId: "mat-pdf",
      pageNumber: 1,
      strokeDataJson:
        '{"schemaVersion":1,"coordinateSpace":"normalized","strokes":[{"id":"s1","tool":"pen","color":"#1f2937","width":0.006,"points":[{"x":0.1,"y":0.2,"t":1}]}]}',
      strokeSchemaVersion: 1,
      pageWidth: 100,
      pageHeight: 140,
      createdAt: "2026-06-17T00:00:00Z",
      updatedAt: "2026-06-17T00:00:00Z",
    });

    render(<PdfPreview sourceUrl={uniquePdfSourceUrl()} materialId="mat-pdf" />);
    await screen.findByText("第 1 / 5 页");

    expect(getPdfPageAnnotationMock).toHaveBeenCalledWith("mat-pdf", 1);
  });

  it("saves dirty annotations before changing pages", async () => {
    const user = userEvent.setup();
    pdfGetOutlineMock.mockResolvedValue(null);
    render(<PdfPreview sourceUrl={uniquePdfSourceUrl()} materialId="mat-pdf" />);
    await screen.findByText("第 1 / 5 页");
    await user.click(screen.getByRole("button", { name: "批注" }));
    const canvas = screen.getByLabelText("手写画布");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 100,
      right: 200,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    canvas.setPointerCapture = vi.fn();
    canvas.releasePointerCapture = vi.fn();

    firePointerStroke(canvas);
    await user.click(screen.getByRole("button", { name: "下一页" }));

    expect(savePdfPageAnnotationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        materialId: "mat-pdf",
        pageNumber: 1,
        pageWidth: 100,
        pageHeight: 140,
        strokeData: expect.stringContaining('"strokes"'),
      }),
    );
    expect(await screen.findByText("第 2 / 5 页")).toBeInTheDocument();
    expect(getPdfPageAnnotationMock).toHaveBeenCalledWith("mat-pdf", 2);
  });

  it("enters annotation mode when the pen tool is clicked", async () => {
    const user = userEvent.setup();
    pdfGetOutlineMock.mockResolvedValue(null);
    render(<PdfPreview sourceUrl={uniquePdfSourceUrl()} materialId="mat-pdf" />);
    await screen.findByText("第 1 / 5 页");

    await user.click(screen.getByRole("button", { name: "笔" }));
    const canvas = screen.getByLabelText("手写画布");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 100,
      right: 200,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    canvas.setPointerCapture = vi.fn();
    canvas.releasePointerCapture = vi.fn();

    firePointerStroke(canvas);
    await user.click(screen.getByRole("button", { name: "下一页" }));

    expect(savePdfPageAnnotationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        materialId: "mat-pdf",
        pageNumber: 1,
        strokeData: expect.stringContaining('"strokes"'),
      }),
    );
  });
});

function firePointerStroke(canvas: HTMLElement) {
  act(() => {
    canvas.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 40,
        clientY: 20,
        pointerId: 1,
        pointerType: "mouse",
      }),
    );
    canvas.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        button: 0,
        clientX: 100,
        clientY: 50,
        pointerId: 1,
        pointerType: "mouse",
      }),
    );
    canvas.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        button: 0,
        clientX: 100,
        clientY: 50,
        pointerId: 1,
        pointerType: "mouse",
      }),
    );
  });
}
