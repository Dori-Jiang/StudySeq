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

export type RenameMaterialItemReport = {
  material: MaterialItem;
  failedCleanupPathCount: number;
};

export type Note = {
  id: string;
  learningContentId: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type HandwritingPoint = {
  x: number;
  y: number;
  t: number;
};

export type HandwritingTool = "pen" | "eraser";

export type HandwritingStroke = {
  id: string;
  tool: HandwritingTool;
  color: string;
  width: number;
  points: HandwritingPoint[];
};

export type HandwritingData = {
  schemaVersion: 1;
  coordinateSpace: "normalized";
  strokes: HandwritingStroke[];
};

export type HandwritingNoteSummary = {
  id: string;
  learningContentId: string;
  title: string;
  strokeSchemaVersion: number;
  canvasWidth: number;
  canvasHeight: number;
  createdAt: string;
  updatedAt: string;
};

export type HandwritingNote = HandwritingNoteSummary & {
  strokeDataJson: string;
};

export type PdfPageAnnotation = {
  id: string;
  materialId: string;
  pageNumber: number;
  strokeDataJson: string;
  strokeSchemaVersion: number;
  pageWidth: number;
  pageHeight: number;
  createdAt: string;
  updatedAt: string;
};

export type SavePdfPageAnnotationInput = {
  materialId: string;
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  strokeData: string;
};

export type LearningDetail = {
  learningContent: LearningContent;
  materials: MaterialItem[];
  notes: Note[];
  handwritingNotes: HandwritingNoteSummary[];
};

export type CodeHighlightingMode =
  | "highlight"
  | "plain_too_large"
  | "plain_unknown_language"
  | "plain_decode_lossy";

export type MaterialPreviewKind = "text" | "code" | "image" | "pdf" | "video" | "unsupported";

export type MaterialPreview = {
  materialId: string;
  kind: MaterialPreviewKind;
  mimeType: string | null;
  text: string | null;
  dataUrl: string | null;
  assetPath: string | null;
  encoding: string | null;
  language: string | null;
  languageLabel: string | null;
  lineCount: number | null;
  isTruncated: boolean;
  highlightingMode: CodeHighlightingMode | null;
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

export type CreateHandwritingNoteInput = {
  learningContentId: string;
  title: string;
  strokeDataJson: string;
  canvasWidth: number;
  canvasHeight: number;
};

export type UpdateHandwritingNoteInput = {
  learningContentId: string;
  noteId: string;
  title: string;
  strokeDataJson: string;
  canvasWidth: number;
  canvasHeight: number;
};
