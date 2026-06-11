import { invoke } from "@tauri-apps/api/core";

import type {
  CreateLearningContentInput,
  CreateMaterialFolderInput,
  CreateNoteInput,
  ImportMaterialFileInput,
  LearningContent,
  LearningDetail,
  MaterialItem,
  MaterialLibraryCleanupReport,
  MaterialLibraryStats,
  MaterialPreview,
  MaterialReadingState,
  MaterialSubtreeCount,
  MoveMaterialItemInput,
  Note,
  RenameMaterialItemInput,
  SaveMaterialReadingStateInput,
  UpdateLearningContentInput,
  UpdateNoteInput,
} from "../types";

export function listLearningContents(): Promise<LearningContent[]> {
  return invoke<LearningContent[]>("list_learning_contents");
}

export function createLearningContent(
  input: CreateLearningContentInput,
): Promise<LearningContent> {
  return invoke<LearningContent>("create_learning_content", { input });
}

export function updateLearningContent(
  input: UpdateLearningContentInput,
): Promise<LearningContent> {
  return invoke<LearningContent>("update_learning_content", { input });
}

export function getLearningDetail(id: string): Promise<LearningDetail | null> {
  return invoke<LearningDetail | null>("get_learning_detail", { id });
}

export function deleteLearningContent(id: string): Promise<void> {
  return invoke<void>("delete_learning_content", { id });
}

export function deleteMaterialItem(id: string): Promise<void> {
  return invoke<void>("delete_material_item", { id });
}

export function importMaterialFile(input: ImportMaterialFileInput): Promise<MaterialItem> {
  return invoke<MaterialItem>("import_material_file", { input });
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
  return invoke<MaterialPreview>("preview_material_file", { materialId });
}

export function getMaterialReadingState(
  materialId: string,
): Promise<MaterialReadingState | null> {
  return invoke<MaterialReadingState | null>("get_material_reading_state", { materialId });
}

export function saveMaterialReadingState(
  input: SaveMaterialReadingStateInput,
): Promise<MaterialReadingState> {
  return invoke<MaterialReadingState>("save_material_reading_state", { input });
}

export function getMaterialLibraryStats(): Promise<MaterialLibraryStats> {
  return invoke<MaterialLibraryStats>("get_material_library_stats");
}

export function cleanupMaterialLibrary(): Promise<MaterialLibraryCleanupReport> {
  return invoke<MaterialLibraryCleanupReport>("cleanup_material_library");
}

export function renameMaterialItem(input: RenameMaterialItemInput): Promise<MaterialItem> {
  return invoke<MaterialItem>("rename_material_item", { input });
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
