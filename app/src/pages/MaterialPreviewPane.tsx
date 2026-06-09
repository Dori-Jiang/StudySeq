import {
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import type { MaterialItem, MaterialPreview } from "../shared/types";

const PDF_BASE_WIDTH = 794;
const PDF_BASE_HEIGHT = 1123;
const PDF_MIN_SCALE = 0.6;
const PDF_MAX_SCALE = 2.4;

export function MaterialPreviewPane({
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
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const panStateRef = useRef<{
    startX: number;
    startY: number;
    startScrollLeft: number;
    startScrollTop: number;
  } | null>(null);
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
      const viewport = page.getViewport({ scale: scale * 1.35 });
      const canvas = canvasRef.current;
      if (!canvas || isCancelled) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext("2d");
      if (!context) return;
      await page.render({ canvas, canvasContext: context, viewport }).promise;
    }

    renderPdf().catch(() => {
      // The surrounding preview surface stays visible; full error handling can be added later.
    });

    return () => {
      isCancelled = true;
    };
  }, [dataUrl, pageNumber, scale]);

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
        <button type="button" onClick={() => adjustScale(-0.2)}>
          缩小
        </button>
        <span>{`${Math.round(scale * 100)}%`}</span>
        <button type="button" onClick={() => adjustScale(0.2)}>
          放大
        </button>
      </div>
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
  );
}

function clampScale(value: number) {
  return Math.min(Math.max(value, PDF_MIN_SCALE), PDF_MAX_SCALE);
}
