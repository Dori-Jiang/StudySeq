import { PointerEvent as ReactPointerEvent, ReactNode, useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const DRAG_START_THRESHOLD = 6;

export function AppFrame({ children }: { children: ReactNode }) {
  const appWindow = getCurrentWindow();
  const pendingDragRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const pendingDrag = pendingDragRef.current;
      if (!pendingDrag) return;

      const deltaX = event.clientX - pendingDrag.x;
      const deltaY = event.clientY - pendingDrag.y;
      const distance = Math.hypot(deltaX, deltaY);
      if (distance < DRAG_START_THRESHOLD) return;

      pendingDragRef.current = null;
      void appWindow.startDragging();
    }

    function clearPendingDrag() {
      pendingDragRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", clearPendingDrag);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", clearPendingDrag);
    };
  }, [appWindow]);

  function handlePotentialDragStart(event: ReactPointerEvent<HTMLDivElement>) {
    pendingDragRef.current = { x: event.clientX, y: event.clientY };
  }

  function handleToggleMaximize() {
    pendingDragRef.current = null;
    void appWindow.toggleMaximize();
  }

  return (
    <div className="app-frame">
      <header className="app-chrome" aria-label="窗口栏">
        <div
          aria-label="窗口拖拽区域"
          className="app-drag-region"
          role="presentation"
          onDoubleClick={handleToggleMaximize}
          onPointerDown={handlePotentialDragStart}
        />
        <div className="window-controls" aria-label="窗口控制">
          <button type="button" aria-label="最小化窗口" onClick={() => void appWindow.minimize()}>
            <span aria-hidden="true">−</span>
          </button>
          <button
            type="button"
            aria-label="最大化或还原窗口"
            onClick={() => void appWindow.toggleMaximize()}
          >
            <span aria-hidden="true">□</span>
          </button>
          <button type="button" aria-label="关闭窗口" onClick={() => void appWindow.close()}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}
