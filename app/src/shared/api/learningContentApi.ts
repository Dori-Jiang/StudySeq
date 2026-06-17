import { invoke } from "@tauri-apps/api/core";

import type {
  CreateHandwritingNoteInput,
  CreateLearningContentInput,
  CreateMaterialFolderInput,
  CreateNoteInput,
  HandwritingNote,
  HandwritingNoteSummary,
  ImportMaterialFileInput,
  LearningContent,
  LearningDetail,
  MaterialDeletionReport,
  MaterialItem,
  MaterialLibraryCleanupReport,
  MaterialLibraryLocationCandidate,
  MaterialLibraryLocationChangeInput,
  MaterialLibraryLocationChangeReport,
  MaterialLibraryLocation,
  MaterialLibraryStats,
  MaterialPreview,
  MaterialReadingState,
  MaterialSubtreeCount,
  MoveMaterialItemInput,
  Note,
  PdfPageAnnotation,
  RenameMaterialItemInput,
  RenameMaterialItemReport,
  RecentMaterialOpenPosition,
  SaveMaterialReadingStateInput,
  SavePdfPageAnnotationInput,
  SaveVideoPlaybackStateInput,
  UpdateHandwritingNoteInput,
  UpdateLearningContentInput,
  UpdateNoteInput,
} from "../types";

export function listLearningContents(): Promise<LearningContent[]> {
  return invoke<unknown>("list_learning_contents").then(decodeLearningContents);
}

export function createLearningContent(
  input: CreateLearningContentInput,
): Promise<LearningContent> {
  return invoke<unknown>("create_learning_content", { input }).then(decodeLearningContent);
}

export function updateLearningContent(
  input: UpdateLearningContentInput,
): Promise<LearningContent> {
  return invoke<unknown>("update_learning_content", { input }).then(decodeLearningContent);
}

export function getLearningDetail(id: string): Promise<LearningDetail | null> {
  return invoke<unknown>("get_learning_detail", { id }).then((value) =>
    value === null ? null : decodeLearningDetail(value),
  );
}

export function deleteLearningContent(id: string): Promise<MaterialDeletionReport> {
  return invoke<unknown>("delete_learning_content", { id }).then(decodeMaterialDeletionReport);
}

export function deleteMaterialItem(id: string): Promise<MaterialDeletionReport> {
  return invoke<unknown>("delete_material_item", { id }).then(decodeMaterialDeletionReport);
}

export function importMaterialFile(input: ImportMaterialFileInput): Promise<MaterialItem | null> {
  return invoke<MaterialItem | null>("import_material_file", { input });
}

export function createNote(input: CreateNoteInput): Promise<Note> {
  return invoke<Note>("create_note", { input });
}

export function updateNote(input: UpdateNoteInput): Promise<Note> {
  return invoke<Note>("update_note", { input });
}

export function deleteNote(id: string): Promise<void> {
  return invoke<void>("delete_note", { id });
}

export function listHandwritingNoteSummaries(
  learningContentId: string,
): Promise<HandwritingNoteSummary[]> {
  return invoke<unknown>("list_handwriting_note_summaries", {
    learningContentId,
  }).then(decodeHandwritingNoteSummaries);
}

export function getHandwritingNote(
  learningContentId: string,
  id: string,
): Promise<HandwritingNote> {
  return invoke<unknown>("get_handwriting_note", { learningContentId, id }).then(
    decodeHandwritingNote,
  );
}

export function createHandwritingNote(
  input: CreateHandwritingNoteInput,
): Promise<HandwritingNote> {
  return invoke<unknown>("create_handwriting_note", { input }).then(decodeHandwritingNote);
}

export function updateHandwritingNote(
  input: UpdateHandwritingNoteInput,
): Promise<HandwritingNote> {
  return invoke<unknown>("update_handwriting_note", { input }).then(decodeHandwritingNote);
}

