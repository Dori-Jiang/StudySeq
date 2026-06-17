import { PointerEvent, useEffect, useRef } from "react";

import type { HandwritingData, HandwritingPoint, HandwritingStroke } from "../../shared/types";
import {
  createStroke,
  type HandwritingToolState,
  pointerToNormalizedPoint,
} from "./handwritingModel";

type HandwritingCanvasProps = {
  data: HandwritingData;
  isDisabled?: boolean;
  toolState: HandwritingToolState;
  onStrokeComplete: (stroke: HandwritingStroke) => void;
};

export function HandwritingCanvas({
  data,
  isDisabled = false,
  toolState,
  onStrokeComplete,
}: HandwritingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointsRef = useRef<HandwritingPoint[]>([]);
  const pointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const redraw = () => {
      resizeCanvasForDpr(canvas);
      renderHandwriting(canvas, data);
    };
    redraw();

    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [data]);

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || isDisabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    pointerIdRef.current = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    pointsRef.current = [
      pointerToNormalizedPoint(
        event.clientX,
        event.clientY,
        canvas.getBoundingClientRect(),
        event.timeStamp,
      ),
    ];
    renderHandwriting(canvas, data, createStroke(toolState, pointsRef.current));
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || isDisabled || pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    pointsRef.current = [
      ...pointsRef.current,
      pointerToNormalizedPoint(
        event.clientX,
        event.clientY,
        canvas.getBoundingClientRect(),
        event.timeStamp,
      ),
    ];
    renderHandwriting(canvas, data, createStroke(toolState, pointsRef.current));
  }

  function finishStroke(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || isDisabled || pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    const stroke = createStroke(toolState, pointsRef.current);
    pointerIdRef.current = null;
    pointsRef.current = [];
    canvas.releasePointerCapture(event.pointerId);
    onStrokeComplete(stroke);
  }

  return (
    <canvas
      ref={canvasRef}
      aria-label="手写画布"
      className="handwriting-canvas"
      aria-disabled={isDisabled}
      onPointerCancel={finishStroke}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishStroke}
    />
  );
}

function resizeCanvasForDpr(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function renderHandwriting(
  canvas: HTMLCanvasElement,
  data: HandwritingData,
  activeStroke?: HandwritingStroke,
) {
  const context = canvas.getContext("2d");
  if (!context) return;

  context.clearRect(0, 0, canvas.width, canvas.height);
  for (const stroke of activeStroke ? [...data.strokes, activeStroke] : data.strokes) {
    drawStroke(context, canvas, stroke);
  }
}

function drawStroke(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  stroke: HandwritingStroke,
) {
  if (stroke.points.length === 0) return;
  context.save();
  context.globalCompositeOperation =
    stroke.tool === "eraser" ? "destination-out" : "source-over";
  context.strokeStyle = stroke.color;
  context.lineWidth = Math.max(1, stroke.width * Math.min(canvas.width, canvas.height));
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();

  const [firstPoint, ...remainingPoints] = stroke.points;
  context.moveTo(firstPoint.x * canvas.width, firstPoint.y * canvas.height);
  for (const point of remainingPoints) {
    context.lineTo(point.x * canvas.width, point.y * canvas.height);
  }
  if (remainingPoints.length === 0) {
    context.lineTo(firstPoint.x * canvas.width + 0.01, firstPoint.y * canvas.height + 0.01);
  }
  context.stroke();
  context.restore();
}
