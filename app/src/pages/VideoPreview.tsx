import { useEffect, useRef, useState } from "react";
import type { SyntheticEvent } from "react";

import { convertFileSrc } from "@tauri-apps/api/core";

export const UNSUPPORTED_VIDEO_MESSAGE = "暂不支持该视频格式（当前仅支持 MP4 / WebM）";
export const VIDEO_LOAD_FAILED_MESSAGE = "视频加载失败，请确认资料文件完整";

const MEDIA_ERR_DECODE = 3;
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

type PlaybackError = "unsupported" | "load-failed";

type VideoPreviewProps = {
  storedPath: string;
};

// 调用方按资料用 key 重挂载本组件（见 MaterialPreviewPane），换资料的资源释放
// 与错误态重置都由重挂载承担，本组件只在卸载时释放一次。
export function VideoPreview({ storedPath }: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playbackError, setPlaybackError] = useState<PlaybackError | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
    };
  }, []);

  if (playbackError) {
    return (
      <p className="empty-state">
        {playbackError === "unsupported" ? UNSUPPORTED_VIDEO_MESSAGE : VIDEO_LOAD_FAILED_MESSAGE}
      </p>
    );
  }

  const handleError = (event: SyntheticEvent<HTMLVideoElement>) => {
    const code = event.currentTarget.error?.code;
    const isFormatError = code === MEDIA_ERR_DECODE || code === MEDIA_ERR_SRC_NOT_SUPPORTED;
    setPlaybackError(isFormatError ? "unsupported" : "load-failed");
  };

  return (
    <video
      ref={videoRef}
      className="video-preview"
      aria-label="视频播放器"
      controls
      preload="metadata"
      src={convertFileSrc(storedPath)}
      onError={handleError}
    />
  );
}