export function deleteHandwritingNote(learningContentId: string, id: string): Promise<void> {
  return invoke<void>("delete_handwriting_note", { learningContentId, id });
}

export function getPdfPageAnnotation(
  materialId: string,
  pageNumber: number,
): Promise<PdfPageAnnotation | null> {
  return invoke<unknown>("get_pdf_page_annotation", { materialId, pageNumber }).then((value) =>
    value === null ? null : decodePdfPageAnnotation(value),
  );
}

export function savePdfPageAnnotation(
  input: SavePdfPageAnnotationInput,
): Promise<PdfPageAnnotation> {
  return invoke<unknown>("save_pdf_page_annotation", { input }).then(decodePdfPageAnnotation);
}

export function deletePdfPageAnnotation(materialId: string, pageNumber: number): Promise<void> {
  return invoke<void>("delete_pdf_page_annotation", { materialId, pageNumber });
}

export function previewMaterialFile(materialId: string): Promise<MaterialPreview> {
  return invoke<unknown>("preview_material_file", { materialId }).then(decodeMaterialPreview);
}

export function copyTextToClipboard(text: string): Promise<void> {
  return invoke<void>("copy_text_to_clipboard", { text });
}

export function getMaterialReadingState(
  materialId: string,
): Promise<MaterialReadingState | null> {
  return invoke<unknown>("get_material_reading_state", { materialId }).then((value) =>
    value === null ? null : decodeMaterialReadingState(value),
  );
}

export function saveMaterialReadingState(
  input: SaveMaterialReadingStateInput,
): Promise<MaterialReadingState> {
  return invoke<unknown>("save_material_reading_state", { input }).then(
    decodeMaterialReadingState,
  );
}

export function saveVideoPlaybackState(
  input: SaveVideoPlaybackStateInput,
): Promise<MaterialReadingState> {
  return invoke<unknown>("save_video_playback_state", { input }).then(
    decodeMaterialReadingState,
  );
}

export function getMaterialLibraryStats(): Promise<MaterialLibraryStats> {
  return invoke<MaterialLibraryStats>("get_material_library_stats");
}

export function cleanupMaterialLibrary(): Promise<MaterialLibraryCleanupReport> {
  return invoke<unknown>("cleanup_material_library").then(decodeMaterialLibraryCleanupReport);
}

export function getMaterialLibraryLocation(): Promise<MaterialLibraryLocation> {
  return invoke<unknown>("get_material_library_location").then(decodeMaterialLibraryLocation);
}

export function prepareMaterialLibraryLocationChange(): Promise<MaterialLibraryLocationCandidate | null> {
  return invoke<unknown>("prepare_material_library_location_change").then((value) =>
    value === null ? null : decodeMaterialLibraryLocationCandidate(value),
  );
}

export function applyMaterialLibraryLocationChange(
  input: MaterialLibraryLocationChangeInput,
): Promise<MaterialLibraryLocationChangeReport> {
  return invoke<unknown>("apply_material_library_location_change", { input }).then(
    decodeMaterialLibraryLocationChangeReport,
  );
}

export function renameMaterialItem(
  input: RenameMaterialItemInput,
): Promise<RenameMaterialItemReport> {
  return invoke<unknown>("rename_material_item", { input }).then(decodeRenameMaterialItemReport);
}

export function createMaterialFolder(
  input: CreateMaterialFolderInput,
): Promise<MaterialItem> {
  return invoke<MaterialItem>("create_material_folder", { input });
}

export function moveMaterialItem(input: MoveMaterialItemInput): Promise<MaterialItem> {
  return invoke<MaterialItem>("move_material_item", { input });
}

export function countMaterialSubtree(materialId: string): Promise<MaterialSubtreeCount> {
  return invoke<MaterialSubtreeCount>("count_material_subtree", { materialId });
}

function decodeLearningContents(value: unknown): LearningContent[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid learning content list");
  }
  return value.map(decodeLearningContent);
}

