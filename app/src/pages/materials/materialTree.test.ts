import { describe, expect, it } from "vitest";

import {
  buildBreadcrumb,
  collectSubtreeIds,
  hasAncestorIn,
  listChildren,
} from "./materialTree";
import type { MaterialItem, MaterialKind } from "../../shared/types";

function buildItem(
  id: string,
  parentId: string | null,
  kind: MaterialKind,
  createdAt = "2026-06-12T00:00:00Z",
): MaterialItem {
  return {
    id,
    learningContentId: "lc-1",
    parentId,
    kind,
    name: id,
    storedPath: kind === "file" ? `C:/lib/${id}` : null,
    mimeType: null,
    sizeBytes: 0,
    createdAt,
    updatedAt: createdAt,
  };
}

// 结构：根 [folder-a, file-1]；folder-a 内 [folder-b, file-2]；folder-b 内 [file-3]
const materials: MaterialItem[] = [
  buildItem("file-1", null, "file", "2026-06-12T00:00:01Z"),
  buildItem("folder-a", null, "folder", "2026-06-12T00:00:02Z"),
  buildItem("file-2", "folder-a", "file"),
  buildItem("folder-b", "folder-a", "folder"),
  buildItem("file-3", "folder-b", "file"),
];

describe("listChildren", () => {
  it("根层只返回 parentId 为 null 的项，文件夹排在文件前", () => {
    const children = listChildren(materials, null);
    expect(children.map((item) => item.id)).toEqual(["folder-a", "file-1"]);
  });

  it("文件夹层返回其直接子项", () => {
    const children = listChildren(materials, "folder-a");
    expect(children.map((item) => item.id)).toEqual(["folder-b", "file-2"]);
  });
});

describe("collectSubtreeIds", () => {
  it("收集整棵子树含根自身", () => {
    const ids = collectSubtreeIds(materials, "folder-a");
    expect([...ids].sort()).toEqual(["file-2", "file-3", "folder-a", "folder-b"]);
  });

  it("文件返回只含自身", () => {
    expect([...collectSubtreeIds(materials, "file-1")]).toEqual(["file-1"]);
  });
});

describe("hasAncestorIn", () => {
  it("自身在集合中返回 true", () => {
    expect(hasAncestorIn(materials[0], materials, new Set(["file-1"]))).toBe(true);
  });

  it("祖先文件夹在集合中返回 true", () => {
    const file3 = materials.find((item) => item.id === "file-3")!;
    expect(hasAncestorIn(file3, materials, new Set(["folder-a"]))).toBe(true);
  });

  it("无关集合返回 false", () => {
    const file2 = materials.find((item) => item.id === "file-2")!;
    expect(hasAncestorIn(file2, materials, new Set(["folder-b"]))).toBe(false);
  });
});

describe("buildBreadcrumb", () => {
  it("根目录返回空链", () => {
    expect(buildBreadcrumb(materials, null)).toEqual([]);
  });

  it("嵌套文件夹返回从根到当前的链", () => {
    const chain = buildBreadcrumb(materials, "folder-b");
    expect(chain.map((item) => item.id)).toEqual(["folder-a", "folder-b"]);
  });

  it("不存在的文件夹返回空链", () => {
    expect(buildBreadcrumb(materials, "missing")).toEqual([]);
  });
});
