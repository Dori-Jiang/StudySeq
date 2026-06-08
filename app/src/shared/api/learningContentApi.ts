import { invoke } from "@tauri-apps/api/core";

import type {
  CreateLearningContentInput,
  CreateNoteInput,
  ImportMaterialFileInput,
  LearningContent,
  LearningDetail,
  MaterialItem,
  MaterialPreview,
  Note,
  ReadingState,
  SaveReadingStateInput,
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

export function getReadingState(learningContentId: string): Promise<ReadingState | null> {
  return invoke<ReadingState | null>("get_reading_state", { learningContentId });
}

export function saveReadingState(input: SaveReadingStateInput): Promise<ReadingState> {
  return invoke<ReadingState>("save_reading_state", { input });
}
