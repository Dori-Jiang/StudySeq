import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import {
  cleanupMaterialLibrary,
  chooseMaterialLibraryStorageRoot,
  createLearningContent,
  createNote,
  deleteLearningContent,
  deleteMaterialItem,
  deleteNote,
  getLearningDetail,
  getMaterialLibraryLocation,
  getMaterialLibraryStats,
  getMaterialReadingState,
  importMaterialFile,
  listLearningContents,
  previewMaterialFile,
  renameMaterialItem,
  saveMaterialReadingState,
  saveVideoPlaybackState,
  setMaterialLibraryLocation,
  updateLearningContent,
  updateNote,
} from "./learningContentApi";

const invokeMock = vi.mocked(invoke);

describe("learningContentApi", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("loads learning contents through the Rust command", async () => {
    invokeMock.mockResolvedValueOnce([
      {
        id: "study-1",
        name: "Rust 入门",
        status: "planned",
        deadline: null,
        estimatedHours: 10,
        progress: 20,
        createdAt: "2026-06-08T00:00:00Z",
        updatedAt: "2026-06-08T00:00:00Z",
        lastOpenedAt: null,
        recentOpen: {
          materialId: "mat-pdf",
          materialName: "讲义.pdf",
          openedAt: "2026-06-14T10:35:00Z",
          position: { kind: "pdf_page", pageNumber: 14 },
        },
      },
    ]);

    const result = await listLearningContents();

    expect(invokeMock).toHaveBeenCalledWith("list_learning_contents");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Rust 入门");
  });

  it("rejects invalid recent open position payloads at the API boundary", async () => {
    invokeMock.mockResolvedValueOnce([
      {
        id: "study-1",
        name: "Rust 入门",
        status: "planned",
        deadline: null,
        estimatedHours: 10,
        progress: 20,
        createdAt: "2026-06-08T00:00:00Z",
        updatedAt: "2026-06-08T00:00:00Z",
        lastOpenedAt: null,
        recentOpen: {
          materialId: "mat-1",
          materialName: "资料.pdf",
          openedAt: "2026-06-14T00:00:00Z",
          position: { kind: "unknown" },
        },
      },
    ]);

    await expect(listLearningContents()).rejects.toThrow("Invalid recent open position");
  });

  it("rejects invalid video playback state numbers at the API boundary", async () => {
    invokeMock.mockResolvedValueOnce({
      materialId: "mat-video",
      pageNumber: 1,
      scale: 1,
      lastOpenedAt: "2026-06-09T00:00:00Z",
      positionKind: "video_second",
      videoPositionSeconds: Number.NaN,
      updatedAt: "2026-06-09T00:00:00Z",
    });

    await expect(
      saveVideoPlaybackState({
        materialId: "mat-video",
        positionSeconds: 42,
      }),
    ).rejects.toThrow("Invalid API number value");
  });

  it("rejects invalid saved PDF reading state payloads at the API boundary", async () => {
    invokeMock.mockResolvedValueOnce({
      materialId: "mat-pdf",
      pageNumber: 4,
      scale: 1.5,
      lastOpenedAt: "2026-06-09T00:00:00Z",
      positionKind: "pdf_page",
      videoPositionSeconds: "not-a-number",
      updatedAt: "2026-06-09T00:00:00Z",
    });

    await expect(
      saveMaterialReadingState({
        materialId: "mat-pdf",
        pageNumber: 4,
        scale: 1.5,
      }),
    ).rejects.toThrow("Invalid API number value");
  });

  it("creates learning content through the Rust command", async () => {
    invokeMock.mockResolvedValueOnce({
      id: "study-2",
      name: "TypeScript 练习",
      status: "planned",
      deadline: null,
      estimatedHours: 6,
      progress: 0,
      createdAt: "2026-06-08T00:00:00Z",
      updatedAt: "2026-06-08T00:00:00Z",
      lastOpenedAt: null,
        recentOpen: null,
    });

    const result = await createLearningContent({
      name: "TypeScript 练习",
      estimatedHours: 6,
      progress: 0,
    });

    expect(invokeMock).toHaveBeenCalledWith("create_learning_content", {
      input: {
        name: "TypeScript 练习",
        estimatedHours: 6,
        progress: 0,
      },
    });
    expect(result.id).toBe("study-2");
  });

  it("rejects invalid created learning content payloads at the API boundary", async () => {
    invokeMock.mockResolvedValueOnce({
      id: "study-2",
      name: "TypeScript 练习",
      status: "unknown",
      deadline: null,
      estimatedHours: 6,
      progress: 0,
      createdAt: "2026-06-08T00:00:00Z",
      updatedAt: "2026-06-08T00:00:00Z",
      lastOpenedAt: null,
      recentOpen: null,
    });

    await expect(
      createLearningContent({
        name: "TypeScript 练习",
      }),
    ).rejects.toThrow("Invalid study status");
  });

  it("loads a learning detail through the Rust command", async () => {
    invokeMock.mockResolvedValueOnce({
      learningContent: {
        id: "study-1",
        name: "Rust 入门",
        status: "planned",
        deadline: null,
        estimatedHours: 10,
        progress: 20,
        createdAt: "2026-06-08T00:00:00Z",
        updatedAt: "2026-06-08T00:00:00Z",
        lastOpenedAt: null,
        recentOpen: null,
      },
      materials: [],
      notes: [],
    });

    const result = await getLearningDetail("study-1");

    expect(invokeMock).toHaveBeenCalledWith("get_learning_detail", { id: "study-1" });
    expect(result?.learningContent.name).toBe("Rust 入门");
  });

  it("deletes learning content through the Rust command", async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await deleteLearningContent("study-1");

    expect(invokeMock).toHaveBeenCalledWith("delete_learning_content", { id: "study-1" });
  });

  it("updates learning content basic fields through the Rust command", async () => {
    invokeMock.mockResolvedValueOnce({
      id: "study-1",
      name: "Rust 深入",
      status: "active",
      deadline: "2026-08-15",
      estimatedHours: 12,
      progress: 65,
      createdAt: "2026-06-08T00:00:00Z",
      updatedAt: "2026-06-08T00:01:00Z",
      lastOpenedAt: null,
        recentOpen: null,
    });

    const result = await updateLearningContent({
      id: "study-1",
      name: "Rust 深入",
      status: "active",
      progress: 65,
      deadline: "2026-08-15",
      estimatedHours: 12,
    });

    expect(invokeMock).toHaveBeenCalledWith("update_learning_content", {
      input: {
        id: "study-1",
        name: "Rust 深入",
        status: "active",
        progress: 65,
        deadline: "2026-08-15",
        estimatedHours: 12,
      },
    });
    expect(result.name).toBe("Rust 深入");
    expect(result.status).toBe("active");
    expect(result.estimatedHours).toBe(12);
    expect(result.progress).toBe(65);
    expect(result.deadline).toBe("2026-08-15");
  });

  it("rejects invalid updated learning content payloads at the API boundary", async () => {
    invokeMock.mockResolvedValueOnce({
      id: "study-1",
      name: "Rust 深入",
      status: "active",
      deadline: null,
      estimatedHours: Number.NaN,
      progress: 65,
      createdAt: "2026-06-08T00:00:00Z",
      updatedAt: "2026-06-08T00:01:00Z",
      lastOpenedAt: null,
      recentOpen: null,
    });

    await expect(
      updateLearningContent({
        id: "study-1",
        name: "Rust 深入",
        status: "active",
        progress: 65,
        deadline: null,
        estimatedHours: 12,
      }),
    ).rejects.toThrow("Invalid API number value");
  });

  it("imports material through the Rust command", async () => {
    invokeMock.mockResolvedValueOnce({
      id: "mat-1",
      learningContentId: "study-1",
      name: "资料.txt",
      originalPath: "C:/source/资料.txt",
      storedPath: "C:/app/资料.txt",
      mimeType: "text/plain",
      sizeBytes: 5,
      createdAt: "2026-06-08T00:00:00Z",
      updatedAt: "2026-06-08T00:00:00Z",
    });

    const result = await importMaterialFile({
      learningContentId: "study-1",
      sourcePath: "C:/source/资料.txt",
    });

    expect(invokeMock).toHaveBeenCalledWith("import_material_file", {
      input: {
        learningContentId: "study-1",
        sourcePath: "C:/source/资料.txt",
      },
    });
    expect(result.name).toBe("资料.txt");
  });

  it("deletes material through the Rust command", async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await deleteMaterialItem("mat-1");

    expect(invokeMock).toHaveBeenCalledWith("delete_material_item", { id: "mat-1" });
  });

  it("creates plain-text note through the Rust command", async () => {
    invokeMock.mockResolvedValueOnce({
      id: "note-1",
      learningContentId: "study-1",
      title: "第一条笔记",
      body: "纯文本正文",
      createdAt: "2026-06-08T00:00:00Z",
      updatedAt: "2026-06-08T00:00:00Z",
    });

    const result = await createNote({
      learningContentId: "study-1",
      title: "第一条笔记",
      body: "纯文本正文",
    });

    expect(invokeMock).toHaveBeenCalledWith("create_note", {
      input: {
        learningContentId: "study-1",
        title: "第一条笔记",
        body: "纯文本正文",
      },
    });
    expect(result.body).toBe("纯文本正文");
  });

  it("deletes note through the Rust command", async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await deleteNote("note-1");

    expect(invokeMock).toHaveBeenCalledWith("delete_note", { id: "note-1" });
  });

  it("previews material through the Rust command", async () => {
    invokeMock.mockResolvedValueOnce({
      materialId: "mat-1",
      kind: "text",
      mimeType: "text/plain",
      text: "资料正文",
      dataUrl: null,
      assetPath: null,
      encoding: "utf-8",
    });

    const result = await previewMaterialFile("mat-1");

    expect(invokeMock).toHaveBeenCalledWith("preview_material_file", {
      materialId: "mat-1",
    });
    expect(result.text).toBe("资料正文");
  });

  it("rejects invalid material preview payloads at the API boundary", async () => {
    invokeMock.mockResolvedValueOnce({
      materialId: "mat-1",
      kind: "pdf",
      mimeType: "application/pdf",
      text: null,
      dataUrl: 123,
      encoding: null,
    });

    await expect(previewMaterialFile("mat-1")).rejects.toThrow("Invalid API string value");
  });

  it("gets and sets material library location through Rust commands", async () => {
    invokeMock
      .mockResolvedValueOnce({
        path: "C:/Users/123/AppData/Roaming/com.studyseq.desktop/materials",
        isDefault: true,
      })
      .mockResolvedValueOnce({
        path: "D:/LearningData/StudySeqData/materials",
        isDefault: false,
      });

    const current = await getMaterialLibraryLocation();
    const moved = await setMaterialLibraryLocation({
      path: "D:/LearningData/StudySeqData/materials",
    });

    expect(invokeMock).toHaveBeenNthCalledWith(1, "get_material_library_location");
    expect(invokeMock).toHaveBeenNthCalledWith(2, "set_material_library_location", {
      input: { path: "D:/LearningData/StudySeqData/materials" },
    });
    expect(current.isDefault).toBe(true);
    expect(moved.path).toBe("D:/LearningData/StudySeqData/materials");
  });

  it("chooses material library storage root through the Rust command", async () => {
    invokeMock.mockResolvedValueOnce("D:/LearningData").mockResolvedValueOnce(null);

    await expect(chooseMaterialLibraryStorageRoot()).resolves.toBe("D:/LearningData");
    await expect(chooseMaterialLibraryStorageRoot()).resolves.toBeNull();

    expect(invokeMock).toHaveBeenNthCalledWith(1, "choose_material_library_storage_root");
    expect(invokeMock).toHaveBeenNthCalledWith(2, "choose_material_library_storage_root");
  });

  it("rejects invalid material library location payloads at the API boundary", async () => {
    invokeMock.mockResolvedValueOnce({
      path: "D:/LearningData/StudySeqData/materials",
      isDefault: "false",
    });

    await expect(getMaterialLibraryLocation()).rejects.toThrow("Invalid API boolean value");
  });

  it("updates plain-text note through the Rust command", async () => {
    invokeMock.mockResolvedValueOnce({
      id: "note-1",
      learningContentId: "study-1",
      title: "更新标题",
      body: "更新正文",
      createdAt: "2026-06-08T00:00:00Z",
      updatedAt: "2026-06-08T00:01:00Z",
    });

    const result = await updateNote({
      noteId: "note-1",
      title: "更新标题",
      body: "更新正文",
    });

    expect(invokeMock).toHaveBeenCalledWith("update_note", {
      input: {
        noteId: "note-1",
        title: "更新标题",
        body: "更新正文",
      },
    });
    expect(result.title).toBe("更新标题");
  });

  it("manages V1.1 material reading state and library operations through Rust commands", async () => {
    invokeMock
      .mockResolvedValueOnce({
        materialId: "mat-pdf",
        pageNumber: 3,
        scale: 1.4,
        lastOpenedAt: "2026-06-09T00:00:00Z",
        positionKind: "pdf_page",
        videoPositionSeconds: null,
        updatedAt: "2026-06-09T00:00:00Z",
      })
      .mockResolvedValueOnce({
        materialId: "mat-pdf",
        pageNumber: 4,
        scale: 1.5,
        lastOpenedAt: "2026-06-09T00:01:00Z",
        positionKind: "pdf_page",
        videoPositionSeconds: null,
        updatedAt: "2026-06-09T00:01:00Z",
      })
      .mockResolvedValueOnce({
        materialId: "mat-video",
        pageNumber: 1,
        scale: 1,
        lastOpenedAt: "2026-06-09T00:01:30Z",
        positionKind: "video_second",
        videoPositionSeconds: 42.5,
        updatedAt: "2026-06-09T00:01:30Z",
      })
      .mockResolvedValueOnce({
        materialCount: 2,
        referencedBytes: 10,
        actualReferencedBytes: 5,
        libraryBytes: 11,
        missingFileCount: 1,
        orphanFileCount: 1,
        orphanDatabaseRecordCount: 1,
        orphanBytes: 6,
        updatedAt: "2026-06-09T00:02:00Z",
      })
      .mockResolvedValueOnce({
        deletedOrphanFileCount: 1,
        deletedOrphanDatabaseRecordCount: 1,
        deletedBytes: 6,
        failedPaths: [],
        updatedAt: "2026-06-09T00:03:00Z",
      })
      .mockResolvedValueOnce({
        id: "mat-pdf",
        learningContentId: "study-1",
        name: "重命名.pdf",
        originalPath: "C:/source/source.pdf",
        storedPath: "C:/app/重命名.pdf",
        mimeType: "application/pdf",
        sizeBytes: 4,
        createdAt: "2026-06-09T00:00:00Z",
        updatedAt: "2026-06-09T00:04:00Z",
      });

    const loadedState = await getMaterialReadingState("mat-pdf");
    const savedState = await saveMaterialReadingState({
      materialId: "mat-pdf",
      pageNumber: 4,
      scale: 1.5,
    });
    const savedVideoState = await saveVideoPlaybackState({
      materialId: "mat-video",
      positionSeconds: 42.5,
    });
    const stats = await getMaterialLibraryStats();
    const cleanup = await cleanupMaterialLibrary();
    const renamed = await renameMaterialItem({
      materialId: "mat-pdf",
      name: "重命名.pdf",
    });

    expect(invokeMock).toHaveBeenNthCalledWith(1, "get_material_reading_state", {
      materialId: "mat-pdf",
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "save_material_reading_state", {
      input: {
        materialId: "mat-pdf",
        pageNumber: 4,
        scale: 1.5,
      },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, "save_video_playback_state", {
      input: {
        materialId: "mat-video",
        positionSeconds: 42.5,
      },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, "get_material_library_stats");
    expect(invokeMock).toHaveBeenNthCalledWith(5, "cleanup_material_library");
    expect(invokeMock).toHaveBeenNthCalledWith(6, "rename_material_item", {
      input: {
        materialId: "mat-pdf",
        name: "重命名.pdf",
      },
    });
    expect(loadedState?.pageNumber).toBe(3);
    expect(savedState.scale).toBe(1.5);
    expect(savedVideoState.videoPositionSeconds).toBe(42.5);
    expect(stats.orphanFileCount).toBe(1);
    expect(cleanup.deletedBytes).toBe(6);
    expect(renamed.name).toBe("重命名.pdf");
  });
});
