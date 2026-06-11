import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PdfOutlinePanel } from "./PdfOutlinePanel";
import type { PdfOutlineNode } from "./pdfOutline";

afterEach(cleanup);

function node(
  id: string,
  title: string,
  pageNumber: number | null,
  children: PdfOutlineNode[] = [],
): PdfOutlineNode {
  return { id, title, pageNumber, children };
}

describe("PdfOutlinePanel", () => {
  it("空目录时显示空状态文案", () => {
    render(<PdfOutlinePanel nodes={[]} onJump={vi.fn()} />);

    expect(screen.getByText("该 PDF 没有目录")).toBeInTheDocument();
  });

  it("渲染多级目录层级", () => {
    const nodes = [
      node("o-0", "第一章", 1, [node("o-0-0", "第一节", 3)]),
      node("o-1", "第二章", 6),
    ];

    render(<PdfOutlinePanel nodes={nodes} onJump={vi.fn()} />);

    expect(screen.getByText("第一章")).toBeInTheDocument();
    expect(screen.getByText("第一节")).toBeInTheDocument();
    expect(screen.getByText("第二章")).toBeInTheDocument();
    const childEntry = screen.getByText("第一节").closest("li");
    expect(childEntry?.parentElement?.tagName).toBe("UL");
  });

  it("点击条目触发跳转回调", async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    render(<PdfOutlinePanel nodes={[node("o-0", "第一章", 5)]} onJump={onJump} />);

    await user.click(screen.getByRole("button", { name: "第一章" }));

    expect(onJump).toHaveBeenCalledWith(5);
  });

  it("页码为 null 的条目禁用且点击不触发跳转", async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    render(<PdfOutlinePanel nodes={[node("o-0", "坏目标", null)]} onJump={onJump} />);

    const entry = screen.getByRole("button", { name: "坏目标" });
    expect(entry).toBeDisabled();
    await user.click(entry).catch(() => undefined);
    expect(onJump).not.toHaveBeenCalled();
  });
});
