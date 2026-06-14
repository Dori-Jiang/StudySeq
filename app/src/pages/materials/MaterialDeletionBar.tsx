import type { MaterialItem } from "../../shared/types";
import { collectSubtreeIds } from "./materialTree";

type MaterialDeletionBarProps = {
  materials: MaterialItem[];
  onSave: () => void;
  onUndo: (materialId: string) => void;
  pendingDeletedMaterialIds: string[];
};

export function MaterialDeletionBar({
  materials,
  onSave,
  onUndo,
  pendingDeletedMaterialIds,
}: MaterialDeletionBarProps) {
  if (pendingDeletedMaterialIds.length === 0) return null;
  const impact = summarizeDeletionImpact(materials, pendingDeletedMaterialIds);

  return (
    <aside className="pending-delete-bar">
      <p>
        已标记删除 {impact.fileCount} 个文件、{impact.folderCount} 个文件夹
        {impact.folderCount > 0 ? "（含子项）" : ""}
      </p>
      <div className="material-actions">
        {pendingDeletedMaterialIds.map((materialId) => {
          const material = materials.find((currentMaterial) => currentMaterial.id === materialId);
          return (
            <button
              aria-label={`撤回删除 ${material?.name ?? materialId}`}
              key={materialId}
              type="button"
              onClick={() => onUndo(materialId)}
            >
              撤回
            </button>
          );
        })}
        <button type="button" onClick={onSave}>
          保存资料删除
        </button>
      </div>
    </aside>
  );
}

function summarizeDeletionImpact(materials: MaterialItem[], pendingDeletedMaterialIds: string[]) {
  const coveredIds = new Set<string>();
  const rootIds = pendingDeletedMaterialIds.filter((materialId) => {
    if (coveredIds.has(materialId)) return false;
    for (const subtreeId of collectSubtreeIds(materials, materialId)) {
      if (subtreeId !== materialId) coveredIds.add(subtreeId);
    }
    return true;
  });
  const impactedIds = new Set(rootIds.flatMap((materialId) => [...collectSubtreeIds(materials, materialId)]));
  let fileCount = 0;
  let folderCount = 0;
  for (const material of materials) {
    if (!impactedIds.has(material.id)) continue;
    if (material.kind === "folder") {
      folderCount += 1;
    } else {
      fileCount += 1;
    }
  }

  return { fileCount, folderCount };
}
