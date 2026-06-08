import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HomePage } from "./HomePage";
import * as learningContentApi from "../shared/api/learningContentApi";

vi.mock("../shared/api/learningContentApi");

const listLearningContents = vi.mocked(learningContentApi.listLearningContents);
const createLearningContent = vi.mocked(learningContentApi.createLearningContent);
const deleteLearningContent = vi.mocked(learningContentApi.deleteLearningContent);

describe("HomePage", () => {
  beforeEach(() => {
    listLearningContents.mockReset();
    createLearningContent.mockReset();
    deleteLearningContent.mockReset();
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
      },
    ]);

    renderHomePage();

    expect(await screen.findByText("Rust 入门")).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();
    expect(screen.getByText("2026-07-01")).toBeInTheDocument();
  });

  it("keeps the home list focused on status, progress, and deadline only", async () => {
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
      },
    ]);

    renderHomePage();

    expect(await screen.findByText("Rust 入门")).toBeInTheDocument();
    expect(screen.getByText(/进行中/)).toBeInTheDocument();
    expect(screen.getByText("45%")).toBeInTheDocument();
    expect(screen.getByText("2026-07-01")).toBeInTheDocument();
    expect(screen.queryByText(/小时/)).not.toBeInTheDocument();
    expect(screen.queryByText(/资料/)).not.toBeInTheDocument();
    expect(screen.queryByText(/笔记/)).not.toBeInTheDocument();
    expect(screen.queryByText(/最近学习/)).not.toBeInTheDocument();
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
      },
    ]);

    renderHomePage();
    await screen.findByText("Rust 入门");

    expect(screen.getByRole("link", { name: /打开 Rust 入门/ })).toHaveAttribute(
      "href",
      "/studies/study-1",
    );
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

  it("asks for confirmation before deleting a learning content", async () => {
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
      },
    ]);
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    deleteLearningContent.mockResolvedValueOnce();

    renderHomePage();
    await screen.findByText("Rust 入门");
    await userEvent.click(screen.getByRole("button", { name: "删除 Rust 入门" }));

    await waitFor(() => {
      expect(deleteLearningContent).toHaveBeenCalledWith("study-1");
    });
    expect(screen.queryByText("Rust 入门")).not.toBeInTheDocument();
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
