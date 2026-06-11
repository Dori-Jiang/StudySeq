import type { MaterialItem } from "../../shared/types";

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

  return (
    <aside className="pending-delete-bar">
      <p>已标记删除 {pendingDeletedMaterialIds.length} 个资料</p>
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
