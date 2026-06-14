import { useEffect, useState } from "react";

import type { MaterialItem } from "../../shared/types";
import { MaterialTile } from "./MaterialTile";
import { MoveMaterialDialog } from "./MoveMaterialDialog";
import { buildBreadcrumb, collectSubtreeIds, listChildren } from "./materialTree";

type MaterialExplorerProps = {
  materials: MaterialItem[];
  currentFolderId: string | null;
  pendingDeletedMaterialIds: string[];
  onCurrentFolderChange: (folderId: string | null) => void;
  onCreateFolder: (parentId: string | null) => void;
  onImport: (parentId: string | null) => void;
  onMove: (material: MaterialItem, newParentId: string | null) => Promise<void> | void;
  onOpenFile: (material: MaterialItem) => void;
  onRename: (material: MaterialItem) => void;
  onStageDelete: (material: MaterialItem) => void;
};

type MaterialTypeFilter = "all" | "folder" | "text" | "image" | "pdf" | "video" | "other";
type MaterialSortMode = "default" | "name" | "type" | "updated";

export function MaterialExplorer({
  currentFolderId,
  materials,
  onCurrentFolderChange,
  onCreateFolder,
  onImport,
  onMove,
  onOpenFile,
  onRename,
  onStageDelete,
  pendingDeletedMaterialIds,
}: MaterialExplorerProps) {
  const [movingMaterial, setMovingMaterial] = useState<MaterialItem | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<MaterialTypeFilter>("all");
  const [sortMode, setSortMode] = useState<MaterialSortMode>("default");

  // 被标记删除的项连同其整棵子树一起隐藏：一次性求出待删子树合集
  const pendingSubtreeIds = new Set(
    pendingDeletedMaterialIds.flatMap((materialId) => [
      ...collectSubtreeIds(materials, materialId),
    ]),
  );
  // 当前文件夹被删除、标记删除或不存在时回落到根目录
  const currentFolder = materials.find(
    (material) =>
      material.id === currentFolderId &&
      material.kind === "folder" &&
      !pendingSubtreeIds.has(material.id),
  );
  const effectiveFolderId = currentFolder ? currentFolder.id : null;
  useEffect(() => {
    if (currentFolderId !== null && effectiveFolderId === null) {
      onCurrentFolderChange(null);
    }
  }, [currentFolderId, effectiveFolderId, onCurrentFolderChange]);

  const visibleChildren = listChildren(materials, effectiveFolderId).filter(
    (material) => !pendingSubtreeIds.has(material.id),
  );
  const filteredChildren = sortMaterials(
    visibleChildren.filter((material) => {
      const normalizedSearch = searchTerm.trim().toLocaleLowerCase("zh-CN");
      const nameMatches =
        normalizedSearch.length === 0 ||
        material.name.toLocaleLowerCase("zh-CN").includes(normalizedSearch);
      return nameMatches && materialMatchesTypeFilter(material, typeFilter);
    }),
    sortMode,
  );
  const breadcrumb = buildBreadcrumb(materials, effectiveFolderId);

  function handleOpen(material: MaterialItem) {
    if (material.kind === "folder") {
      onCurrentFolderChange(material.id);
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
            onClick={() => onCurrentFolderChange(null)}
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
                onClick={() => onCurrentFolderChange(folder.id)}
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

      <div className="material-explorer-controls" aria-label="当前文件夹资料定位">
        <label>
          搜索
          <input
            aria-label="搜索当前文件夹资料"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="文件名或扩展名"
          />
        </label>
        <label>
          类型
          <select
            aria-label="筛选资料类型"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as MaterialTypeFilter)}
          >
            <option value="all">全部</option>
            <option value="folder">文件夹</option>
            <option value="text">文本</option>
            <option value="image">图片</option>
            <option value="pdf">PDF</option>
            <option value="video">视频</option>
            <option value="other">其他文件</option>
          </select>
        </label>
        <label>
          排序
          <select
            aria-label="排序当前文件夹资料"
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as MaterialSortMode)}
          >
            <option value="default">默认</option>
            <option value="name">名称</option>
            <option value="type">类型</option>
            <option value="updated">最近更新</option>
          </select>
        </label>
      </div>

      {visibleChildren.length === 0 ? (
        <p className="empty-state">
          {effectiveFolderId === null ? "还没有资料" : "这个文件夹是空的"}
        </p>
      ) : filteredChildren.length === 0 ? (
        <p className="empty-state">当前文件夹没有匹配资料</p>
      ) : (
        <div className="material-tile-grid">
          {filteredChildren.map((material) => (
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

function materialMatchesTypeFilter(material: MaterialItem, filter: MaterialTypeFilter) {
  if (filter === "all") return true;
  if (filter === "folder") return material.kind === "folder";
  if (material.kind === "folder") return false;
  return getMaterialTypeGroup(material) === filter;
}

function getMaterialTypeGroup(material: MaterialItem): Exclude<MaterialTypeFilter, "all" | "folder"> {
  const mimeType = material.mimeType ?? "";
  const extension = material.name.split(".").pop()?.toLocaleLowerCase("zh-CN") ?? "";
  if (mimeType === "text/plain" || extension === "txt") return "text";
  if (mimeType.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp"].includes(extension)) {
    return "image";
  }
  if (mimeType === "application/pdf" || extension === "pdf") return "pdf";
  if (mimeType.startsWith("video/") || ["mp4", "webm", "mkv", "avi", "mov"].includes(extension)) {
    return "video";
  }
  return "other";
}

function sortMaterials(materials: MaterialItem[], sortMode: MaterialSortMode) {
  if (sortMode === "default") return materials;
  return [...materials].sort((left, right) => {
    if (sortMode === "name") {
      return left.name.localeCompare(right.name, "zh-CN");
    }
    if (sortMode === "updated") {
      return right.updatedAt.localeCompare(left.updatedAt);
    }

    const leftType = left.kind === "folder" ? "folder" : getMaterialTypeGroup(left);
    const rightType = right.kind === "folder" ? "folder" : getMaterialTypeGroup(right);
    return leftType.localeCompare(rightType, "zh-CN") || left.name.localeCompare(right.name, "zh-CN");
  });
}
