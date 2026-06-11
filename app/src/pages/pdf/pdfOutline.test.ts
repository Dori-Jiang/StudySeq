import { describe, expect, it } from "vitest";

import { loadPdfOutline } from "./pdfOutline";
import type { PdfDocumentProxy, PdfOutlineItem } from "./pdfDocumentCache";

function createDocument(overrides: Partial<PdfDocumentProxy>): PdfDocumentProxy {
  return {
    numPages: 10,
    getPage: () => Promise.reject(new Error("not used in outline tests")),
    ...overrides,
  };
}

function outlineItem(
  title: string,
  dest: unknown,
  items: PdfOutlineItem[] = [],
): PdfOutlineItem {
  return { title, dest, items };
}

const pageRefOf = (pageIndex: number) => ({ num: pageIndex, gen: 0 });

function createResolvingDocument(
  outline: PdfOutlineItem[],
  namedDestinations: Record<string, unknown[] | null> = {},
): PdfDocumentProxy {
  return createDocument({
    getOutline: () => Promise.resolve(outline),
    getDestination: (name: string) => Promise.resolve(namedDestinations[name] ?? null),
    getPageIndex: (ref: unknown) => {
      const candidate = ref as { num?: number };
      if (typeof candidate?.num !== "number") {
        return Promise.reject(new Error("invalid page ref"));
      }
      return Promise.resolve(candidate.num);
    },
  });
}

describe("loadPdfOutline", () => {
  it("getOutline 返回 null 时得到空目录", async () => {
    const document = createDocument({ getOutline: () => Promise.resolve(null) });

    expect(await loadPdfOutline(document)).toEqual([]);
  });

  it("getOutline 返回空数组时得到空目录", async () => {
    const document = createDocument({ getOutline: () => Promise.resolve([]) });

    expect(await loadPdfOutline(document)).toEqual([]);
  });

  it("文档不支持 getOutline 时得到空目录", async () => {
    const document = createDocument({});

    expect(await loadPdfOutline(document)).toEqual([]);
  });

  it("getOutline 抛错时降级为空目录", async () => {
    const document = createDocument({
      getOutline: () => Promise.reject(new Error("broken outline")),
    });

    expect(await loadPdfOutline(document)).toEqual([]);
  });

  it("解析数组形态 dest 为 1 起始页码并保留多级层级", async () => {
    const document = createResolvingDocument([
      outlineItem("第一章", [pageRefOf(0)], [outlineItem("第一节", [pageRefOf(2)])]),
      outlineItem("第二章", [pageRefOf(5)]),
    ]);

    const nodes = await loadPdfOutline(document);

    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ title: "第一章", pageNumber: 1 });
    expect(nodes[0].children).toHaveLength(1);
    expect(nodes[0].children[0]).toMatchObject({ title: "第一节", pageNumber: 3 });
    expect(nodes[1]).toMatchObject({ title: "第二章", pageNumber: 6 });
  });

  it("解析字符串命名 dest", async () => {
    const document = createResolvingDocument(
      [outlineItem("命名章节", "chapter-one")],
      { "chapter-one": [pageRefOf(4)] },
    );

    const nodes = await loadPdfOutline(document);

    expect(nodes[0]).toMatchObject({ title: "命名章节", pageNumber: 5 });
  });

  it("dest 无法解析时节点保留但页码为 null", async () => {
    const document = createResolvingDocument([
      outlineItem("坏目标", null),
      outlineItem("正常", [pageRefOf(1)]),
    ]);

    const nodes = await loadPdfOutline(document);

    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ title: "坏目标", pageNumber: null });
    expect(nodes[1]).toMatchObject({ title: "正常", pageNumber: 2 });
  });

  it("单节点解析抛错不拖垮整棵树", async () => {
    const document = createResolvingDocument([
      outlineItem("会抛错", [{ broken: true }]),
      outlineItem("正常", [pageRefOf(7)]),
    ]);

    const nodes = await loadPdfOutline(document);

    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ title: "会抛错", pageNumber: null });
    expect(nodes[1]).toMatchObject({ title: "正常", pageNumber: 8 });
  });

  it("空标题给出占位文案", async () => {
    const document = createResolvingDocument([outlineItem("   ", [pageRefOf(0)])]);

    const nodes = await loadPdfOutline(document);

    expect(nodes[0].title).toBe("（无标题）");
  });

  it("节点总数超限时截断", async () => {
    const bigOutline = Array.from({ length: 600 }, (_, index) =>
      outlineItem(`条目 ${index}`, [pageRefOf(0)]),
    );
    const document = createResolvingDocument(bigOutline);

    const nodes = await loadPdfOutline(document);

    expect(nodes.length).toBeLessThanOrEqual(500);
  });

  it("递归深度超限时截断更深层级", async () => {
    let deepest = outlineItem("第 12 层", [pageRefOf(0)]);
    for (let depth = 11; depth >= 1; depth -= 1) {
      deepest = outlineItem(`第 ${depth} 层`, [pageRefOf(0)], [deepest]);
    }
    const document = createResolvingDocument([deepest]);

    const nodes = await loadPdfOutline(document);

    let depthCount = 0;
    let cursor = nodes[0];
    while (cursor) {
      depthCount += 1;
      cursor = cursor.children[0];
    }
    expect(depthCount).toBeLessThanOrEqual(8);
  });

  it("每个节点拥有稳定且唯一的 id", async () => {
    const document = createResolvingDocument([
      outlineItem("章", [pageRefOf(0)], [outlineItem("节", [pageRefOf(1)])]),
      outlineItem("章", [pageRefOf(2)]),
    ]);

    const nodes = await loadPdfOutline(document);
    const ids = [nodes[0].id, nodes[0].children[0].id, nodes[1].id];

    expect(new Set(ids).size).toBe(ids.length);
  });
});
