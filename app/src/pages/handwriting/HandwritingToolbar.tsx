import type { HandwritingTool } from "../../shared/types";
import type { HandwritingToolState } from "./handwritingModel";

const COLORS = ["#1f2937", "#2563eb", "#dc2626", "#16a34a"];

type HandwritingToolbarProps = {
  canRedo: boolean;
  canUndo: boolean;
  isDisabled: boolean;
  isSaving: boolean;
  toolState: HandwritingToolState;
  onClear: () => void;
  onRedo: () => void;
  onSave: () => void;
  onToolChange: (toolState: HandwritingToolState) => void;
  onUndo: () => void;
};

export function HandwritingToolbar({
  canRedo,
  canUndo,
  isDisabled,
  isSaving,
  onClear,
  onRedo,
  onSave,
  onToolChange,
  onUndo,
  toolState,
}: HandwritingToolbarProps) {
  function setTool(tool: HandwritingTool) {
    onToolChange({ ...toolState, tool });
  }

  return (
    <div className="handwriting-toolbar" aria-label="手写工具栏">
      <div className="segmented-control" aria-label="手写工具">
        <button
          type="button"
          className={toolState.tool === "pen" ? "active" : ""}
          disabled={isDisabled}
          onClick={() => setTool("pen")}
        >
          笔
        </button>
        <button
          type="button"
          className={toolState.tool === "eraser" ? "active" : ""}
          disabled={isDisabled}
          onClick={() => setTool("eraser")}
        >
          橡皮
        </button>
      </div>

      <div className="handwriting-swatches" aria-label="笔迹颜色">
        {COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`颜色 ${color}`}
            className={toolState.color === color ? "active" : ""}
            disabled={isDisabled}
            style={{ backgroundColor: color }}
            onClick={() => onToolChange({ ...toolState, color })}
          />
        ))}
      </div>

      <label className="handwriting-width-control">
        粗细
        <input
          aria-label="笔迹粗细"
          type="range"
          min="0.003"
          max="0.02"
          step="0.001"
          value={toolState.width}
          disabled={isDisabled}
          onChange={(event) =>
            onToolChange({ ...toolState, width: Number(event.currentTarget.value) })
          }
        />
      </label>

      <div className="handwriting-toolbar-actions">
        <button type="button" onClick={onUndo} disabled={isDisabled || !canUndo}>
          撤销
        </button>
        <button type="button" onClick={onRedo} disabled={isDisabled || !canRedo}>
          重做
        </button>
        <button type="button" onClick={onClear} disabled={isDisabled}>
          清空
        </button>
        <button type="button" onClick={onSave} disabled={isDisabled || isSaving}>
          保存
        </button>
      </div>
    </div>
  );
}
