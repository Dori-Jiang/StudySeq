import type { MaterialItem } from "../../shared/types";

export type MaterialSearchResult = {
  material: MaterialItem;
  logicalPath: string;
};

type MaterialTreeSearchOptions = {
  query: string;
  excludedIds: Set<string>;
};

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

/** 返回 material 所在父级的逻辑路径，只使用资料树 parentId，不使用 storedPath。 */
export function getLogicalParentPath(materials: MaterialItem[], material: MaterialItem): string {
  const parentChain = buildPathToFolder(materials, material.parentId);
  return ["根目录", ...parentChain.map((folder) => folder.name)].join(" / ");
}

/** 在当前学习内容的逻辑资料树中搜索名称和扩展名，不读取文件内容。 */
export function searchMaterialTree(
  materials: MaterialItem[],
  { excludedIds, query }: MaterialTreeSearchOptions,
): MaterialSearchResult[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  return materials
    .filter((material) => !hasAncestorIn(material, materials, excludedIds))
    .filter((material) => materialMatchesQuery(material, normalizedQuery))
    .map((material) => ({
      material,
      logicalPath: getLogicalParentPath(materials, material),
    }));
}

function materialMatchesQuery(material: MaterialItem, normalizedQuery: string) {
  const normalizedName = normalizeSearchText(material.name);
  if (normalizedName.includes(normalizedQuery)) return true;

  if (material.kind === "folder") return false;
  const normalizedExtension = normalizeSearchText(getExtension(material.name));
  return normalizedExtension.length > 0 && normalizedExtension.includes(stripDot(normalizedQuery));
}

function getExtension(name: string) {
  const lastDotIndex = name.lastIndexOf(".");
  if (lastDotIndex < 0 || lastDotIndex === name.length - 1) return "";
  return name.slice(lastDotIndex + 1);
}

function normalizeSearchText(value: string) {
  return stripDot(value.trim().toLocaleLowerCase("zh-CN"));
}

function stripDot(value: string) {
  return value.startsWith(".") ? value.slice(1) : value;
}

function buildPathToFolder(materials: MaterialItem[], folderId: string | null) {
  if (!folderId) return [];

  const pathFromRoot = findFolderPathFromRoots(materials, folderId);
  if (pathFromRoot) return pathFromRoot;

  const byId = new Map(materials.map((item) => [item.id, item]));
  const chain: MaterialItem[] = [];
  const visited = new Set<string>();
  let current = byId.get(folderId);
  while (current && current.kind === "folder" && !visited.has(current.id)) {
    visited.add(current.id);
    chain.push(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
}

function findFolderPathFromRoots(materials: MaterialItem[], targetFolderId: string) {
  const foldersByParentId = new Map<string, MaterialItem[]>();
  for (const material of materials) {
    if (material.kind !== "folder") continue;
    const key = material.parentId ?? "__root__";
    foldersByParentId.set(key, [...(foldersByParentId.get(key) ?? []), material]);
  }

  const frontier = (foldersByParentId.get("__root__") ?? []).map((folder) => ({
    folder,
    path: [folder],
    visited: new Set<string>(),
  }));

  while (frontier.length > 0) {
    const current = frontier.shift()!;
    if (current.folder.id === targetFolderId) return current.path;
    if (current.visited.has(current.folder.id)) continue;

    const nextVisited = new Set(current.visited);
    nextVisited.add(current.folder.id);
    for (const child of foldersByParentId.get(current.folder.id) ?? []) {
      frontier.push({
        folder: child,
        path: [...current.path, child],
        visited: nextVisited,
      });
    }
  }

  return null;
}