function decodeLearningContent(value: unknown): LearningContent {
  const record = asRecord(value);
  const progress = finiteNumber(record.progress);
  const estimatedHours = finiteNumber(record.estimatedHours);
  return {
    id: stringValue(record.id),
    name: stringValue(record.name),
    status: decodeStudyStatus(record.status),
    deadline: nullableString(record.deadline),
    estimatedHours,
    progress,
    createdAt: stringValue(record.createdAt),
    updatedAt: stringValue(record.updatedAt),
    lastOpenedAt: nullableString(record.lastOpenedAt),
    recentOpen: record.recentOpen === null ? null : decodeRecentOpen(record.recentOpen),
  };
}

function decodeLearningDetail(value: unknown): LearningDetail {
  const record = asRecord(value);
  const materials = record.materials;
  const notes = record.notes;
  const handwritingNotes = record.handwritingNotes;
  if (!Array.isArray(materials) || !Array.isArray(notes) || !Array.isArray(handwritingNotes)) {
    throw new Error("Invalid learning detail");
  }
  return {
    learningContent: decodeLearningContent(record.learningContent),
    materials: materials.map(decodeMaterialItem),
    notes: notes.map(decodeNote),
    handwritingNotes: handwritingNotes.map(decodeHandwritingNoteSummary),
  };
}

function decodeMaterialItem(value: unknown): MaterialItem {
  const record = asRecord(value);
  const kind = stringValue(record.kind);
  if (kind !== "file" && kind !== "folder") {
    throw new Error("Invalid material kind");
  }
  return {
    id: stringValue(record.id),
    learningContentId: stringValue(record.learningContentId),
    parentId: optionalNullableString(record.parentId),
    kind,
    name: stringValue(record.name),
    storedPath: optionalNullableString(record.storedPath),
    mimeType: optionalNullableString(record.mimeType),
    sizeBytes: finiteNumber(record.sizeBytes),
    createdAt: stringValue(record.createdAt),
    updatedAt: stringValue(record.updatedAt),
  };
}

function decodeNote(value: unknown): Note {
  const record = asRecord(value);
  return {
    id: stringValue(record.id),
    learningContentId: stringValue(record.learningContentId),
    title: stringValue(record.title),
    body: stringValue(record.body),
    createdAt: stringValue(record.createdAt),
    updatedAt: stringValue(record.updatedAt),
  };
}

function decodeHandwritingNoteSummaries(value: unknown): HandwritingNoteSummary[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid handwriting note summary list");
  }
  return value.map(decodeHandwritingNoteSummary);
}

function decodeHandwritingNoteSummary(value: unknown): HandwritingNoteSummary {
  const record = asRecord(value);
  const summary = {
    id: stringValue(record.id),
    learningContentId: stringValue(record.learningContentId),
    title: stringValue(record.title),
    strokeSchemaVersion: finiteNumber(record.strokeSchemaVersion),
    canvasWidth: finiteNumber(record.canvasWidth),
    canvasHeight: finiteNumber(record.canvasHeight),
    createdAt: stringValue(record.createdAt),
    updatedAt: stringValue(record.updatedAt),
  };
  validateHandwritingNoteSummary(summary);
  return summary;
}

function decodeHandwritingNote(value: unknown): HandwritingNote {
  const record = asRecord(value);
  const note = {
    ...decodeHandwritingNoteSummary(record),
    strokeDataJson: stringValue(record.strokeDataJson),
  };
  validateHandwritingDataContract(note.strokeDataJson);
  return note;
}

function decodePdfPageAnnotation(value: unknown): PdfPageAnnotation {
  const record = asRecord(value);
  const annotation = {
    id: stringValue(record.id),
    materialId: stringValue(record.materialId),
    pageNumber: finiteNumber(record.pageNumber),
    strokeDataJson: stringValue(record.strokeDataJson),
    strokeSchemaVersion: finiteNumber(record.strokeSchemaVersion),
    pageWidth: finiteNumber(record.pageWidth),
    pageHeight: finiteNumber(record.pageHeight),
    createdAt: stringValue(record.createdAt),
    updatedAt: stringValue(record.updatedAt),
  };
  validatePdfPageAnnotation(annotation);
  return annotation;
}

