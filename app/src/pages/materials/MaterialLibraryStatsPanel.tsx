import type { MaterialLibraryStats } from "../../shared/types";
import { formatBytes } from "./format";

type MaterialLibraryStatsPanelProps = {
  message: string | null;
  onCleanup: () => void;
  onRefresh: () => void;
  stats: MaterialLibraryStats | null;
};

export function MaterialLibraryStatsPanel({
  message,
  onCleanup,
  onRefresh,
  stats,
}: MaterialLibraryStatsPanelProps) {
  return (
    <section className="material-library-panel" aria-label="资料库统计">
      <div className="material-library-actions">
        <button type="button" onClick={onRefresh}>
          刷新资料库统计
        </button>
        <button type="button" onClick={onCleanup}>
          清理无引用资料
        </button>
      </div>
      {stats ? (
        <div className="material-library-stats">
          <span>{`资料数量 ${stats.materialCount}`}</span>
          <span>{`记录大小 ${formatBytes(stats.referencedBytes)}`}</span>
          <span>{`磁盘占用 ${formatBytes(stats.libraryBytes)}`}</span>
          <span>{`缺失文件 ${stats.missingFileCount}`}</span>
          <span>{`无引用文件 ${stats.orphanFileCount}`}</span>
          <span>{`孤儿记录 ${stats.orphanDatabaseRecordCount}`}</span>
        </div>
      ) : (
        <p className="muted-text">资料库统计低频刷新，可手动刷新。</p>
      )}
      {message ? <p className="muted-text">{message}</p> : null}
    </section>
  );
}
