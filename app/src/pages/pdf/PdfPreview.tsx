import {
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  deletePdfPageAnnotation,
  getPdfPageAnnotation,
  savePdfPageAnnotation,
} from "../../shared/api/learningContentApi";
import { toUserMessage } from "../../shared/api/errors";
import { HandwritingToolbar } from "../handwriting/HandwritingToolbar";
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
} from "../handwriting/handwritingModel";
import { PdfAnnotationLayer } from "./PdfAnnotationLayer";
import {
  PDF_BASE_HEIGHT,
  PDF_BASE_WIDTH,
  PDF_MAX_RENDER_SCALE,
  PDF_ZOOM_RENDER_DEBOUNCE_MS,
  PDF_RENDER_SCALE_FACTOR,
  clampPageNumber,
  clampScale,
  drawRenderedPage,
  getCachedPage,
  getCachedRenderedPage,
  loadPdfDocument,
  preRenderAdjacentPages,
} from "./pdfDocumentCache";
import type {
  PdfDocumentProxy,
  PdfPageProxy,
  PdfViewport,
  PdfRenderTask,
  RenderedPdfPage,
} from "./pdfDocumentCache";
import { PdfOutlinePanel } from "./PdfOutlinePanel";
import { loadPdfOutline } from "./pdfOutline";
import type { PdfOutlineNode } from "./pdfOutline";

// 页面舞台左右各 28px 内边距（styles.css 的 .pdf-page-stage）
const PDF_STAGE_HORIZONTAL_PADDING = 56;
// 阅读区极窄时保底的页面显示宽度
const PDF_MIN_FIT_WIDTH = 160;
const DEFAULT_PAGE_SIZE = {
  width: PDF_BASE_WIDTH,
  height: PDF_BASE_HEIGHT,
};
const PDF_ANNOTATION_SAVE_DELAY_MS = 1000;

type PdfAnnotationSaveStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; savedAt: string }
  | { kind: "error"; message: string };

function resolveInitialScale(
  initialScale: number | undefined,
  minimumInitialScale: number | undefined,
) {
  const nextScale = clampScale(initialScale ?? 1);
  if (minimumInitialScale === undefined) return nextScale;

  return Math.max(nextScale, clampScale(minimumInitialScale));
}

