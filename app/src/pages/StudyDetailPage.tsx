import { open } from "@tauri-apps/plugin-dialog";
import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";

import {
  createNote,
  deleteMaterialItem,
  deleteNote,
  getLearningDetail,
  importMaterialFile,
  updateLearningContent,
  updateNote,
} from "../shared/api/learningContentApi";
import type { LearningDetail, MaterialItem, Note } from "../shared/types";

const DEFAULT_DETAIL_SPLIT_RATIO = 58;
const MIN_DETAIL_SPLIT_RATIO = 30;
const MAX_DETAIL_SPLIT_RATIO = 70;

export function StudyDetailPage() {
  const { studyId } = useParams<{ studyId: string }>();
  const detailGridRef = useRef<HTMLDivElement | null>(null);
  const isDetailSplitDraggingRef = useRef(false);
  const [detail, setDetail] = useState<LearningDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [progressInput, setProgressInput] = useState("0");
  const [deadlineInput, setDeadlineInput] = useState("");
  const [pendingDeletedMaterialIds, setPendingDeletedMaterialIds] = useState<string[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [detailSplitRatio, setDetailSplitRatio] = useState(DEFAULT_DETAIL_SPLIT_RATIO);

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
          if (loadedDetail) {
            setProgressInput(String(loadedDetail.learningContent.progress));
            setDeadlineInput(loadedDetail.learningContent.deadline ?? "");
          }
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

  async function handleImportMaterial() {
    if (!studyId) return;

    const selected = await open({
      multiple: false,
      directory: false,
    });
    if (typeof selected !== "string") return;

    const imported = await importMaterialFile({
      learningContentId: studyId,
      sourcePath: selected,
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

  async function handleUpdateLearningContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;

    const progress = Number(progressInput);
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
      setError("进度必须是 0 到 100 的整数");
      return;
    }

    const updated = await updateLearningContent({
      id: detail.learningContent.id,
      progress,
      deadline: deadlineInput || null,
    });

    setDetail((currentDetail) =>
      currentDetail
        ? {
            ...currentDetail,
            learningContent: updated,
          }
        : currentDetail,
    );
    setProgressInput(String(updated.progress));
    setDeadlineInput(updated.deadline ?? "");
    setError(null);
  }

  function handleStageDeleteMaterial(material: MaterialItem) {
    if (!window.confirm(`确定删除资料「${material.name}」吗？保存后将无法撤回。`)) {
      return;
    }

    setPendingDeletedMaterialIds((currentIds) =>
      currentIds.includes(material.id) ? currentIds : [...currentIds, material.id],
    );
  }

  function handleUndoDeleteMaterial(materialId: string) {
    setPendingDeletedMaterialIds((currentIds) =>
      currentIds.filter((currentId) => currentId !== materialId),
    );
  }

  async function handleSaveMaterialDeletes() {
    if (!detail || pendingDeletedMaterialIds.length === 0) return;

    const idsToDelete = [...pendingDeletedMaterialIds];
    await Promise.all(idsToDelete.map((materialId) => deleteMaterialItem(materialId)));
    setDetail((currentDetail) =>
      currentDetail
        ? {
            ...currentDetail,
            materials: currentDetail.materials.filter(
              (material) => !idsToDelete.includes(material.id),
            ),
          }
        : currentDetail,
    );
    setPendingDeletedMaterialIds([]);
    setError(null);
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
      <Link className="back-link" to="/">
        返回主页
      </Link>
      <section className="detail-header">
        <div>
          <p className="eyebrow">学习内容详情</p>
          <h1>{detail.learningContent.name}</h1>
        </div>
        <strong>{detail.learningContent.progress}%</strong>
      </section>

      <form className="content-edit-form" onSubmit={handleUpdateLearningContent}>
        <label>
          进度百分比
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            value={progressInput}
            onChange={(event) => setProgressInput(event.target.value)}
          />
        </label>
        <label>
          截止日期
          <input
            type="date"
            value={deadlineInput}
            onChange={(event) => setDeadlineInput(event.target.value)}
          />
        </label>
        <button type="submit">保存学习内容</button>
      </form>

      {error ? <p className="error-message">{error}</p> : null}

      <div
        className="detail-grid"
        ref={detailGridRef}
        style={{
          gridTemplateColumns: `${detailSplitRatio}fr 16px ${100 - detailSplitRatio}fr`,
        }}
      >
        <section className="detail-panel">
          <div className="panel-title-row">
            <h2>资料</h2>
            <button type="button" onClick={handleImportMaterial}>
              导入资料
            </button>
          </div>
          <MaterialList
            materials={detail.materials}
            pendingDeletedMaterialIds={pendingDeletedMaterialIds}
            onStageDelete={handleStageDeleteMaterial}
          />
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
          <NoteList
            notes={detail.notes}
            selectedNoteId={selectedNoteId}
            onDelete={handleDeleteNote}
            onSelect={handleSelectNote}
          />
          <form className="note-form note-editor" onSubmit={handleSaveNote}>
            <label>
              笔记标题
              <input
                value={noteTitle}
                onChange={(event) => setNoteTitle(event.target.value)}
                placeholder="例如：第一条笔记"
              />
            </label>
            <label>
              笔记正文
              <textarea
                value={noteBody}
                onChange={(event) => setNoteBody(event.target.value)}
                placeholder="记录纯文本笔记"
              />
            </label>
            <button type="submit">保存笔记</button>
          </form>
        </section>
      </div>
    </main>
  );
}

function MaterialList({
  materials,
  onStageDelete,
  pendingDeletedMaterialIds,
}: {
  materials: MaterialItem[];
  onStageDelete?: (material: MaterialItem) => void;
  pendingDeletedMaterialIds?: string[];
}) {
  const visibleMaterials = materials.filter(
    (material) => !pendingDeletedMaterialIds?.includes(material.id),
  );

  if (visibleMaterials.length === 0) {
    return <p className="empty-state">还没有资料</p>;
  }

  return (
    <div className="material-list">
      {visibleMaterials.map((material) => (
        <article className="material-item" key={material.id}>
          <span className="file-icon">{iconForMime(material.mimeType)}</span>
          <div>
            <h3>{material.name}</h3>
            <p>{formatBytes(material.sizeBytes)}</p>
            <div className="material-actions">
              <Link to={`/studies/${material.learningContentId}/read?materialId=${material.id}`}>
                阅读
              </Link>
              {onStageDelete ? (
                <button type="button" onClick={() => onStageDelete(material)}>
                  删除
                </button>
              ) : null}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function MaterialDeletionBar({
  materials,
  onSave,
  onUndo,
  pendingDeletedMaterialIds,
}: {
  materials: MaterialItem[];
  onSave: () => void;
  onUndo: (materialId: string) => void;
  pendingDeletedMaterialIds: string[];
}) {
  if (pendingDeletedMaterialIds.length === 0) return null;

  return (
    <aside className="pending-delete-bar">
      <p>已标记删除 {pendingDeletedMaterialIds.length} 个资料</p>
      <div className="material-actions">
        {pendingDeletedMaterialIds.map((materialId) => {
          const material = materials.find((currentMaterial) => currentMaterial.id === materialId);
          return (
            <button
              aria-label={`撤回删除 ${material?.name ?? materialId}`}
              key={materialId}
              type="button"
              onClick={() => onUndo(materialId)}
            >
              撤回
            </button>
          );
        })}
        <button type="button" onClick={onSave}>
          保存资料删除
        </button>
      </div>
    </aside>
  );
}

function NoteList({
  notes,
  onDelete,
  onSelect,
  selectedNoteId,
}: {
  notes: Note[];
  onDelete?: (note: Note) => void;
  onSelect: (note: Note) => void;
  selectedNoteId: string | null;
}) {
  if (notes.length === 0) {
    return <p className="empty-state">还没有笔记</p>;
  }

  return (
    <div className="note-list">
      {notes.map((note) => (
        <article className="note-item" key={note.id}>
          <button
            aria-pressed={selectedNoteId === note.id}
            className="note-title-button"
            type="button"
            onClick={() => onSelect(note)}
          >
            {note.title}
          </button>
          {onDelete ? (
            <button type="button" onClick={() => onDelete(note)}>
              删除
            </button>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function iconForMime(mimeType: string | null) {
  if (!mimeType) return "FILE";
  if (mimeType.startsWith("image/")) return "IMG";
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType === "text/plain") return "TXT";
  return "FILE";
}

function formatBytes(sizeBytes: number) {
  const units = ["B", "KB", "MB", "GB"];
  let value = sizeBytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  if (unitIndex === 0) return `${value} ${units[unitIndex]}`;
  return `${value.toFixed(1)} ${units[unitIndex]}`;
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
