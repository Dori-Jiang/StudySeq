import type { PdfDocumentProxy, PdfOutlineItem } from "./pdfDocumentCache";

const OUTLINE_MAX_NODE_COUNT = 500;
const OUTLINE_MAX_DEPTH = 8;
const OUTLINE_EMPTY_TITLE_PLACEHOLDER = "（无标题）";

export type PdfOutlineNode = {
  id: string;
  title: string;
  pageNumber: number | null;
  children: PdfOutlineNode[];
};

export async function loadPdfOutline(document: PdfDocumentProxy): Promise<PdfOutlineNode[]> {
  if (!document.getOutline) return [];

  let outlineItems: PdfOutlineItem[] | null;
  try {
    outlineItems = await document.getOutline();
  } catch {
    return [];
  }
  if (!outlineItems || outlineItems.length === 0) return [];

  const budget = { remaining: OUTLINE_MAX_NODE_COUNT };
  return buildOutlineNodes(document, outlineItems, "outline", 1, budget);
}

async function buildOutlineNodes(
  document: PdfDocumentProxy,
  items: PdfOutlineItem[],
  idPrefix: string,
  depth: number,
  budget: { remaining: number },
): Promise<PdfOutlineNode[]> {
  if (depth > OUTLINE_MAX_DEPTH) return [];

  const takenItems: { item: PdfOutlineItem; index: number }[] = [];
  for (const [index, item] of items.entries()) {
    if (budget.remaining <= 0) break;
    budget.remaining -= 1;
    takenItems.push({ item, index });
  }

  // 同层 dest 并行解析，避免大目录下数百次串行 worker 往返。
  const pageNumbers = await Promise.all(
    takenItems.map(({ item }) => resolveDestinationPageNumber(document, item.dest)),
  );

  const nodes: PdfOutlineNode[] = [];
  for (const [takenIndex, { item, index }] of takenItems.entries()) {
    const id = `${idPrefix}-${index}`;
    const title = item.title?.trim() ? item.title.trim() : OUTLINE_EMPTY_TITLE_PLACEHOLDER;
    const children = Array.isArray(item.items)
      ? await buildOutlineNodes(document, item.items, id, depth + 1, budget)
      : [];

    nodes.push({ id, title, pageNumber: pageNumbers[takenIndex], children });
  }

  return nodes;
}

async function resolveDestinationPageNumber(
  document: PdfDocumentProxy,
  dest: unknown,
): Promise<number | null> {
  try {
    const explicitDest =
      typeof dest === "string" ? await document.getDestination?.(dest) : dest;
    if (!Array.isArray(explicitDest) || explicitDest.length === 0) return null;

    const pageRef = explicitDest[0];
    if (pageRef === null || pageRef === undefined) return null;
    if (!document.getPageIndex) return null;

    const pageIndex = await document.getPageIndex(pageRef);
    if (typeof pageIndex !== "number" || Number.isNaN(pageIndex)) return null;

    return pageIndex + 1;
  } catch {
    return null;
  }
}