function validateHandwritingNoteSummary(summary: HandwritingNoteSummary) {
  if (summary.strokeSchemaVersion !== 1) {
    throw new Error("Invalid handwriting schema version");
  }
  if (summary.canvasWidth <= 0 || summary.canvasHeight <= 0) {
    throw new Error("Invalid handwriting canvas size");
  }
}

function validatePdfPageAnnotation(annotation: PdfPageAnnotation) {
  if (annotation.strokeSchemaVersion !== 1) {
    throw new Error("Invalid PDF annotation schema version");
  }
  if (!Number.isInteger(annotation.pageNumber) || annotation.pageNumber < 1) {
    throw new Error("Invalid PDF annotation page number");
  }
  if (annotation.pageWidth <= 0 || annotation.pageHeight <= 0) {
    throw new Error("Invalid PDF annotation page size");
  }
  validateHandwritingDataContract(annotation.strokeDataJson);
}

function validateHandwritingDataContract(strokeDataJson: string) {
  const parsed: unknown = JSON.parse(strokeDataJson);
  const record = asRecord(parsed);
  if (
    finiteNumber(record.schemaVersion) !== 1 ||
    stringValue(record.coordinateSpace) !== "normalized" ||
    !Array.isArray(record.strokes)
  ) {
    throw new Error("Invalid handwriting data");
  }
}

function decodeRecentOpen(value: unknown): LearningContent["recentOpen"] {
  const record = asRecord(value);
  return {
    materialId: stringValue(record.materialId),
    materialName: stringValue(record.materialName),
    openedAt: stringValue(record.openedAt),
    position: decodeRecentOpenPosition(record.position),
  };
}

function decodeRecentOpenPosition(value: unknown): RecentMaterialOpenPosition {
  const record = asRecord(value);
  const kind = stringValue(record.kind);
  if (kind === "none") {
    return { kind };
  }
  if (kind === "pdf_page") {
    return { kind, pageNumber: finiteNumber(record.pageNumber) };
  }
  if (kind === "video_second") {
    return { kind, seconds: finiteNumber(record.seconds) };
  }
  throw new Error("Invalid recent open position");
}

function decodeMaterialReadingState(value: unknown): MaterialReadingState {
  const record = asRecord(value);
  return {
    materialId: stringValue(record.materialId),
    pageNumber: finiteNumber(record.pageNumber),
    scale: finiteNumber(record.scale),
    lastOpenedAt: nullableString(record.lastOpenedAt),
    positionKind: decodePositionKind(record.positionKind),
    videoPositionSeconds:
      record.videoPositionSeconds === null ? null : finiteNumber(record.videoPositionSeconds),
    updatedAt: stringValue(record.updatedAt),
  };
}

function decodeMaterialPreview(value: unknown): MaterialPreview {
  const record = asRecord(value);
  const preview = {
    materialId: stringValue(record.materialId),
    kind: decodeMaterialPreviewKind(record.kind),
    mimeType: nullableString(record.mimeType),
    text: nullableString(record.text),
    dataUrl: nullableString(record.dataUrl),
    assetPath: optionalNullableString(record.assetPath),
    encoding: nullableString(record.encoding),
    language: nullableString(record.language),
    languageLabel: nullableString(record.languageLabel),
    lineCount: nullableNumber(record.lineCount),
    isTruncated: booleanValue(record.isTruncated),
    highlightingMode: nullableHighlightingMode(record.highlightingMode),
  };
  validateMaterialPreviewContract(preview);
  return preview;
}

