import type { MaterialItem } from "../../shared/types";

/** 返回某层（parentId 为 null 表示根）的直接子项，文件夹在前、文件在后，层内保持入参顺序。 */
export function listChildren(
  materials: MaterialItem[],
  parentId: string | null,
): MaterialItem[] {
  const children = materials.filter((material) => material.parentId === parentId);
  const folders = children.filter((material) => material.kind === "folder");
  const files = children.filter((material) => material.kind === "file");
  return [...folders, ...files];
}

/** 收集以 rootId 为根的整棵子树 id（含根自身），用 visited 防御异常数据中的环。 */
export function collectSubtreeIds(materials: MaterialItem[], rootId: string): Set<string> {
  const ids = new Set<string>([rootId]);
  const frontier = [rootId];
  while (frontier.length > 0) {
    const currentId = frontier.pop()!;
    for (const material of materials) {
      if (material.parentId !== currentId || ids.has(material.id)) continue;
      ids.add(material.id);
      if (material.kind === "folder") {
        frontier.push(material.id);
      }
    }
  }
  return ids;
}

/** 判断 material 自身或任一祖先是否落在 ids 集合中（用于隐藏被标记删除的整棵子树）。 */
export function hasAncestorIn(
  material: MaterialItem,
  materials: MaterialItem[],
  ids: Set<string>,
): boolean {
  const byId = new Map(materials.map((item) => [item.id, item]));
  const visited = new Set<string>();
  let current: MaterialItem | undefined = material;
  while (current) {
    if (ids.has(current.id)) return true;
    if (visited.has(current.id)) return false;
    visited.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return false;
}

/** 返回从根到 folderId 的文件夹链（不含根目录本身）；folderId 为 null 或不存在时返回空链。 */
export function buildBreadcrumb(
  materials: MaterialItem[],
  folderId: string | null,
): MaterialItem[] {
  if (!folderId) return [];
  const byId = new Map(materials.map((item) => [item.id, item]));
  const chain: MaterialItem[] = [];
  const visited = new Set<string>();
  let current = byId.get(folderId);
  while (current && current.kind === "folder" && !visited.has(current.id)) {
    visited.add(current.id);
    chain.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
}
