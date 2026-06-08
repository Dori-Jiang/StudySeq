import { open } from "@tauri-apps/plugin-dialog";
import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";

import {
  createNote,
  getLearningDetail,
  importMaterialFile,
  previewMaterialFile,
} from "../shared/api/learningContentApi";
import type { LearningDetail, MaterialItem, MaterialPreview, Note } from "../shared/types";

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
  const [selectedPreview, setSelectedPreview] = useState<MaterialPreview | null>(null);
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
  }

  async function handleCreateNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!studyId) return;

    const title = noteTitle.trim();
    if (!title) {
      setError("笔记标题不能为空");
      return;
    }

    const created = await createNote({
      learningContentId: studyId,
      title,
      body: noteBody,
    });

    setDetail((currentDetail) =>
      currentDetail
        ? {
            ...currentDetail,
            notes: [...currentDetail.notes, created],
          }
        : currentDetail,
    );
    setNoteTitle("");
    setNoteBody("");
    setError(null);
  }

  async function handlePreviewMaterial(material: MaterialItem) {
    try {
      const preview = await previewMaterialFile(material.id);
      setSelectedPreview(preview);
      setError(null);
    } catch (previewError: unknown) {
      setError(toMessage(previewError));
    }
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
          <MaterialList materials={detail.materials} onPreview={handlePreviewMaterial} />
          {selectedPreview ? (
            <LightweightPreview
              material={detail.materials.find(
                (currentMaterial) => currentMaterial.id === selectedPreview.materialId,
              )}
              onClose={() => setSelectedPreview(null)}
              preview={selectedPreview}
            />
          ) : null}
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
          <h2>笔记</h2>
          <form className="note-form" onSubmit={handleCreateNote}>
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
          <NoteList notes={detail.notes} />
        </section>
      </div>
    </main>
  );
}

function MaterialList({
  materials,
  onPreview,
}: {
  materials: MaterialItem[];
  onPreview: (material: MaterialItem) => void;
}) {
  if (materials.length === 0) {
    return <p className="empty-state">还没有资料</p>;
  }

  return (
    <div className="material-list">
      {materials.map((material) => (
        <article className="material-item" key={material.id}>
          <span className="file-icon">{iconForMime(material.mimeType)}</span>
          <div>
            <h3>{material.name}</h3>
            <p>{formatBytes(material.sizeBytes)}</p>
            <div className="material-actions">
              <button type="button" onClick={() => onPreview(material)}>
                预览 {material.name}
              </button>
              <Link to={`/studies/${material.learningContentId}/read?materialId=${material.id}`}>
                阅读
              </Link>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function LightweightPreview({
  material,
  onClose,
  preview,
}: {
  material: MaterialItem | undefined;
  onClose: () => void;
  preview: MaterialPreview;
}) {
  return (
    <aside className="light-preview" aria-label="资料轻量预览">
      <div className="panel-title-row">
        <h3>{material?.name ?? "资料预览"}</h3>
        <div className="material-actions">
          <button type="button" onClick={onClose}>
            关闭预览
          </button>
          <Link
            to={`/studies/${material?.learningContentId}/read?materialId=${preview.materialId}`}
          >
            进入阅读页
          </Link>
        </div>
      </div>
      {preview.kind === "text" ? <pre>{preview.text}</pre> : null}
      {preview.kind === "image" && preview.dataUrl ? (
        <img alt={material?.name ?? "图片预览"} src={preview.dataUrl} />
      ) : null}
      {preview.kind === "pdf" ? <p>PDF 可在阅读页内预览</p> : null}
      {preview.kind === "unsupported" ? <p>暂不支持预览这种资料</p> : null}
    </aside>
  );
}

function NoteList({ notes }: { notes: Note[] }) {
  if (notes.length === 0) {
    return <p className="empty-state">还没有笔记</p>;
  }

  return (
    <div className="note-list">
      {notes.map((note) => (
        <article className="note-item" key={note.id}>
          <h3>{note.title}</h3>
          <p>{note.body}</p>
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
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  return `${(sizeBytes / 1024).toFixed(1)} KB`;
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
