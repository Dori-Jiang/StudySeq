import { useState } from "react";

import type { MaterialItem } from "../../shared/types";
import { MaterialTile } from "./MaterialTile";
import { MoveMaterialDialog } from "./MoveMaterialDialog";
import { buildBreadcrumb, collectSubtreeIds, listChildren } from "./materialTree";

type MaterialExplorerProps = {
  materials: MaterialItem[];
  pendingDeletedMaterialIds: string[];
  onCreateFolder: (parentId: string | null) => void;
  onImport: (parentId: string | null) => void;
  onMove: (material: MaterialItem, newParentId: string | null) => Promise<void> | void;
  onOpenFile: (material: MaterialItem) => void;
  onRename: (material: MaterialItem) => void;
  onStageDelete: (material: MaterialItem) => void;
};

export function MaterialExplorer({
  materials,
  onCreateFolder,
  onImport,
  onMove,
  onOpenFile,
  onRename,
  onStageDelete,
  pendingDeletedMaterialIds,
}: MaterialExplorerProps) {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [movingMaterial, setMovingMaterial] = useState<MaterialItem | null>(null);

  // 当前文件夹被删除或不存在时回落到根目录
  const currentFolder = materials.find(
    (material) => material.id === currentFolderId && material.kind === "folder",
  );
  const effectiveFolderId = currentFolder ? currentFolder.id : null;

  // 被标记删除的项连同其整棵子树一起隐藏：一次性求出待删子树合集
  const pendingSubtreeIds = new Set(
    pendingDeletedMaterialIds.flatMap((materialId) => [
      ...collectSubtreeIds(materials, materialId),
    ]),
  );
  const visibleChildren = listChildren(materials, effectiveFolderId).filter(
    (material) => !pendingSubtreeIds.has(material.id),
  );
  const breadcrumb = buildBreadcrumb(materials, effectiveFolderId);

  function handleOpen(material: MaterialItem) {
    if (material.kind === "folder") {
      setCurrentFolderId(material.id);
      return;
    }
    onOpenFile(material);
  }

  async function handleMove(newParentId: string | null) {
    if (!movingMaterial) return;
    await onMove(movingMaterial, newParentId);
    setMovingMaterial(null);
  }

  return (
    <div className="material-explorer">
      <div className="material-explorer-toolbar">
        <nav aria-label="资料位置" className="material-breadcrumb">
          <button
            type="button"
            disabled={effectiveFolderId === null}
            onClick={() => setCurrentFolderId(null)}
          >
            根目录
          </button>
          {breadcrumb.map((folder) => (
            <span key={folder.id}>
              <span aria-hidden="true" className="material-breadcrumb-separator">
                ›
              </span>
              <button
                type="button"
                disabled={folder.id === effectiveFolderId}
                onClick={() => setCurrentFolderId(folder.id)}
              >
                {folder.name}
              </button>
            </span>
          ))}
        </nav>
        <div className="material-explorer-actions">
          <button type="button" onClick={() => onCreateFolder(effectiveFolderId)}>
            新建文件夹
          </button>
          <button type="button" onClick={() => onImport(effectiveFolderId)}>
            导入资料
          </button>
        </div>
      </div>

      {visibleChildren.length === 0 ? (
        <p className="empty-state">
          {effectiveFolderId === null ? "还没有资料" : "这个文件夹是空的"}
        </p>
      ) : (
        <div className="material-tile-grid">
          {visibleChildren.map((material) => (
            <MaterialTile
              key={material.id}
              material={material}
              onMoveRequest={setMovingMaterial}
              onOpen={handleOpen}
              onRename={onRename}
              onStageDelete={onStageDelete}
            />
          ))}
        </div>
      )}

      {movingMaterial ? (
        <MoveMaterialDialog
          material={movingMaterial}
          materials={materials}
          disabledFolderIds={pendingSubtreeIds}
          onClose={() => setMovingMaterial(null)}
          onMove={(newParentId) => {
            void handleMove(newParentId);
          }}
        />
      ) : null}
    </div>
  );
}