function validateMaterialPreviewContract(preview: MaterialPreview) {
  if (preview.kind !== "code") return;

  if (preview.text === null) {
    throw new Error("Invalid code preview text");
  }
  if (preview.dataUrl !== null || preview.assetPath !== null) {
    throw new Error("Invalid code preview asset payload");
  }
  if (preview.highlightingMode === null) {
    throw new Error("Invalid code highlighting mode");
  }
  if (preview.lineCount === null || !Number.isInteger(preview.lineCount) || preview.lineCount < 0) {
    throw new Error("Invalid code preview line count");
  }
}

function decodeMaterialLibraryLocation(value: unknown): MaterialLibraryLocation {
  const record = asRecord(value);
  return {
    path: stringValue(record.path),
    isDefault: booleanValue(record.isDefault),
  };
}

function decodeMaterialLibraryLocationChangeReport(
  value: unknown,
): MaterialLibraryLocationChangeReport {
  const record = asRecord(value);
  return {
    location: decodeMaterialLibraryLocation(record.location),
    failedCleanupPathCount: finiteNumber(record.failedCleanupPathCount),
  };
}

function decodeRenameMaterialItemReport(value: unknown): RenameMaterialItemReport {
  const record = asRecord(value);
  return {
    material: record.material as MaterialItem,
    failedCleanupPathCount: finiteNumber(record.failedCleanupPathCount),
  };
}

function decodeMaterialDeletionReport(value: unknown): MaterialDeletionReport {
  const record = asRecord(value);
  return {
    failedCleanupPathCount: finiteNumber(record.failedCleanupPathCount),
  };
}

function decodeMaterialLibraryLocationCandidate(
  value: unknown,
): MaterialLibraryLocationCandidate {
  const record = asRecord(value);
  return {
    token: stringValue(record.token),
    displayPath: stringValue(record.displayPath),
    expiresAt: stringValue(record.expiresAt),
  };
}

function decodeMaterialLibraryCleanupReport(value: unknown): MaterialLibraryCleanupReport {
  const record = asRecord(value);
  return {
    deletedOrphanFileCount: finiteNumber(record.deletedOrphanFileCount),
    deletedOrphanDatabaseRecordCount: finiteNumber(record.deletedOrphanDatabaseRecordCount),
    deletedBytes: finiteNumber(record.deletedBytes),
    failedPathCount: finiteNumber(record.failedPathCount),
    updatedAt: stringValue(record.updatedAt),
  };
}

function decodeStudyStatus(value: unknown): LearningContent["status"] {
  if (
    value === "planned" ||
    value === "active" ||
    value === "paused" ||
    value === "completed" ||
    value === "overdue"
  ) {
    return value;
  }
  throw new Error("Invalid study status");
}

function decodePositionKind(value: unknown): MaterialReadingState["positionKind"] {
  if (value === "none" || value === "pdf_page" || value === "video_second") {
    return value;
  }
  throw new Error("Invalid material position kind");
}

function decodeMaterialPreviewKind(value: unknown): MaterialPreview["kind"] {
  if (
    value === "text" ||
    value === "code" ||
    value === "image" ||
    value === "pdf" ||
    value === "video" ||
    value === "unsupported"
  ) {
    return value;
  }
  throw new Error("Invalid material preview kind");
}

function nullableHighlightingMode(value: unknown): MaterialPreview["highlightingMode"] {
  if (value === null) return null;
  if (
    value === "highlight" ||
    value === "plain_too_large" ||
    value === "plain_unknown_language" ||
    value === "plain_decode_lossy"
  ) {
    return value;
  }
  throw new Error("Invalid code highlighting mode");
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid API payload");
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Invalid API string value");
  }
  return value;
}

function nullableString(value: unknown): string | null {
  if (value === null) return null;
  return stringValue(value);
}

function nullableNumber(value: unknown): number | null {
  if (value === null) return null;
  return finiteNumber(value);
}

function optionalNullableString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return stringValue(value);
}

function finiteNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Invalid API number value");
  }
  return value;
}

function booleanValue(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new Error("Invalid API boolean value");
  }
  return value;
}
