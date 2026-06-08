import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StudyReaderPage } from "./StudyReaderPage";
import * as learningContentApi from "../shared/api/learningContentApi";

vi.mock("../shared/api/learningContentApi");
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {
    workerSrc: "",
  },
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 3,
      getPage: vi.fn(() =>
        Promise.resolve({
          getViewport: vi.fn(({ scale }: { scale: number }) => ({
            width: 100 * scale,
            height: 120 * scale,
          })),
          render: vi.fn(() => ({ promise: Promise.resolve() })),
        }),
      ),
    }),
  })),
}));

const getLearningDetail = vi.mocked(learningContentApi.getLearningDetail);
const getReadingState = vi.mocked(learningContentApi.getReadingState);
const previewMaterialFile = vi.mocked(learningContentApi.previewMaterialFile);
const updateNote = vi.mocked(learningContentApi.updateNote);
const createNote = vi.mocked(learningContentApi.createNote);
const deleteNote = vi.mocked(learningContentApi.deleteNote);
const saveReadingState = vi.mocked(learningContentApi.saveReadingState);

const baseDetail = {
  learningContent: {
    id: "study-1",
    name: "Rust 入门",
    status: "planned" as const,
    deadline: null,
    estimatedHours: 10,
    progress: 20,
    createdAt: "2026-06-08T00:00:00Z",
    updatedAt: "2026-06-08T00:00:00Z",
    lastOpenedAt: null,
  },
  materials: [
    {
      id: "mat-1",
      learningContentId: "study-1",
      name: "资料.txt",
      originalPath: "C:/source/资料.txt",
      storedPath: "C:/app/资料.txt",
      mimeType: "text/plain",
      sizeBytes: 12,
      createdAt: "2026-06-08T00:00:00Z",
      updatedAt: "2026-06-08T00:00:00Z",
    },
    {
      id: "mat-2",
      learningContentId: "study-1",
      name: "图片.png",
      originalPath: "C:/source/图片.png",
      storedPath: "C:/app/图片.png",
      mimeType: "image/png",
      sizeBytes: 4,
      createdAt: "2026-06-08T00:01:00Z",
      updatedAt: "2026-06-08T00:01:00Z",
    },
  ],
  notes: [
    {
      id: "note-1",
      learningContentId: "study-1",
      title: "第一条笔记",
      body: "旧正文",
      createdAt: "2026-06-08T00:00:00Z",
      updatedAt: "2026-06-08T00:00:00Z",
    },
    {
      id: "note-2",
      learningContentId: "study-1",
      title: "第二条笔记",
      body: "第二条正文",
      createdAt: "2026-06-08T00:02:00Z",
      updatedAt: "2026-06-08T00:02:00Z",
    },
  ],
};

