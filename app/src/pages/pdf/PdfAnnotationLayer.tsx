import type { HandwritingData, HandwritingStroke } from "../../shared/types";
import { HandwritingCanvas } from "../handwriting/HandwritingCanvas";
import type { HandwritingToolState } from "../handwriting/handwritingModel";

type PdfAnnotationLayerProps = {
  data: HandwritingData;
  isAnnotating: boolean;
  toolState: HandwritingToolState;
  onStrokeComplete: (stroke: HandwritingStroke) => void;
};

export function PdfAnnotationLayer({
  data,
  isAnnotating,
  onStrokeComplete,
  toolState,
}: PdfAnnotationLayerProps) {
  return (
    <div
      aria-hidden={!isAnnotating}
      className={`pdf-annotation-layer ${isAnnotating ? "is-active" : ""}`}
    >
      <HandwritingCanvas
        data={data}
        isDisabled={!isAnnotating}
        toolState={toolState}
        onStrokeComplete={onStrokeComplete}
      />
    </div>
  );
}
