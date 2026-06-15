import { invoke } from "@tauri-apps/api/core";

import type {
  CreateLearningContentInput,
  CreateMaterialFolderInput,
  CreateNoteInput,
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
  RenameMaterialItemInput,
  RenameMaterialItemReport,
  RecentMaterialOpenPosition,
  SaveMaterialReadingStateInput,
  SaveVideoPlaybackStateInput,
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

export function previewMaterialFile(materialId: string): Promise<MaterialPreview> {
  return invoke<unknown>("preview_material_file", { materialId }).then(decodeMaterialPreview);
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
  if (!Array.isArray(materials) || !Array.isArray(notes)) {
    throw new Error("Invalid learning detail");
  }
  return {
    learningContent: decodeLearningContent(record.learningContent),
    materials: materials as MaterialItem[],
    notes: notes as Note[],
  };
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
  return {
    materialId: stringValue(record.materialId),
    kind: decodeMaterialPreviewKind(record.kind),
    mimeType: nullableString(record.mimeType),
    text: nullableString(record.text),
    dataUrl: nullableString(record.dataUrl),
    assetPath: optionalNullableString(record.assetPath),
    encoding: nullableString(record.encoding),
  };
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
    value === "image" ||
    value === "pdf" ||
    value === "video" ||
    value === "unsupported"
  ) {
    return value;
  }
  throw new Error("Invalid material preview kind");
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
