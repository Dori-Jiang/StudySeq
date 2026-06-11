import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MaterialPreviewPane } from "./MaterialPreviewPane";
import { VideoPreview } from "./VideoPreview";
import type { MaterialItem, MaterialPreview } from "../shared/types";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn((path: string) => `asset://localhost/${encodeURIComponent(path)}`),
}));

afterEach(cleanup);

function buildMaterial(overrides: Partial<MaterialItem> = {}): MaterialItem {
  return {
    id: "material-1",
    learningContentId: "lc-1",
    name: "课程视频.mp4",
    originalPath: "D:\\downloads\\课程视频.mp4",
    storedPath: "C:\\appdata\\materials\\lc-1\\课程视频.mp4",
    mimeType: "video/mp4",
    sizeBytes: 1024,
    createdAt: "2026-06-12T00:00:00Z",
    updatedAt: "2026-06-12T00:00:00Z",
    ...overrides,
  };
}

function buildPreview(overrides: Partial<MaterialPreview> = {}): MaterialPreview {
  return {
    materialId: "material-1",
    kind: "video",
    mimeType: "video/mp4",
    text: null,
    dataUrl: null,
    encoding: null,
    ...overrides,
  };
}

describe("VideoPreview", () => {
  it("video 元素 src 来自 convertFileSrc 转换的资料副本路径", () => {
    const storedPath = "C:\\appdata\\materials\\lc-1\\课程视频.mp4";
    render(<VideoPreview storedPath={storedPath} />);

    const video = screen.getByLabelText("视频播放器");
    expect(video.getAttribute("src")).toBe(
      `asset://localhost/${encodeURIComponent(storedPath)}`,
    );
  });

  it("解码失败时显示视频格式不支持提示", () => {
    render(<VideoPreview storedPath={"C:\\appdata\\materials\\lc-1\\hevc.mp4"} />);

    fireEvent.error(screen.getByLabelText("视频播放器"));

    expect(
      screen.getByText("暂不支持该视频格式（当前仅支持 MP4 / WebM）"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("视频播放器")).not.toBeInTheDocument();
  });
});

describe("MaterialPreviewPane 视频分支", () => {
  it("video 预览渲染视频播放器", () => {
    render(
      <MaterialPreviewPane
        material={buildMaterial()}
        preview={buildPreview()}
      />,
    );

    expect(screen.getByLabelText("视频播放器")).toBeInTheDocument();
  });

  it("不支持的视频格式显示视频专属文案", () => {
    render(
      <MaterialPreviewPane
        material={buildMaterial({ name: "movie.mkv", mimeType: "video/x-matroska" })}
        preview={buildPreview({ kind: "unsupported", mimeType: "video/x-matroska" })}
      />,
    );

    expect(
      screen.getByText("暂不支持该视频格式（当前仅支持 MP4 / WebM）"),
    ).toBeInTheDocument();
  });

  it("非视频的不支持格式仍显示通用文案", () => {
    render(
      <MaterialPreviewPane
        material={buildMaterial({ name: "report.docx", mimeType: "application/octet-stream" })}
        preview={buildPreview({ kind: "unsupported", mimeType: "application/octet-stream" })}
      />,
    );

    expect(screen.getByText("暂不支持预览这种资料")).toBeInTheDocument();
  });
});
