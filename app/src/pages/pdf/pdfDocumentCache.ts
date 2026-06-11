export const PDF_BASE_WIDTH = 794;
export const PDF_BASE_HEIGHT = 1123;
export const PDF_MIN_SCALE = 0.6;
export const PDF_MAX_SCALE = 2.4;
export const PDF_RENDER_SCALE_FACTOR = 1.35;
export const PDF_ZOOM_RENDER_DEBOUNCE_MS = 150;
const PDF_DOCUMENT_CACHE_LIMIT = 3;
const PDF_RENDERED_PAGE_CACHE_LIMIT = 6;

export type PdfViewport = {
  width: number;
  height: number;
};

export type PdfRenderTask = {
  promise: Promise<void>;
  cancel?: () => void;
};

export type PdfPageProxy = {
  getViewport: (options: { scale: number }) => PdfViewport;
  render: (options: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }) => PdfRenderTask;
};

export type PdfOutlineItem = {
  title: string;
  dest: unknown;
  items: PdfOutlineItem[];
};

export type PdfDocumentProxy = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageProxy>;
  getOutline?: () => Promise<PdfOutlineItem[] | null>;
  getDestination?: (name: string) => Promise<unknown[] | null>;
  getPageIndex?: (ref: unknown) => Promise<number>;
};

export type RenderedPdfPage = {
  canvas: HTMLCanvasElement;
  viewport: PdfViewport;
};

const pdfDocumentCache = new Map<string, Promise<PdfDocumentProxy>>();

export function clampScale(value: number) {
  return Math.min(Math.max(value, PDF_MIN_SCALE), PDF_MAX_SCALE);
}

export function clampPageNumber(pageNumber: number, pageCount: number) {
  return Math.min(Math.max(pageNumber, 1), pageCount);
}

export async function loadPdfDocument(dataUrl: string) {
  const cachedDocument = pdfDocumentCache.get(dataUrl);
  if (cachedDocument) return cachedDocument;

  const documentPromise = (async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.mjs",
      import.meta.url,
    ).toString();
    return pdfjs.getDocument({ url: dataUrl }).promise as unknown as Promise<PdfDocumentProxy>;
  })();

  trimPdfDocumentCache();
  pdfDocumentCache.set(dataUrl, documentPromise);
  documentPromise.catch(() => {
    pdfDocumentCache.delete(dataUrl);
  });

  return documentPromise;
}

function trimPdfDocumentCache() {
  while (pdfDocumentCache.size >= PDF_DOCUMENT_CACHE_LIMIT) {
    const oldestCacheKey = pdfDocumentCache.keys().next().value;
    if (!oldestCacheKey) return;

    pdfDocumentCache.delete(oldestCacheKey);
  }
}

export function getCachedPage(
  pageCache: Map<number, Promise<PdfPageProxy>>,
  document: PdfDocumentProxy,
  pageNumber: number,
) {
  const cachedPage = pageCache.get(pageNumber);
  if (cachedPage) return cachedPage;

  const pagePromise = document.getPage(pageNumber);
  pageCache.set(pageNumber, pagePromise);
  pagePromise.catch(() => {
    pageCache.delete(pageNumber);
  });

  return pagePromise;
}

export function getCachedRenderedPage(
  renderedPageCache: Map<string, Promise<RenderedPdfPage>>,
  pageNumber: number,
  renderScale: number,
) {
  return renderedPageCache.get(getRenderedPageCacheKey(pageNumber, renderScale));
}

function getOrRenderPage(
  pageCache: Map<number, Promise<PdfPageProxy>>,
  renderedPageCache: Map<string, Promise<RenderedPdfPage>>,
  document: PdfDocumentProxy,
  pageNumber: number,
  renderScale: number,
) {
  const cacheKey = getRenderedPageCacheKey(pageNumber, renderScale);
  const cachedRenderedPage = renderedPageCache.get(cacheKey);
  if (cachedRenderedPage) return cachedRenderedPage;

  const renderedPagePromise = renderPageToCanvas(pageCache, document, pageNumber, renderScale);
  renderedPageCache.set(cacheKey, renderedPagePromise);
  trimRenderedPageCache(renderedPageCache);
  renderedPagePromise.catch(() => {
    renderedPageCache.delete(cacheKey);
  });

  return renderedPagePromise;
}

async function renderPageToCanvas(
  pageCache: Map<number, Promise<PdfPageProxy>>,
  document: PdfDocumentProxy,
  pageNumber: number,
  renderScale: number,
) {
  const page = await getCachedPage(pageCache, document, pageNumber);
  const viewport = page.getViewport({ scale: renderScale * PDF_RENDER_SCALE_FACTOR });
  const canvas = window.document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("PDF canvas context unavailable");
  }

  await page.render({ canvas, canvasContext: context, viewport }).promise;

  return {
    canvas,
    viewport,
  };
}

export function drawRenderedPage(canvas: HTMLCanvasElement, renderedPage: RenderedPdfPage) {
  canvas.width = renderedPage.viewport.width;
  canvas.height = renderedPage.viewport.height;
  const context = canvas.getContext("2d");
  if (!context) return;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage?.(renderedPage.canvas, 0, 0);
}

export function preRenderAdjacentPages(
  pageCache: Map<number, Promise<PdfPageProxy>>,
  renderedPageCache: Map<string, Promise<RenderedPdfPage>>,
  document: PdfDocumentProxy,
  pageNumber: number,
  renderScale: number,
) {
  for (const adjacentPageNumber of [pageNumber - 1, pageNumber + 1]) {
    if (adjacentPageNumber < 1 || adjacentPageNumber > document.numPages) continue;

    getOrRenderPage(
      pageCache,
      renderedPageCache,
      document,
      adjacentPageNumber,
      renderScale,
    ).catch(() => undefined);
  }
}

function trimRenderedPageCache(renderedPageCache: Map<string, Promise<RenderedPdfPage>>) {
  while (renderedPageCache.size > PDF_RENDERED_PAGE_CACHE_LIMIT) {
    const oldestCacheKey = renderedPageCache.keys().next().value;
    if (!oldestCacheKey) return;

    renderedPageCache.delete(oldestCacheKey);
  }
}

function getRenderedPageCacheKey(pageNumber: number, renderScale: number) {
  return `${pageNumber}:${renderScale.toFixed(2)}`;
}
