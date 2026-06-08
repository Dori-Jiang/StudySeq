export type StudyStatus = "planned" | "active" | "paused" | "completed" | "overdue";

export type LearningContent = {
  id: string;
  name: string;
  status: StudyStatus;
  deadline: string | null;
  estimatedHours: number;
  progress: number;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
};

export type CreateLearningContentInput = {
  name: string;
  deadline?: string | null;
  estimatedHours?: number;
  progress?: number;
};

export type UpdateLearningContentInput = {
  id: string;
  deadline: string | null;
  progress: number;
};

export type MaterialItem = {
  id: string;
  learningContentId: string;
  name: string;
  originalPath: string;
  storedPath: string;
  mimeType: string | null;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
};

export type Note = {
  id: string;
  learningContentId: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type LearningDetail = {
  learningContent: LearningContent;
  materials: MaterialItem[];
  notes: Note[];
};

export type MaterialPreviewKind = "text" | "image" | "pdf" | "unsupported";

export type MaterialPreview = {
  materialId: string;
  kind: MaterialPreviewKind;
  mimeType: string | null;
  text: string | null;
  dataUrl: string | null;
  encoding: string | null;
};

export type ReadingState = {
  learningContentId: string;
  currentMaterialId: string | null;
  currentNoteId: string | null;
  splitRatio: number;
  updatedAt: string;
};

export type ImportMaterialFileInput = {
  learningContentId: string;
  sourcePath: string;
};

export type CreateNoteInput = {
  learningContentId: string;
  title: string;
  body: string;
};

export type UpdateNoteInput = {
  noteId: string;
  title: string;
  body: string;
};

export type SaveReadingStateInput = {
  learningContentId: string;
  currentMaterialId: string | null;
  currentNoteId: string | null;
  splitRatio: number;
};
