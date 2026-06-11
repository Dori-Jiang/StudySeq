import { open } from "@tauri-apps/plugin-dialog";
import {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, useParams } from "react-router";

import {
  countMaterialSubtree,
  createMaterialFolder,
  createNote,
  cleanupMaterialLibrary,
  deleteMaterialItem,
  deleteNote,
  getLearningDetail,
  getMaterialReadingState,
  getMaterialLibraryStats,
  importMaterialFile,
  moveMaterialItem,
  previewMaterialFile,
  renameMaterialItem,
  saveMaterialReadingState,
  updateNote,
} from "../shared/api/learningContentApi";
import { MaterialPreviewPane } from "./MaterialPreviewPane";
import { MaterialDeletionBar } from "./materials/MaterialDeletionBar";
import { MaterialExplorer } from "./materials/MaterialExplorer";
import { MaterialLibraryStatsPanel } from "./materials/MaterialLibraryStatsPanel";
import { formatBytes } from "./materials/format";
import { collectSubtreeIds } from "./materials/materialTree";
import type {
  LearningDetail,
  MaterialItem,
  MaterialLibraryStats,
  MaterialPreview,
  Note,
  StudyStatus,
} from "../shared/types";

const DEFAULT_DETAIL_SPLIT_RATIO = 58;
const MIN_DETAIL_SPLIT_RATIO = 30;
const MAX_DETAIL_SPLIT_RATIO = 70;
const PDF_STATE_SAVE_DELAY_MS = 800;

const statusLabels: Record<StudyStatus, string> = {
  planned: "计划中",
  active: "进行中",
  paused: "暂停",
  completed: "完成",
  overdue: "超期",
};

