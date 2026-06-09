import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppFrame } from "./AppFrame";

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(),
}));

import { getCurrentWindow } from "@tauri-apps/api/window";

const windowControls = {
  close: vi.fn(),
  minimize: vi.fn(),
  startDragging: vi.fn(),
  toggleMaximize: vi.fn(),
};

describe("AppFrame", () => {
  beforeEach(() => {
    vi.mocked(getCurrentWindow).mockReturnValue(windowControls as unknown as ReturnType<typeof getCurrentWindow>);
    windowControls.close.mockReset();
    windowControls.minimize.mockReset();
    windowControls.startDragging.mockReset();
    windowControls.toggleMaximize.mockReset();
  });

  it("renders a frameless top bar without showing the app title", () => {
    renderFrame();

    expect(screen.getByLabelText("窗口拖拽区域")).toBeInTheDocument();
    expect(screen.queryByText("StudySeq")).not.toBeInTheDocument();
  });

  it("calls Tauri window controls from the custom chrome", async () => {
    renderFrame();

    expect(screen.getByRole("button", { name: "最小化窗口" })).toHaveTextContent("−");
    expect(screen.getByRole("button", { name: "最大化或还原窗口" })).toHaveTextContent("□");
    expect(screen.getByRole("button", { name: "关闭窗口" })).toHaveTextContent("×");

    await userEvent.click(screen.getByRole("button", { name: "最小化窗口" }));
    await userEvent.click(screen.getByRole("button", { name: "最大化或还原窗口" }));
    await userEvent.click(screen.getByRole("button", { name: "关闭窗口" }));

    expect(windowControls.minimize).toHaveBeenCalled();
    expect(windowControls.toggleMaximize).toHaveBeenCalled();
    expect(windowControls.close).toHaveBeenCalled();
  });

  it("starts dragging only after pointer movement on the top drag region", () => {
    renderFrame();
    const dragRegion = screen.getByLabelText("窗口拖拽区域");

    fireEvent.pointerDown(dragRegion, { clientX: 20, clientY: 12, pointerId: 1 });

    expect(windowControls.startDragging).not.toHaveBeenCalled();

    fireEvent.pointerMove(window, { clientX: 34, clientY: 12, pointerId: 1 });

    expect(windowControls.startDragging).toHaveBeenCalled();
  });

  it("toggles maximize when double-clicking the top drag region", async () => {
    renderFrame();

    await userEvent.dblClick(screen.getByLabelText("窗口拖拽区域"));

    expect(windowControls.toggleMaximize).toHaveBeenCalled();
  });
});

function renderFrame() {
  render(
    <MemoryRouter>
      <AppFrame>
        <main>页面内容</main>
      </AppFrame>
    </MemoryRouter>,
  );
}
