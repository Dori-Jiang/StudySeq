import type { MaterialItem, MaterialPreview } from "../shared/types";

import { PdfPreview } from "./pdf/PdfPreview";

export function MaterialPreviewPane({
  material,
  preview,
  pdfState,
  onPdfStateChange,
}: {
  material: MaterialItem | undefined;
  preview: MaterialPreview | null;
  pdfState?: { pageNumber: number; scale: number } | null;
  onPdfStateChange?: (state: { pageNumber: number; scale: number }) => void;
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
    return (
      <PdfPreview
        dataUrl={preview.dataUrl}
        initialPageNumber={pdfState?.pageNumber}
        initialScale={pdfState?.scale}
        onStateChange={onPdfStateChange}
      />
    );
  }

  return <p className="empty-state">暂不支持预览这种资料</p>;
}
