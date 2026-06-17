import { createRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  HandwritingNoteEditor,
  type HandwritingNoteEditorHandle,
} from "./HandwritingNoteEditor";
import * as learningContentApi from "../../shared/api/learningContentApi";
import type { HandwritingNote } from "../../shared/types";

vi.mock("../../shared/api/learningContentApi");

const createHandwritingNote = vi.mocked(learningContentApi.createHandwritingNote);
const getHandwritingNote = vi.mocked(learningContentApi.getHandwritingNote);
const updateHandwritingNote = vi.mocked(learningContentApi.updateHandwritingNote);

const savedNote: HandwritingNote = {
  id: "hand-1",
  learningContentId: "study-1",
  title: "手写草稿",
  strokeDataJson: '{"schemaVersion":1,"coordinateSpace":"normalized","strokes":[]}',
  strokeSchemaVersion: 1,
  canvasWidth: 1024,
  canvasHeight: 720,
  createdAt: "2026-06-16T00:00:00Z",
  updatedAt: "2026-06-16T00:00:00Z",
};

describe("HandwritingNoteEditor", () => {
  beforeEach(() => {
    createHandwritingNote.mockReset();
    getHandwritingNote.mockReset();
    updateHandwritingNote.mockReset();
    vi.useRealTimers();
  });

  it("creates a handwriting note without clearing the editor", async () => {
    createHandwritingNote.mockResolvedValueOnce(savedNote);
    const onSaved = vi.fn();
    render(
      <HandwritingNoteEditor
        learningContentId="study-1"
        selectedSummary={null}
        onSaved={onSaved}
      />,
    );

    await userEvent.type(screen.getByLabelText("手写笔记标题"), "手写草稿");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(createHandwritingNote).toHaveBeenCalledWith({
        learningContentId: "study-1",
        title: "手写草稿",
        strokeDataJson: '{"schemaVersion":1,"coordinateSpace":"normalized","strokes":[]}',
        canvasWidth: 1024,
        canvasHeight: 720,
      });
    });
    expect(onSaved).toHaveBeenCalledWith(savedNote);
    expect(screen.getByLabelText("手写笔记标题")).toHaveValue("手写草稿");
  });

  it("keeps dirty state and offers retry after save failure", async () => {
    createHandwritingNote
      .mockRejectedValueOnce({ message: "保存失败" })
      .mockResolvedValueOnce(savedNote);
    render(
      <HandwritingNoteEditor
        learningContentId="study-1"
        selectedSummary={null}
        onSaved={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByLabelText("手写笔记标题"), "手写草稿");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("操作失败，请稍后重试");
    expect(screen.getByLabelText("手写笔记标题")).toHaveValue("手写草稿");

    await userEvent.click(screen.getByRole("button", { name: "重试" }));

    await waitFor(() => expect(createHandwritingNote).toHaveBeenCalledTimes(2));
  });

  it("loads an existing handwriting note before editing", async () => {
    getHandwritingNote.mockResolvedValueOnce(savedNote);
    updateHandwritingNote.mockResolvedValueOnce({ ...savedNote, title: "更新标题" });
    render(
      <HandwritingNoteEditor
        learningContentId="study-1"
        selectedSummary={savedNote}
        onSaved={vi.fn()}
      />,
    );

    expect(await screen.findByDisplayValue("手写草稿")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("手写笔记标题"), {
      target: { value: "更新标题" },
    });
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(updateHandwritingNote).toHaveBeenCalledWith({
        learningContentId: "study-1",
        noteId: "hand-1",
        title: "更新标题",
        strokeDataJson: savedNote.strokeDataJson,
        canvasWidth: 1024,
        canvasHeight: 720,
      });
    });
  });

  it("does not overwrite an existing handwriting note when loading fails", async () => {
    getHandwritingNote.mockRejectedValueOnce({
      code: "invalid_handwriting_data",
      message: "笔记数据损坏，无法打开",
    });
    const editorRef = createRef<HandwritingNoteEditorHandle>();
    render(
      <HandwritingNoteEditor
        ref={editorRef}
        learningContentId="study-1"
        selectedSummary={savedNote}
        onSaved={vi.fn()}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("笔记数据损坏，无法打开");
    expect(screen.getByLabelText("手写笔记标题")).toBeDisabled();
    const flushed = await editorRef.current?.flushPendingChanges();

    expect(flushed).toBe(false);
    expect(updateHandwritingNote).not.toHaveBeenCalled();
    expect(createHandwritingNote).not.toHaveBeenCalled();
  });

  it("reuses an in-flight save when flushing before leave", async () => {
    vi.useFakeTimers();
    let resolveSave: (note: HandwritingNote) => void = () => {};
    createHandwritingNote.mockImplementationOnce(
      () =>
        new Promise<HandwritingNote>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const editorRef = createRef<HandwritingNoteEditorHandle>();
    const onSaved = vi.fn();
    render(
      <HandwritingNoteEditor
        ref={editorRef}
        learningContentId="study-1"
        selectedSummary={null}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(screen.getByLabelText("手写笔记标题"), {
      target: { value: "手写草稿" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(createHandwritingNote).toHaveBeenCalledTimes(1);

    const flushPromise = editorRef.current?.flushPendingChanges();
    await act(async () => {
      resolveSave(savedNote);
      await flushPromise;
    });

    expect(createHandwritingNote).toHaveBeenCalledTimes(1);
    await expect(flushPromise).resolves.toBe(true);
  });

  it("updates the saved draft id when a create resolves after more edits", async () => {
    vi.useFakeTimers();
    let resolveCreate: (note: HandwritingNote) => void = () => {};
    createHandwritingNote.mockImplementationOnce(
      () =>
        new Promise<HandwritingNote>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    updateHandwritingNote.mockResolvedValueOnce({
      ...savedNote,
      title: "手写草稿第二版",
    });
    const editorRef = createRef<HandwritingNoteEditorHandle>();
    const onSaved = vi.fn();
    render(
      <HandwritingNoteEditor
        ref={editorRef}
        learningContentId="study-1"
        selectedSummary={null}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(screen.getByLabelText("手写笔记标题"), {
      target: { value: "手写草稿" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    fireEvent.change(screen.getByLabelText("手写笔记标题"), {
      target: { value: "手写草稿第二版" },
    });

    await act(async () => {
      resolveCreate(savedNote);
      await Promise.resolve();
    });
    expect(onSaved).not.toHaveBeenCalled();
    const flushed = await editorRef.current?.flushPendingChanges();

    expect(createHandwritingNote).toHaveBeenCalledTimes(1);
    expect(updateHandwritingNote).toHaveBeenCalledWith({
      learningContentId: "study-1",
      noteId: "hand-1",
      title: "手写草稿第二版",
      strokeDataJson: savedNote.strokeDataJson,
      canvasWidth: 1024,
      canvasHeight: 720,
    });
    expect(flushed).toBe(true);
    expect(onSaved).toHaveBeenCalledWith({
      ...savedNote,
      title: "手写草稿第二版",
    });
  });
});
