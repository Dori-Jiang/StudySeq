import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  createHandwritingNote,
  getHandwritingNote,
  updateHandwritingNote,
} from "../../shared/api/learningContentApi";
import { toUserMessage } from "../../shared/api/errors";
import type { HandwritingNote, HandwritingNoteSummary } from "../../shared/types";
import { HandwritingCanvas } from "./HandwritingCanvas";
import { HandwritingToolbar } from "./HandwritingToolbar";
import {
  canRedo,
  canUndo,
  clearHandwriting,
  createHandwritingHistory,
  DEFAULT_HANDWRITING_TOOL,
  EMPTY_HANDWRITING_DATA,
  parseHandwritingData,
  pushStroke,
  redoHandwriting,
  serializeHandwritingData,
  undoHandwriting,
  type HandwritingHistory,
  type HandwritingToolState,
} from "./handwritingModel";

const AUTOSAVE_DELAY_MS = 1000;

type SaveStatus =
  | { kind: "idle" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; savedAt: string }
  | { kind: "saveError"; message: string }
  | { kind: "loadError"; message: string };

type HandwritingNoteEditorProps = {
  learningContentId: string;
  onDirtyChange?: (isDirty: boolean) => void;
  selectedSummary: HandwritingNoteSummary | null;
  onSaved: (note: HandwritingNote) => void;
};

export type HandwritingNoteEditorHandle = {
  flushPendingChanges: () => Promise<boolean>;
};

export const HandwritingNoteEditor = forwardRef<
  HandwritingNoteEditorHandle,
  HandwritingNoteEditorProps
