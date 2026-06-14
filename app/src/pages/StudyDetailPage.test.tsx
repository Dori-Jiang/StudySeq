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
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn((path: string) => `asset://localhost/${encodeURIComponent(path)}`),
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
const saveVideoPlaybackState = vi.mocked(learningContentApi.saveVideoPlaybackState);
const getMaterialLibraryLocation = vi.mocked(learningContentApi.getMaterialLibraryLocation);
const getMaterialLibraryStats = vi.mocked(learningContentApi.getMaterialLibraryStats);
const cleanupMaterialLibrary = vi.mocked(learningContentApi.cleanupMaterialLibrary);
const renameMaterialItem = vi.mocked(learningContentApi.renameMaterialItem);
const createMaterialFolder = vi.mocked(learningContentApi.createMaterialFolder);
const moveMaterialItem = vi.mocked(learningContentApi.moveMaterialItem);
const countMaterialSubtree = vi.mocked(learningContentApi.countMaterialSubtree);
const open = vi.mocked(dialog.open);
const pendingFileDeleteSummary = "已标记删除 1 个文件、0 个文件夹";

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
        recentOpen: null,
  },
  materials: [
    {
      id: "mat-1",
      learningContentId: "study-1",
      parentId: null,
      kind: "file" as const,
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
    saveVideoPlaybackState.mockReset();
    getMaterialLibraryLocation.mockReset();
    getMaterialLibraryStats.mockReset();
    cleanupMaterialLibrary.mockReset();
    renameMaterialItem.mockReset();
    createMaterialFolder.mockReset();
    moveMaterialItem.mockReset();
    countMaterialSubtree.mockReset();
    pdfGetDocumentMock.mockClear();
    pdfGetPageMock.mockClear();
    pdfRenderMock.mockClear();
    getMaterialReadingState.mockResolvedValue(null);
    getMaterialLibraryLocation.mockResolvedValue({
      path: "C:/Users/123/AppData/Roaming/com.studyseq.desktop/materials",
      isDefault: true,
    });
    saveMaterialReadingState.mockResolvedValue({
      materialId: "mat-pdf",
      pageNumber: 1,
      scale: 1,
      lastOpenedAt: "2026-06-09T00:00:00Z",
      positionKind: "pdf_page",
      videoPositionSeconds: null,
      updatedAt: "2026-06-09T00:00:00Z",
    });
    saveVideoPlaybackState.mockResolvedValue({
      materialId: "mat-video",
      pageNumber: 1,
      scale: 1,
      lastOpenedAt: "2026-06-09T00:00:00Z",
      positionKind: "video_second",
      videoPositionSeconds: 24,
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
    expect(
      screen.getByRole("progressbar", { name: "学习进度" }).closest(".detail-header"),
    ).toBeInTheDocument();
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
        parentId: null,
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
    expect(screen.getByText(/已保存/)).toBeInTheDocument();
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

    // 大图标格子只显示名字和类型，不显示大小等附加信息
    expect(screen.queryByText("2.5 MB")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /预览/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("资料轻量预览")).not.toBeInTheDocument();
    expect(previewMaterialFile).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "阅读" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "阅读" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开资料：资料.txt" })).toBeInTheDocument();
    const menu = await openMaterialMenu("资料.txt");
    expect(within(menu).getByRole("menuitem", { name: "删除" })).toBeInTheDocument();
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
      assetPath: null,
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

  it("auto-opens the continue target from the query and keeps its folder context", async () => {
    const folder = {
      ...baseDetail.materials[0],
      id: "folder-continue",
      kind: "folder" as const,
      name: "继续章节",
      originalPath: null,
      storedPath: null,
      mimeType: null,
      sizeBytes: 0,
    };
    const nested = {
      ...baseDetail.materials[0],
      id: "mat-continue",
      parentId: "folder-continue",
      name: "继续资料.txt",
    };
    getLearningDetail.mockResolvedValueOnce({
      ...baseDetail,
      materials: [folder, nested, baseDetail.materials[0]],
    });
    previewMaterialFile.mockResolvedValueOnce({
      materialId: "mat-continue",
      kind: "text",
      mimeType: "text/plain",
      text: "自动继续正文",
      dataUrl: null,
      assetPath: null,
      encoding: "utf-8",
    });

    renderDetailPage("/studies/study-1?continue=1&materialId=mat-continue");

    expect(await screen.findByText("自动继续正文")).toBeInTheDocument();
    expect(previewMaterialFile).toHaveBeenCalledTimes(1);
    expect(previewMaterialFile).toHaveBeenCalledWith("mat-continue");

    await userEvent.click(screen.getByRole("button", { name: "返回资料列表" }));
    expect(await screen.findByText("继续资料.txt")).toBeInTheDocument();
    expect(screen.queryByText("资料.txt")).not.toBeInTheDocument();
  });

  it("degrades continue query targets that are missing or folders", async () => {
    getLearningDetail.mockResolvedValueOnce(baseDetail);

    renderDetailPage("/studies/study-1?continue=1&materialId=missing");

    expect(await screen.findByText("最近打开资料已不可用")).toBeInTheDocument();
    expect(previewMaterialFile).not.toHaveBeenCalled();
  });

  it("does not expose raw runtime errors when material preview fails", async () => {
    getLearningDetail.mockResolvedValueOnce(baseDetail);
    previewMaterialFile.mockRejectedValueOnce(new Error("C:\\Users\\123\\secret.txt"));

    renderDetailPage();
    await screen.findByText("资料.txt");
    await userEvent.click(screen.getByRole("button", { name: "打开资料：资料.txt" }));

    expect(await screen.findByText("操作失败，请稍后重试")).toBeInTheDocument();
    expect(screen.queryByText(/C:\\Users/)).not.toBeInTheDocument();
  });

  it("shows the material library location and keeps location changes on the home page", async () => {
    getLearningDetail.mockResolvedValueOnce(baseDetail);
    getMaterialLibraryStats.mockResolvedValueOnce({
      materialCount: 1,
      referencedBytes: 5,
      actualReferencedBytes: 5,
      libraryBytes: 5,
      missingFileCount: 0,
      orphanFileCount: 0,
      orphanDatabaseRecordCount: 0,
      orphanBytes: 0,
      updatedAt: "2026-06-14T00:00:00Z",
    });

    renderDetailPage();
    await screen.findByText("Rust 入门");
    expect(await screen.findByText(/当前位置 C:\/Users\/123/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "迁移到 G 盘" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "迁回默认位置" })).not.toBeInTheDocument();
  });

  it("ignores stale preview results when opening another material first", async () => {
    let resolveFirstPreview: (preview: Awaited<ReturnType<typeof previewMaterialFile>>) => void;
    let resolveFirstState: (state: Awaited<ReturnType<typeof getMaterialReadingState>>) => void;
    const firstPreviewPromise = new Promise<Awaited<ReturnType<typeof previewMaterialFile>>>(
      (resolve) => {
        resolveFirstPreview = resolve;
      },
    );
    const firstStatePromise = new Promise<Awaited<ReturnType<typeof getMaterialReadingState>>>(
      (resolve) => {
        resolveFirstState = resolve;
      },
    );
    getLearningDetail.mockResolvedValueOnce({
      ...baseDetail,
      materials: [
        {
          ...baseDetail.materials[0],
          id: "mat-a",
          name: "A.txt",
        },
        {
          ...baseDetail.materials[0],
          id: "mat-b",
          name: "B.txt",
        },
      ],
    });
    previewMaterialFile
      .mockReturnValueOnce(firstPreviewPromise)
      .mockResolvedValueOnce({
        materialId: "mat-b",
        kind: "text",
        mimeType: "text/plain",
        text: "B content",
        dataUrl: null,
        assetPath: null,
        encoding: "utf-8",
      });
    getMaterialReadingState.mockReturnValueOnce(firstStatePromise).mockResolvedValueOnce(null);

    renderDetailPage();
    await screen.findByText("A.txt");
    await userEvent.click(screen.getByRole("button", { name: "打开资料：A.txt" }));
    await userEvent.click(screen.getByRole("button", { name: "返回资料列表" }));
    await userEvent.click(screen.getByRole("button", { name: "打开资料：B.txt" }));

    expect(await screen.findByText("B content")).toBeInTheDocument();

    resolveFirstPreview!({
      materialId: "mat-a",
      kind: "text",
      mimeType: "text/plain",
      text: "A stale content",
      dataUrl: null,
      assetPath: null,
      encoding: "utf-8",
    });
    resolveFirstState!(null);

    await waitFor(() => {
      expect(screen.queryByText("A stale content")).not.toBeInTheDocument();
    });
    expect(screen.getByText("B content")).toBeInTheDocument();
  });

  it("ignores stale preview failures when opening another material first", async () => {
    let rejectFirstPreview: (error: unknown) => void;
    const firstPreviewPromise = new Promise<Awaited<ReturnType<typeof previewMaterialFile>>>(
      (_resolve, reject) => {
        rejectFirstPreview = reject;
      },
    );
    getLearningDetail.mockResolvedValueOnce({
      ...baseDetail,
      materials: [
        {
          ...baseDetail.materials[0],
          id: "mat-a",
          name: "A.txt",
        },
        {
          ...baseDetail.materials[0],
          id: "mat-b",
          name: "B.txt",
        },
      ],
    });
    previewMaterialFile
      .mockReturnValueOnce(firstPreviewPromise)
      .mockResolvedValueOnce({
        materialId: "mat-b",
        kind: "text",
        mimeType: "text/plain",
        text: "B content",
        dataUrl: null,
        assetPath: null,
        encoding: "utf-8",
      });
    getMaterialReadingState.mockResolvedValue(null);

    renderDetailPage();
    await screen.findByText("A.txt");
    await userEvent.click(screen.getByRole("button", { name: "打开资料：A.txt" }));
    await userEvent.click(screen.getByRole("button", { name: "返回资料列表" }));
    await userEvent.click(screen.getByRole("button", { name: "打开资料：B.txt" }));

    expect(await screen.findByText("B content")).toBeInTheDocument();
    rejectFirstPreview!(new Error("stale failure"));

    await waitFor(() => {
      expect(screen.queryByText("操作失败，请稍后重试")).not.toBeInTheDocument();
    });
    expect(screen.getByText("B content")).toBeInTheDocument();
  });

  it("keeps material delete independent from the inline reader", async () => {
    getLearningDetail.mockResolvedValueOnce(baseDetail);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderDetailPage();
    await screen.findByText("资料.txt");

    const menu = await openMaterialMenu("资料.txt");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "删除" }));

    expect(previewMaterialFile).not.toHaveBeenCalled();
    expect(screen.getByText(pendingFileDeleteSummary)).toBeInTheDocument();
  });

  it("renders PDF material inside the detail pane with the shared reader controls", async () => {
    getLearningDetail.mockResolvedValueOnce({
      ...baseDetail,
      materials: [
        {
          ...baseDetail.materials[0],
          id: "mat-pdf",
          name: "资料.pdf",
          storedPath: "C:/app/inline-reader.pdf",
          mimeType: "application/pdf",
        },
      ],
    });
    previewMaterialFile.mockResolvedValueOnce({
      materialId: "mat-pdf",
      kind: "pdf",
      mimeType: "application/pdf",
      text: null,
      dataUrl: null,
      assetPath: "C:/app/inline-reader.pdf",
      encoding: null,
    });

    renderDetailPage();
    await screen.findByText("资料.pdf");

    await userEvent.click(screen.getByRole("button", { name: "打开资料：资料.pdf" }));

    expect(await screen.findByLabelText("PDF 预览")).toBeInTheDocument();
    expect(await screen.findByText("第 1 / 3 页")).toBeInTheDocument();
    expect(pdfGetDocumentMock).toHaveBeenCalledWith({
      url: "asset://localhost/C%3A%2Fapp%2Finline-reader.pdf",
    });
    await userEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(await screen.findByText("第 2 / 3 页")).toBeInTheDocument();
  });

  it("uses an asset URL for image previews after Rust validates the material", async () => {
    getLearningDetail.mockResolvedValueOnce({
      ...baseDetail,
      materials: [
        {
          ...baseDetail.materials[0],
          id: "mat-image",
          name: "截图.png",
          storedPath: "C:/app/screenshot.png",
          mimeType: "image/png",
        },
      ],
    });
    previewMaterialFile.mockResolvedValueOnce({
      materialId: "mat-image",
      kind: "image",
      mimeType: "image/png",
      text: null,
      dataUrl: null,
      assetPath: "C:/app/screenshot.png",
      encoding: null,
    });

    renderDetailPage();
    await screen.findByText("截图.png");
    await userEvent.click(screen.getByRole("button", { name: "打开资料：截图.png" }));

    expect(await screen.findByAltText("截图.png")).toHaveAttribute(
      "src",
      "asset://localhost/C%3A%2Fapp%2Fscreenshot.png",
    );
  });

  it("restores and saves PDF page state in the detail inline reader", async () => {
    getLearningDetail.mockResolvedValueOnce({
      ...baseDetail,
      materials: [
        {
          ...baseDetail.materials[0],
          id: "mat-pdf",
          name: "资料.pdf",
          storedPath: "C:/app/page-state.pdf",
          mimeType: "application/pdf",
        },
      ],
    });
    getMaterialReadingState.mockResolvedValueOnce({
      materialId: "mat-pdf",
      pageNumber: 2,
      scale: 1.4,
      lastOpenedAt: "2026-06-09T00:00:00Z",
      positionKind: "pdf_page",
      videoPositionSeconds: null,
      updatedAt: "2026-06-09T00:00:00Z",
    });
    previewMaterialFile.mockResolvedValueOnce({
      materialId: "mat-pdf",
      kind: "pdf",
      mimeType: "application/pdf",
      text: null,
      dataUrl: null,
      assetPath: "C:/app/page-state.pdf",
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

  it("restores and saves video playback position in the detail inline reader", async () => {
    getLearningDetail.mockResolvedValueOnce({
      ...baseDetail,
      materials: [
        {
          ...baseDetail.materials[0],
          id: "mat-video",
          name: "课程视频.mp4",
          storedPath: "C:/app/课程视频.mp4",
          mimeType: "video/mp4",
        },
      ],
    });
    getMaterialReadingState.mockResolvedValueOnce({
      materialId: "mat-video",
      pageNumber: 1,
      scale: 1,
      lastOpenedAt: "2026-06-09T00:00:00Z",
      positionKind: "video_second",
      videoPositionSeconds: 24,
      updatedAt: "2026-06-09T00:00:00Z",
    });
    previewMaterialFile.mockResolvedValueOnce({
      materialId: "mat-video",
      kind: "video",
      mimeType: "video/mp4",
      text: null,
      dataUrl: null,
      assetPath: "C:/app/课程视频.mp4",
      encoding: null,
    });

    renderDetailPage();
    await screen.findByText("课程视频.mp4");

    await userEvent.click(screen.getByRole("button", { name: "打开资料：课程视频.mp4" }));
    const video = (await screen.findByLabelText("视频播放器")) as HTMLVideoElement;
    Object.defineProperty(video, "duration", {
      configurable: true,
      value: 300,
    });
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      writable: true,
      value: 0,
    });

    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(24);

    video.currentTime = 42;
    fireEvent.pause(video);

    expect(saveVideoPlaybackState).toHaveBeenCalledWith({
      materialId: "mat-video",
      positionSeconds: 42,
    });
  });

  it("caches the PDF document, pre-renders adjacent pages, and debounces zoom rendering", async () => {
    getLearningDetail.mockResolvedValueOnce({
      ...baseDetail,
      materials: [
        {
          ...baseDetail.materials[0],
          id: "mat-pdf",
          name: "资料.pdf",
          storedPath: "C:/app/pdf-cache.pdf",
          mimeType: "application/pdf",
        },
      ],
    });
    previewMaterialFile.mockResolvedValueOnce({
      materialId: "mat-pdf",
      kind: "pdf",
      mimeType: "application/pdf",
      text: null,
      dataUrl: null,
      assetPath: "C:/app/pdf-cache.pdf",
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

    const menu = await openMaterialMenu("资料.txt");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "删除" }));
    expect(screen.queryByText("资料.txt")).not.toBeInTheDocument();
    expect(screen.getByText(pendingFileDeleteSummary)).toBeInTheDocument();

    await userEvent.click(screen.getByText("撤回"));
    expect(screen.getByText("资料.txt")).toBeInTheDocument();

    const restoredMenu = await openMaterialMenu("资料.txt");
    await userEvent.click(within(restoredMenu).getByRole("menuitem", { name: "删除" }));
    await userEvent.click(screen.getByRole("button", { name: "保存资料删除" }));

    await waitFor(() => {
      expect(deleteMaterialItem).toHaveBeenCalledWith("mat-1");
    });
    expect(screen.queryByText(pendingFileDeleteSummary)).not.toBeInTheDocument();
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
        orphanDatabaseRecordCount: 1,
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
        orphanDatabaseRecordCount: 1,
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
        orphanDatabaseRecordCount: 0,
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

  it("shows cleanup confirmation matching orphan files and orphan database records", async () => {
    getLearningDetail.mockResolvedValueOnce(baseDetail);
    getMaterialLibraryStats
      .mockResolvedValueOnce({
        materialCount: 2,
        referencedBytes: 10,
        actualReferencedBytes: 5,
        libraryBytes: 11,
        missingFileCount: 3,
        orphanFileCount: 1,
        orphanDatabaseRecordCount: 2,
        orphanBytes: 6,
        updatedAt: "2026-06-09T00:01:00Z",
      })
      .mockResolvedValueOnce({
        materialCount: 2,
        referencedBytes: 10,
        actualReferencedBytes: 5,
        libraryBytes: 5,
        missingFileCount: 3,
        orphanFileCount: 0,
        orphanDatabaseRecordCount: 0,
        orphanBytes: 0,
        updatedAt: "2026-06-09T00:02:00Z",
      });
    cleanupMaterialLibrary.mockResolvedValueOnce({
      deletedOrphanFileCount: 1,
      deletedOrphanDatabaseRecordCount: 2,
      deletedBytes: 6,
      failedPaths: [],
      updatedAt: "2026-06-09T00:01:00Z",
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    renderDetailPage();
    await screen.findByText("资料.txt");
    await userEvent.click(screen.getByRole("button", { name: "清理无引用资料" }));

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith(
        "确定清理 1 个无引用文件，并删除 2 条孤儿资料记录吗？缺失文件只会保留为统计提示。",
      );
    });
    expect(await screen.findByText("孤儿记录 0")).toBeInTheDocument();
  });

  it("does not expose raw cleanup failure paths", async () => {
    getLearningDetail.mockResolvedValueOnce(baseDetail);
    getMaterialLibraryStats
      .mockResolvedValueOnce({
        materialCount: 2,
        referencedBytes: 10,
        actualReferencedBytes: 5,
        libraryBytes: 11,
        missingFileCount: 0,
        orphanFileCount: 1,
        orphanDatabaseRecordCount: 0,
        orphanBytes: 6,
        updatedAt: "2026-06-09T00:01:00Z",
      })
      .mockResolvedValueOnce({
        materialCount: 2,
        referencedBytes: 10,
        actualReferencedBytes: 5,
        libraryBytes: 11,
        missingFileCount: 0,
        orphanFileCount: 1,
        orphanDatabaseRecordCount: 0,
        orphanBytes: 6,
        updatedAt: "2026-06-09T00:02:00Z",
      });
    cleanupMaterialLibrary.mockResolvedValueOnce({
      deletedOrphanFileCount: 0,
      deletedOrphanDatabaseRecordCount: 0,
      deletedBytes: 0,
      failedPaths: ["C:/Users/123/secret/material.txt"],
      updatedAt: "2026-06-09T00:01:00Z",
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderDetailPage();
    await screen.findByText("资料.txt");
    await userEvent.click(screen.getByRole("button", { name: "清理无引用资料" }));

    expect(await screen.findByText("有 1 个路径清理失败，可稍后重试。")).toBeInTheDocument();
    expect(screen.queryByText(/C:\/Users\/123\/secret/)).not.toBeInTheDocument();
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
    const menu = await openMaterialMenu("资料.txt");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "重命名" }));

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
      .mockRejectedValueOnce({
        code: "file_system_error",
        message: "文件系统操作失败，请确认文件仍可访问",
      });

    renderDetailPage();
    await screen.findByText("资料.txt");

    const firstMenu = await openMaterialMenu("资料.txt");
    await userEvent.click(within(firstMenu).getByRole("menuitem", { name: "删除" }));
    const secondMenu = await openMaterialMenu("失败资料.txt");
    await userEvent.click(within(secondMenu).getByRole("menuitem", { name: "删除" }));
    await userEvent.click(screen.getByRole("button", { name: "保存资料删除" }));

    await waitFor(() => {
      expect(deleteMaterialItem).toHaveBeenCalledWith("mat-1");
      expect(deleteMaterialItem).toHaveBeenCalledWith("mat-2");
    });
    expect(screen.getByText(/部分资料删除失败/)).toBeInTheDocument();
    expect(screen.getByText(/失败项已保留/)).toBeInTheDocument();
    expect(screen.getByText(pendingFileDeleteSummary)).toBeInTheDocument();
    expect(screen.queryByText("资料.txt")).not.toBeInTheDocument();
    expect(screen.queryByText("失败资料.txt")).not.toBeInTheDocument();

    deleteMaterialItem.mockResolvedValueOnce();
    await userEvent.click(screen.getByRole("button", { name: "保存资料删除" }));

    await waitFor(() => {
      expect(deleteMaterialItem).toHaveBeenLastCalledWith("mat-2");
    });
    expect(screen.queryByText(pendingFileDeleteSummary)).not.toBeInTheDocument();
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

  it("keeps new note draft when create note fails", async () => {
    getLearningDetail.mockResolvedValueOnce({ ...baseDetail, notes: [] });
    createNote.mockRejectedValueOnce({
      code: "database_error",
      message: "保存失败",
    });

    renderDetailPage();
    await screen.findByText("还没有笔记");

    await userEvent.type(screen.getByLabelText("笔记标题"), "失败草稿");
    await userEvent.type(screen.getByLabelText("笔记正文"), "不会丢失的正文");
    await userEvent.click(screen.getByRole("button", { name: "保存笔记" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("保存失败");
    expect(screen.getByLabelText("笔记标题")).toHaveValue("失败草稿");
    expect(screen.getByLabelText("笔记正文")).toHaveValue("不会丢失的正文");
    expect(screen.queryByText("失败草稿")).not.toBeInTheDocument();
    expect(screen.getByText("还没有笔记")).toBeInTheDocument();
  });

  it("keeps existing note draft when update note fails", async () => {
    getLearningDetail.mockResolvedValueOnce(baseDetail);
    updateNote.mockRejectedValueOnce({
      code: "database_error",
      message: "更新失败",
    });

    renderDetailPage();
    await screen.findByText("第一条笔记");
    await userEvent.selectOptions(screen.getByLabelText("选择笔记"), "note-1");
    await userEvent.clear(screen.getByLabelText("笔记标题"));
    await userEvent.type(screen.getByLabelText("笔记标题"), "未保存标题");
    await userEvent.clear(screen.getByLabelText("笔记正文"));
    await userEvent.type(screen.getByLabelText("笔记正文"), "未保存正文");
    await userEvent.click(screen.getByRole("button", { name: "保存笔记" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("更新失败");
    expect(screen.getByLabelText("笔记标题")).toHaveValue("未保存标题");
    expect(screen.getByLabelText("笔记正文")).toHaveValue("未保存正文");
    expect(screen.getByText("第一条笔记")).toBeInTheDocument();
    expect(screen.queryByText("未保存标题")).not.toBeInTheDocument();
    expect(screen.getByLabelText("选择笔记")).toHaveValue("note-1");
  });

  it("keeps note visible and selected when delete note fails", async () => {
    getLearningDetail.mockResolvedValueOnce(baseDetail);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    deleteNote.mockRejectedValueOnce({
      code: "database_error",
      message: "删除失败",
    });

    renderDetailPage();
    await screen.findByText("第一条笔记");
    await userEvent.selectOptions(screen.getByLabelText("选择笔记"), "note-1");
    await userEvent.click(screen.getByRole("button", { name: "删除当前笔记" }));

    expect(await screen.findByText("删除失败")).toBeInTheDocument();
    expect(screen.getByText("第一条笔记")).toBeInTheDocument();
    expect(screen.getByLabelText("选择笔记")).toHaveValue("note-1");
    expect(screen.getByLabelText("笔记标题")).toHaveValue("第一条笔记");
    expect(screen.getByLabelText("笔记正文")).toHaveValue("纯文本正文");
  });

  it("allows retry after failed note delete", async () => {
    getLearningDetail.mockResolvedValueOnce(baseDetail);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    deleteNote
      .mockRejectedValueOnce({
        code: "database_error",
        message: "删除失败",
      })
      .mockResolvedValueOnce();

    renderDetailPage();
    await screen.findByText("第一条笔记");
    await userEvent.selectOptions(screen.getByLabelText("选择笔记"), "note-1");
    await userEvent.click(screen.getByRole("button", { name: "删除当前笔记" }));
    expect(await screen.findByText("删除失败")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "删除当前笔记" }));

    await waitFor(() => {
      expect(deleteNote).toHaveBeenCalledTimes(2);
    });
    expect(deleteNote).toHaveBeenNthCalledWith(1, "note-1");
    expect(deleteNote).toHaveBeenNthCalledWith(2, "note-1");
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

  describe("资料资源管理器", () => {
    const folderItem = {
      ...baseDetail.materials[0],
      id: "folder-1",
      kind: "folder" as const,
      name: "第一章",
      originalPath: null,
      storedPath: null,
      mimeType: null,
      sizeBytes: 0,
    };
    const nestedFile = {
      ...baseDetail.materials[0],
      id: "mat-nested",
      name: "章节资料.txt",
      parentId: "folder-1",
    };

    it("大图标平铺渲染当前层，进入文件夹后面包屑可返回根目录", async () => {
      getLearningDetail.mockResolvedValueOnce({
        ...baseDetail,
        materials: [folderItem, nestedFile, baseDetail.materials[0]],
      });

      renderDetailPage();
      await screen.findByText("第一章");

      // 根层只显示根级项，文件夹子项不可见
      expect(screen.getByText("资料.txt")).toBeInTheDocument();
      expect(screen.queryByText("章节资料.txt")).not.toBeInTheDocument();
      expect(document.querySelector(".material-tile-grid")).not.toBeNull();

      await userEvent.click(screen.getByRole("button", { name: "打开文件夹：第一章" }));
      expect(await screen.findByText("章节资料.txt")).toBeInTheDocument();
      expect(screen.queryByText("资料.txt")).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "根目录" }));
      expect(await screen.findByText("资料.txt")).toBeInTheDocument();
    });

    it("在文件夹内导入资料归属当前文件夹", async () => {
      getLearningDetail.mockResolvedValueOnce({ ...baseDetail, materials: [folderItem] });
      open.mockResolvedValueOnce("C:/source/新文件.txt");
      importMaterialFile.mockResolvedValueOnce({
        ...nestedFile,
        id: "mat-new",
        name: "新文件.txt",
      });

      renderDetailPage();
      await screen.findByText("第一章");
      await userEvent.click(screen.getByRole("button", { name: "打开文件夹：第一章" }));
      await userEvent.click(screen.getByRole("button", { name: "导入资料" }));

      await waitFor(() => {
        expect(importMaterialFile).toHaveBeenCalledWith({
          learningContentId: "study-1",
          sourcePath: "C:/source/新文件.txt",
          parentId: "folder-1",
        });
      });
      expect(await screen.findByText("新文件.txt")).toBeInTheDocument();
    });

    it("打开文件夹内资料并返回后仍停留在原文件夹", async () => {
      getLearningDetail.mockResolvedValueOnce({
        ...baseDetail,
        materials: [folderItem, nestedFile, baseDetail.materials[0]],
      });
      previewMaterialFile.mockResolvedValueOnce({
        materialId: "mat-nested",
        kind: "text",
        mimeType: "text/plain",
        text: "章节正文",
        dataUrl: null,
        assetPath: null,
        encoding: "utf-8",
      });

      renderDetailPage();
      await screen.findByText("第一章");
      await userEvent.click(screen.getByRole("button", { name: "打开文件夹：第一章" }));
      expect(await screen.findByText("章节资料.txt")).toBeInTheDocument();
      expect(screen.queryByText("资料.txt")).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "打开资料：章节资料.txt" }));
      expect(await screen.findByText("章节正文")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "返回资料列表" }));

      expect(await screen.findByText("章节资料.txt")).toBeInTheDocument();
      expect(screen.queryByText("资料.txt")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "根目录" })).toBeEnabled();
    });

    it("新建文件夹调用 API 并显示在当前层", async () => {
      getLearningDetail.mockResolvedValueOnce(baseDetail);
      vi.spyOn(window, "prompt").mockReturnValue("新章节");
      createMaterialFolder.mockResolvedValueOnce({
        ...folderItem,
        id: "folder-new",
        name: "新章节",
      });

      renderDetailPage();
      await screen.findByText("资料.txt");
      await userEvent.click(screen.getByRole("button", { name: "新建文件夹" }));

      await waitFor(() => {
        expect(createMaterialFolder).toHaveBeenCalledWith({
          learningContentId: "study-1",
          parentId: null,
          name: "新章节",
        });
      });
      expect(await screen.findByText("新章节")).toBeInTheDocument();
    });

    it("移动对话框禁选自身与后代，选择有效目标后调用移动", async () => {
      const childFolder = {
        ...folderItem,
        id: "folder-child",
        name: "子文件夹",
        parentId: "folder-1",
      };
      const otherFolder = { ...folderItem, id: "folder-other", name: "他处" };
      getLearningDetail.mockResolvedValueOnce({
        ...baseDetail,
        materials: [folderItem, childFolder, otherFolder],
      });
      moveMaterialItem.mockResolvedValueOnce({ ...folderItem, parentId: "folder-other" });

      renderDetailPage();
      await screen.findByText("第一章");
      const menu = await openMaterialMenu("第一章");
      await userEvent.click(within(menu).getByRole("menuitem", { name: "移动到" }));

      const moveDialog = await screen.findByRole("dialog");
      expect(within(moveDialog).getByRole("button", { name: "第一章" })).toBeDisabled();
      expect(within(moveDialog).getByRole("button", { name: "子文件夹" })).toBeDisabled();
      expect(within(moveDialog).getByRole("button", { name: "根目录" })).toBeDisabled();
      expect(within(moveDialog).getByRole("button", { name: "他处" })).toBeEnabled();

      await userEvent.click(within(moveDialog).getByRole("button", { name: "他处" }));

      await waitFor(() => {
        expect(moveMaterialItem).toHaveBeenCalledWith({
          materialId: "folder-1",
          newParentId: "folder-other",
        });
      });
    });

    it("祖先文件夹与其子项同时标记删除时，只对祖先发删除请求且保存后子树移除", async () => {
      getLearningDetail.mockResolvedValueOnce({
        ...baseDetail,
        materials: [folderItem, nestedFile, baseDetail.materials[0]],
      });
      countMaterialSubtree.mockResolvedValueOnce({ fileCount: 1, folderCount: 0 });
      vi.spyOn(window, "confirm").mockReturnValue(true);
      deleteMaterialItem.mockResolvedValue(undefined);

      renderDetailPage();
      await screen.findByText("第一章");

      // 进入文件夹标记删除子项
      await userEvent.click(screen.getByRole("button", { name: "打开文件夹：第一章" }));
      await screen.findByText("章节资料.txt");
      const fileMenu = await openMaterialMenu("章节资料.txt");
      await userEvent.click(within(fileMenu).getByRole("menuitem", { name: "删除" }));
      // 返回根目录标记删除祖先文件夹
      await userEvent.click(screen.getByRole("button", { name: "根目录" }));
      await screen.findByText("第一章");
      const folderMenu = await openMaterialMenu("第一章");
      await userEvent.click(within(folderMenu).getByRole("menuitem", { name: "删除" }));

      await userEvent.click(await screen.findByRole("button", { name: "保存资料删除" }));

      await waitFor(() => {
        expect(deleteMaterialItem).toHaveBeenCalledTimes(1);
      });
      expect(deleteMaterialItem).toHaveBeenCalledWith("folder-1");
      // 保存成功后子树移除、待删栏消失、无失败提示
      await waitFor(() => {
        expect(screen.queryByText(/已标记删除/)).not.toBeInTheDocument();
      });
      expect(screen.queryByText("第一章")).not.toBeInTheDocument();
      expect(screen.queryByText(/删除失败/)).not.toBeInTheDocument();
      expect(screen.getByText("资料.txt")).toBeInTheDocument();
    });

    it("删除当前文件夹后返回最近仍存在的父级", async () => {
      const innerFolder = {
        ...folderItem,
        id: "folder-inner",
        name: "第二节",
        parentId: "folder-1",
      };
      const innerFile = {
        ...nestedFile,
        id: "mat-inner",
        name: "第二节资料.txt",
        parentId: "folder-inner",
      };
      getLearningDetail.mockResolvedValueOnce({
        ...baseDetail,
        materials: [folderItem, innerFolder, innerFile, baseDetail.materials[0]],
      });
      countMaterialSubtree.mockResolvedValueOnce({ fileCount: 1, folderCount: 0 });
      vi.spyOn(window, "confirm").mockReturnValue(true);
      deleteMaterialItem.mockResolvedValueOnce();

      renderDetailPage();
      await screen.findByText("第一章");
      await userEvent.click(screen.getByRole("button", { name: "打开文件夹：第一章" }));
      await userEvent.click(await screen.findByRole("button", { name: "打开文件夹：第二节" }));
      expect(await screen.findByText("第二节资料.txt")).toBeInTheDocument();

      const innerFolderInBreadcrumb = screen.getByRole("button", { name: "第二节" });
      expect(innerFolderInBreadcrumb).toBeDisabled();
      await userEvent.click(screen.getByRole("button", { name: "第一章" }));
      const menu = await openMaterialMenu("第二节");
      await userEvent.click(within(menu).getByRole("menuitem", { name: "删除" }));
      await userEvent.click(screen.getByRole("button", { name: "保存资料删除" }));

      await waitFor(() => {
        expect(deleteMaterialItem).toHaveBeenCalledWith("folder-inner");
      });
      expect(await screen.findByText("这个文件夹是空的")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "第一章" })).toBeDisabled();
      expect(screen.queryByText("第二节资料.txt")).not.toBeInTheDocument();
    });

    it("移动对话框禁用已标记删除的文件夹目标", async () => {
      const otherFolder = { ...folderItem, id: "folder-other", name: "他处" };
      getLearningDetail.mockResolvedValueOnce({
        ...baseDetail,
        materials: [folderItem, otherFolder, baseDetail.materials[0]],
      });
      countMaterialSubtree.mockResolvedValueOnce({ fileCount: 0, folderCount: 0 });
      vi.spyOn(window, "confirm").mockReturnValue(true);

      renderDetailPage();
      await screen.findByText("他处");

      const otherMenu = await openMaterialMenu("他处");
      await userEvent.click(within(otherMenu).getByRole("menuitem", { name: "删除" }));
      await waitFor(() => {
        expect(screen.queryByText("他处")).not.toBeInTheDocument();
      });

      const fileMenu = await openMaterialMenu("资料.txt");
      await userEvent.click(within(fileMenu).getByRole("menuitem", { name: "移动到" }));
      const moveDialog = await screen.findByRole("dialog");

      expect(within(moveDialog).getByRole("button", { name: "他处" })).toBeDisabled();
      expect(within(moveDialog).getByRole("button", { name: "第一章" })).toBeEnabled();
    });

    it("导入资料失败时显示错误信息", async () => {
      getLearningDetail.mockResolvedValueOnce(baseDetail);
      open.mockResolvedValueOnce("C:/source/坏文件.txt");
      importMaterialFile.mockRejectedValueOnce({
        code: "source_file_missing",
        message: "资料文件不存在",
      });

      renderDetailPage();
      await screen.findByText("资料.txt");
      await userEvent.click(screen.getByRole("button", { name: "导入资料" }));

      expect(await screen.findByText("资料文件不存在")).toBeInTheDocument();
    });

    it("文件夹标记删除时确认文案含数量，且整棵子树从列表隐藏", async () => {
      getLearningDetail.mockResolvedValueOnce({
        ...baseDetail,
        materials: [folderItem, nestedFile, baseDetail.materials[0]],
      });
      countMaterialSubtree.mockResolvedValueOnce({ fileCount: 1, folderCount: 0 });
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

      renderDetailPage();
      await screen.findByText("第一章");
      const menu = await openMaterialMenu("第一章");
      await userEvent.click(within(menu).getByRole("menuitem", { name: "删除" }));

      await waitFor(() => {
        expect(confirmSpy).toHaveBeenCalledWith(
          expect.stringContaining("1 个文件、0 个子文件夹"),
        );
      });
      expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("不影响原始文件"));
      await waitFor(() => {
        expect(screen.queryByText("第一章")).not.toBeInTheDocument();
      });
      // 根级文件不受影响
      expect(screen.getByText("资料.txt")).toBeInTheDocument();
    });
  });
});

async function openMaterialMenu(name: string) {
  await userEvent.click(screen.getByRole("button", { name: `资料操作：${name}` }));
  return await screen.findByRole("menu", { name: `资料操作菜单：${name}` });
}

function renderDetailPage(initialEntry = "/studies/study-1") {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/studies/:studyId" element={<StudyDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
