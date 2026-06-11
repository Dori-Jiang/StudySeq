import type { MaterialItem } from "../../shared/types";
import { formatBytes, iconForMaterial } from "./format";

type MaterialTileProps = {
  material: MaterialItem;
  onOpen: (material: MaterialItem) => void;
  onRename: (material: MaterialItem) => void;
  onMoveRequest: (material: MaterialItem) => void;
  onStageDelete: (material: MaterialItem) => void;
};

export function MaterialTile({
  material,
  onMoveRequest,
  onOpen,
  onRename,
  onStageDelete,
}: MaterialTileProps) {
  const isFolder = material.kind === "folder";

  return (
    <article className={`material-tile${isFolder ? " material-tile-folder" : ""}`}>
      <button
        className="material-tile-open"
        type="button"
        aria-label={isFolder ? `打开文件夹：${material.name}` : `打开资料：${material.name}`}
        onClick={() => onOpen(material)}
      >
        <span aria-hidden="true" className="material-tile-icon">
          {iconForMaterial(material)}
        </span>
        <h3>{material.name}</h3>
        <p>{isFolder ? "文件夹" : formatBytes(material.sizeBytes)}</p>
      </button>
      <div
        aria-label={`资料操作：${material.name}`}
        className="material-tile-actions"
        role="group"
      >
        <button type="button" onClick={() => onRename(material)}>
          重命名
        </button>
        <button type="button" onClick={() => onMoveRequest(material)}>
          移动到
        </button>
        <button type="button" onClick={() => onStageDelete(material)}>
          删除
        </button>
      </div>
    </article>
  );
}