>(function HandwritingNoteEditor(
  { learningContentId, onDirtyChange, onSaved, selectedSummary },
  ref,
) {
  const [title, setTitle] = useState("");
  const [history, setHistory] = useState<HandwritingHistory>(() => createHandwritingHistory());
  const [toolState, setToolState] = useState<HandwritingToolState>(DEFAULT_HANDWRITING_TOOL);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: "idle" });
  const [loadedNoteId, setLoadedNoteId] = useState<string | null>(null);
  const [loadRetryToken, setLoadRetryToken] = useState(0);
  const inFlightSavePromiseRef = useRef<Promise<boolean> | null>(null);
  const loadedNoteIdRef = useRef<string | null>(null);
  const saveTokenRef = useRef(0);
  const editGenerationRef = useRef(0);
  const lastSavedJsonRef = useRef(serializeHandwritingData(EMPTY_HANDWRITING_DATA));
  const lastSavedTitleRef = useRef("");

  const isDirty = useMemo(() => saveStatus.kind === "dirty" || saveStatus.kind === "saveError", [
    saveStatus.kind,
  ]);
  const hasBlockingUnsavedChanges =
    isDirty || saveStatus.kind === "saving" || saveStatus.kind === "loadError";

  useEffect(() => {
    onDirtyChange?.(hasBlockingUnsavedChanges);
  }, [hasBlockingUnsavedChanges, onDirtyChange]);

  useEffect(() => {
    editGenerationRef.current += 1;
    saveTokenRef.current += 1;
    inFlightSavePromiseRef.current = null;
    let cancelled = false;
    async function loadSelectedNote() {
      if (!selectedSummary) {
        const emptyJson = serializeHandwritingData(EMPTY_HANDWRITING_DATA);
        loadedNoteIdRef.current = null;
        setLoadedNoteId(null);
        setTitle("");
        setHistory(createHandwritingHistory());
        lastSavedJsonRef.current = emptyJson;
        lastSavedTitleRef.current = "";
        setSaveStatus({ kind: "idle" });
        return;
      }

      setSaveStatus({ kind: "idle" });
      try {
        const note = await getHandwritingNote(learningContentId, selectedSummary.id);
        if (cancelled) return;
        const data = parseHandwritingData(note.strokeDataJson);
        loadedNoteIdRef.current = note.id;
        setLoadedNoteId(note.id);
        setTitle(note.title);
        setHistory(createHandwritingHistory(data));
        lastSavedJsonRef.current = note.strokeDataJson;
        lastSavedTitleRef.current = note.title;
      } catch (error) {
        if (!cancelled) {
          loadedNoteIdRef.current = null;
          setLoadedNoteId(null);
          setTitle(selectedSummary.title);
          setHistory(createHandwritingHistory());
          setSaveStatus({ kind: "loadError", message: toUserMessage(error) });
        }
      }
    }

    void loadSelectedNote();
    return () => {
      cancelled = true;
    };
  }, [learningContentId, loadRetryToken, selectedSummary]);

  const performSave = useCallback(async (): Promise<boolean> => {
    if (saveStatus.kind === "loadError") return false;

    const currentToken = ++saveTokenRef.current;
    const currentGeneration = editGenerationRef.current;
    const trimmedTitle = title.trim() || "未命名手写笔记";
    const strokeDataJson = serializeHandwritingData(history.present);
    const currentLoadedNoteId = loadedNoteIdRef.current;
    if (
      currentLoadedNoteId &&
      strokeDataJson === lastSavedJsonRef.current &&
      trimmedTitle === lastSavedTitleRef.current
    ) {
      setSaveStatus({ kind: "saved", savedAt: formatClockTime(new Date()) });
      return true;
    }

    setSaveStatus({ kind: "saving" });
    try {
      const saved = currentLoadedNoteId
        ? await updateHandwritingNote({
            learningContentId,
            noteId: currentLoadedNoteId,
            title: trimmedTitle,
            strokeDataJson,
            canvasWidth: 1024,
            canvasHeight: 720,
          })
        : await createHandwritingNote({
            learningContentId,
            title: trimmedTitle,
            strokeDataJson,
            canvasWidth: 1024,
            canvasHeight: 720,
          });
      if (currentToken !== saveTokenRef.current) {
        return false;
      }
      if (currentGeneration !== editGenerationRef.current) {
        if (!currentLoadedNoteId) {
          loadedNoteIdRef.current = saved.id;
          setLoadedNoteId(saved.id);
          setSaveStatus({ kind: "dirty" });
        }
        return false;
      }
      loadedNoteIdRef.current = saved.id;
      setLoadedNoteId(saved.id);
      setTitle(saved.title);
      lastSavedJsonRef.current = saved.strokeDataJson;
      lastSavedTitleRef.current = saved.title;
      setSaveStatus({ kind: "saved", savedAt: formatClockTime(new Date()) });
      onSaved(saved);
      return true;
    } catch (error) {
      if (currentToken === saveTokenRef.current) {
        setSaveStatus({ kind: "saveError", message: toUserMessage(error) });
      }
      return false;
    }
  }, [history.present, learningContentId, onSaved, saveStatus.kind, title]);

  const saveCurrent = useCallback((): Promise<boolean> => {
    if (inFlightSavePromiseRef.current) return inFlightSavePromiseRef.current;

    const promise = performSave().finally(() => {
      if (inFlightSavePromiseRef.current === promise) {
        inFlightSavePromiseRef.current = null;
      }
    });
    inFlightSavePromiseRef.current = promise;
    return promise;
  }, [performSave]);

  useEffect(() => {
    if (!isDirty) return;
    const timer = window.setTimeout(() => {
      void saveCurrent();
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [isDirty, saveCurrent]);

  useImperativeHandle(
    ref,
    () => ({
      flushPendingChanges: saveCurrent,
    }),
    [saveCurrent],
  );

  return (
    <div className="handwriting-editor" aria-label="手写笔记编辑区">
      <input
        aria-label="手写笔记标题"
        className="note-document-title"
        disabled={saveStatus.kind === "loadError"}
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
          editGenerationRef.current += 1;
          setSaveStatus({ kind: "dirty" });
        }}
        placeholder="未命名手写笔记"
      />
      <HandwritingToolbar
        canRedo={canRedo(history)}
        canUndo={canUndo(history)}
        isSaving={saveStatus.kind === "saving"}
        isDisabled={saveStatus.kind === "loadError"}
        toolState={toolState}
        onClear={() => {
          setHistory((current) => clearHandwriting(current));
          editGenerationRef.current += 1;
          setSaveStatus({ kind: "dirty" });
        }}
        onRedo={() => {
          setHistory((current) => redoHandwriting(current));
          editGenerationRef.current += 1;
          setSaveStatus({ kind: "dirty" });
        }}
        onSave={() => {
          void saveCurrent();
        }}
        onToolChange={setToolState}
        onUndo={() => {
          setHistory((current) => undoHandwriting(current));
          editGenerationRef.current += 1;
          setSaveStatus({ kind: "dirty" });
        }}
      />
      <HandwritingCanvas
        data={history.present}
        isDisabled={saveStatus.kind === "loadError"}
        toolState={toolState}
        onStrokeComplete={(stroke) => {
          setHistory((current) => pushStroke(current, stroke));
          editGenerationRef.current += 1;
          setSaveStatus({ kind: "dirty" });
        }}
      />
      <div className="note-document-actions">
        <span
          className={`note-save-status note-save-status-${saveStatus.kind}`}
          role={
            saveStatus.kind === "saveError" || saveStatus.kind === "loadError"
              ? "alert"
              : undefined
          }
        >
          {saveStatus.kind === "saved"
            ? `已保存 ${saveStatus.savedAt}`
            : saveStatus.kind === "saving"
              ? "正在保存"
              : saveStatus.kind === "dirty"
                ? "有未保存的手写内容"
                : saveStatus.kind === "saveError" || saveStatus.kind === "loadError"
                  ? saveStatus.message
                  : " "}
        </span>
        {saveStatus.kind === "saveError" || saveStatus.kind === "loadError" ? (
          <button
            type="button"
            onClick={() => {
              if (saveStatus.kind === "loadError") {
                setLoadRetryToken((currentToken) => currentToken + 1);
              } else {
                void saveCurrent();
              }
            }}
          >
            {saveStatus.kind === "loadError" ? "重试加载" : "重试"}
          </button>
        ) : null}
      </div>
    </div>
  );
});

function formatClockTime(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
