import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StudyDetailPage } from "./StudyDetailPage";
import * as learningContentApi from "../shared/api/learningContentApi";
import * as dialog from "@tauri-apps/plugin-dialog";

const pdfRenderMock = vi.fn(() => ({ promise: Promise.resolve() }));
const pdfGetPageMock = vi.fn((pageNumber: number) =>
  Promise.resolve({
    pageNumber,
    getViewport: vi.fn(({ scale }: { scale: number }) => ({
      width: 100 * scale,
      height: 120 * scale,
    })),
    render: pdfRenderMock,
  }),
);
const pdfGetDocumentMock = vi.fn(() => ({
  promise: Promise.resolve({
    numPages: 3,
    getPage: pdfGetPageMock,
  }),
}));

vi.mock("../shared/api/learningContentApi");
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {
    workerSrc: "",
  },
  getDocument: pdfGetDocumentMock,
}));

const getLearningDetail = vi.mocked(learningContentApi.getLearningDetail);
const importMaterialFile = vi.mocked(learningContentApi.importMaterialFile);
const createNote = vi.mocked(learningContentApi.createNote);
const deleteMaterialItem = vi.mocked(learningContentApi.deleteMaterialItem);
const deleteNote = vi.mocked(learningContentApi.deleteNote);
const previewMaterialFile = vi.mocked(learningContentApi.previewMaterialFile);
const updateLearningContent = vi.mocked(learningContentApi.updateLearningContent);
const updateNote = vi.mocked(learningContentApi.updateNote);
const getMaterialReadingState = vi.mocked(learningContentApi.getMaterialReadingState);
const saveMaterialReadingState = vi.mocked(learningContentApi.saveMaterialReadingState);
const getMaterialLibraryStats = vi.mocked(learningContentApi.getMaterialLibraryStats);
const cleanupMaterialLibrary = vi.mocked(learningContentApi.cleanupMaterialLibrary);
const renameMaterialItem = vi.mocked(learningContentApi.renameMaterialItem);
const open = vi.mocked(dialog.open);

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
      sizeBytes: 5,
      createdAt: "2026-06-08T00:00:00Z",
      updatedAt: "2026-06-08T00:00:00Z",
    },
  ],
  notes: [
    {
      id: "note-1",
      learningContentId: "study-1",
      title: "第一条笔记",
      body: "纯文本正文",
      createdAt: "2026-06-08T00:00:00Z",
      updatedAt: "2026-06-08T00:00:00Z",
    },
  ],
};

