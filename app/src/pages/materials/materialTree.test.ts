import { describe, expect, it } from "vitest";

import {
  buildBreadcrumb,
  collectSubtreeIds,
  getLogicalParentPath,
  hasAncestorIn,
  listChildren,
  searchMaterialTree,
} from "./materialTree";
import type { MaterialItem, MaterialKind } from "../../shared/types";

function buildItem(
  id: string,
  parentId: string | null,
  kind: MaterialKind,
  createdAt = "2026-06-12T00:00:00Z",
  name = id,
): MaterialItem {
  return {
    id,
    learningContentId: "lc-1",
    parentId,
    kind,
    name,
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

describe("getLogicalParentPath", () => {
  it("返回资料所在父级逻辑路径，不包含本机 storedPath", () => {
    const file3 = materials.find((item) => item.id === "file-3")!;

    expect(getLogicalParentPath(materials, file3)).toBe("根目录 / folder-a / folder-b");
    expect(getLogicalParentPath(materials, materials[0])).toBe("根目录");
  });

  it("异常环形 parent 不会死循环", () => {
    const circular: MaterialItem[] = [
      buildItem("folder-a", "folder-b", "folder"),
      buildItem("folder-b", "folder-a", "folder"),
      buildItem("file-a", "folder-a", "file", "2026-06-12T00:00:00Z", "循环.pdf"),
    ];

    expect(getLogicalParentPath(circular, circular[2])).toBe("根目录 / folder-a / folder-b");
  });
});

describe("searchMaterialTree", () => {
  const searchableMaterials: MaterialItem[] = [
    buildItem("root-file", null, "file", "2026-06-12T00:00:00Z", "根资料.txt"),
    buildItem("chapter-1", null, "folder", "2026-06-12T00:00:00Z", "第一章"),
    buildItem("chapter-2", null, "folder", "2026-06-12T00:00:00Z", "第二章"),
    buildItem("nested-pdf", "chapter-1", "file", "2026-06-12T00:00:00Z", "递归资料.PDF"),
    buildItem("deep-folder", "chapter-1", "folder", "2026-06-12T00:00:00Z", "第二节"),
    buildItem("deep-file", "deep-folder", "file", "2026-06-12T00:00:00Z", "C++ 入门(第1版).pptx"),
  ];

  it("递归匹配当前学习内容中的资料名和文件夹名", () => {
    const results = searchMaterialTree(searchableMaterials, {
      query: "第二",
      excludedIds: new Set(),
    });

    expect(results.map((result) => result.material.id)).toEqual(["chapter-2", "deep-folder"]);
    expect(results[1].logicalPath).toBe("根目录 / 第一章");
  });

  it("支持扩展名搜索并忽略大小写和点号", () => {
    expect(
      searchMaterialTree(searchableMaterials, { query: "pdf", excludedIds: new Set() }).map(
        (result) => result.material.id,
      ),
    ).toEqual(["nested-pdf"]);
    expect(
      searchMaterialTree(searchableMaterials, { query: ".PPTX", excludedIds: new Set() }).map(
        (result) => result.material.id,
      ),
    ).toEqual(["deep-file"]);
  });

  it("空白搜索不返回整棵树", () => {
    expect(searchMaterialTree(searchableMaterials, { query: "  ", excludedIds: new Set() })).toEqual(
      [],
    );
  });

  it("排除待删除子树", () => {
    const excludedIds = collectSubtreeIds(searchableMaterials, "chapter-1");

    const results = searchMaterialTree(searchableMaterials, {
      query: "资料",
      excludedIds,
    });

    expect(results.map((result) => result.material.id)).toEqual(["root-file"]);
  });

  it("异常 parent 数据不会阻塞搜索", () => {
    const circular: MaterialItem[] = [
      buildItem("folder-a", "folder-b", "folder", "2026-06-12T00:00:00Z", "A"),
      buildItem("folder-b", "folder-a", "folder", "2026-06-12T00:00:00Z", "B"),
      buildItem("file-a", "folder-a", "file", "2026-06-12T00:00:00Z", "循环资料.pdf"),
    ];

    const results = searchMaterialTree(circular, {
      query: "循环",
      excludedIds: new Set(),
    });

    expect(results.map((result) => result.material.id)).toEqual(["file-a"]);
  });
});
