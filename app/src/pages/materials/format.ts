import type { MaterialItem } from "../../shared/types";

export function formatBytes(sizeBytes: number) {
  const units = ["B", "KB", "MB", "GB"];
  let value = sizeBytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  if (unitIndex === 0) return `${value} ${units[unitIndex]}`;
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/** 文件类型短标签：优先取扩展名，无扩展名时按 mime 归类。 */
export function fileTypeLabel(material: MaterialItem) {
  const extension = material.name.includes(".")
    ? material.name.split(".").pop()?.trim().toUpperCase()
    : null;
  if (extension && extension.length <= 5) return extension;

  const mimeType = material.mimeType;
  if (!mimeType) return "FILE";
  if (mimeType.startsWith("image/")) return "IMG";
  if (mimeType.startsWith("video/")) return "VID";
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType === "text/plain") return "TXT";
  return "FILE";
}
