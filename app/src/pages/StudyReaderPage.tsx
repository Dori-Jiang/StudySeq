import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";

import {
  createNote,
  getLearningDetail,
  getReadingState,
  previewMaterialFile,
  saveReadingState,
  updateNote,
} from "../shared/api/learningContentApi";
import type { LearningDetail, MaterialItem, MaterialPreview, Note } from "../shared/types";

const DEFAULT_SPLIT_RATIO = 55;

export function StudyReaderPage() {
  const { studyId } = useParams<{ studyId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialMaterialId = searchParams.get("materialId");
  const [detail, setDetail] = useState<LearningDetail | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(initialMaterialId);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [splitRatio, setSplitRatio] = useState(DEFAULT_SPLIT_RATIO);
  const [preview, setPreview] = useState<MaterialPreview | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedMaterial = useMemo(
    () => detail?.materials.find((material) => material.id === selectedMaterialId),
    [detail?.materials, selectedMaterialId],
  );
  const selectedNote = useMemo(
    () => detail?.notes.find((note) => note.id === selectedNoteId),
    [detail?.notes, selectedNoteId],
  );

  useEffect(() => {
    if (!studyId) {
      setError("缺少学习内容 ID");
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    Promise.all([getLearningDetail(studyId), getReadingState(studyId)])
      .then(([loadedDetail, readingState]) => {
        if (!isMounted) return;
        setDetail(loadedDetail);
        const materialId =
          initialMaterialId ??
          readingState?.currentMaterialId ??
          loadedDetail?.materials[0]?.id ??
          null;
        const noteId = readingState?.currentNoteId ?? loadedDetail?.notes[0]?.id ?? null;
        setSelectedMaterialId(materialId);
        setSelectedNoteId(noteId);
        setSplitRatio(readingState?.splitRatio ?? DEFAULT_SPLIT_RATIO);
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
  }, [initialMaterialId, studyId]);

  useEffect(() => {
    if (!selectedNote) {
      setNoteTitle("");
      setNoteBody("");
      return;
    }

    setNoteTitle(selectedNote.title);
    setNoteBody(selectedNote.body);
  }, [selectedNote]);

  useEffect(() => {
    if (!selectedMaterialId) {
      setPreview(null);
      return;
    }

    let isMounted = true;
    previewMaterialFile(selectedMaterialId)
      .then((loadedPreview) => {
        if (isMounted) {
          setPreview(loadedPreview);
          setError(null);
        }
      })
      .catch((previewError: unknown) => {
        if (isMounted) {
          setError(toMessage(previewError));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedMaterialId]);

  useEffect(() => {
    if (!studyId || !detail) return;

    saveReadingState({
      learningContentId: studyId,
      currentMaterialId: selectedMaterialId,
      currentNoteId: selectedNoteId,
      splitRatio,
    }).catch((saveError: unknown) => {
      setError(toMessage(saveError));
    });
  }, [detail, selectedMaterialId, selectedNoteId, splitRatio, studyId]);

  function hasDirtySelectedNote() {
    if (!selectedNote) return false;
    return selectedNote.title !== noteTitle.trim() || selectedNote.body !== noteBody;
  }

  async function saveCurrentNoteIfNeeded() {
    if (!studyId) return;

    const title = noteTitle.trim();
    if (!title || (!selectedNoteId && !noteBody.trim())) {
      return;
    }

    if (selectedNoteId && !hasDirtySelectedNote()) {
      return;
    }

    const saved = selectedNoteId
      ? await updateNote({ noteId: selectedNoteId, title, body: noteBody })
      : await createNote({ learningContentId: studyId, title, body: noteBody });

    setDetail((currentDetail) => mergeSavedNote(currentDetail, saved));
    setSelectedNoteId(saved.id);
    setError(null);
  }

  async function handleSaveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = noteTitle.trim();
    if (!title) {
      setError("笔记标题不能为空");
      return;
    }

    await saveCurrentNoteIfNeeded();
  }

  async function handleSelectNote(nextNoteId: string) {
    try {
      await saveCurrentNoteIfNeeded();
      setSelectedNoteId(nextNoteId || null);
    } catch (saveError: unknown) {
      setError(toMessage(saveError));
    }
  }

  async function handleReturnToDetail() {
    if (!detail || !studyId) return;

    try {
      await saveCurrentNoteIfNeeded();
      await saveReadingState({
        learningContentId: studyId,
        currentMaterialId: selectedMaterialId,
        currentNoteId: selectedNoteId,
        splitRatio,
      });
      navigate(`/studies/${detail.learningContent.id}`);
    } catch (saveError: unknown) {
      setError(toMessage(saveError));
    }
  }

  if (isLoading) {
    return <main className="reader-shell">正在加载阅读页</main>;
  }

  if (!detail) {
    return (
      <main className="reader-shell">
        <button className="link-button" type="button" onClick={() => navigate("/")}>
          返回主页
        </button>
        <p className="empty-state">{error ?? "学习内容不存在"}</p>
      </main>
    );
  }

  return (
    <main className="reader-shell">
      <header className="reader-header">
        <button className="link-button" type="button" onClick={handleReturnToDetail}>
          返回详情
        </button>
        <h1>{detail.learningContent.name}</h1>
      </header>

      {error ? <p className="error-message">{error}</p> : null}

      <div
        className="reader-grid"
        style={{ gridTemplateColumns: `${splitRatio}fr ${100 - splitRatio}fr` }}
      >
        <section className="reader-preview">
          <label>
            选择资料
            <select
              value={selectedMaterialId ?? ""}
              onChange={(event) => setSelectedMaterialId(event.target.value || null)}
            >
              {detail.materials.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.name}
                </option>
              ))}
            </select>
          </label>
          <PreviewPane material={selectedMaterial} preview={preview} />
        </section>

        <section className="reader-notes">
          <label>
            选择笔记
            <select
              value={selectedNoteId ?? ""}
              onChange={(event) => {
                void handleSelectNote(event.target.value);
              }}
            >
              <option value="">新建笔记</option>
              {detail.notes.map((note) => (
                <option key={note.id} value={note.id}>
                  {note.title}
                </option>
              ))}
            </select>
          </label>

          <form className="note-form" onSubmit={handleSaveNote}>
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

          <label>
            分栏比例
            <input
              type="range"
              min="30"
              max="70"
              value={splitRatio}
              onChange={(event) => setSplitRatio(Number(event.target.value))}
            />
          </label>
        </section>
      </div>
    </main>
  );
}

function PreviewPane({
  material,
  preview,
}: {
  material: MaterialItem | undefined;
  preview: MaterialPreview | null;
}) {
  if (!material) {
    return <p className="empty-state">还没有资料</p>;
  }

  if (!preview) {
    return <p className="empty-state">正在加载资料预览</p>;
  }

  if (preview.kind === "text") {
    return <pre className="text-preview">{preview.text}</pre>;
  }

  if (preview.kind === "image" && preview.dataUrl) {
    return <img className="image-preview" alt={material.name} src={preview.dataUrl} />;
  }

  if (preview.kind === "pdf" && preview.dataUrl) {
    return <PdfPreview dataUrl={preview.dataUrl} />;
  }

  return <p className="empty-state">暂不支持预览这种资料</p>;
}

function PdfPreview({ dataUrl }: { dataUrl: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    let isCancelled = false;

    async function renderPdf() {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/legacy/build/pdf.worker.mjs",
        import.meta.url,
      ).toString();
      const document = await pdfjs.getDocument({ url: dataUrl }).promise;
      if (!isCancelled) {
        setPageCount(document.numPages);
        setPageNumber((currentPage) => Math.min(currentPage, document.numPages));
      }
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: scale * 1.2 });
      const canvas = canvasRef.current;
      if (!canvas || isCancelled) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext("2d");
      if (!context) return;
      await page.render({ canvas, canvasContext: context, viewport }).promise;
    }

    renderPdf().catch(() => {
      // The surrounding preview surface stays visible; full error handling can be added with pages.
    });

    return () => {
      isCancelled = true;
    };
  }, [dataUrl, pageNumber, scale]);

  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar" aria-label="PDF 控制">
        <button
          type="button"
          disabled={pageNumber <= 1}
          onClick={() => setPageNumber((currentPage) => Math.max(1, currentPage - 1))}
        >
          上一页
        </button>
        <span>{`第 ${pageNumber} / ${pageCount} 页`}</span>
        <button
          type="button"
          disabled={pageNumber >= pageCount}
          onClick={() => setPageNumber((currentPage) => Math.min(pageCount, currentPage + 1))}
        >
          下一页
        </button>
        <button
          type="button"
          onClick={() => setScale((currentScale) => Math.max(0.6, currentScale - 0.2))}
        >
          缩小
        </button>
        <span>{`${Math.round(scale * 100)}%`}</span>
        <button
          type="button"
          onClick={() => setScale((currentScale) => Math.min(2, currentScale + 0.2))}
        >
          放大
        </button>
      </div>
      <canvas className="pdf-preview" ref={canvasRef} aria-label="PDF 预览" />
    </div>
  );
}

function mergeSavedNote(detail: LearningDetail | null, saved: Note) {
  if (!detail) return detail;
  const exists = detail.notes.some((note) => note.id === saved.id);
  return {
    ...detail,
    notes: exists
      ? detail.notes.map((note) => (note.id === saved.id ? saved : note))
      : [...detail.notes, saved],
  };
}

function toMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }

  return String(error);
}
