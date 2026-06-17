import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import {
  applyMaterialLibraryLocationChange,
  cleanupMaterialLibrary,
  createHandwritingNote,
  createLearningContent,
  createNote,
  deletePdfPageAnnotation,
  deleteHandwritingNote,
  deleteLearningContent,
  deleteMaterialItem,
  deleteNote,
  getHandwritingNote,
  getLearningDetail,
  getMaterialLibraryLocation,
  getMaterialLibraryStats,
  getMaterialReadingState,
  getPdfPageAnnotation,
  importMaterialFile,
  listHandwritingNoteSummaries,
  listLearningContents,
  prepareMaterialLibraryLocationChange,
  previewMaterialFile,
  renameMaterialItem,
  saveMaterialReadingState,
  savePdfPageAnnotation,
  saveVideoPlaybackState,
  updateHandwritingNote,
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
      handwritingNotes: [],
    });

    const result = await getLearningDetail("study-1");

    expect(invokeMock).toHaveBeenCalledWith("get_learning_detail", { id: "study-1" });
    expect(result?.learningContent.name).toBe("Rust 入门");
  });

  it("rejects invalid learning detail material and note payloads", async () => {
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
      materials: [{ kind: "file", id: "mat-1" }],
      notes: [],
      handwritingNotes: [],
    });
    await expect(getLearningDetail("study-1")).rejects.toThrow("Invalid API string value");

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
      notes: [{ id: "note-1" }],
      handwritingNotes: [],
    });
    await expect(getLearningDetail("study-1")).rejects.toThrow("Invalid API string value");
  });

  it("deletes learning content through the Rust command", async () => {
    invokeMock.mockResolvedValueOnce({ failedCleanupPathCount: 0 });

    await expect(deleteLearningContent("study-1")).resolves.toEqual({
      failedCleanupPathCount: 0,
    });

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
      storedPath: "C:/app/资料.txt",
      mimeType: "text/plain",
      sizeBytes: 5,
      createdAt: "2026-06-08T00:00:00Z",
      updatedAt: "2026-06-08T00:00:00Z",
    });

    const result = await importMaterialFile({
      learningContentId: "study-1",
      parentId: null,
    });

    expect(invokeMock).toHaveBeenCalledWith("import_material_file", {
      input: {
        learningContentId: "study-1",
        parentId: null,
      },
    });
    expect(result?.name).toBe("资料.txt");
    expect(result).not.toHaveProperty("originalPath");
  });

  it("deletes material through the Rust command", async () => {
    invokeMock.mockResolvedValueOnce({ failedCleanupPathCount: 0 });

    await expect(deleteMaterialItem("mat-1")).resolves.toEqual({
      failedCleanupPathCount: 0,
    });

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

  it("manages handwriting notes through Rust commands", async () => {
    const strokeDataJson =
      '{"schemaVersion":1,"coordinateSpace":"normalized","strokes":[]}';
    const handwritingNote = {
      id: "hand-1",
      learningContentId: "study-1",
      title: "手写笔记",
      strokeDataJson,
      strokeSchemaVersion: 1,
      canvasWidth: 1024,
      canvasHeight: 768,
      createdAt: "2026-06-16T00:00:00Z",
      updatedAt: "2026-06-16T00:00:00Z",
    };
    invokeMock
      .mockResolvedValueOnce([{ ...handwritingNote, strokeDataJson: undefined }])
      .mockResolvedValueOnce(handwritingNote)
      .mockResolvedValueOnce(handwritingNote)
      .mockResolvedValueOnce({ ...handwritingNote, title: "更新后的手写" })
      .mockResolvedValueOnce(undefined);

    const summaries = await listHandwritingNoteSummaries("study-1");
    const loaded = await getHandwritingNote("study-1", "hand-1");
    const created = await createHandwritingNote({
      learningContentId: "study-1",
      title: "手写笔记",
      strokeDataJson,
      canvasWidth: 1024,
      canvasHeight: 768,
    });
    const updated = await updateHandwritingNote({
      learningContentId: "study-1",
      noteId: "hand-1",
      title: "更新后的手写",
      strokeDataJson,
      canvasWidth: 1024,
      canvasHeight: 768,
    });
    await deleteHandwritingNote("study-1", "hand-1");

    expect(summaries[0].title).toBe("手写笔记");
    expect(loaded.strokeDataJson).toBe(strokeDataJson);
    expect(created.strokeSchemaVersion).toBe(1);
    expect(updated.title).toBe("更新后的手写");
    expect(invokeMock).toHaveBeenNthCalledWith(1, "list_handwriting_note_summaries", {
      learningContentId: "study-1",
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "get_handwriting_note", {
      learningContentId: "study-1",
      id: "hand-1",
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, "create_handwriting_note", {
      input: {
        learningContentId: "study-1",
        title: "手写笔记",
        strokeDataJson,
        canvasWidth: 1024,
        canvasHeight: 768,
      },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, "update_handwriting_note", {
      input: {
        learningContentId: "study-1",
        noteId: "hand-1",
        title: "更新后的手写",
        strokeDataJson,
        canvasWidth: 1024,
        canvasHeight: 768,
      },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(5, "delete_handwriting_note", {
      learningContentId: "study-1",
      id: "hand-1",
    });
  });

  it("rejects invalid handwriting schema payloads at the API boundary", async () => {
    invokeMock.mockResolvedValueOnce({
      id: "hand-1",
      learningContentId: "study-1",
      title: "坏手写",
      strokeDataJson:
        '{"schemaVersion":2,"coordinateSpace":"normalized","strokes":[]}',
      strokeSchemaVersion: 2,
      canvasWidth: 1024,
      canvasHeight: 768,
      createdAt: "2026-06-16T00:00:00Z",
      updatedAt: "2026-06-16T00:00:00Z",
    });

    await expect(getHandwritingNote("study-1", "hand-1")).rejects.toThrow(
      "Invalid handwriting schema version",
    );
  });

  it("manages PDF page annotations through Rust commands", async () => {
    const strokeData =
      '{"schemaVersion":1,"coordinateSpace":"normalized","strokes":[]}';
    const annotation = {
      id: "annotation-1",
      materialId: "mat-pdf",
      pageNumber: 2,
      strokeDataJson: strokeData,
      strokeSchemaVersion: 1,
      pageWidth: 595,
      pageHeight: 842,
      createdAt: "2026-06-17T00:00:00Z",
      updatedAt: "2026-06-17T00:00:00Z",
    };
    invokeMock
      .mockResolvedValueOnce(annotation)
      .mockResolvedValueOnce({ ...annotation, pageNumber: 3 })
      .mockResolvedValueOnce(undefined);

    const loaded = await getPdfPageAnnotation("mat-pdf", 2);
    const saved = await savePdfPageAnnotation({
      materialId: "mat-pdf",
      pageNumber: 3,
      pageWidth: 595,
      pageHeight: 842,
      strokeData,
    });
    await deletePdfPageAnnotation("mat-pdf", 3);

    expect(loaded?.strokeDataJson).toBe(strokeData);
    expect(saved.pageNumber).toBe(3);
    expect(invokeMock).toHaveBeenNthCalledWith(1, "get_pdf_page_annotation", {
      materialId: "mat-pdf",
      pageNumber: 2,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "save_pdf_page_annotation", {
      input: {
        materialId: "mat-pdf",
        pageNumber: 3,
        pageWidth: 595,
        pageHeight: 842,
        strokeData,
      },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, "delete_pdf_page_annotation", {
      materialId: "mat-pdf",
      pageNumber: 3,
    });
  });

  it("rejects invalid PDF annotation payloads at the API boundary", async () => {
    invokeMock.mockResolvedValueOnce({
      id: "annotation-1",
      materialId: "mat-pdf",
      pageNumber: 0,
      strokeDataJson:
        '{"schemaVersion":1,"coordinateSpace":"normalized","strokes":[]}',
      strokeSchemaVersion: 1,
      pageWidth: 595,
      pageHeight: 842,
      createdAt: "2026-06-17T00:00:00Z",
      updatedAt: "2026-06-17T00:00:00Z",
    });

    await expect(getPdfPageAnnotation("mat-pdf", 1)).rejects.toThrow(
      "Invalid PDF annotation page number",
    );
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
      language: null,
      languageLabel: null,
      lineCount: null,
      isTruncated: false,
      highlightingMode: null,
    });

    const result = await previewMaterialFile("mat-1");

    expect(invokeMock).toHaveBeenCalledWith("preview_material_file", {
      materialId: "mat-1",
    });
    expect(result.text).toBe("资料正文");
  });

  it("decodes code material preview payloads at the API boundary", async () => {
    invokeMock.mockResolvedValueOnce({
      materialId: "mat-code",
      kind: "code",
      mimeType: "application/x-typescript",
      text: "const answer: number = 42;",
      dataUrl: null,
      assetPath: null,
      encoding: "utf-8",
      language: "typescript",
      languageLabel: "TypeScript",
      lineCount: 1,
      isTruncated: false,
      highlightingMode: "highlight",
    });

    const result = await previewMaterialFile("mat-code");

    expect(result.kind).toBe("code");
    expect(result.language).toBe("typescript");
    expect(result.languageLabel).toBe("TypeScript");
    expect(result.lineCount).toBe(1);
    expect(result.highlightingMode).toBe("highlight");
  });

  it("rejects invalid code highlighting mode payloads at the API boundary", async () => {
    invokeMock.mockResolvedValueOnce({
      materialId: "mat-code",
      kind: "code",
      mimeType: "application/x-typescript",
      text: "const answer = 42;",
      dataUrl: null,
      assetPath: null,
      encoding: "utf-8",
      language: "typescript",
      languageLabel: "TypeScript",
      lineCount: 1,
      isTruncated: false,
      highlightingMode: "unsafe_html",
    });

    await expect(previewMaterialFile("mat-code")).rejects.toThrow(
      "Invalid code highlighting mode",
    );
  });

  it("rejects invalid code material preview contracts at the API boundary", async () => {
    invokeMock.mockResolvedValueOnce({
      materialId: "mat-code",
      kind: "code",
      mimeType: "application/x-typescript",
      text: null,
      dataUrl: null,
      assetPath: null,
      encoding: "utf-8",
      language: "typescript",
      languageLabel: "TypeScript",
      lineCount: 1,
      isTruncated: false,
      highlightingMode: "highlight",
    });

    await expect(previewMaterialFile("mat-code")).rejects.toThrow("Invalid code preview text");

    invokeMock.mockResolvedValueOnce({
      materialId: "mat-code",
      kind: "code",
      mimeType: "application/x-typescript",
      text: "const value = 1;",
      dataUrl: "data:text/plain;base64,Y29uc3Q=",
      assetPath: null,
      encoding: "utf-8",
      language: "typescript",
      languageLabel: "TypeScript",
      lineCount: 1,
      isTruncated: false,
      highlightingMode: "highlight",
    });

    await expect(previewMaterialFile("mat-code")).rejects.toThrow(
      "Invalid code preview asset payload",
    );

    invokeMock.mockResolvedValueOnce({
      materialId: "mat-code",
      kind: "code",
      mimeType: "application/x-typescript",
      text: "const value = 1;",
      dataUrl: null,
      assetPath: null,
      encoding: "utf-8",
      language: "typescript",
      languageLabel: "TypeScript",
      lineCount: -1,
      isTruncated: false,
      highlightingMode: "highlight",
    });

    await expect(previewMaterialFile("mat-code")).rejects.toThrow(
      "Invalid code preview line count",
    );
  });

  it("rejects invalid material preview payloads at the API boundary", async () => {
    invokeMock.mockResolvedValueOnce({
      materialId: "mat-1",
      kind: "pdf",
      mimeType: "application/pdf",
      text: null,
      dataUrl: 123,
      assetPath: null,
      encoding: null,
      language: null,
      languageLabel: null,
      lineCount: null,
      isTruncated: false,
      highlightingMode: null,
    });

    await expect(previewMaterialFile("mat-1")).rejects.toThrow("Invalid API string value");
  });

  it("gets and changes material library location through token-based Rust commands", async () => {
    invokeMock
      .mockResolvedValueOnce({
        path: "C:/Users/123/AppData/Roaming/com.studyseq.desktop/materials",
        isDefault: true,
      })
      .mockResolvedValueOnce({
        token: "candidate-token",
        displayPath: "D:/LearningData/StudySeqData/materials",
        expiresAt: "2026-06-15T00:10:00Z",
      })
      .mockResolvedValueOnce({
        location: {
          path: "D:/LearningData/StudySeqData/materials",
          isDefault: false,
        },
        failedCleanupPathCount: 1,
      })
      .mockResolvedValueOnce({
        location: {
          path: "C:/Users/123/AppData/Roaming/com.studyseq.desktop/materials",
          isDefault: true,
        },
        failedCleanupPathCount: 0,
      });

    const current = await getMaterialLibraryLocation();
    const candidate = await prepareMaterialLibraryLocationChange();
    const moved = await applyMaterialLibraryLocationChange({
      kind: "selected",
      token: "candidate-token",
    });
    const reset = await applyMaterialLibraryLocationChange({ kind: "default" });

    expect(invokeMock).toHaveBeenNthCalledWith(1, "get_material_library_location");
    expect(invokeMock).toHaveBeenNthCalledWith(2, "prepare_material_library_location_change");
    expect(invokeMock).toHaveBeenNthCalledWith(3, "apply_material_library_location_change", {
      input: { kind: "selected", token: "candidate-token" },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, "apply_material_library_location_change", {
      input: { kind: "default" },
    });
    expect(current.isDefault).toBe(true);
    expect(candidate?.displayPath).toBe("D:/LearningData/StudySeqData/materials");
    expect(moved.location.path).toBe("D:/LearningData/StudySeqData/materials");
    expect(moved.failedCleanupPathCount).toBe(1);
    expect(reset.location.isDefault).toBe(true);
  });

  it("rejects invalid material library location change reports at the API boundary", async () => {
    invokeMock.mockResolvedValueOnce({
      location: {
        path: "D:/LearningData/StudySeqData/materials",
        isDefault: false,
      },
      failedCleanupPathCount: "1",
    });

    await expect(
      applyMaterialLibraryLocationChange({ kind: "selected", token: "candidate-token" }),
    ).rejects.toThrow("Invalid API number value");
  });

  it("rejects invalid material library location payloads at the API boundary", async () => {
    invokeMock.mockResolvedValueOnce({
      path: "D:/LearningData/StudySeqData/materials",
      isDefault: "false",
    });

    await expect(getMaterialLibraryLocation()).rejects.toThrow("Invalid API boolean value");
  });

  it("rejects invalid material library location candidate payloads at the API boundary", async () => {
    invokeMock.mockResolvedValueOnce({
      token: 123,
      displayPath: "D:/LearningData/StudySeqData/materials",
      expiresAt: "2026-06-15T00:10:00Z",
    });

    await expect(prepareMaterialLibraryLocationChange()).rejects.toThrow(
      "Invalid API string value",
    );
  });

  it("rejects legacy cleanup payloads that expose failed paths", async () => {
    invokeMock.mockResolvedValueOnce({
      deletedOrphanFileCount: 0,
      deletedOrphanDatabaseRecordCount: 0,
      deletedBytes: 0,
      failedPaths: ["C:/Users/123/secret/material.txt"],
      updatedAt: "2026-06-09T00:03:00Z",
    });

    await expect(cleanupMaterialLibrary()).rejects.toThrow("Invalid API number value");
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
        failedPathCount: 0,
        updatedAt: "2026-06-09T00:03:00Z",
      })
      .mockResolvedValueOnce({
        material: {
          id: "mat-pdf",
          learningContentId: "study-1",
          name: "重命名.pdf",
          storedPath: "C:/app/重命名.pdf",
          mimeType: "application/pdf",
          sizeBytes: 4,
          createdAt: "2026-06-09T00:00:00Z",
          updatedAt: "2026-06-09T00:04:00Z",
        },
        failedCleanupPathCount: 1,
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
    expect(renamed.material.name).toBe("重命名.pdf");
    expect(renamed.failedCleanupPathCount).toBe(1);
  });
});