describe("StudyDetailPage", () => {
  beforeEach(() => {
    getLearningDetail.mockReset();
    importMaterialFile.mockReset();
    createNote.mockReset();
    deleteMaterialItem.mockReset();
    deleteNote.mockReset();
    previewMaterialFile.mockReset();
    updateLearningContent.mockReset();
    updateNote.mockReset();
    getMaterialReadingState.mockReset();
    saveMaterialReadingState.mockReset();
    getMaterialLibraryStats.mockReset();
    cleanupMaterialLibrary.mockReset();
    renameMaterialItem.mockReset();
    pdfGetDocumentMock.mockClear();
    pdfGetPageMock.mockClear();
    pdfRenderMock.mockClear();
    getMaterialReadingState.mockResolvedValue(null);
    saveMaterialReadingState.mockResolvedValue({
      materialId: "mat-pdf",
      pageNumber: 1,
      scale: 1,
      updatedAt: "2026-06-09T00:00:00Z",
    });
    open.mockReset();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      { clearRect: vi.fn() } as unknown as CanvasRenderingContext2D,
    );
  });

  it("renders learning detail with materials and note titles only", async () => {
    getLearningDetail.mockResolvedValueOnce(baseDetail);

    renderDetailPage();

    expect(await screen.findByText("Rust 入门")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回主页" })).toHaveClass("page-back-button");
    expect(screen.queryByText("学习内容详情")).not.toBeInTheDocument();
    expect(screen.getByText("资料.txt")).toBeInTheDocument();
    expect(screen.getByLabelText("选择笔记")).toHaveValue("");
    expect(screen.getByText("第一条笔记")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "第一条笔记" })).not.toBeInTheDocument();
    expect(screen.queryByText("纯文本正文")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "学习进度" }).closest(".detail-title-block")).toBeInTheDocument();
  });

  it("shows the note editor as a document surface with the title as the headline", async () => {
    getLearningDetail.mockResolvedValueOnce(baseDetail);

    renderDetailPage();
    await screen.findByText("第一条笔记");

    expect(screen.getByLabelText("笔记标题")).toHaveClass("note-document-title");
    expect(screen.getByLabelText("笔记正文")).toHaveClass("note-document-body");
    expect(screen.queryByText(/^笔记标题$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^笔记正文$/)).not.toBeInTheDocument();
  });

  it("imports a root material file and appends it to the list", async () => {
    getLearningDetail.mockResolvedValueOnce({ ...baseDetail, materials: [] });
    open.mockResolvedValueOnce("C:/source/资料.txt");
    importMaterialFile.mockResolvedValueOnce(baseDetail.materials[0]);

    renderDetailPage();
    await screen.findByText("还没有资料");

    await userEvent.click(screen.getByRole("button", { name: "导入资料" }));

    await waitFor(() => {
      expect(importMaterialFile).toHaveBeenCalledWith({
        learningContentId: "study-1",
        sourcePath: "C:/source/资料.txt",
      });
    });
    expect(await screen.findByText("资料.txt")).toBeInTheDocument();
  });

  it("creates a plain-text note and appends it to the list", async () => {
    getLearningDetail.mockResolvedValueOnce({ ...baseDetail, notes: [] });
    createNote.mockResolvedValueOnce(baseDetail.notes[0]);

    renderDetailPage();
    await screen.findByText("还没有笔记");

    await userEvent.type(screen.getByLabelText("笔记标题"), "第一条笔记");
    await userEvent.type(screen.getByLabelText("笔记正文"), "纯文本正文");
    await userEvent.click(screen.getByRole("button", { name: "保存笔记" }));

    await waitFor(() => {
      expect(createNote).toHaveBeenCalledWith({
        learningContentId: "study-1",
        title: "第一条笔记",
        body: "纯文本正文",
      });
    });
    expect(await screen.findByText("第一条笔记")).toBeInTheDocument();
    expect(screen.getByLabelText("笔记正文")).toHaveValue("纯文本正文");
  });

  it("uses the material row as the read entry without showing a read button", async () => {
    getLearningDetail.mockResolvedValueOnce({
      ...baseDetail,
      materials: [
        {
          ...baseDetail.materials[0],
          sizeBytes: 2_621_440,
        },
      ],
    });

    renderDetailPage();
    await screen.findByText("资料.txt");

    expect(screen.getByText("2.5 MB")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /预览/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("资料轻量预览")).not.toBeInTheDocument();
    expect(previewMaterialFile).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "阅读" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "阅读" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开资料：资料.txt" })).toBeInTheDocument();
    const materialItem = screen.getByText("资料.txt").closest("article") as HTMLElement;
    const actions = within(materialItem).getByRole("group", { name: "资料操作：资料.txt" });
    expect(within(actions).getByRole("button", { name: "删除" })).toBeInTheDocument();
  });

  it("opens a material inside the left detail pane and can return to the material list", async () => {
    getLearningDetail.mockResolvedValueOnce({
      ...baseDetail,
      materials: [
        baseDetail.materials[0],
        {
          ...baseDetail.materials[0],
          id: "mat-2",
          name: "补充资料.pdf",
          mimeType: "application/pdf",
          storedPath: "C:/app/补充资料.pdf",
        },
      ],
    });
    previewMaterialFile.mockResolvedValueOnce({
      materialId: "mat-1",
      kind: "text",
      mimeType: "text/plain",
      text: "资料正文",
      dataUrl: null,
      encoding: "utf-8",
    });

    renderDetailPage();
    await screen.findByText("资料.txt");
    expect(screen.getByText("补充资料.pdf")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "打开资料：资料.txt" }));

    await waitFor(() => {
      expect(previewMaterialFile).toHaveBeenCalledWith("mat-1");
    });
    expect(await screen.findByText("资料正文")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回资料列表" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "导入资料" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "打开资料：补充资料.pdf" })).not.toBeInTheDocument();
    expect(screen.queryByText("补充资料.pdf")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "返回资料列表" }));

    expect(screen.getByRole("button", { name: "打开资料：资料.txt" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开资料：补充资料.pdf" })).toBeInTheDocument();
    expect(screen.queryByText("资料正文")).not.toBeInTheDocument();
  });

  it("keeps material delete independent from the inline reader", async () => {
    getLearningDetail.mockResolvedValueOnce(baseDetail);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderDetailPage();
    await screen.findByText("资料.txt");

    const materialItem = screen.getByText("资料.txt").closest("article") as HTMLElement;
    await userEvent.click(within(materialItem).getByRole("button", { name: "删除" }));

    expect(previewMaterialFile).not.toHaveBeenCalled();
    expect(screen.getByText("已标记删除 1 个资料")).toBeInTheDocument();
  });

  it("renders PDF material inside the detail pane with the shared reader controls", async () => {
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
    previewMaterialFile.mockResolvedValueOnce({
      materialId: "mat-pdf",
      kind: "pdf",
      mimeType: "application/pdf",
      text: null,
      dataUrl: "data:application/pdf;base64,JVBERi0xLjcKQ2FjaGU=",
      encoding: null,
    });

    renderDetailPage();
    await screen.findByText("资料.pdf");

    await userEvent.click(screen.getByRole("button", { name: "打开资料：资料.pdf" }));

    expect(await screen.findByLabelText("PDF 预览")).toBeInTheDocument();
    expect(await screen.findByText("第 1 / 3 页")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(await screen.findByText("第 2 / 3 页")).toBeInTheDocument();
  });

  it("restores and saves PDF page state in the detail inline reader", async () => {
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
    getMaterialReadingState.mockResolvedValueOnce({
      materialId: "mat-pdf",
      pageNumber: 2,
      scale: 1.4,
      updatedAt: "2026-06-09T00:00:00Z",
    });
    previewMaterialFile.mockResolvedValueOnce({
      materialId: "mat-pdf",
      kind: "pdf",
      mimeType: "application/pdf",
      text: null,
      dataUrl: "data:application/pdf;base64,JVBERi0xLjcgY2FjaGUtdGVzdA==",
      encoding: null,
    });

    renderDetailPage();
    await screen.findByText("资料.pdf");

    await userEvent.click(screen.getByRole("button", { name: "打开资料：资料.pdf" }));

    expect(await screen.findByText("第 2 / 3 页")).toBeInTheDocument();
    expect(screen.getByText("140%")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "下一页" }));

    await waitFor(() => {
      expect(saveMaterialReadingState).toHaveBeenCalledWith({
        materialId: "mat-pdf",
        pageNumber: 3,
        scale: 1.4,
      });
    }, { timeout: 1500 });
  });

  it("caches the PDF document, pre-renders adjacent pages, and debounces zoom rendering", async () => {
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
    previewMaterialFile.mockResolvedValueOnce({
      materialId: "mat-pdf",
      kind: "pdf",
      mimeType: "application/pdf",
      text: null,
      dataUrl: "data:application/pdf;base64,JVBERi0xLjc=",
      encoding: null,
    });

    renderDetailPage();
    await screen.findByText("资料.pdf");
    await userEvent.click(screen.getByRole("button", { name: "打开资料：资料.pdf" }));

    await waitFor(() => {
      expect(pdfGetDocumentMock).toHaveBeenCalledTimes(1);
      expect(pdfGetPageMock).toHaveBeenCalledWith(1);
      expect(pdfGetPageMock).toHaveBeenCalledWith(2);
    });

    await userEvent.click(screen.getByRole("button", { name: "下一页" }));
    await waitFor(() => {
      expect(pdfGetDocumentMock).toHaveBeenCalledTimes(1);
      expect(pdfGetPageMock).toHaveBeenCalledWith(3);
    });

    vi.useFakeTimers();
    try {
      pdfRenderMock.mockClear();
      fireEvent.click(screen.getByRole("button", { name: "放大" }));
      fireEvent.click(screen.getByRole("button", { name: "放大" }));
      fireEvent.click(screen.getByRole("button", { name: "放大" }));
      expect(screen.getByText("160%")).toBeInTheDocument();
      expect(pdfRenderMock).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(180);
      });

      expect(pdfRenderMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets the detail split pane ratio be resized by dragging the splitter", async () => {
    getLearningDetail.mockResolvedValueOnce(baseDetail);

    renderDetailPage();
    await screen.findByText("Rust 入门");

    const splitter = screen.getByRole("separator", { name: "调整资料和笔记分栏比例" });
    const grid = splitter.closest(".detail-grid") as HTMLDivElement;
    vi.spyOn(grid, "getBoundingClientRect").mockReturnValue({
      bottom: 600,
      height: 400,
      left: 0,
      right: 1000,
      top: 200,
      width: 1000,
      x: 0,
      y: 200,
      toJSON: () => undefined,
    });

    fireEvent.pointerDown(splitter, { clientX: 580, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 680, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    expect(grid.style.gridTemplateColumns).toBe("68fr 16px 32fr");
  });

  it("shows learning content progress without editing fields in detail", async () => {
    getLearningDetail.mockResolvedValueOnce(baseDetail);

    renderDetailPage();
    await screen.findByText("Rust 入门");

    expect(screen.getByRole("progressbar", { name: "学习进度" })).toHaveAttribute(
      "aria-valuenow",
      "20",
    );
    expect(screen.getByText("20%")).toBeInTheDocument();
    expect(screen.queryByLabelText("学习名称")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("状态")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "保存学习内容" })).not.toBeInTheDocument();
    expect(updateLearningContent).not.toHaveBeenCalled();
  });

  it("stages material deletion, allows undo, and permanently deletes on save", async () => {
    getLearningDetail.mockResolvedValueOnce(baseDetail);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    deleteMaterialItem.mockResolvedValueOnce();

    renderDetailPage();
    await screen.findByText("资料.txt");

    const materialItem = screen.getByText("资料.txt").closest("article") as HTMLElement;
    await userEvent.click(within(materialItem).getByRole("button", { name: "删除" }));
    expect(screen.queryByText("资料.txt")).not.toBeInTheDocument();
    expect(screen.getByText("已标记删除 1 个资料")).toBeInTheDocument();

    await userEvent.click(screen.getByText("撤回"));
    expect(screen.getByText("资料.txt")).toBeInTheDocument();

    const restoredMaterialItem = screen.getByText("资料.txt").closest("article") as HTMLElement;
    await userEvent.click(within(restoredMaterialItem).getByRole("button", { name: "删除" }));
    await userEvent.click(screen.getByRole("button", { name: "保存资料删除" }));

    await waitFor(() => {
      expect(deleteMaterialItem).toHaveBeenCalledWith("mat-1");
    });
    expect(screen.queryByText("已标记删除 1 个资料")).not.toBeInTheDocument();
  });

  it("refreshes material library stats and cleans orphan files after confirmation", async () => {
    getLearningDetail.mockResolvedValueOnce(baseDetail);
    getMaterialLibraryStats
      .mockResolvedValueOnce({
        materialCount: 2,
        referencedBytes: 10,
        actualReferencedBytes: 5,
        libraryBytes: 11,
        missingFileCount: 1,
        orphanFileCount: 1,
        orphanBytes: 6,
        updatedAt: "2026-06-09T00:00:00Z",
      })
      .mockResolvedValueOnce({
        materialCount: 1,
        referencedBytes: 10,
        actualReferencedBytes: 5,
        libraryBytes: 11,
        missingFileCount: 1,
        orphanFileCount: 1,
        orphanBytes: 6,
        updatedAt: "2026-06-09T00:01:00Z",
      })
      .mockResolvedValueOnce({
        materialCount: 1,
        referencedBytes: 5,
        actualReferencedBytes: 5,
        libraryBytes: 5,
        missingFileCount: 0,
        orphanFileCount: 0,
        orphanBytes: 0,
        updatedAt: "2026-06-09T00:02:00Z",
      });
    cleanupMaterialLibrary.mockResolvedValueOnce({
      deletedOrphanFileCount: 1,
      deletedOrphanDatabaseRecordCount: 1,
      deletedBytes: 6,
      failedPaths: [],
      updatedAt: "2026-06-09T00:01:00Z",
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderDetailPage();
    await screen.findByText("资料.txt");
    await userEvent.click(screen.getByRole("button", { name: "刷新资料库统计" }));

    expect(await screen.findByText("资料数量 2")).toBeInTheDocument();
    expect(screen.getByText("记录大小 10 B")).toBeInTheDocument();
    expect(screen.getByText("磁盘占用 11 B")).toBeInTheDocument();
    expect(screen.getByText("缺失文件 1")).toBeInTheDocument();
    expect(screen.getByText("无引用文件 1")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "清理无引用资料" }));

    await waitFor(() => {
      expect(getMaterialLibraryStats).toHaveBeenCalledTimes(3);
      expect(cleanupMaterialLibrary).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText(/已清理 1 个无引用文件/)).toBeInTheDocument();
    expect(screen.getByText("无引用文件 0")).toBeInTheDocument();
  });

  it("renames material and updates the visible material row", async () => {
    getLearningDetail.mockResolvedValueOnce(baseDetail);
    vi.spyOn(window, "prompt").mockReturnValue("新资料.txt");
    renameMaterialItem.mockResolvedValueOnce({
      ...baseDetail.materials[0],
      name: "新资料.txt",
      storedPath: "C:/app/新资料.txt",
      updatedAt: "2026-06-09T00:00:00Z",
    });

    renderDetailPage();
    await screen.findByText("资料.txt");
    const materialItem = screen.getByText("资料.txt").closest("article") as HTMLElement;
    await userEvent.click(within(materialItem).getByRole("button", { name: "重命名" }));

    await waitFor(() => {
      expect(renameMaterialItem).toHaveBeenCalledWith({
        materialId: "mat-1",
        name: "新资料.txt",
      });
    });
    expect(screen.getByText("新资料.txt")).toBeInTheDocument();
    expect(screen.queryByText("资料.txt")).not.toBeInTheDocument();
  });

  it("keeps failed material deletes pending with a retryable error", async () => {
    const detailWithTwoMaterials = {
      ...baseDetail,
      materials: [
        baseDetail.materials[0],
        {
          ...baseDetail.materials[0],
          id: "mat-2",
          name: "失败资料.txt",
          storedPath: "C:/app/失败资料.txt",
        },
      ],
    };
    getLearningDetail.mockResolvedValueOnce(detailWithTwoMaterials);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    deleteMaterialItem
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error("文件被占用"));

    renderDetailPage();
    await screen.findByText("资料.txt");

    await userEvent.click(
      within(screen.getByText("资料.txt").closest("article") as HTMLElement).getByRole("button", {
        name: "删除",
      }),
    );
    await userEvent.click(
      within(screen.getByText("失败资料.txt").closest("article") as HTMLElement).getByRole(
        "button",
        { name: "删除" },
      ),
    );
    await userEvent.click(screen.getByRole("button", { name: "保存资料删除" }));

    await waitFor(() => {
      expect(deleteMaterialItem).toHaveBeenCalledWith("mat-1");
      expect(deleteMaterialItem).toHaveBeenCalledWith("mat-2");
    });
    expect(screen.getByText(/部分资料删除失败/)).toBeInTheDocument();
    expect(screen.getByText(/失败项已保留/)).toBeInTheDocument();
    expect(screen.getByText("已标记删除 1 个资料")).toBeInTheDocument();
    expect(screen.queryByText("资料.txt")).not.toBeInTheDocument();
    expect(screen.queryByText("失败资料.txt")).not.toBeInTheDocument();

    deleteMaterialItem.mockResolvedValueOnce();
    await userEvent.click(screen.getByRole("button", { name: "保存资料删除" }));

    await waitFor(() => {
      expect(deleteMaterialItem).toHaveBeenLastCalledWith("mat-2");
    });
    expect(screen.queryByText("已标记删除 1 个资料")).not.toBeInTheDocument();
  });

  it("deletes a note after confirmation", async () => {
    getLearningDetail.mockResolvedValueOnce(baseDetail);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    deleteNote.mockResolvedValueOnce();

    renderDetailPage();
    await screen.findByText("第一条笔记");

    await userEvent.selectOptions(screen.getByLabelText("选择笔记"), "note-1");
    await userEvent.click(screen.getByRole("button", { name: "删除当前笔记" }));

    await waitFor(() => {
      expect(deleteNote).toHaveBeenCalledWith("note-1");
    });
    expect(screen.queryByText("第一条笔记")).not.toBeInTheDocument();
  });

  it("opens an existing note into the detail editor and saves changes", async () => {
    getLearningDetail.mockResolvedValueOnce(baseDetail);
    updateNote.mockResolvedValueOnce({
      ...baseDetail.notes[0],
      title: "更新后的笔记",
      body: "更新后的正文",
      updatedAt: "2026-06-08T00:01:00Z",
    });

    renderDetailPage();
    await screen.findByText("第一条笔记");

    await userEvent.selectOptions(screen.getByLabelText("选择笔记"), "note-1");
    expect(screen.getByLabelText("笔记标题")).toHaveValue("第一条笔记");
    expect(screen.getByLabelText("笔记正文")).toHaveValue("纯文本正文");

    await userEvent.clear(screen.getByLabelText("笔记标题"));
    await userEvent.type(screen.getByLabelText("笔记标题"), "更新后的笔记");
    await userEvent.clear(screen.getByLabelText("笔记正文"));
    await userEvent.type(screen.getByLabelText("笔记正文"), "更新后的正文");
    await userEvent.click(screen.getByRole("button", { name: "保存笔记" }));

    await waitFor(() => {
      expect(updateNote).toHaveBeenCalledWith({
        noteId: "note-1",
        title: "更新后的笔记",
        body: "更新后的正文",
      });
    });
    expect(screen.getByText("更新后的笔记")).toBeInTheDocument();
  });
});

function renderDetailPage() {
  render(
    <MemoryRouter initialEntries={["/studies/study-1"]}>
      <Routes>
        <Route path="/studies/:studyId" element={<StudyDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