export function StudyDetailPage() {
  const { studyId } = useParams<{ studyId: string }>();
  const detailGridRef = useRef<HTMLDivElement | null>(null);
  const isDetailSplitDraggingRef = useRef(false);
  const [detail, setDetail] = useState<LearningDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [pendingDeletedMaterialIds, setPendingDeletedMaterialIds] = useState<string[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [selectedMaterialPreview, setSelectedMaterialPreview] = useState<MaterialPreview | null>(
    null,
  );
  const [selectedMaterialPdfState, setSelectedMaterialPdfState] = useState<{
    pageNumber: number;
    scale: number;
  } | null>(null);
  const [pendingPdfState, setPendingPdfState] = useState<{
    materialId: string;
    pageNumber: number;
    scale: number;
  } | null>(null);
  const [materialLibraryStats, setMaterialLibraryStats] = useState<MaterialLibraryStats | null>(
    null,
  );
  const [statsMessage, setStatsMessage] = useState<string | null>(null);
  const [detailSplitRatio, setDetailSplitRatio] = useState(DEFAULT_DETAIL_SPLIT_RATIO);
  const selectedMaterial =
    detail?.materials.find((material) => material.id === selectedMaterialId) ?? undefined;

  useEffect(() => {
    if (!studyId) {
      setError("缺少学习内容 ID");
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    getLearningDetail(studyId)
      .then((loadedDetail) => {
        if (isMounted) {
          setDetail(loadedDetail);
        }
      })
      .catch((loadError: unknown) => {
        if (isMounted) {
          setError(toMessage(loadError));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [studyId]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      if (!isDetailSplitDraggingRef.current || !detailGridRef.current) return;

      const bounds = detailGridRef.current.getBoundingClientRect();
      if (bounds.width <= 0) return;

      const nextRatio = Math.round(((event.clientX - bounds.left) / bounds.width) * 100);
      setDetailSplitRatio(clamp(nextRatio, MIN_DETAIL_SPLIT_RATIO, MAX_DETAIL_SPLIT_RATIO));
    }

    function handlePointerUp() {
      isDetailSplitDraggingRef.current = false;
      document.body.classList.remove("is-resizing-split-pane");
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.classList.remove("is-resizing-split-pane");
    };
  }, []);

  async function handleImportMaterial(parentId: string | null) {
    if (!studyId) return;

    const selected = await open({
      multiple: false,
      directory: false,
    });
    if (typeof selected !== "string") return;

    const imported = await importMaterialFile({
      learningContentId: studyId,
      sourcePath: selected,
      parentId,
    });

    setDetail((currentDetail) =>
      currentDetail
        ? {
            ...currentDetail,
            materials: [...currentDetail.materials, imported],
          }
        : currentDetail,
    );
    setPendingDeletedMaterialIds((currentIds) =>
      currentIds.filter((materialId) => materialId !== imported.id),
    );
  }

  async function handleCreateFolder(parentId: string | null) {
    if (!studyId) return;

    const name = window.prompt("输入文件夹名称", "新建文件夹");
    if (name === null) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("文件夹名称不能为空");
      return;
    }

    try {
      const folder = await createMaterialFolder({
        learningContentId: studyId,
        parentId,
        name: trimmedName,
      });
      setDetail((currentDetail) =>
        currentDetail
          ? {
              ...currentDetail,
              materials: [...currentDetail.materials, folder],
            }
          : currentDetail,
      );
      setError(null);
    } catch (createError: unknown) {
      setError(toMessage(createError));
    }
  }

  async function handleMoveMaterial(material: MaterialItem, newParentId: string | null) {
    try {
      const moved = await moveMaterialItem({
        materialId: material.id,
        newParentId,
      });
      setDetail((currentDetail) =>
        currentDetail
          ? {
              ...currentDetail,
              materials: currentDetail.materials.map((currentMaterial) =>
                currentMaterial.id === moved.id ? moved : currentMaterial,
              ),
            }
          : currentDetail,
      );
      setError(null);
    } catch (moveError: unknown) {
      setError(toMessage(moveError));
    }
  }

  async function handleOpenMaterial(material: MaterialItem) {
    setSelectedMaterialId(material.id);
    setSelectedMaterialPreview(null);
    setSelectedMaterialPdfState(null);
    try {
      const [preview, readingState] = await Promise.all([
        previewMaterialFile(material.id),
        getMaterialReadingState(material.id).catch(() => null),
      ]);
      setSelectedMaterialPreview(preview);
      setSelectedMaterialPdfState(
        readingState
          ? {
              pageNumber: readingState.pageNumber,
              scale: readingState.scale,
            }
          : null,
      );
      setError(null);
    } catch (previewError: unknown) {
      setError(toMessage(previewError));
    }
  }

  function handleReturnToMaterialList() {
    setSelectedMaterialId(null);
    setSelectedMaterialPreview(null);
    setSelectedMaterialPdfState(null);
  }

  const handlePdfStateChange = useCallback(
    (nextPdfState: { pageNumber: number; scale: number }) => {
      if (!selectedMaterialId) return;

      setPendingPdfState((currentState) => {
        if (
          currentState?.materialId === selectedMaterialId &&
          currentState.pageNumber === nextPdfState.pageNumber &&
          currentState.scale === nextPdfState.scale
        ) {
          return currentState;
        }

        return {
          materialId: selectedMaterialId,
          pageNumber: nextPdfState.pageNumber,
          scale: nextPdfState.scale,
        };
      });
    },
    [selectedMaterialId],
  );

  useEffect(() => {
    if (!pendingPdfState) return;

    const timeoutId = window.setTimeout(() => {
      saveMaterialReadingState(pendingPdfState).catch((saveError: unknown) => {
        setError(toMessage(saveError));
      });
    }, PDF_STATE_SAVE_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [pendingPdfState]);

  async function handleSaveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!studyId) return;

    const title = noteTitle.trim();
    if (!title) {
      setError("笔记标题不能为空");
      return;
    }

    const saved = selectedNoteId
      ? await updateNote({
          noteId: selectedNoteId,
          title,
          body: noteBody,
        })
      : await createNote({
          learningContentId: studyId,
          title,
          body: noteBody,
        });

    setDetail((currentDetail) =>
      currentDetail
        ? {
            ...currentDetail,
            notes: upsertNote(currentDetail.notes, saved),
          }
        : currentDetail,
    );
    setSelectedNoteId(saved.id);
    setNoteTitle(saved.title);
    setNoteBody(saved.body);
    setError(null);
  }

  async function handleStageDeleteMaterial(material: MaterialItem) {
    let confirmMessage = `确定删除资料「${material.name}」吗？保存后将无法撤回。`;
    if (material.kind === "folder") {
      try {
        const count = await countMaterialSubtree(material.id);
        confirmMessage =
          `将删除文件夹「${material.name}」及其中 ${count.fileCount + count.folderCount} 个资料` +
          `（${count.fileCount} 个文件、${count.folderCount} 个子文件夹）。` +
          `仅删除 App 管理副本，不影响原始文件。确定删除吗？保存后将无法撤回。`;
      } catch (countError: unknown) {
        setError(toMessage(countError));
        return;
      }
    }
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setPendingDeletedMaterialIds((currentIds) =>
      currentIds.includes(material.id) ? currentIds : [...currentIds, material.id],
    );
    if (selectedMaterialId === material.id) {
      handleReturnToMaterialList();
    }
  }

  function handleUndoDeleteMaterial(materialId: string) {
    setPendingDeletedMaterialIds((currentIds) =>
      currentIds.filter((currentId) => currentId !== materialId),
    );
  }

  async function handleSaveMaterialDeletes() {
    if (!detail || pendingDeletedMaterialIds.length === 0) return;

    const idsToDelete = [...pendingDeletedMaterialIds];
    const deleteResults = await Promise.allSettled(
      idsToDelete.map(async (materialId) => {
        await deleteMaterialItem(materialId);
        return materialId;
      }),
    );
    const deletedIds = deleteResults.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    const failedIds = idsToDelete.filter((materialId) => !deletedIds.includes(materialId));
    setDetail((currentDetail) => {
      if (!currentDetail) return currentDetail;
      // 文件夹由后端递归删除，前端同步移除整棵子树
      const removedIds = new Set(
        deletedIds.flatMap((deletedId) => [
          ...collectSubtreeIds(currentDetail.materials, deletedId),
        ]),
      );
      return {
        ...currentDetail,
        materials: currentDetail.materials.filter((material) => !removedIds.has(material.id)),
      };
    });
    setPendingDeletedMaterialIds(failedIds);
    if (failedIds.length > 0) {
      const failedNames = failedIds
        .map(
          (materialId) =>
            detail.materials.find((material) => material.id === materialId)?.name ?? materialId,
        )
        .join("、");
      setError(`部分资料删除失败：${failedNames}。失败项已保留，可再次保存重试。`);
      return;
    }

    setError(null);
  }

  async function handleRefreshMaterialStats() {
    try {
      const stats = await getMaterialLibraryStats();
      setMaterialLibraryStats(stats);
      setStatsMessage(null);
      setError(null);
    } catch (statsError: unknown) {
      setError(toMessage(statsError));
    }
  }

  async function handleCleanupMaterialLibrary() {
    try {
      const latestStats = await getMaterialLibraryStats();
      setMaterialLibraryStats(latestStats);
      if (latestStats.orphanFileCount === 0 && latestStats.missingFileCount === 0) {
        setStatsMessage("没有可清理的无引用资料");
        return;
      }

      if (
        !window.confirm(
          `确定清理 ${latestStats.orphanFileCount} 个无引用文件，并删除 ${latestStats.missingFileCount} 条缺失资料记录吗？`,
        )
      ) {
        return;
      }

      const report = await cleanupMaterialLibrary();
      const refreshedStats = await getMaterialLibraryStats();
      setMaterialLibraryStats(refreshedStats);
      setStatsMessage(
        `已清理 ${report.deletedOrphanFileCount} 个无引用文件，释放 ${formatBytes(report.deletedBytes)}`,
      );
      setError(report.failedPaths.length > 0 ? `部分路径清理失败：${report.failedPaths.join("、")}` : null);
    } catch (cleanupError: unknown) {
      setError(toMessage(cleanupError));
    }
  }

  async function handleRenameMaterial(material: MaterialItem) {
    const nextName = window.prompt("输入新的资料名称", material.name);
    if (nextName === null) return;

    try {
      const renamed = await renameMaterialItem({
        materialId: material.id,
        name: nextName,
      });
      setDetail((currentDetail) =>
        currentDetail
          ? {
              ...currentDetail,
              materials: currentDetail.materials.map((currentMaterial) =>
                currentMaterial.id === renamed.id ? renamed : currentMaterial,
              ),
            }
          : currentDetail,
      );
      if (selectedMaterialId === renamed.id) {
        setSelectedMaterialPreview(null);
        void handleOpenMaterial(renamed);
      }
      setError(null);
    } catch (renameError: unknown) {
      setError(toMessage(renameError));
    }
  }

  async function handleDeleteNote(note: Note) {
    if (!window.confirm(`确定删除笔记「${note.title}」吗？`)) {
      return;
    }

    await deleteNote(note.id);
    if (selectedNoteId === note.id) {
      handleNewNote();
    }
    setDetail((currentDetail) =>
      currentDetail
        ? {
            ...currentDetail,
            notes: currentDetail.notes.filter((currentNote) => currentNote.id !== note.id),
          }
        : currentDetail,
    );
    setError(null);
  }

  function handleSelectNote(note: Note) {
    setSelectedNoteId(note.id);
    setNoteTitle(note.title);
    setNoteBody(note.body);
    setError(null);
  }

  function handleSelectNoteId(noteId: string) {
    const note = detail?.notes.find((currentNote) => currentNote.id === noteId);
    if (!note) {
      handleNewNote();
      return;
    }

    handleSelectNote(note);
  }

  function handleNewNote() {
    setSelectedNoteId(null);
    setNoteTitle("");
    setNoteBody("");
    setError(null);
  }

  function handleDetailSplitterPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    isDetailSplitDraggingRef.current = true;
    document.body.classList.add("is-resizing-split-pane");
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  if (isLoading) {
    return <main className="detail-shell">正在加载详情</main>;
  }

  if (!detail) {
    return (
      <main className="detail-shell">
        <Link to="/">返回主页</Link>
        <p className="empty-state">{error ?? "学习内容不存在"}</p>
      </main>
    );
  }

  return (
    <main className="detail-shell">
      <Link className="page-back-button" to="/" aria-label="返回主页">
        <ChevronLeftIcon />
      </Link>
      <section className="detail-header">
        <div className="detail-title-block">
          <h1>{detail.learningContent.name}</h1>
          <p className="detail-header-meta">{`${statusLabels[detail.learningContent.status]} · 预计 ${formatHours(detail.learningContent.estimatedHours)}`}</p>
          <div className="detail-progress-summary">
            <span>学习进度</span>
            <strong>{detail.learningContent.progress}%</strong>
            <div
              aria-label="学习进度"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={detail.learningContent.progress}
              className="detail-progress-bar"
              role="progressbar"
            >
              <span style={{ width: `${detail.learningContent.progress}%` }} />
            </div>
          </div>
        </div>
      </section>

      {error ? <p className="error-message">{error}</p> : null}

      <div
        className="detail-grid"
        ref={detailGridRef}
        style={{
          gridTemplateColumns: `${detailSplitRatio}fr 16px ${100 - detailSplitRatio}fr`,
        }}
      >
        <section className="detail-panel">
          {selectedMaterial ? (
            <MaterialInlineReader
              material={selectedMaterial}
              preview={selectedMaterialPreview}
              pdfState={selectedMaterialPdfState}
              onPdfStateChange={handlePdfStateChange}
              onReturn={handleReturnToMaterialList}
            />
          ) : (
            <>
              <div className="panel-title-row">
                <h2>资料</h2>
              </div>
              <MaterialExplorer
                materials={detail.materials}
                pendingDeletedMaterialIds={pendingDeletedMaterialIds}
                onCreateFolder={(parentId) => {
                  void handleCreateFolder(parentId);
                }}
                onImport={(parentId) => {
                  void handleImportMaterial(parentId);
                }}
                onMove={handleMoveMaterial}
                onOpenFile={handleOpenMaterial}
                onRename={handleRenameMaterial}
                onStageDelete={(material) => {
                  void handleStageDeleteMaterial(material);
                }}
              />
              <MaterialLibraryStatsPanel
                stats={materialLibraryStats}
                message={statsMessage}
                onCleanup={handleCleanupMaterialLibrary}
                onRefresh={handleRefreshMaterialStats}
              />
            </>
          )}
          <MaterialDeletionBar
            materials={detail.materials}
            pendingDeletedMaterialIds={pendingDeletedMaterialIds}
            onSave={handleSaveMaterialDeletes}
            onUndo={handleUndoDeleteMaterial}
          />
        </section>

        <button
          aria-label="调整资料和笔记分栏比例"
          aria-orientation="vertical"
          aria-valuemax={MAX_DETAIL_SPLIT_RATIO}
          aria-valuemin={MIN_DETAIL_SPLIT_RATIO}
          aria-valuenow={detailSplitRatio}
          className="splitter-handle"
          role="separator"
          type="button"
          onPointerDown={handleDetailSplitterPointerDown}
        />

        <section className="detail-panel">
          <div className="panel-title-row">
            <h2>笔记</h2>
            <button type="button" onClick={handleNewNote}>
              新建笔记
            </button>
          </div>
          <NoteSelector
            notes={detail.notes}
            selectedNoteId={selectedNoteId}
            onDelete={handleDeleteNote}
            onSelect={handleSelectNoteId}
          />
          <form
            aria-label="笔记编辑区"
            className="note-form note-document-editor"
            onSubmit={handleSaveNote}
          >
            <input
              aria-label="笔记标题"
              className="note-document-title"
              value={noteTitle}
              onChange={(event) => setNoteTitle(event.target.value)}
              placeholder="无标题笔记"
            />
            <textarea
              aria-label="笔记正文"
              className="note-document-body"
              value={noteBody}
              onChange={(event) => setNoteBody(event.target.value)}
              placeholder="开始记录..."
            />
            <div className="note-document-actions">
              <button type="submit">保存笔记</button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

function MaterialInlineReader({
  material,
  onPdfStateChange,
  onReturn,
  pdfState,
  preview,
}: {
  material: MaterialItem;
  onPdfStateChange: (state: { pageNumber: number; scale: number }) => void;
  onReturn: () => void;
  pdfState: { pageNumber: number; scale: number } | null;
  preview: MaterialPreview | null;
}) {
  return (
    <section className="material-inline-reader" aria-label={`正在阅读：${material.name}`}>
      <div className="material-reader-header">
        <button
          className="icon-button"
          type="button"
          aria-label="返回资料列表"
          onClick={onReturn}
        >
          <ChevronLeftIcon />
        </button>
        <div>
          <h3>{material.name}</h3>
          <p>{formatBytes(material.sizeBytes)}</p>
        </div>
      </div>
      <MaterialPreviewPane
        material={material}
        preview={preview}
        pdfState={pdfState}
        onPdfStateChange={onPdfStateChange}
      />
    </section>
  );
}

function ChevronLeftIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path
        d="M15 6l-6 6 6 6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
    </svg>
  );
}

function NoteSelector({
  notes,
  onDelete,
  onSelect,
  selectedNoteId,
}: {
  notes: Note[];
  onDelete?: (note: Note) => void;
  onSelect: (noteId: string) => void;
  selectedNoteId: string | null;
}) {
  const selectedNote = notes.find((note) => note.id === selectedNoteId);

  if (notes.length === 0) {
    return <p className="empty-state">还没有笔记</p>;
  }

  return (
    <div className="note-selector-row">
      <label>
        选择笔记
        <select value={selectedNoteId ?? ""} onChange={(event) => onSelect(event.target.value)}>
          <option value="">新建笔记</option>
          {notes.map((note) => (
            <option key={note.id} value={note.id}>
              {note.title}
            </option>
          ))}
        </select>
      </label>
      {onDelete ? (
        <button
          type="button"
          aria-label="删除当前笔记"
          disabled={!selectedNote}
          onClick={() => {
            if (selectedNote) onDelete(selectedNote);
          }}
        >
          删除
        </button>
      ) : null}
    </div>
  );
}

function formatHours(hours: number) {
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} 小时`;
}

function upsertNote(notes: Note[], savedNote: Note) {
  const hasNote = notes.some((note) => note.id === savedNote.id);
  if (!hasNote) return [...notes, savedNote];

  return notes.map((note) => (note.id === savedNote.id ? savedNote : note));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function toMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }

  return String(error);
}
