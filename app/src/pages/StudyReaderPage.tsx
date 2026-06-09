import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";

import {
  createNote,
  deleteNote,
  getLearningDetail,
  getReadingState,
  previewMaterialFile,
  saveReadingState,
  updateNote,
} from "../shared/api/learningContentApi";
import { MaterialPreviewPane } from "./MaterialPreviewPane";
import type { LearningDetail, MaterialPreview, Note } from "../shared/types";

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

  async function handleDeleteSelectedNote() {
    if (!selectedNote) return;
    if (!window.confirm(`确定删除笔记「${selectedNote.title}」吗？`)) {
      return;
    }

    await deleteNote(selectedNote.id);
    setDetail((currentDetail) =>
      currentDetail
        ? {
            ...currentDetail,
            notes: currentDetail.notes.filter((note) => note.id !== selectedNote.id),
          }
        : currentDetail,
    );
    setSelectedNoteId(null);
    setNoteTitle("");
    setNoteBody("");
    setError(null);
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
          <MaterialPreviewPane material={selectedMaterial} preview={preview} />
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
            <button type="button" disabled={!selectedNote} onClick={handleDeleteSelectedNote}>
              删除当前笔记
            </button>
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
