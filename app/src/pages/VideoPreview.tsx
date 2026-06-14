import { useEffect, useRef, useState } from "react";
import type { SyntheticEvent } from "react";

import { convertFileSrc } from "@tauri-apps/api/core";

export const UNSUPPORTED_VIDEO_MESSAGE = "暂不支持该视频格式（当前仅支持 MP4 / WebM）";
export const VIDEO_LOAD_FAILED_MESSAGE = "视频加载失败，请确认资料文件完整";
export const VIDEO_POSITION_SAVE_INTERVAL_SECONDS = 10;

const MEDIA_ERR_DECODE = 3;
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

type PlaybackError = "unsupported" | "load-failed";

type VideoPreviewProps = {
  storedPath: string;
  initialPositionSeconds?: number | null;
  onPositionChange?: (positionSeconds: number) => void;
};

// 调用方按资料用 key 重挂载本组件（见 MaterialPreviewPane），换资料的资源释放
// 与错误态重置都由重挂载承担，本组件只在卸载时释放一次。
export function VideoPreview({
  storedPath,
  initialPositionSeconds,
  onPositionChange,
}: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSavedPositionRef = useRef<number | null>(null);
  const hasLoadedMetadataRef = useRef(false);
  const [playbackError, setPlaybackError] = useState<PlaybackError | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (video) {
        const lastSavedPosition = lastSavedPositionRef.current;
        if (
          hasLoadedMetadataRef.current &&
          lastSavedPosition !== null &&
          Math.abs(video.currentTime - lastSavedPosition) > 0.25
        ) {
          emitPosition(video.currentTime);
        }
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
    };
  }, []);

  function emitPosition(positionSeconds: number) {
    if (!Number.isFinite(positionSeconds) || positionSeconds < 0) return;
    onPositionChange?.(positionSeconds);
    lastSavedPositionRef.current = positionSeconds;
  }

  function handleLoadedMetadata(event: SyntheticEvent<HTMLVideoElement>) {
    hasLoadedMetadataRef.current = true;
    const positionSeconds = initialPositionSeconds ?? 0;
    if (!Number.isFinite(positionSeconds) || positionSeconds <= 0) return;

    const video = event.currentTarget;
    const maxPosition = Number.isFinite(video.duration)
      ? Math.max(0, video.duration - 0.25)
      : positionSeconds;
    video.currentTime = Math.min(positionSeconds, maxPosition);
    lastSavedPositionRef.current = video.currentTime;
  }

  function handleTimeUpdate(event: SyntheticEvent<HTMLVideoElement>) {
    const positionSeconds = event.currentTarget.currentTime;
    const lastSavedPosition = lastSavedPositionRef.current;
    if (
      lastSavedPosition === null ||
      Math.abs(positionSeconds - lastSavedPosition) >= VIDEO_POSITION_SAVE_INTERVAL_SECONDS
    ) {
      emitPosition(positionSeconds);
    }
  }

  function handlePositionCommit(event: SyntheticEvent<HTMLVideoElement>) {
    emitPosition(event.currentTarget.currentTime);
  }

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
      onLoadedMetadata={handleLoadedMetadata}
      onPause={handlePositionCommit}
      onSeeked={handlePositionCommit}
      onTimeUpdate={handleTimeUpdate}
    />
  );
}
