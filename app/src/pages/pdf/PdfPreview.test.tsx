import { cleanup, render, screen } from "@testing-library/react";
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
  return `data:application/pdf;base64,outline-test-${dataUrlCounter}`;
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
