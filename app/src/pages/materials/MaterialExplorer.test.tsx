import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { MaterialExplorer } from "./MaterialExplorer";
import type { MaterialItem, MaterialKind } from "../../shared/types";

function buildItem(
  id: string,
  parentId: string | null,
  kind: MaterialKind,
  name: string,
  mimeType: string | null = null,
): MaterialItem {
  return {
    id,
    learningContentId: "study-1",
    parentId,
    kind,
    name,
    storedPath: kind === "file" ? `C:/Users/123/AppData/StudySeqData/materials/${id}` : null,
    mimeType,
    sizeBytes: kind === "file" ? 1024 : 0,
    createdAt: "2026-06-15T00:00:00Z",
    updatedAt: "2026-06-15T00:00:00Z",
  };
}

const folder = buildItem("folder-1", null, "folder", "第一章");
const nestedFolder = buildItem("folder-2", "folder-1", "folder", "第二节");
const rootFile = buildItem("mat-root", null, "file", "根资料.txt", "text/plain");
const nestedPdf = buildItem("mat-pdf", "folder-1", "file", "递归资料.PDF", "application/pdf");
const deepPptx = buildItem(
  "mat-pptx",
  "folder-2",
  "file",
  "C++ 入门(第1版).pptx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
);

function renderExplorer(overrides: Partial<ComponentProps<typeof MaterialExplorer>> = {}) {
  const props = {
    materials: [folder, nestedFolder, rootFile, nestedPdf, deepPptx],
    currentFolderId: null,
    pendingDeletedMaterialIds: [],
    onCurrentFolderChange: vi.fn(),
    onCreateFolder: vi.fn(),
    onImport: vi.fn(),
    onMove: vi.fn(),
    onOpenFile: vi.fn(),
    onRename: vi.fn(),
    onStageDelete: vi.fn(),
    ...overrides,
  };
  render(<MaterialExplorer {...props} />);
  return props;
}

describe("MaterialExplorer V1.7 search scope", () => {
  it("当前文件夹模式只搜索当前层，不匹配下级资料", async () => {
    renderExplorer();

    expect(screen.getByText("第一章")).toBeInTheDocument();
    expect(screen.getByText("根资料.txt")).toBeInTheDocument();
    expect(screen.queryByText("递归资料.PDF")).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("搜索资料"), "递归");

    expect(screen.getByText("当前文件夹没有匹配资料")).toBeInTheDocument();
    expect(screen.queryByText("递归资料.PDF")).not.toBeInTheDocument();
  });

  it("当前学习内容模式递归搜索名称和扩展名，并只展示逻辑路径", async () => {
    renderExplorer();

    await userEvent.click(screen.getByRole("button", { name: "当前学习内容" }));
    expect(screen.getByText("输入关键词搜索当前学习内容中的资料")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("搜索资料"), ".pptx");

    const result = await screen.findByRole("button", { name: "打开资料：C++ 入门(第1版).pptx" });
    expect(result).toBeInTheDocument();
    expect(screen.getByText("PPTX")).toBeInTheDocument();
    expect(screen.getByText("根目录 / 第一章 / 第二节")).toBeInTheDocument();
    expect(screen.queryByText(/AppData/)).not.toBeInTheDocument();
    expect(screen.queryByText(/StudySeqData/)).not.toBeInTheDocument();
  });

  it("当前学习内容模式应用类型筛选并显示空结果文案", async () => {
    renderExplorer();

    await userEvent.click(screen.getByRole("button", { name: "当前学习内容" }));
    await userEvent.selectOptions(screen.getByLabelText("筛选资料类型"), "pdf");
    await userEvent.type(screen.getByLabelText("搜索资料"), "入门");

    expect(screen.getByText("当前学习内容没有匹配资料")).toBeInTheDocument();
    expect(screen.queryByText("C++ 入门(第1版).pptx")).not.toBeInTheDocument();
  });

  it("点击文件结果先切换父文件夹再打开资料", async () => {
    const onCurrentFolderChange = vi.fn();
    const onOpenFile = vi.fn();
    renderExplorer({ onCurrentFolderChange, onOpenFile });

    await userEvent.click(screen.getByRole("button", { name: "当前学习内容" }));
    await userEvent.type(screen.getByLabelText("搜索资料"), "递归");
    await userEvent.click(await screen.findByRole("button", { name: "打开资料：递归资料.PDF" }));

    expect(onCurrentFolderChange).toHaveBeenCalledWith("folder-1");
    expect(onOpenFile).toHaveBeenCalledWith(expect.objectContaining({ id: "mat-pdf" }));
  });

  it("点击文件夹结果进入文件夹并清空搜索", async () => {
    const onCurrentFolderChange = vi.fn();
    const onOpenFile = vi.fn();
    renderExplorer({ onCurrentFolderChange, onOpenFile });

    await userEvent.click(screen.getByRole("button", { name: "当前学习内容" }));
    await userEvent.type(screen.getByLabelText("搜索资料"), "第二节");
    const resultList = await screen.findByRole("list", { name: "当前学习内容搜索结果" });
    await userEvent.click(within(resultList).getByRole("button", { name: "打开文件夹：第二节" }));

    expect(onCurrentFolderChange).toHaveBeenCalledWith("folder-2");
    expect(onOpenFile).not.toHaveBeenCalled();
    expect(screen.getByLabelText("搜索资料")).toHaveValue("");
    expect(screen.getByRole("button", { name: "当前文件夹" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("待删除子树不会出现在当前学习内容搜索结果中", async () => {
    renderExplorer({ pendingDeletedMaterialIds: ["folder-1"] });

    await userEvent.click(screen.getByRole("button", { name: "当前学习内容" }));
    await userEvent.type(screen.getByLabelText("搜索资料"), "资料");

    expect(screen.getByText("根资料.txt")).toBeInTheDocument();
    expect(screen.queryByText("递归资料.PDF")).not.toBeInTheDocument();
  });
});
