import {
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  PDF_BASE_HEIGHT,
  PDF_BASE_WIDTH,
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
  PdfRenderTask,
  RenderedPdfPage,
} from "./pdfDocumentCache";
import { PdfOutlinePanel } from "./PdfOutlinePanel";
import { loadPdfOutline } from "./pdfOutline";
import type { PdfOutlineNode } from "./pdfOutline";

export function PdfPreview({
  dataUrl,
  initialPageNumber,
  initialScale,
  onStateChange,
}: {
  dataUrl: string;
  initialPageNumber?: number;
  initialScale?: number;
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
  const [pageCount, setPageCount] = useState(1);
  const [scale, setScale] = useState(() => clampScale(initialScale ?? 1));
  const [renderScale, setRenderScale] = useState(() => clampScale(initialScale ?? 1));
  const pageCacheRef = useRef<Map<number, Promise<PdfPageProxy>>>(new Map());
  const renderedPageCacheRef = useRef<Map<string, Promise<RenderedPdfPage>>>(new Map());
  const lastPrefetchedPageRef = useRef<number | null>(null);
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [outlineNodes, setOutlineNodes] = useState<PdfOutlineNode[] | null>(null);

  useEffect(() => {
    const nextScale = clampScale(initialScale ?? 1);
    pageCacheRef.current.clear();
    renderedPageCacheRef.current.clear();
    lastPrefetchedPageRef.current = null;
    setPageNumber(Math.max(1, initialPageNumber ?? 1));
    setScale(nextScale);
    setRenderScale(nextScale);
    setIsOutlineOpen(false);
    setOutlineNodes(null);
  }, [dataUrl, initialPageNumber, initialScale]);

  useEffect(() => {
    if (!isOutlineOpen || outlineNodes !== null) return;

    let isCancelled = false;
    loadPdfDocument(dataUrl)
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
  }, [dataUrl, isOutlineOpen, outlineNodes]);

  useEffect(() => {
    renderedPageCacheRef.current.clear();
  }, [dataUrl, renderScale]);

  useEffect(() => {
    let isCancelled = false;
    let renderTask: PdfRenderTask | null = null;

    async function renderPdf() {
      const document = await loadPdfDocument(dataUrl);
      if (!isCancelled) {
        setPageCount(document.numPages);
        setPageNumber((currentPage) => Math.min(currentPage, document.numPages));
      }

      const safePageNumber = clampPageNumber(pageNumber, document.numPages);
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
        drawRenderedPage(canvas, renderedPage);
        preRenderAdjacentPagesForPageChange(document, safePageNumber, renderScale);
        return;
      }

      const page = await getCachedPage(pageCacheRef.current, document, safePageNumber);
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

    renderPdf().catch(() => {
      // The surrounding preview surface stays visible; full error handling can be added later.
    });

    return () => {
      isCancelled = true;
      renderTask?.cancel?.();
    };
  }, [dataUrl, pageNumber, renderScale]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setRenderScale(scale);
    }, PDF_ZOOM_RENDER_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [scale]);

  useEffect(() => {
    onStateChange?.({ pageNumber, scale });
  }, [onStateChange, pageNumber, scale]);

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

  function handleOutlineJump(targetPageNumber: number) {
    setPageNumber(clampPageNumber(targetPageNumber, pageCount));
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
        <button type="button" onClick={() => adjustScale(-0.2)}>
          缩小
        </button>
        <span>{`${Math.round(scale * 100)}%`}</span>
        <button type="button" onClick={() => adjustScale(0.2)}>
          放大
        </button>
      </div>
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
              aria-label="A4 PDF 页面"
              className="pdf-page-sheet"
              style={{
                width: `${PDF_BASE_WIDTH * scale}px`,
                height: `${PDF_BASE_HEIGHT * scale}px`,
              }}
            >
              <canvas className="pdf-preview" ref={canvasRef} aria-label="PDF 预览" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
