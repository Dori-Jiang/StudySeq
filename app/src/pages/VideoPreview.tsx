import { useEffect, useRef, useState } from "react";

import { convertFileSrc } from "@tauri-apps/api/core";

export const UNSUPPORTED_VIDEO_MESSAGE = "暂不支持该视频格式（当前仅支持 MP4 / WebM）";

type VideoPreviewProps = {
  storedPath: string;
};

export function VideoPreview({ storedPath }: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hasPlaybackError, setHasPlaybackError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
    };
  }, [storedPath]);

  if (hasPlaybackError) {
    return <p className="empty-state">{UNSUPPORTED_VIDEO_MESSAGE}</p>;
  }

  return (
    <video
      ref={videoRef}
      className="video-preview"
      aria-label="视频播放器"
      controls
      preload="metadata"
      src={convertFileSrc(storedPath)}
      onError={() => setHasPlaybackError(true)}
    />
  );
}