describe("StudyReaderPage", () => {
  beforeEach(() => {
    getLearningDetail.mockReset();
    getReadingState.mockReset();
    previewMaterialFile.mockReset();
    updateNote.mockReset();
    createNote.mockReset();
    deleteNote.mockReset();
    saveReadingState.mockReset();
    saveReadingState.mockResolvedValue({
      learningContentId: "study-1",
      currentMaterialId: "mat-1",
      currentNoteId: "note-1",
      splitRatio: 55,
      updatedAt: "2026-06-08T00:00:00Z",
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      { clearRect: vi.fn() } as unknown as CanvasRenderingContext2D,
    );
  });

  it("previews selected material and restores note selection from reading state", async () => {
    getLearningDetail.mockResolvedValueOnce(baseDetail);
    getReadingState.mockResolvedValueOnce({
      learningContentId: "study-1",
      currentMaterialId: "mat-2",
      currentNoteId: "note-1",
      splitRatio: 58,
      updatedAt: "2026-06-08T00:00:00Z",
    });
    previewMaterialFile.mockResolvedValueOnce({
      materialId: "mat-2",
      kind: "image",
      mimeType: "image/png",
      text: null,
      dataUrl: "data:image/png;base64,AAAA",
      encoding: null,
    });

    renderReaderPage("/studies/study-1/read");

    expect(await screen.findByText("Rust 入门")).toBeInTheDocument();
    expect(await screen.findByAltText("图片.png")).toHaveAttribute(
      "src",
      "data:image/png;base64,AAAA",
    );
    expect(screen.getByLabelText("选择笔记")).toHaveValue("note-1");
    await waitFor(() => {
      expect(screen.getByLabelText("笔记正文")).toHaveValue("旧正文");
    });
    expect(saveReadingState).toHaveBeenCalledWith({
      learningContentId: "study-1",
      currentMaterialId: "mat-2",
      currentNoteId: "note-1",
      splitRatio: 58,
    });
  });

  it("edits the selected plain-text note", async () => {
    getLearningDetail.mockResolvedValueOnce(baseDetail);
    getReadingState.mockResolvedValueOnce(null);
    previewMaterialFile.mockResolvedValueOnce({
      materialId: "mat-1",
      kind: "text",
      mimeType: "text/plain",
      text: "资料正文",
      dataUrl: null,
      encoding: "utf-8",
    });
    updateNote.mockResolvedValueOnce({
      ...baseDetail.notes[0],
      title: "更新标题",
      body: "更新正文",
      updatedAt: "2026-06-08T00:01:00Z",
    });

    renderReaderPage("/studies/study-1/read?materialId=mat-1");
    await screen.findByText("资料正文");
    await waitFor(() => {
      expect(screen.getByLabelText("笔记标题")).toHaveValue("第一条笔记");
    });

    await userEvent.clear(screen.getByLabelText("笔记标题"));
    await userEvent.type(screen.getByLabelText("笔记标题"), "更新标题");
    await userEvent.clear(screen.getByLabelText("笔记正文"));
    await userEvent.type(screen.getByLabelText("笔记正文"), "更新正文");
    await userEvent.click(screen.getByRole("button", { name: "保存笔记" }));

    await waitFor(() => {
      expect(updateNote).toHaveBeenCalledWith({
        noteId: "note-1",
        title: "更新标题",
        body: "更新正文",
      });
    });
    expect(screen.getByLabelText("笔记标题")).toHaveValue("更新标题");
  });

  it("creates a new plain-text note from the reader", async () => {
    getLearningDetail.mockResolvedValueOnce({ ...baseDetail, notes: [] });
    getReadingState.mockResolvedValueOnce(null);
    previewMaterialFile.mockResolvedValueOnce({
      materialId: "mat-1",
      kind: "text",
      mimeType: "text/plain",
      text: "资料正文",
      dataUrl: null,
      encoding: "utf-8",
    });
    createNote.mockResolvedValueOnce(baseDetail.notes[0]);

    renderReaderPage("/studies/study-1/read?materialId=mat-1");
    await screen.findByText("资料正文");

    await userEvent.type(screen.getByLabelText("笔记标题"), "第一条笔记");
    await userEvent.type(screen.getByLabelText("笔记正文"), "旧正文");
    await userEvent.click(screen.getByRole("button", { name: "保存笔记" }));

    await waitFor(() => {
      expect(createNote).toHaveBeenCalledWith({
        learningContentId: "study-1",
        title: "第一条笔记",
        body: "旧正文",
      });
    });
    expect(screen.getByLabelText("选择笔记")).toHaveValue("note-1");
  });

  it("renders the PDF preview surface for pdf materials", async () => {
    getLearningDetail.mockResolvedValueOnce({
      ...baseDetail,
      materials: [
        {
          ...baseDetail.materials[0],
          id: "mat-pdf",
          name: "资料.pdf",
          mimeType: "application/pdf",
        },
      ],
    });
    getReadingState.mockResolvedValueOnce(null);
    previewMaterialFile.mockResolvedValueOnce({
      materialId: "mat-pdf",
      kind: "pdf",
      mimeType: "application/pdf",
      text: null,
      dataUrl: "data:application/pdf;base64,JVBERi0xLjc=",
      encoding: null,
    });

    renderReaderPage("/studies/study-1/read?materialId=mat-pdf");

    expect(await screen.findByLabelText("PDF 预览")).toBeInTheDocument();
    expect(previewMaterialFile).toHaveBeenCalledWith("mat-pdf");
  });

  it("supports pdf page navigation and zoom controls", async () => {
    getLearningDetail.mockResolvedValueOnce({
      ...baseDetail,
      materials: [
        {
          ...baseDetail.materials[0],
          id: "mat-pdf",
          name: "资料.pdf",
          mimeType: "application/pdf",
        },
      ],
    });
    getReadingState.mockResolvedValueOnce(null);
    previewMaterialFile.mockResolvedValueOnce({
      materialId: "mat-pdf",
      kind: "pdf",
      mimeType: "application/pdf",
      text: null,
      dataUrl: "data:application/pdf;base64,JVBERi0xLjc=",
      encoding: null,
    });

    renderReaderPage("/studies/study-1/read?materialId=mat-pdf");

    expect(await screen.findByLabelText("PDF 预览")).toBeInTheDocument();
    expect(await screen.findByText("第 1 / 3 页")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(await screen.findByText("第 2 / 3 页")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "放大" }));
    expect(screen.getByText("120%")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "上一页" }));
    expect(await screen.findByText("第 1 / 3 页")).toBeInTheDocument();
  });

  it("renders pdf pages in an A4 sheet and supports browser-like zoom and pan", async () => {
    getLearningDetail.mockResolvedValueOnce({
      ...baseDetail,
      materials: [
        {
          ...baseDetail.materials[0],
          id: "mat-pdf",
          name: "资料.pdf",
          mimeType: "application/pdf",
        },
      ],
    });
    getReadingState.mockResolvedValueOnce(null);
    previewMaterialFile.mockResolvedValueOnce({
      materialId: "mat-pdf",
      kind: "pdf",
      mimeType: "application/pdf",
      text: null,
      dataUrl: "data:application/pdf;base64,JVBERi0xLjc=",
      encoding: null,
    });

    renderReaderPage("/studies/study-1/read?materialId=mat-pdf");

    const viewport = await screen.findByLabelText("PDF 阅读区域");
    const sheet = screen.getByLabelText("A4 PDF 页面");
    expect(sheet).toHaveClass("pdf-page-sheet");
    expect(await screen.findByLabelText("PDF 预览")).toBeInTheDocument();

    fireEvent.wheel(viewport, { ctrlKey: true, deltaY: -120 });
    expect(screen.getByText("110%")).toBeInTheDocument();

    Object.defineProperty(viewport, "scrollLeft", { configurable: true, value: 80, writable: true });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, value: 120, writable: true });
    fireEvent.pointerDown(viewport, { button: 1, clientX: 320, clientY: 260 });
    fireEvent.pointerMove(window, { clientX: 280, clientY: 220 });
    fireEvent.pointerUp(window);

    expect(viewport.scrollLeft).toBe(120);
    expect(viewport.scrollTop).toBe(160);
  });

  it("auto-saves edited note before switching notes", async () => {
    getLearningDetail.mockResolvedValueOnce(baseDetail);
    getReadingState.mockResolvedValueOnce(null);
    previewMaterialFile.mockResolvedValueOnce({
      materialId: "mat-1",
      kind: "text",
      mimeType: "text/plain",
      text: "资料正文",
      dataUrl: null,
      encoding: "utf-8",
    });
    updateNote.mockResolvedValueOnce({
      ...baseDetail.notes[0],
      title: "自动保存标题",
      body: "自动保存正文",
      updatedAt: "2026-06-08T00:03:00Z",
    });

    renderReaderPage("/studies/study-1/read?materialId=mat-1");
    await screen.findByText("资料正文");
    await waitFor(() => {
      expect(screen.getByLabelText("笔记标题")).toHaveValue("第一条笔记");
    });

    await userEvent.clear(screen.getByLabelText("笔记标题"));
    await userEvent.type(screen.getByLabelText("笔记标题"), "自动保存标题");
    await userEvent.clear(screen.getByLabelText("笔记正文"));
    await userEvent.type(screen.getByLabelText("笔记正文"), "自动保存正文");
    await userEvent.selectOptions(screen.getByLabelText("选择笔记"), "note-2");

    await waitFor(() => {
      expect(updateNote).toHaveBeenCalledWith({
        noteId: "note-1",
        title: "自动保存标题",
        body: "自动保存正文",
      });
    });
    expect(screen.getByLabelText("选择笔记")).toHaveValue("note-2");
    expect(screen.getByLabelText("笔记标题")).toHaveValue("第二条笔记");
  });

  it("stays on the current note when auto-save fails before switching notes", async () => {
    getLearningDetail.mockResolvedValueOnce(baseDetail);
    getReadingState.mockResolvedValueOnce(null);
    previewMaterialFile.mockResolvedValueOnce({
      materialId: "mat-1",
      kind: "text",
      mimeType: "text/plain",
      text: "资料正文",
      dataUrl: null,
      encoding: "utf-8",
    });
    updateNote.mockRejectedValueOnce(new Error("保存失败"));

    renderReaderPage("/studies/study-1/read?materialId=mat-1");
    await screen.findByText("资料正文");
    await waitFor(() => {
      expect(screen.getByLabelText("笔记标题")).toHaveValue("第一条笔记");
    });

    await userEvent.clear(screen.getByLabelText("笔记标题"));
    await userEvent.type(screen.getByLabelText("笔记标题"), "失败标题");
    await userEvent.selectOptions(screen.getByLabelText("选择笔记"), "note-2");

    expect(await screen.findByText("保存失败")).toBeInTheDocument();
    expect(screen.getByLabelText("选择笔记")).toHaveValue("note-1");
  });

  it("auto-saves edited note and reading state before returning to detail", async () => {
    getLearningDetail.mockResolvedValueOnce(baseDetail);
    getReadingState.mockResolvedValueOnce(null);
    previewMaterialFile.mockResolvedValueOnce({
      materialId: "mat-1",
      kind: "text",
      mimeType: "text/plain",
      text: "资料正文",
      dataUrl: null,
      encoding: "utf-8",
    });
    updateNote.mockResolvedValueOnce({
      ...baseDetail.notes[0],
      title: "返回前保存",
      body: "返回前正文",
      updatedAt: "2026-06-08T00:04:00Z",
    });

    renderReaderPage("/studies/study-1/read?materialId=mat-1");
    await screen.findByText("资料正文");
    await waitFor(() => {
      expect(screen.getByLabelText("笔记标题")).toHaveValue("第一条笔记");
    });

    await userEvent.clear(screen.getByLabelText("笔记标题"));
    await userEvent.type(screen.getByLabelText("笔记标题"), "返回前保存");
    await userEvent.clear(screen.getByLabelText("笔记正文"));
    await userEvent.type(screen.getByLabelText("笔记正文"), "返回前正文");
    await userEvent.click(screen.getByRole("button", { name: "返回详情" }));

    await waitFor(() => {
      expect(updateNote).toHaveBeenCalledWith({
        noteId: "note-1",
        title: "返回前保存",
        body: "返回前正文",
      });
    });
    expect(saveReadingState).toHaveBeenCalledWith({
      learningContentId: "study-1",
      currentMaterialId: "mat-1",
      currentNoteId: "note-1",
      splitRatio: 55,
    });
  });

  it("deletes the selected note and returns to new note state", async () => {
    getLearningDetail.mockResolvedValueOnce(baseDetail);
    getReadingState.mockResolvedValueOnce(null);
    previewMaterialFile.mockResolvedValueOnce({
      materialId: "mat-1",
      kind: "text",
      mimeType: "text/plain",
      text: "资料正文",
      dataUrl: null,
      encoding: "utf-8",
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    deleteNote.mockResolvedValueOnce();

    renderReaderPage("/studies/study-1/read?materialId=mat-1");
    await screen.findByText("资料正文");
    await waitFor(() => {
      expect(screen.getByLabelText("笔记标题")).toHaveValue("第一条笔记");
    });

    await userEvent.click(screen.getByRole("button", { name: "删除当前笔记" }));

    await waitFor(() => {
      expect(deleteNote).toHaveBeenCalledWith("note-1");
    });
    expect(screen.getByLabelText("选择笔记")).toHaveValue("");
    expect(screen.getByLabelText("笔记标题")).toHaveValue("");
    expect(screen.getByLabelText("笔记正文")).toHaveValue("");
  });
});

function renderReaderPage(initialEntry: string) {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/studies/:studyId/read" element={<StudyReaderPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
