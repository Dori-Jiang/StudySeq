import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StudyDetailPage } from "./StudyDetailPage";
import * as learningContentApi from "../shared/api/learningContentApi";
import * as dialog from "@tauri-apps/plugin-dialog";

vi.mock("../shared/api/learningContentApi");
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

const getLearningDetail = vi.mocked(learningContentApi.getLearningDetail);
const importMaterialFile = vi.mocked(learningContentApi.importMaterialFile);
const createNote = vi.mocked(learningContentApi.createNote);
const previewMaterialFile = vi.mocked(learningContentApi.previewMaterialFile);
const open = vi.mocked(dialog.open);

const baseDetail = {
  learningContent: {
    id: "study-1",
    name: "Rust 入门",
    status: "planned" as const,
    deadline: null,
    estimatedHours: 10,
    progress: 20,
    createdAt: "2026-06-08T00:00:00Z",
    updatedAt: "2026-06-08T00:00:00Z",
    lastOpenedAt: null,
  },
  materials: [
    {
      id: "mat-1",
      learningContentId: "study-1",
      name: "资料.txt",
      originalPath: "C:/source/资料.txt",
      storedPath: "C:/app/资料.txt",
      mimeType: "text/plain",
      sizeBytes: 5,
      createdAt: "2026-06-08T00:00:00Z",
      updatedAt: "2026-06-08T00:00:00Z",
    },
  ],
  notes: [
    {
      id: "note-1",
      learningContentId: "study-1",
      title: "第一条笔记",
      body: "纯文本正文",
      createdAt: "2026-06-08T00:00:00Z",
      updatedAt: "2026-06-08T00:00:00Z",
    },
  ],
};

describe("StudyDetailPage", () => {
  beforeEach(() => {
    getLearningDetail.mockReset();
    importMaterialFile.mockReset();
    createNote.mockReset();
    previewMaterialFile.mockReset();
    open.mockReset();
  });

  it("renders learning detail with materials and plain-text notes", async () => {
    getLearningDetail.mockResolvedValueOnce(baseDetail);

    renderDetailPage();

    expect(await screen.findByText("Rust 入门")).toBeInTheDocument();
    expect(screen.getByText("资料.txt")).toBeInTheDocument();
    expect(screen.getByText("第一条笔记")).toBeInTheDocument();
    expect(screen.getByText("纯文本正文")).toBeInTheDocument();
  });

  it("imports a root material file and appends it to the list", async () => {
    getLearningDetail.mockResolvedValueOnce({ ...baseDetail, materials: [] });
    open.mockResolvedValueOnce("C:/source/资料.txt");
    importMaterialFile.mockResolvedValueOnce(baseDetail.materials[0]);

    renderDetailPage();
    await screen.findByText("还没有资料");

    await userEvent.click(screen.getByRole("button", { name: "导入资料" }));

    await waitFor(() => {
      expect(importMaterialFile).toHaveBeenCalledWith({
        learningContentId: "study-1",
        sourcePath: "C:/source/资料.txt",
      });
    });
    expect(await screen.findByText("资料.txt")).toBeInTheDocument();
  });

  it("creates a plain-text note and appends it to the list", async () => {
    getLearningDetail.mockResolvedValueOnce({ ...baseDetail, notes: [] });
    createNote.mockResolvedValueOnce(baseDetail.notes[0]);

    renderDetailPage();
    await screen.findByText("还没有笔记");

    await userEvent.type(screen.getByLabelText("笔记标题"), "第一条笔记");
    await userEvent.type(screen.getByLabelText("笔记正文"), "纯文本正文");
    await userEvent.click(screen.getByRole("button", { name: "保存笔记" }));

    await waitFor(() => {
      expect(createNote).toHaveBeenCalledWith({
        learningContentId: "study-1",
        title: "第一条笔记",
        body: "纯文本正文",
      });
    });
    expect(await screen.findByText("第一条笔记")).toBeInTheDocument();
    expect(screen.getByText("纯文本正文")).toBeInTheDocument();
  });

  it("shows a lightweight material preview and links into the reader", async () => {
    getLearningDetail.mockResolvedValueOnce(baseDetail);
    previewMaterialFile.mockResolvedValueOnce({
      materialId: "mat-1",
      kind: "text",
      mimeType: "text/plain",
      text: "资料正文",
      dataUrl: null,
      encoding: "utf-8",
    });

    renderDetailPage();
    await screen.findByText("资料.txt");

    await userEvent.click(screen.getByRole("button", { name: "预览 资料.txt" }));

    await waitFor(() => {
      expect(previewMaterialFile).toHaveBeenCalledWith("mat-1");
    });
    expect(await screen.findByText("资料正文")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "进入阅读页" })).toHaveAttribute(
      "href",
      "/studies/study-1/read?materialId=mat-1",
    );
  });

  it("clears the lightweight preview when closing it", async () => {
    getLearningDetail.mockResolvedValueOnce(baseDetail);
    previewMaterialFile.mockResolvedValueOnce({
      materialId: "mat-1",
      kind: "text",
      mimeType: "text/plain",
      text: "资料正文",
      dataUrl: null,
      encoding: "utf-8",
    });

    renderDetailPage();
    await screen.findByText("资料.txt");

    await userEvent.click(screen.getByRole("button", { name: "预览 资料.txt" }));
    expect(await screen.findByText("资料正文")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "关闭预览" }));

    expect(screen.queryByLabelText("资料轻量预览")).not.toBeInTheDocument();
    expect(screen.queryByText("资料正文")).not.toBeInTheDocument();
  });

  it("lets the detail split pane ratio be resized by dragging the splitter", async () => {
    getLearningDetail.mockResolvedValueOnce(baseDetail);

    renderDetailPage();
    await screen.findByText("Rust 入门");

    const splitter = screen.getByRole("separator", { name: "调整资料和笔记分栏比例" });
    const grid = splitter.closest(".detail-grid") as HTMLDivElement;
    vi.spyOn(grid, "getBoundingClientRect").mockReturnValue({
      bottom: 600,
      height: 400,
      left: 0,
      right: 1000,
      top: 200,
      width: 1000,
      x: 0,
      y: 200,
      toJSON: () => undefined,
    });

    fireEvent.pointerDown(splitter, { clientX: 580, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 680, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    expect(grid.style.gridTemplateColumns).toBe("68fr 16px 32fr");
  });
});

function renderDetailPage() {
  render(
    <MemoryRouter initialEntries={["/studies/study-1"]}>
      <Routes>
        <Route path="/studies/:studyId" element={<StudyDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
