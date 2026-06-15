import {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useParams, useSearchParams } from "react-router";

import {
  countMaterialSubtree,
  createMaterialFolder,
  createNote,
  cleanupMaterialLibrary,
  deleteMaterialItem,
  deleteNote,
  getLearningDetail,
  getMaterialLibraryLocation,
  getMaterialReadingState,
  getMaterialLibraryStats,
  importMaterialFile,
  moveMaterialItem,
  previewMaterialFile,
  renameMaterialItem,
  saveMaterialReadingState,
  saveVideoPlaybackState,
  updateNote,
} from "../shared/api/learningContentApi";
import { MaterialPreviewPane } from "./MaterialPreviewPane";
import { MaterialDeletionBar } from "./materials/MaterialDeletionBar";
import { MaterialExplorer } from "./materials/MaterialExplorer";
import { MaterialLibraryStatsPanel } from "./materials/MaterialLibraryStatsPanel";
import { formatBytes } from "./materials/format";
import { collectSubtreeIds } from "./materials/materialTree";
import { toUserMessage } from "../shared/api/errors";
import type {
  LearningDetail,
  MaterialItem,
  MaterialLibraryLocation,
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
  const [searchParams] = useSearchParams();
  const detailGridRef = useRef<HTMLDivElement | null>(null);
  const isDetailSplitDraggingRef = useRef(false);
  const materialOpenRequestIdRef = useRef(0);
  const selectedMaterialIdRef = useRef<string | null>(null);
  const handledContinueMaterialIdRef = useRef<string | null>(null);
  const [detail, setDetail] = useState<LearningDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [continueMessage, setContinueMessage] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteSaveStatus, setNoteSaveStatus] = useState<
    | { kind: "saved"; savedAt: string }
    | { kind: "error"; message: string }
    | null
  >(null);
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
  const [selectedMaterialVideoPositionSeconds, setSelectedMaterialVideoPositionSeconds] =
    useState<number | null>(null);
  const [pendingPdfState, setPendingPdfState] = useState<{
    materialId: string;
    pageNumber: number;
    scale: number;
  } | null>(null);
  const [materialLibraryStats, setMaterialLibraryStats] = useState<MaterialLibraryStats | null>(
    null,
  );
  const [materialLibraryLocation, setMaterialLibraryLocationState] =
    useState<MaterialLibraryLocation | null>(null);
  const [statsMessage, setStatsMessage] = useState<string | null>(null);
  const [detailSplitRatio, setDetailSplitRatio] = useState(DEFAULT_DETAIL_SPLIT_RATIO);
  const [currentMaterialFolderId, setCurrentMaterialFolderId] = useState<string | null>(null);
  const selectedMaterial =
    detail?.materials.find((material) => material.id === selectedMaterialId) ?? undefined;
  const handleCurrentMaterialFolderChange = useCallback((folderId: string | null) => {
    setCurrentMaterialFolderId(folderId);
  }, []);
  const materialParentById = useMemo(() => {
    return new Map(detail?.materials.map((material) => [material.id, material.parentId]) ?? []);
  }, [detail?.materials]);

  useEffect(() => {
    selectedMaterialIdRef.current = selectedMaterialId;
  }, [selectedMaterialId]);

  useEffect(() => {
    if (currentMaterialFolderId === null) return;
    const currentFolder = detail?.materials.find(
      (material) => material.id === currentMaterialFolderId && material.kind === "folder",
    );
    if (currentFolder) return;

    let fallbackFolderId = materialParentById.get(currentMaterialFolderId) ?? null;
    while (fallbackFolderId && !materialParentById.has(fallbackFolderId)) {
      fallbackFolderId = materialParentById.get(fallbackFolderId) ?? null;
    }
    setCurrentMaterialFolderId(fallbackFolderId);
  }, [currentMaterialFolderId, detail?.materials, materialParentById]);

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
          setError(toUserMessage(loadError));
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
    let isMounted = true;
    getMaterialLibraryLocation()
      .then((location) => {
        if (isMounted) setMaterialLibraryLocationState(location);
      })
      .catch((locationError: unknown) => {
        if (isMounted) setError(toUserMessage(locationError));
      });

    return () => {
      isMounted = false;
    };
  }, []);

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

    try {
      const imported = await importMaterialFile({
        learningContentId: studyId,
        parentId,
      });
      if (imported === null) return;

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
      setError(null);
    } catch (importError: unknown) {
      setError(toUserMessage(importError));
    }
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
      setError(toUserMessage(createError));
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
      setError(toUserMessage(moveError));
    }
  }

  async function handleOpenMaterial(material: MaterialItem) {
    const requestId = materialOpenRequestIdRef.current + 1;
    materialOpenRequestIdRef.current = requestId;
    selectedMaterialIdRef.current = material.id;
    setSelectedMaterialId(material.id);
    setSelectedMaterialPreview(null);
    setSelectedMaterialPdfState(null);
    setSelectedMaterialVideoPositionSeconds(null);
    try {
      const [preview, readingState] = await Promise.all([
        previewMaterialFile(material.id),
        getMaterialReadingState(material.id).catch(() => null),
      ]);
      if (
        materialOpenRequestIdRef.current !== requestId ||
        selectedMaterialIdRef.current !== material.id
      ) {
        return;
      }
      setSelectedMaterialPreview(preview);
      setSelectedMaterialPdfState(
        readingState
          ? {
              pageNumber: readingState.pageNumber,
              scale: readingState.scale,
            }
          : null,
      );
      setSelectedMaterialVideoPositionSeconds(readingState?.videoPositionSeconds ?? null);
      setError(null);
    } catch (previewError: unknown) {
      if (
        materialOpenRequestIdRef.current !== requestId ||
        selectedMaterialIdRef.current !== material.id
      ) {
        return;
      }
      setError(toUserMessage(previewError));
    }
  }

  function handleReturnToMaterialList() {
    materialOpenRequestIdRef.current += 1;
    selectedMaterialIdRef.current = null;
    setSelectedMaterialId(null);
    setSelectedMaterialPreview(null);
    setSelectedMaterialPdfState(null);
    setSelectedMaterialVideoPositionSeconds(null);
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
        setError(toUserMessage(saveError));
      });
    }, PDF_STATE_SAVE_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [pendingPdfState]);

  const handleVideoPositionChange = useCallback(
    (positionSeconds: number) => {
      if (!selectedMaterialId) return;
      setSelectedMaterialVideoPositionSeconds(positionSeconds);
      saveVideoPlaybackState({
        materialId: selectedMaterialId,
        positionSeconds,
      }).catch((saveError: unknown) => {
        setError(toUserMessage(saveError));
      });
    },
    [selectedMaterialId],
  );

  useEffect(() => {
    if (!detail) return;
    if (searchParams.get("continue") !== "1") return;
    const materialId = searchParams.get("materialId");
    if (!materialId || handledContinueMaterialIdRef.current === materialId) return;
    handledContinueMaterialIdRef.current = materialId;

    const material = detail.materials.find((currentMaterial) => currentMaterial.id === materialId);
    if (!material) {
      setContinueMessage("最近打开资料已不可用");
      return;
    }
    if (material.kind !== "file") {
      setContinueMessage("最近打开资料已不可预览");
      return;
    }

    setCurrentMaterialFolderId(material.parentId);
    setContinueMessage(null);
    void handleOpenMaterial(material);
  }, [detail, searchParams]);

  async function handleSaveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!studyId) return;

    const title = noteTitle.trim();
    if (!title) {
      setError("笔记标题不能为空");
      setNoteSaveStatus({ kind: "error", message: "笔记标题不能为空" });
      return;
    }

    try {
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
      setNoteSaveStatus({ kind: "saved", savedAt: formatClockTime(new Date()) });
      setError(null);
    } catch (saveError: unknown) {
      const message = toUserMessage(saveError);
      setNoteSaveStatus({ kind: "error", message });
      setError(message);
    }
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
        setError(toUserMessage(countError));
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

    // 被其它待删祖先覆盖的项由后端递归删除，不单独发请求，
    // 避免并行删除竞态导致误报失败和待删标记残留
    const coveredIds = new Set(
      pendingDeletedMaterialIds.flatMap((materialId) =>
        [...collectSubtreeIds(detail.materials, materialId)].filter(
          (subtreeId) => subtreeId !== materialId,
        ),
      ),
    );
    const idsToDelete = pendingDeletedMaterialIds.filter(
      (materialId) => !coveredIds.has(materialId),
    );
    const deleteResults = await Promise.allSettled(
      idsToDelete.map(async (materialId) => {
        const report = await deleteMaterialItem(materialId);
        return { materialId, report };
      }),
    );
    const deletedIds = deleteResults.flatMap((result) =>
      result.status === "fulfilled" ? [result.value.materialId] : [],
    );
    const failedCleanupPathCount = deleteResults.reduce(
      (count, result) =>
        result.status === "fulfilled" ? count + result.value.report.failedCleanupPathCount : count,
      0,
    );
    const failedIds = idsToDelete.filter((materialId) => !deletedIds.includes(materialId));
    const removedIds = new Set(
      deletedIds.flatMap((deletedId) => [...collectSubtreeIds(detail.materials, deletedId)]),
    );
    if (currentMaterialFolderId && removedIds.has(currentMaterialFolderId)) {
      setCurrentMaterialFolderId(
        findNearestRemainingParentFolder(
          detail.materials,
          currentMaterialFolderId,
          removedIds,
        ),
      );
    }
    setDetail((currentDetail) => {
      if (!currentDetail) return currentDetail;
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

    setError(
      failedCleanupPathCount > 0
        ? `资料记录已删除，但有 ${failedCleanupPathCount} 个 App 管理资料副本未清理，可稍后在资料库清理中重试。`
        : null,
    );
  }

  async function handleRefreshMaterialStats() {
    try {
      const stats = await getMaterialLibraryStats();
      setMaterialLibraryStats(stats);
      setStatsMessage(null);
      setError(null);
    } catch (statsError: unknown) {
      setError(toUserMessage(statsError));
    }
  }

  async function handleCleanupMaterialLibrary() {
    try {
      const latestStats = await getMaterialLibraryStats();
      setMaterialLibraryStats(latestStats);
      if (latestStats.orphanFileCount === 0 && latestStats.orphanDatabaseRecordCount === 0) {
        setStatsMessage("没有可清理的无引用资料");
        return;
      }

      if (
        !window.confirm(
          `确定清理 ${latestStats.orphanFileCount} 个无引用文件，并删除 ${latestStats.orphanDatabaseRecordCount} 条孤儿资料记录吗？缺失文件只会保留为统计提示。`,
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
      setError(
        report.failedPathCount > 0
          ? `有 ${report.failedPathCount} 个文件清理失败，可稍后重试。`
          : null,
      );
    } catch (cleanupError: unknown) {
      setError(toUserMessage(cleanupError));
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
      setError(toUserMessage(renameError));
    }
  }

  async function handleDeleteNote(note: Note) {
    if (!window.confirm(`确定删除笔记「${note.title}」吗？`)) {
      return;
    }

    try {
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
    } catch (deleteError: unknown) {
      setError(toUserMessage(deleteError));
    }
  }

  function handleSelectNote(note: Note) {
    setSelectedNoteId(note.id);
    setNoteTitle(note.title);
    setNoteBody(note.body);
    setNoteSaveStatus(null);
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
    setNoteSaveStatus(null);
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
      <section className="detail-header">
        <Link className="page-back-button" to="/" aria-label="返回主页">
          <ChevronLeftIcon />
        </Link>
        <div className="detail-title-block">
          <h1>{detail.learningContent.name}</h1>
          <p className="detail-header-meta">{`${statusLabels[detail.learningContent.status]} · 预计 ${formatHours(detail.learningContent.estimatedHours)}`}</p>
        </div>
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
      </section>

      {error ? <p className="error-message">{error}</p> : null}
      {continueMessage ? <p className="empty-state">{continueMessage}</p> : null}

      <div
        className="detail-grid"
        ref={detailGridRef}
        style={{
          gridTemplateColumns: `${detailSplitRatio}fr 16px ${100 - detailSplitRatio}fr`,
        }}
      >
        <section className="detail-panel detail-panel-materials">
          {selectedMaterial ? (
            <MaterialInlineReader
              material={selectedMaterial}
              preview={selectedMaterialPreview}
              pdfState={selectedMaterialPdfState}
              onPdfStateChange={handlePdfStateChange}
              videoPositionSeconds={selectedMaterialVideoPositionSeconds}
              onVideoPositionChange={handleVideoPositionChange}
              onReturn={handleReturnToMaterialList}
            />
          ) : (
            <>
              <div className="panel-title-row">
                <h2>资料</h2>
              </div>
              <MaterialExplorer
                currentFolderId={currentMaterialFolderId}
                materials={detail.materials}
                pendingDeletedMaterialIds={pendingDeletedMaterialIds}
                onCurrentFolderChange={handleCurrentMaterialFolderChange}
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
                location={materialLibraryLocation}
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
              onChange={(event) => {
                setNoteTitle(event.target.value);
                setNoteSaveStatus(null);
              }}
              placeholder="无标题笔记"
            />
            <textarea
              aria-label="笔记正文"
              className="note-document-body"
              value={noteBody}
              onChange={(event) => {
                setNoteBody(event.target.value);
                setNoteSaveStatus(null);
              }}
              placeholder="开始记录..."
            />
            <div className="note-document-actions">
              {noteSaveStatus ? (
                <span
                  className={`note-save-status note-save-status-${noteSaveStatus.kind}`}
                  role={noteSaveStatus.kind === "error" ? "alert" : undefined}
                >
                  {noteSaveStatus.kind === "saved"
                    ? `已保存 ${noteSaveStatus.savedAt}`
                    : noteSaveStatus.message}
                </span>
              ) : null}
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
  onVideoPositionChange,
  pdfState,
  preview,
  videoPositionSeconds,
}: {
  material: MaterialItem;
  onPdfStateChange: (state: { pageNumber: number; scale: number }) => void;
  onReturn: () => void;
  onVideoPositionChange: (positionSeconds: number) => void;
  pdfState: { pageNumber: number; scale: number } | null;
  preview: MaterialPreview | null;
  videoPositionSeconds: number | null;
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
        videoPositionSeconds={videoPositionSeconds}
        onVideoPositionChange={onVideoPositionChange}
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

function formatClockTime(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function upsertNote(notes: Note[], savedNote: Note) {
  const hasNote = notes.some((note) => note.id === savedNote.id);
  if (!hasNote) return [...notes, savedNote];

  return notes.map((note) => (note.id === savedNote.id ? savedNote : note));
}

function findNearestRemainingParentFolder(
  materials: MaterialItem[],
  folderId: string,
  removedIds: Set<string>,
) {
  const materialById = new Map(materials.map((material) => [material.id, material]));
  let parentId = materialById.get(folderId)?.parentId ?? null;
  const visitedIds = new Set<string>();
  while (parentId) {
    if (!visitedIds.add(parentId)) return null;
    const parent = materialById.get(parentId);
    if (!parent) return null;
    if (parent.kind === "folder" && !removedIds.has(parent.id)) return parent.id;
    parentId = parent.parentId;
  }

  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
