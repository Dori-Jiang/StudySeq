import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HomePage } from "./HomePage";
import * as learningContentApi from "../shared/api/learningContentApi";

vi.mock("../shared/api/learningContentApi");

const listLearningContents = vi.mocked(learningContentApi.listLearningContents);
const createLearningContent = vi.mocked(learningContentApi.createLearningContent);
const deleteLearningContent = vi.mocked(learningContentApi.deleteLearningContent);
const updateLearningContent = vi.mocked(learningContentApi.updateLearningContent);
const chooseMaterialLibraryStorageRoot = vi.mocked(
  learningContentApi.chooseMaterialLibraryStorageRoot,
);
const getMaterialLibraryLocation = vi.mocked(learningContentApi.getMaterialLibraryLocation);
const setMaterialLibraryLocation = vi.mocked(learningContentApi.setMaterialLibraryLocation);

describe("HomePage", () => {
  beforeEach(() => {
    listLearningContents.mockReset();
    createLearningContent.mockReset();
    deleteLearningContent.mockReset();
    updateLearningContent.mockReset();
    chooseMaterialLibraryStorageRoot.mockReset();
    getMaterialLibraryLocation.mockReset();
    setMaterialLibraryLocation.mockReset();
    getMaterialLibraryLocation.mockResolvedValue({
      path: "C:/Users/123/AppData/Roaming/com.studyseq.desktop/materials",
      isDefault: true,
    });
    vi.restoreAllMocks();
  });

  it("renders learning contents loaded from SQLite through the API", async () => {
    listLearningContents.mockResolvedValueOnce([
      {
        id: "study-1",
        name: "Rust 入门",
        status: "planned",
        deadline: "2026-07-01",
        estimatedHours: 12,
        progress: 30,
        createdAt: "2026-06-08T00:00:00Z",
        updatedAt: "2026-06-08T00:00:00Z",
        lastOpenedAt: null,
        recentOpen: null,
      },
    ]);

    renderHomePage();

    expect(await screen.findByText("Rust 入门")).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Rust 入门 进度" })).toHaveAttribute(
      "aria-valuenow",
      "30",
    );
    expect(screen.getByText("2026-07-01")).toBeInTheDocument();
  });

  it("keeps the home list free of calendar and statistics modules", async () => {
    listLearningContents.mockResolvedValueOnce([
      {
        id: "study-1",
        name: "Rust 入门",
        status: "active",
        deadline: "2026-07-01",
        estimatedHours: 12,
        progress: 45,
        createdAt: "2026-06-08T00:00:00Z",
        updatedAt: "2026-06-08T00:00:00Z",
        lastOpenedAt: null,
        recentOpen: null,
      },
    ]);

    renderHomePage();

    expect(await screen.findByText("Rust 入门")).toBeInTheDocument();
    expect(screen.getByText(/进行中/)).toBeInTheDocument();
    expect(screen.getByText("45%")).toBeInTheDocument();
    expect(screen.getByText("2026-07-01")).toBeInTheDocument();
    expect(screen.getByText("暂无打开记录")).toBeInTheDocument();
    expect(screen.queryByText(/小时/)).not.toBeInTheDocument();
    expect(screen.queryByText(/笔记/)).not.toBeInTheDocument();
    expect(screen.queryByText(/日历/)).not.toBeInTheDocument();
    expect(screen.queryByText(/连续学习/)).not.toBeInTheDocument();
    expect(screen.queryByText(/学习时长/)).not.toBeInTheDocument();
  });

  it("renders recent PDF and video positions inside the study row", async () => {
    listLearningContents.mockResolvedValueOnce([
      {
        id: "study-1",
        name: "PDF 课程",
        status: "active",
        deadline: null,
        estimatedHours: 12,
        progress: 45,
        createdAt: "2026-06-08T00:00:00Z",
        updatedAt: "2026-06-08T00:00:00Z",
        lastOpenedAt: null,
        recentOpen: {
          materialId: "mat-pdf",
          materialName: "很长很长的课程讲义.pdf",
          openedAt: "2026-06-14T10:35:00Z",
          position: { kind: "pdf_page", pageNumber: 14 },
        },
      },
      {
        id: "study-2",
        name: "视频课程",
        status: "active",
        deadline: null,
        estimatedHours: 6,
        progress: 20,
        createdAt: "2026-06-08T00:00:00Z",
        updatedAt: "2026-06-08T00:00:00Z",
        lastOpenedAt: null,
        recentOpen: {
          materialId: "mat-video",
          materialName: "课程视频 03.mp4",
          openedAt: "2026-06-14T11:00:00Z",
          position: { kind: "video_second", seconds: 1458 },
        },
      },
    ]);

    renderHomePage();

    expect(await screen.findByText("PDF 课程")).toBeInTheDocument();
    expect(screen.getByText("很长很长的课程讲义.pdf")).toHaveClass(
      "study-recent-open-file",
    );
    expect(screen.getByText("第 14 页")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "打开 PDF 课程" })).toHaveAttribute(
      "aria-describedby",
      "study-recent-open-study-1",
    );
    expect(screen.getByText("很长很长的课程讲义.pdf").closest("p")).toHaveAttribute(
      "id",
      "study-recent-open-study-1",
    );
    expect(screen.getByText("课程视频 03.mp4")).toBeInTheDocument();
    expect(screen.getByText("24:18")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "继续 PDF 课程" })).toHaveAttribute(
      "href",
      "/studies/study-1?continue=1&materialId=mat-pdf",
    );
    expect(screen.getByRole("link", { name: "继续 视频课程" })).toHaveAttribute(
      "href",
      "/studies/study-2?continue=1&materialId=mat-video",
    );
  });

  it("makes the whole learning content row navigate to detail", async () => {
    listLearningContents.mockResolvedValueOnce([
      {
        id: "study-1",
        name: "Rust 入门",
        status: "planned",
        deadline: null,
        estimatedHours: 12,
        progress: 30,
        createdAt: "2026-06-08T00:00:00Z",
        updatedAt: "2026-06-08T00:00:00Z",
        lastOpenedAt: null,
        recentOpen: null,
      },
    ]);

    renderHomePage();
    await screen.findByText("Rust 入门");

    expect(screen.getByRole("link", { name: /打开 Rust 入门/ })).toHaveAttribute(
      "href",
      "/studies/study-1",
    );
    expect(screen.queryByRole("link", { name: "继续 Rust 入门" })).not.toBeInTheDocument();
  });

  it("creates a learning content and shows it in the home list", async () => {
    listLearningContents.mockResolvedValueOnce([]);
    createLearningContent.mockResolvedValueOnce({
      id: "study-2",
      name: "TypeScript 练习",
      status: "planned",
      deadline: null,
      estimatedHours: 6,
      progress: 0,
      createdAt: "2026-06-08T00:00:00Z",
      updatedAt: "2026-06-08T00:00:00Z",
      lastOpenedAt: null,
      recentOpen: null,
    });

    renderHomePage();
    await screen.findByText("还没有学习内容");

    await userEvent.type(screen.getByLabelText("学习内容名称"), "TypeScript 练习");
    await userEvent.clear(screen.getByLabelText("预计工时"));
    await userEvent.type(screen.getByLabelText("预计工时"), "6");
    await userEvent.click(screen.getByRole("button", { name: "新建" }));

    await waitFor(() => {
      expect(createLearningContent).toHaveBeenCalledWith({
        name: "TypeScript 练习",
        estimatedHours: 6,
        progress: 0,
      });
    });
    expect(await screen.findByText("TypeScript 练习")).toBeInTheDocument();
  });

  it("chooses a material library location from the home page", async () => {
    listLearningContents.mockResolvedValueOnce([]);
    chooseMaterialLibraryStorageRoot.mockResolvedValueOnce("D:/LearningData");
    setMaterialLibraryLocation.mockResolvedValueOnce({
      path: "D:/LearningData/StudySeqData/materials",
      isDefault: false,
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderHomePage();
    expect(await screen.findByText(/当前 C:\/Users\/123/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "选择资料库位置" }));

    expect(chooseMaterialLibraryStorageRoot).toHaveBeenCalledWith();
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining("D:/LearningData/StudySeqData/materials"),
    );
    expect(setMaterialLibraryLocation).toHaveBeenCalledWith({
      path: "D:/LearningData/StudySeqData/materials",
    });
    expect(
      await screen.findByText("资料库位置已更新为 D:/LearningData/StudySeqData/materials"),
    ).toBeInTheDocument();
    expect(screen.getByText(/当前 D:\/LearningData\/StudySeqData\/materials/)).toBeInTheDocument();
  });

  it("does not migrate the material library when folder selection is cancelled", async () => {
    listLearningContents.mockResolvedValueOnce([]);
    chooseMaterialLibraryStorageRoot.mockResolvedValueOnce(null);

    renderHomePage();
    await screen.findByText(/当前 C:\/Users\/123/);
    await userEvent.click(screen.getByRole("button", { name: "选择资料库位置" }));

    expect(setMaterialLibraryLocation).not.toHaveBeenCalled();
  });

  it("moves the material library back to the default location from the home page", async () => {
    getMaterialLibraryLocation.mockResolvedValueOnce({
      path: "D:/LearningData/StudySeqData/materials",
      isDefault: false,
    });
    listLearningContents.mockResolvedValueOnce([]);
    setMaterialLibraryLocation.mockResolvedValueOnce({
      path: "C:/Users/123/AppData/Roaming/com.studyseq.desktop/materials",
      isDefault: true,
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderHomePage();
    await screen.findByText(/当前 D:\/LearningData/);

    await userEvent.click(screen.getByRole("button", { name: "迁回默认位置" }));

    expect(setMaterialLibraryLocation).toHaveBeenCalledWith({ path: "DEFAULT" });
    expect(
      await screen.findByText(
        "资料库位置已更新为 C:/Users/123/AppData/Roaming/com.studyseq.desktop/materials",
      ),
    ).toBeInTheDocument();
  });

  it("shows an in-app confirmation before deleting a learning content", async () => {
    listLearningContents.mockResolvedValueOnce([
      {
        id: "study-1",
        name: "Rust 入门",
        status: "planned",
        deadline: null,
        estimatedHours: 12,
        progress: 30,
        createdAt: "2026-06-08T00:00:00Z",
        updatedAt: "2026-06-08T00:00:00Z",
        lastOpenedAt: null,
        recentOpen: null,
      },
    ]);
    deleteLearningContent.mockResolvedValueOnce();

    renderHomePage();
    await screen.findByText("Rust 入门");
    await userEvent.click(screen.getByRole("button", { name: "删除 Rust 入门" }));

    const dialog = screen.getByRole("dialog", { name: "删除学习内容" });
    expect(dialog.closest(".modal-backdrop")?.parentElement).toBe(document.body);
    expect(
      within(dialog).getByText(
        "删除「Rust 入门」会同步删除该学习内容下的资料、笔记和阅读状态。只会删除 App 管理的资料副本，不会删除用户原始来源文件。",
      ),
    ).toBeInTheDocument();
    expect(deleteLearningContent).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "确认删除" }));

    await waitFor(() => {
      expect(deleteLearningContent).toHaveBeenCalledWith("study-1");
    });
    expect(screen.queryByRole("dialog", { name: "删除学习内容" })).not.toBeInTheDocument();
    expect(screen.queryByText("Rust 入门")).not.toBeInTheDocument();
  });

  it("keeps the learning content when deleting is cancelled", async () => {
    listLearningContents.mockResolvedValueOnce([
      {
        id: "study-1",
        name: "Rust 入门",
        status: "planned",
        deadline: null,
        estimatedHours: 12,
        progress: 30,
        createdAt: "2026-06-08T00:00:00Z",
        updatedAt: "2026-06-08T00:00:00Z",
        lastOpenedAt: null,
        recentOpen: null,
      },
    ]);

    renderHomePage();
    await screen.findByText("Rust 入门");
    await userEvent.click(screen.getByRole("button", { name: "删除 Rust 入门" }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "删除学习内容" })).getByRole("button", {
        name: "取消",
      }),
    );

    expect(deleteLearningContent).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "删除学习内容" })).not.toBeInTheDocument();
    expect(screen.getByText("Rust 入门")).toBeInTheDocument();
  });

  it("keeps the confirmation visible when deleting a learning content fails", async () => {
    listLearningContents.mockResolvedValueOnce([
      {
        id: "study-1",
        name: "Rust 入门",
        status: "planned",
        deadline: null,
        estimatedHours: 12,
        progress: 30,
        createdAt: "2026-06-08T00:00:00Z",
        updatedAt: "2026-06-08T00:00:00Z",
        lastOpenedAt: null,
        recentOpen: null,
      },
    ]);
    deleteLearningContent.mockRejectedValueOnce({
      code: "database_error",
      message: "数据库操作失败，请稍后重试",
    });

    renderHomePage();
    await screen.findByText("Rust 入门");
    await userEvent.click(screen.getByRole("button", { name: "删除 Rust 入门" }));
    const dialog = screen.getByRole("dialog", { name: "删除学习内容" });
    await userEvent.click(within(dialog).getByRole("button", { name: "确认删除" }));

    expect(
      await within(dialog).findByText("删除学习内容失败：数据库操作失败，请稍后重试"),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "删除学习内容" })).toBeInTheDocument();
    expect(screen.getByText("Rust 入门")).toBeInTheDocument();
  });

  it("does not expose raw runtime errors on delete failure", async () => {
    listLearningContents.mockResolvedValueOnce([
      {
        id: "study-1",
        name: "Rust 入门",
        status: "planned",
        deadline: null,
        estimatedHours: 12,
        progress: 30,
        createdAt: "2026-06-08T00:00:00Z",
        updatedAt: "2026-06-08T00:00:00Z",
        lastOpenedAt: null,
        recentOpen: null,
      },
    ]);
    deleteLearningContent.mockRejectedValueOnce(new Error("C:\\Users\\123\\secret.sqlite"));

    renderHomePage();
    await screen.findByText("Rust 入门");
    await userEvent.click(screen.getByRole("button", { name: "删除 Rust 入门" }));
    const dialog = screen.getByRole("dialog", { name: "删除学习内容" });
    await userEvent.click(within(dialog).getByRole("button", { name: "确认删除" }));

    expect(
      await within(dialog).findByText("删除学习内容失败：操作失败，请稍后重试"),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/C:\\Users/)).not.toBeInTheDocument();
  });

  it("edits learning content basic fields from the home row", async () => {
    listLearningContents.mockResolvedValueOnce([
      {
        id: "study-1",
        name: "Rust 入门",
        status: "planned",
        deadline: null,
        estimatedHours: 12,
        progress: 30,
        createdAt: "2026-06-08T00:00:00Z",
        updatedAt: "2026-06-08T00:00:00Z",
        lastOpenedAt: null,
        recentOpen: null,
      },
    ]);
    updateLearningContent.mockResolvedValueOnce({
      id: "study-1",
      name: "Rust 深入",
      status: "active",
      deadline: "2026-08-15",
      estimatedHours: 16,
      progress: 65,
      createdAt: "2026-06-08T00:00:00Z",
      updatedAt: "2026-06-08T00:01:00Z",
      lastOpenedAt: null,
      recentOpen: null,
    });

    renderHomePage();
    await screen.findByText("Rust 入门");

    await userEvent.click(screen.getByRole("button", { name: "编辑 Rust 入门" }));
    const editForm = screen.getByRole("button", { name: "保存学习内容" }).closest("form")!;
    await userEvent.clear(within(editForm).getByLabelText("学习名称"));
    await userEvent.type(within(editForm).getByLabelText("学习名称"), "Rust 深入");
    await userEvent.selectOptions(within(editForm).getByLabelText("状态"), "active");
    await userEvent.clear(within(editForm).getByLabelText("预计工时"));
    await userEvent.type(within(editForm).getByLabelText("预计工时"), "16");
    await userEvent.clear(within(editForm).getByLabelText("截止日期"));
    await userEvent.type(within(editForm).getByLabelText("截止日期"), "2026-08-15");
    await userEvent.clear(within(editForm).getByLabelText("进度百分比"));
    await userEvent.type(within(editForm).getByLabelText("进度百分比"), "65");
    await userEvent.click(within(editForm).getByRole("button", { name: "保存学习内容" }));

    await waitFor(() => {
      expect(updateLearningContent).toHaveBeenCalledWith({
        id: "study-1",
        name: "Rust 深入",
        status: "active",
        estimatedHours: 16,
        deadline: "2026-08-15",
        progress: 65,
      });
    });
    expect(screen.getByText("Rust 深入")).toBeInTheDocument();
    expect(screen.getByText("进行中")).toBeInTheDocument();
    expect(screen.getByText("65%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Rust 深入 进度" })).toHaveAttribute(
      "aria-valuenow",
      "65",
    );
  });
});

function renderHomePage() {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/studies/:studyId" element={<p>详情页</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
