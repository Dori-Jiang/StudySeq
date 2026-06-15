import type { MaterialItem, MaterialPreview } from "../shared/types";

import { convertFileSrc } from "@tauri-apps/api/core";

import { PdfPreview } from "./pdf/PdfPreview";
import {
  UNSUPPORTED_VIDEO_MESSAGE,
  VIDEO_LOAD_FAILED_MESSAGE,
  VideoPreview,
} from "./VideoPreview";

export function MaterialPreviewPane({
  material,
  preview,
  previewError,
  pdfState,
  onPdfStateChange,
  videoPositionSeconds,
  onVideoPositionChange,
}: {
  material: MaterialItem | undefined;
  preview: MaterialPreview | null;
  previewError?: string | null;
  pdfState?: { pageNumber: number; scale: number } | null;
  onPdfStateChange?: (state: { pageNumber: number; scale: number }) => void;
  videoPositionSeconds?: number | null;
  onVideoPositionChange?: (positionSeconds: number) => void;
}) {
  if (!material) {
    return <p className="empty-state">还没有资料</p>;
  }

  if (previewError) {
    return <p className="empty-state">{previewError}</p>;
  }

  if (!preview) {
    return <p className="empty-state">正在加载资料预览</p>;
  }

  if (preview.kind === "text") {
    return <pre className="text-preview">{preview.text}</pre>;
  }

  if (preview.kind === "image") {
    const sourceUrl = preview.assetPath ? convertFileSrc(preview.assetPath) : preview.dataUrl;
    if (!sourceUrl) {
      return <p className="empty-state">图片文件无法加载</p>;
    }
    return <img className="image-preview" alt={material.name} src={sourceUrl} />;
  }

  if (preview.kind === "pdf") {
    const sourceUrl = preview.assetPath ? convertFileSrc(preview.assetPath) : preview.dataUrl;
    if (!sourceUrl) {
      return <p className="empty-state">PDF 文件无法加载</p>;
    }

    return (
      <PdfPreview
        sourceUrl={sourceUrl}
        initialPageNumber={pdfState?.pageNumber}
        initialScale={pdfState?.scale}
        onStateChange={onPdfStateChange}
      />
    );
  }

  if (preview.kind === "video") {
    if (!preview.assetPath) {
      return <p className="empty-state">{VIDEO_LOAD_FAILED_MESSAGE}</p>;
    }
    return (
      <VideoPreview
        key={material.id}
        storedPath={preview.assetPath}
        initialPositionSeconds={videoPositionSeconds}
        onPositionChange={onVideoPositionChange}
      />
    );
  }

  const isUnsupportedVideo = preview.mimeType?.startsWith("video/") ?? false;
  if (isUnsupportedVideo) {
    return <p className="empty-state">{UNSUPPORTED_VIDEO_MESSAGE}</p>;
  }

  return <p className="empty-state">暂不支持预览这种资料</p>;
}