function formatClockTime(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function PdfPreview({
  sourceUrl,
  materialId,
  initialPageNumber,
  initialScale,
  minimumInitialScale,
  onStateChange,
}: {
  sourceUrl: string;
  materialId?: string;
  initialPageNumber?: number;
  initialScale?: number;
  minimumInitialScale?: number;
  onStateChange?: (state: { pageNumber: number; scale: number }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const panStateRef = useRef<{
    startX: number;
    startY: number;
    startScrollLeft: number;
    startScrollTop: number;
  } | null>(null);
  const [pageNumber, setPageNumber] = useState(() => Math.max(1, initialPageNumber ?? 1));
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [scale, setScale] = useState(() => resolveInitialScale(initialScale, minimumInitialScale));
  const [renderScale, setRenderScale] = useState(() =>
    resolveInitialScale(initialScale, minimumInitialScale),
  );
  const pageCacheRef = useRef<Map<number, Promise<PdfPageProxy>>>(new Map());
  const renderedPageCacheRef = useRef<Map<string, Promise<RenderedPdfPage>>>(new Map());
  const lastPrefetchedPageRef = useRef<number | null>(null);
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [outlineNodes, setOutlineNodes] = useState<PdfOutlineNode[] | null>(null);
  const [hasLoadFailed, setHasLoadFailed] = useState(false);
  const [isAnnotationMode, setIsAnnotationMode] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [annotationHistory, setAnnotationHistory] = useState<HandwritingHistory>(() =>
    createHandwritingHistory(),
  );
  const [annotationToolState, setAnnotationToolState] =
    useState<HandwritingToolState>(DEFAULT_HANDWRITING_TOOL);
  const [annotationSaveStatus, setAnnotationSaveStatus] =
    useState<PdfAnnotationSaveStatus>({ kind: "idle" });
  // 适应宽度基准：100% 缩放时页面铺满阅读区可用宽度；环境不支持测量时退回 A4 固定宽
  const [fitWidth, setFitWidth] = useState(PDF_BASE_WIDTH);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const annotationSavePromiseRef = useRef<Promise<boolean> | null>(null);
  const saveCurrentAnnotationRef = useRef<(() => Promise<boolean>) | null>(null);
  const annotationGenerationRef = useRef(0);
  const annotationLoadedKeyRef = useRef<string | null>(null);
  const annotationLastSavedJsonRef = useRef(serializeHandwritingData(EMPTY_HANDWRITING_DATA));

  function enableAnnotationMode() {
    setIsAnnotationMode(true);
  }

  const sheetWidth = fitWidth * scale;
  const sheetHeight = sheetWidth * (pageSize.height / pageSize.width);
  const displayScale = sheetWidth / pageSize.width;
  const displayedPageNumber =
    pageCount === null ? Math.max(1, pageNumber) : clampPageNumber(pageNumber, pageCount);
  const annotationKey = materialId ? `${materialId}:${displayedPageNumber}` : null;
  const isAnnotationDirty = useMemo(
    () => annotationSaveStatus.kind === "dirty" || annotationSaveStatus.kind === "error",
    [annotationSaveStatus.kind],
  );

  useEffect(() => {
    const nextScale = resolveInitialScale(initialScale, minimumInitialScale);
    pageCacheRef.current.clear();
    renderedPageCacheRef.current.clear();
    lastPrefetchedPageRef.current = null;
    setPageNumber(Math.max(1, initialPageNumber ?? 1));
    setPageCount(null);
    setScale(nextScale);
    setRenderScale(nextScale);
    setPageSize(DEFAULT_PAGE_SIZE);
    setIsOutlineOpen(false);
    setOutlineNodes(null);
    setHasLoadFailed(false);
    setAnnotationHistory(createHandwritingHistory());
    setAnnotationSaveStatus({ kind: materialId ? "loading" : "idle" });
    setIsAnnotationMode(false);
    annotationGenerationRef.current += 1;
    annotationLoadedKeyRef.current = null;
    annotationSavePromiseRef.current = null;
    annotationLastSavedJsonRef.current = serializeHandwritingData(EMPTY_HANDWRITING_DATA);
  }, [sourceUrl, materialId, initialPageNumber, initialScale, minimumInitialScale]);

  useEffect(() => {
    annotationGenerationRef.current += 1;
    annotationSavePromiseRef.current = null;

    if (!materialId || pageCount === null || hasLoadFailed) {
      setAnnotationHistory(createHandwritingHistory());
      setAnnotationSaveStatus({ kind: "idle" });
      annotationLoadedKeyRef.current = null;
      annotationLastSavedJsonRef.current = serializeHandwritingData(EMPTY_HANDWRITING_DATA);
      return;
    }

    const currentKey = annotationKey;
    if (!currentKey) return;
    let isCancelled = false;
    setAnnotationSaveStatus({ kind: "loading" });
    getPdfPageAnnotation(materialId, displayedPageNumber)
      .then((annotation) => {
        if (isCancelled) return;
        const data = annotation
          ? parseHandwritingData(annotation.strokeDataJson)
          : EMPTY_HANDWRITING_DATA;
        annotationLoadedKeyRef.current = currentKey;
        annotationLastSavedJsonRef.current = serializeHandwritingData(data);
        setAnnotationHistory(createHandwritingHistory(data));
        setAnnotationSaveStatus({ kind: "idle" });
      })
      .catch((error: unknown) => {
        if (isCancelled) return;
        setAnnotationHistory(createHandwritingHistory());
        setAnnotationSaveStatus({ kind: "error", message: toUserMessage(error) });
      });

    return () => {
      isCancelled = true;
    };
  }, [annotationKey, displayedPageNumber, hasLoadFailed, materialId, pageCount]);

  useEffect(() => {
    if (!isOutlineOpen || outlineNodes !== null) return;

    let isCancelled = false;
    loadPdfDocument(sourceUrl)
      .then((document) => loadPdfOutline(document))
      .then((nodes) => {
        if (!isCancelled) setOutlineNodes(nodes);
      })
      .catch(() => {
        if (!isCancelled) setOutlineNodes([]);
      });

    return () => {
      isCancelled = true;
    };
  }, [sourceUrl, isOutlineOpen, outlineNodes]);

  useEffect(() => {
    renderedPageCacheRef.current.clear();
  }, [sourceUrl, renderScale]);

  useEffect(() => {
    let isCancelled = false;
    let renderTask: PdfRenderTask | null = null;

    async function renderPdf() {
      const document = await loadPdfDocument(sourceUrl);
      const safePageNumber = clampPageNumber(pageNumber, document.numPages);
      if (!isCancelled) {
        setPageCount(document.numPages);
        setPageNumber((currentPage) => clampPageNumber(currentPage, document.numPages));
        setHasLoadFailed(false);
      }

      const canvas = canvasRef.current;
      if (!canvas || isCancelled) return;
      const cachedRenderedPage = getCachedRenderedPage(
        renderedPageCacheRef.current,
        safePageNumber,
        renderScale,
      );
      if (cachedRenderedPage) {
        const renderedPage = await cachedRenderedPage;
        if (isCancelled) return;
        updatePageSizeFromRenderedViewport(renderedPage.viewport, renderScale);
        drawRenderedPage(canvas, renderedPage);
        preRenderAdjacentPagesForPageChange(document, safePageNumber, renderScale);
        return;
      }

      const page = await getCachedPage(pageCacheRef.current, document, safePageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      updatePageSize(baseViewport);
      const viewport = page.getViewport({ scale: renderScale * PDF_RENDER_SCALE_FACTOR });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext("2d");
      if (!context) return;
      renderTask = page.render({ canvas, canvasContext: context, viewport });
      await renderTask.promise;
      preRenderAdjacentPagesForPageChange(document, safePageNumber, renderScale);
    }

    function preRenderAdjacentPagesForPageChange(
      document: PdfDocumentProxy,
      safePageNumber: number,
      nextRenderScale: number,
    ) {
      if (lastPrefetchedPageRef.current === safePageNumber) return;

      lastPrefetchedPageRef.current = safePageNumber;
      preRenderAdjacentPages(
        pageCacheRef.current,
        renderedPageCacheRef.current,
        document,
        safePageNumber,
        nextRenderScale,
      );
    }

    function updatePageSizeFromRenderedViewport(
      viewport: PdfViewport,
      nextRenderScale: number,
    ) {
      const viewportScale = nextRenderScale * PDF_RENDER_SCALE_FACTOR;
      if (viewportScale <= 0) return;
      updatePageSize({
        width: viewport.width / viewportScale,
        height: viewport.height / viewportScale,
      });
    }

    renderPdf().catch(() => {
      if (!isCancelled) setHasLoadFailed(true);
    });

    return () => {
      isCancelled = true;
      renderTask?.cancel?.();
    };
  }, [sourceUrl, pageNumber, renderScale]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;

    function applyFitWidth(viewportWidth: number) {
      if (viewportWidth <= 0) return;
      setFitWidth(Math.max(viewportWidth - PDF_STAGE_HORIZONTAL_PADDING, PDF_MIN_FIT_WIDTH));
    }

    applyFitWidth(viewport.clientWidth);
    const observer = new ResizeObserver((entries) => {
      applyFitWidth(entries[0]?.contentRect.width ?? viewport.clientWidth);
    });
    observer.observe(viewport);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setRenderScale(Math.min(displayScale, PDF_MAX_RENDER_SCALE));
    }, PDF_ZOOM_RENDER_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [displayScale]);

  useEffect(() => {
    if (pageCount === null || hasLoadFailed) return;
    onStateChange?.({ pageNumber: displayedPageNumber, scale });
  }, [displayedPageNumber, hasLoadFailed, onStateChange, pageCount, scale]);

  const performAnnotationSave = useCallback(async (): Promise<boolean> => {
    if (!materialId || pageCount === null || hasLoadFailed) return true;
    if (annotationSaveStatus.kind === "loading") return false;

    const currentKey = `${materialId}:${displayedPageNumber}`;
    if (annotationLoadedKeyRef.current !== currentKey) return false;

    const currentJson = serializeHandwritingData(annotationHistory.present);
    if (currentJson === annotationLastSavedJsonRef.current) {
      setAnnotationSaveStatus({ kind: "saved", savedAt: formatClockTime(new Date()) });
      return true;
    }

    const currentGeneration = annotationGenerationRef.current;
    setAnnotationSaveStatus({ kind: "saving" });
    try {
      if (annotationHistory.present.strokes.length === 0) {
        await deletePdfPageAnnotation(materialId, displayedPageNumber);
      } else {
        await savePdfPageAnnotation({
          materialId,
          pageNumber: displayedPageNumber,
          pageWidth: pageSize.width,
          pageHeight: pageSize.height,
          strokeData: currentJson,
        });
      }
      if (currentGeneration !== annotationGenerationRef.current) return false;
      annotationLastSavedJsonRef.current = currentJson;
      setAnnotationSaveStatus({ kind: "saved", savedAt: formatClockTime(new Date()) });
      return true;
    } catch (error) {
      if (currentGeneration === annotationGenerationRef.current) {
        setAnnotationSaveStatus({ kind: "error", message: toUserMessage(error) });
      }
      return false;
    }
  }, [
    annotationHistory.present,
    annotationSaveStatus.kind,
    displayedPageNumber,
    hasLoadFailed,
    materialId,
    pageCount,
    pageSize.height,
    pageSize.width,
  ]);

  const saveCurrentAnnotation = useCallback((): Promise<boolean> => {
    if (annotationSavePromiseRef.current) return annotationSavePromiseRef.current;

    const promise = performAnnotationSave().finally(() => {
      if (annotationSavePromiseRef.current === promise) {
        annotationSavePromiseRef.current = null;
      }
    });
    annotationSavePromiseRef.current = promise;
    return promise;
  }, [performAnnotationSave]);

  useEffect(() => {
    saveCurrentAnnotationRef.current = saveCurrentAnnotation;
  }, [saveCurrentAnnotation]);

  useEffect(() => {
    if (!isAnnotationDirty) return;
    const timeoutId = window.setTimeout(() => {
      void saveCurrentAnnotation();
    }, PDF_ANNOTATION_SAVE_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [isAnnotationDirty, saveCurrentAnnotation]);

  useEffect(() => {
    return () => {
      void saveCurrentAnnotationRef.current?.();
    };
  }, []);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const panState = panStateRef.current;
      const viewport = viewportRef.current;
      if (!panState || !viewport) return;

      viewport.scrollLeft = panState.startScrollLeft + panState.startX - event.clientX;
      viewport.scrollTop = panState.startScrollTop + panState.startY - event.clientY;
    }

    function handlePointerUp() {
      panStateRef.current = null;
      document.body.classList.remove("is-panning-pdf");
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.classList.remove("is-panning-pdf");
    };
  }, []);

  function adjustScale(delta: number) {
    setScale((currentScale) => clampScale(Number((currentScale + delta).toFixed(2))));
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!event.ctrlKey) return;

    event.preventDefault();
    adjustScale(event.deltaY < 0 ? 0.1 : -0.1);
  }

  function handlePanStart(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 1) return;

    event.preventDefault();
    panStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: event.currentTarget.scrollLeft,
      startScrollTop: event.currentTarget.scrollTop,
    };
    document.body.classList.add("is-panning-pdf");
  }

  async function goToPage(targetPageNumber: number) {
    if (!(await saveCurrentAnnotation())) return;
    if (pageCount === null) return;
    setPageNumber(clampPageNumber(targetPageNumber, pageCount));
  }

  function handleOutlineJump(targetPageNumber: number) {
    void goToPage(targetPageNumber);
  }

  function updatePageSize(nextPageSize: PdfViewport) {
    if (nextPageSize.width <= 0 || nextPageSize.height <= 0) return;
    setPageSize((currentSize) => {
      if (
        Math.abs(currentSize.width - nextPageSize.width) < 0.01 &&
        Math.abs(currentSize.height - nextPageSize.height) < 0.01
      ) {
        return currentSize;
      }

      return {
        width: nextPageSize.width,
        height: nextPageSize.height,
      };
    });
  }

  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar" aria-label="PDF 控制">
        <button
          type="button"
          aria-pressed={isOutlineOpen}
          onClick={() => setIsOutlineOpen((isOpen) => !isOpen)}
        >
          目录
        </button>
        <button
          type="button"
          disabled={pageCount === null || displayedPageNumber <= 1}
          onClick={() => {
            void goToPage(displayedPageNumber - 1);
          }}
        >
          上一页
        </button>
        <span>
          {hasLoadFailed
            ? "PDF 加载失败"
            : pageCount === null
              ? "正在加载 PDF"
              : `第 ${displayedPageNumber} / ${pageCount} 页`}
        </span>
        <button
          type="button"
          disabled={pageCount === null || displayedPageNumber >= pageCount}
          onClick={() => {
            void goToPage(displayedPageNumber + 1);
          }}
        >
          下一页
        </button>
        <button type="button" onClick={() => adjustScale(-0.2)}>
          缩小
        </button>
        <span>{`${Math.round(scale * 100)}%`}</span>
        <button type="button" onClick={() => adjustScale(0.2)}>
          放大
        </button>
        {materialId ? (
          <>
            <button
              type="button"
              aria-pressed={isAnnotationMode}
              onClick={() => setIsAnnotationMode((current) => !current)}
            >
              批注
            </button>
            <button
              type="button"
              aria-pressed={showAnnotations}
              onClick={() => setShowAnnotations((current) => !current)}
            >
              {showAnnotations ? "隐藏批注" : "显示批注"}
            </button>
          </>
        ) : null}
      </div>
      {materialId ? (
        <div className="pdf-annotation-toolbar-row">
          <HandwritingToolbar
            canRedo={canRedo(annotationHistory)}
            canUndo={canUndo(annotationHistory)}
            isSaving={annotationSaveStatus.kind === "saving"}
            isDisabled={annotationSaveStatus.kind === "loading"}
            toolState={annotationToolState}
            onClear={() => {
              enableAnnotationMode();
              setAnnotationHistory((current) => clearHandwriting(current));
              annotationGenerationRef.current += 1;
              setAnnotationSaveStatus({ kind: "dirty" });
            }}
            onRedo={() => {
              enableAnnotationMode();
              setAnnotationHistory((current) => redoHandwriting(current));
              annotationGenerationRef.current += 1;
              setAnnotationSaveStatus({ kind: "dirty" });
            }}
            onSave={() => {
              void saveCurrentAnnotation();
            }}
            onToolChange={(nextToolState) => {
              enableAnnotationMode();
              setAnnotationToolState(nextToolState);
            }}
            onUndo={() => {
              enableAnnotationMode();
              setAnnotationHistory((current) => undoHandwriting(current));
              annotationGenerationRef.current += 1;
              setAnnotationSaveStatus({ kind: "dirty" });
            }}
          />
          <span
            className={`pdf-annotation-save-status note-save-status note-save-status-${annotationSaveStatus.kind}`}
            role={annotationSaveStatus.kind === "error" ? "alert" : undefined}
          >
            {annotationSaveStatus.kind === "loading"
              ? "正在加载批注"
              : annotationSaveStatus.kind === "saving"
                ? "正在保存批注"
                : annotationSaveStatus.kind === "dirty"
                  ? "有未保存批注"
                  : annotationSaveStatus.kind === "saved"
                    ? `批注已保存 ${annotationSaveStatus.savedAt}`
                    : annotationSaveStatus.kind === "error"
                      ? annotationSaveStatus.message
                      : " "}
          </span>
        </div>
      ) : null}
      <div className="pdf-content">
        {isOutlineOpen &&
          (outlineNodes === null ? (
            <div className="pdf-outline-panel" aria-label="PDF 目录">
              <p className="empty-state">正在加载目录</p>
            </div>
          ) : (
            <PdfOutlinePanel nodes={outlineNodes} onJump={handleOutlineJump} />
          ))}
        <div
          aria-label="PDF 阅读区域"
          className="pdf-scroll-viewport"
          ref={viewportRef}
          onPointerDown={handlePanStart}
          onWheel={handleWheel}
        >
          <div className="pdf-page-stage">
            <div
              aria-label="PDF 页面"
              className="pdf-page-sheet"
              style={{
                width: `${sheetWidth}px`,
                height: `${sheetHeight}px`,
              }}
            >
              <canvas className="pdf-preview" ref={canvasRef} aria-label="PDF 预览" />
              {materialId && showAnnotations ? (
                <PdfAnnotationLayer
                  data={annotationHistory.present}
                  isAnnotating={isAnnotationMode}
                  toolState={annotationToolState}
                  onStrokeComplete={(stroke) => {
                    setAnnotationHistory((current) => pushStroke(current, stroke));
                    annotationGenerationRef.current += 1;
                    setAnnotationSaveStatus({ kind: "dirty" });
                  }}
                />
              ) : null}
              {hasLoadFailed && <p className="empty-state">PDF 加载失败，请重新打开资料</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
