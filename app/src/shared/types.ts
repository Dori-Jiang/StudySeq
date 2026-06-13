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
  name: string;
  status: StudyStatus;
  deadline: string | null;
  estimatedHours: number;
  progress: number;
};

export type MaterialKind = "file" | "folder";

export type MaterialItem = {
  id: string;
  learningContentId: string;
  parentId: string | null;
  kind: MaterialKind;
  name: string;
  originalPath: string | null;
  storedPath: string | null;
  mimeType: string | null;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateMaterialFolderInput = {
  learningContentId: string;
  parentId: string | null;
  name: string;
};

export type MoveMaterialItemInput = {
  materialId: string;
  newParentId: string | null;
};

export type MaterialSubtreeCount = {
  fileCount: number;
  folderCount: number;
};

export type MaterialReadingState = {
  materialId: string;
  pageNumber: number;
  scale: number;
  updatedAt: string;
};

export type SaveMaterialReadingStateInput = {
  materialId: string;
  pageNumber: number;
  scale: number;
};

export type MaterialLibraryStats = {
  materialCount: number;
  referencedBytes: number;
  actualReferencedBytes: number;
  libraryBytes: number;
  missingFileCount: number;
  orphanFileCount: number;
  orphanDatabaseRecordCount: number;
  orphanBytes: number;
  updatedAt: string;
};

export type MaterialLibraryCleanupReport = {
  deletedOrphanFileCount: number;
  deletedOrphanDatabaseRecordCount: number;
  deletedBytes: number;
  failedPaths: string[];
  updatedAt: string;
};

export type RenameMaterialItemInput = {
  materialId: string;
  name: string;
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

export type MaterialPreviewKind = "text" | "image" | "pdf" | "video" | "unsupported";

export type MaterialPreview = {
  materialId: string;
  kind: MaterialPreviewKind;
  mimeType: string | null;
  text: string | null;
  dataUrl: string | null;
  encoding: string | null;
};

export type ImportMaterialFileInput = {
  learningContentId: string;
  sourcePath: string;
  parentId?: string | null;
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
