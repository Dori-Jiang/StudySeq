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
  recentOpen: RecentMaterialOpenSummary | null;
};

export type RecentMaterialOpenPosition =
  | { kind: "none" }
  | { kind: "pdf_page"; pageNumber: number }
  | { kind: "video_second"; seconds: number };

export type RecentMaterialOpenSummary = {
  materialId: string;
  materialName: string;
  openedAt: string;
  position: RecentMaterialOpenPosition;
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
  lastOpenedAt: string | null;
  positionKind: "none" | "pdf_page" | "video_second";
  videoPositionSeconds: number | null;
  updatedAt: string;
};

export type SaveMaterialReadingStateInput = {
  materialId: string;
  pageNumber: number;
  scale: number;
};

export type SaveVideoPlaybackStateInput = {
  materialId: string;
  positionSeconds: number;
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

export type MaterialDeletionReport = {
  failedCleanupPathCount: number;
};

export type MaterialLibraryCleanupReport = {
  deletedOrphanFileCount: number;
  deletedOrphanDatabaseRecordCount: number;
  deletedBytes: number;
  failedPathCount: number;
  updatedAt: string;
};

export type MaterialLibraryLocation = {
  path: string;
  isDefault: boolean;
};

export type MaterialLibraryLocationChangeReport = {
  location: MaterialLibraryLocation;
  failedCleanupPathCount: number;
};

export type MaterialLibraryLocationCandidate = {
  token: string;
  displayPath: string;
  expiresAt: string;
};

export type MaterialLibraryLocationChangeInput =
  | { kind: "selected"; token: string }
  | { kind: "default" };

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
  assetPath: string | null;
  encoding: string | null;
};

export type ImportMaterialFileInput = {
  learningContentId: string;
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
