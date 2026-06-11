import type { MaterialItem } from "../../shared/types";
import { collectSubtreeIds } from "./materialTree";

type MoveMaterialDialogProps = {
  material: MaterialItem;
  materials: MaterialItem[];
  onClose: () => void;
  onMove: (newParentId: string | null) => void;
};

export function MoveMaterialDialog({
  material,
  materials,
  onClose,
  onMove,
}: MoveMaterialDialogProps) {
  // 禁选自身与后代（文件夹移动时），避免制造循环
  const forbiddenIds =
    material.kind === "folder" ? collectSubtreeIds(materials, material.id) : new Set([material.id]);
  const folders = materials.filter((item) => item.kind === "folder");

  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-label={`移动 ${material.name}`} className="confirm-dialog" role="dialog">
        <h2>移动「{material.name}」到</h2>
        <ul className="move-dialog-targets">
          <li>
            <button
              type="button"
              disabled={material.parentId === null}
              onClick={() => onMove(null)}
            >
              根目录
            </button>
          </li>
          {folders.map((folder) => (
            <li key={folder.id}>
              <button
                type="button"
                disabled={forbiddenIds.has(folder.id) || material.parentId === folder.id}
                onClick={() => onMove(folder.id)}
              >
                {folder.name}
              </button>
            </li>
          ))}
        </ul>
        <div className="confirm-dialog-actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
        </div>
      </section>
    </div>
  );
}
