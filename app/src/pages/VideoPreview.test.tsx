import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MaterialPreviewPane } from "./MaterialPreviewPane";
import { VideoPreview, VIDEO_POSITION_SAVE_INTERVAL_SECONDS } from "./VideoPreview";
import type { MaterialItem, MaterialPreview } from "../shared/types";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn((path: string) => `asset://localhost/${encodeURIComponent(path)}`),
}));

function fireVideoError(video: Element, code: number | null) {
  Object.defineProperty(video, "error", {
    configurable: true,
    value: code === null ? null : { code },
  });
  fireEvent.error(video);
}

function buildMaterial(overrides: Partial<MaterialItem> = {}): MaterialItem {
  return {
    id: "material-1",
    learningContentId: "lc-1",
    parentId: null,
    kind: "file",
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
    assetPath: "C:\\appdata\\materials\\lc-1\\课程视频.mp4",
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

    fireVideoError(screen.getByLabelText("视频播放器"), 4);

    expect(
      screen.getByText("暂不支持该视频格式（当前仅支持 MP4 / WebM）"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("视频播放器")).not.toBeInTheDocument();
  });

  it("非解码类错误显示加载失败提示而非格式提示", () => {
    render(<VideoPreview storedPath={"C:\\appdata\\materials\\lc-1\\missing.mp4"} />);

    fireVideoError(screen.getByLabelText("视频播放器"), 2);

    expect(screen.getByText("视频加载失败，请确认资料文件完整")).toBeInTheDocument();
    expect(
      screen.queryByText("暂不支持该视频格式（当前仅支持 MP4 / WebM）"),
    ).not.toBeInTheDocument();
  });

  it("卸载时暂停并释放视频资源", () => {
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, "pause");
    const loadSpy = vi.spyOn(HTMLMediaElement.prototype, "load");
    const { unmount } = render(
      <VideoPreview storedPath={"C:\\appdata\\materials\\lc-1\\课程视频.mp4"} />,
    );
    const video = screen.getByLabelText("视频播放器");

    unmount();

    expect(pauseSpy).toHaveBeenCalled();
    expect(loadSpy).toHaveBeenCalled();
    expect(video.getAttribute("src")).toBeNull();
  });

  it("元数据加载前卸载不会把播放位置保存为 0", () => {
    const onPositionChange = vi.fn();
    const { unmount } = render(
      <VideoPreview
        storedPath={"C:\\appdata\\materials\\lc-1\\课程视频.mp4"}
        initialPositionSeconds={42}
        onPositionChange={onPositionChange}
      />,
    );
    const video = screen.getByLabelText("视频播放器") as HTMLVideoElement;
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      writable: true,
      value: 0,
    });

    unmount();

    expect(onPositionChange).not.toHaveBeenCalled();
  });

  it("加载元数据后恢复上次播放位置", () => {
    render(
      <VideoPreview
        storedPath={"C:\\appdata\\materials\\lc-1\\课程视频.mp4"}
        initialPositionSeconds={42}
      />,
    );
    const video = screen.getByLabelText("视频播放器") as HTMLVideoElement;
    Object.defineProperty(video, "duration", {
      configurable: true,
      value: 100,
    });

    fireEvent.loadedMetadata(video);

    expect(video.currentTime).toBe(42);
  });

  it("加载元数据但未播放时卸载不会把播放位置保存为 0", () => {
    const onPositionChange = vi.fn();
    const { unmount } = render(
      <VideoPreview
        storedPath={"C:\\appdata\\materials\\lc-1\\课程视频.mp4"}
        onPositionChange={onPositionChange}
      />,
    );
    const video = screen.getByLabelText("视频播放器") as HTMLVideoElement;
    Object.defineProperty(video, "duration", {
      configurable: true,
      value: 100,
    });
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      writable: true,
      value: 0,
    });

    fireEvent.loadedMetadata(video);
    unmount();

    expect(onPositionChange).not.toHaveBeenCalled();
  });

  it("按播放位置变化阈值低频上报进度", () => {
    const onPositionChange = vi.fn();
    render(
      <VideoPreview
        storedPath={"C:\\appdata\\materials\\lc-1\\课程视频.mp4"}
        onPositionChange={onPositionChange}
      />,
    );
    const video = screen.getByLabelText("视频播放器") as HTMLVideoElement;
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      writable: true,
      value: 1,
    });

    fireEvent.timeUpdate(video);
    video.currentTime = VIDEO_POSITION_SAVE_INTERVAL_SECONDS - 1;
    fireEvent.timeUpdate(video);
    video.currentTime = VIDEO_POSITION_SAVE_INTERVAL_SECONDS + 1;
    fireEvent.timeUpdate(video);
    video.currentTime = VIDEO_POSITION_SAVE_INTERVAL_SECONDS + 2;
    fireEvent.pause(video);

    expect(onPositionChange).toHaveBeenNthCalledWith(1, 1);
    expect(onPositionChange).toHaveBeenNthCalledWith(2, VIDEO_POSITION_SAVE_INTERVAL_SECONDS + 1);
    expect(onPositionChange).toHaveBeenNthCalledWith(3, VIDEO_POSITION_SAVE_INTERVAL_SECONDS + 2);
  });

  it("跳转后立即上报当前播放位置", () => {
    const onPositionChange = vi.fn();
    render(
      <VideoPreview
        storedPath={"C:\\appdata\\materials\\lc-1\\课程视频.mp4"}
        onPositionChange={onPositionChange}
      />,
    );
    const video = screen.getByLabelText("视频播放器") as HTMLVideoElement;
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      writable: true,
      value: 36,
    });

    fireEvent.seeked(video);

    expect(onPositionChange).toHaveBeenCalledWith(36);
  });
});

describe("MaterialPreviewPane 视频分支", () => {
  it("video 预览渲染视频播放器", () => {
    render(
      <MaterialPreviewPane
        material={buildMaterial()}
        preview={buildPreview()}
        videoPositionSeconds={36}
        onVideoPositionChange={vi.fn()}
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

  it("资料 A 播放失败后切换到资料 B 重新显示播放器", () => {
    const { rerender } = render(
      <MaterialPreviewPane material={buildMaterial()} preview={buildPreview()} />,
    );
    fireVideoError(screen.getByLabelText("视频播放器"), 4);
    expect(
      screen.getByText("暂不支持该视频格式（当前仅支持 MP4 / WebM）"),
    ).toBeInTheDocument();

    rerender(
      <MaterialPreviewPane
        material={buildMaterial({
          id: "material-2",
          name: "另一个视频.mp4",
          storedPath: "C:\\appdata\\materials\\lc-1\\另一个视频.mp4",
        })}
        preview={buildPreview({ materialId: "material-2" })}
      />,
    );

    expect(screen.getByLabelText("视频播放器")).toBeInTheDocument();
    expect(
      screen.queryByText("暂不支持该视频格式（当前仅支持 MP4 / WebM）"),
    ).not.toBeInTheDocument();
  });
});
