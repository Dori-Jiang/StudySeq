import type {
  HandwritingData,
  HandwritingPoint,
  HandwritingStroke,
  HandwritingTool,
} from "../../shared/types";

export const EMPTY_HANDWRITING_DATA: HandwritingData = {
  schemaVersion: 1,
  coordinateSpace: "normalized",
  strokes: [],
};

export type HandwritingToolState = {
  tool: HandwritingTool;
  color: string;
  width: number;
};

export type HandwritingHistory = {
  present: HandwritingData;
  past: HandwritingData[];
  future: HandwritingData[];
};

export const DEFAULT_HANDWRITING_TOOL: HandwritingToolState = {
  tool: "pen",
  color: "#1f2937",
  width: 0.006,
};

const MAX_HISTORY_LENGTH = 50;
const MAX_STROKES = 2_000;
const MAX_POINTS = 100_000;
const MAX_STROKE_WIDTH = 0.2;

export function createHandwritingHistory(
  data: HandwritingData = EMPTY_HANDWRITING_DATA,
): HandwritingHistory {
  return { present: cloneHandwritingData(data), past: [], future: [] };
}

export function pushStroke(
  history: HandwritingHistory,
  stroke: HandwritingStroke,
): HandwritingHistory {
  if (stroke.points.length === 0) return history;
  return commit(history, {
    ...history.present,
    strokes: [...history.present.strokes, stroke],
  });
}

export function clearHandwriting(history: HandwritingHistory): HandwritingHistory {
  if (history.present.strokes.length === 0) return history;
  return commit(history, { ...EMPTY_HANDWRITING_DATA });
}

export function undoHandwriting(history: HandwritingHistory): HandwritingHistory {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    present: cloneHandwritingData(previous),
    past: history.past.slice(0, -1),
    future: [cloneHandwritingData(history.present), ...history.future],
  };
}

export function redoHandwriting(history: HandwritingHistory): HandwritingHistory {
  const next = history.future[0];
  if (!next) return history;
  return {
    present: cloneHandwritingData(next),
    past: trimHistory([...history.past, cloneHandwritingData(history.present)]),
    future: history.future.slice(1),
  };
}

export function parseHandwritingData(value: string): HandwritingData {
  const parsed: unknown = JSON.parse(value);
  if (!isHandwritingData(parsed)) {
    throw new Error("Invalid handwriting data");
  }
  return parsed;
}

export function serializeHandwritingData(data: HandwritingData): string {
  return JSON.stringify(data);
}

export function pointerToNormalizedPoint(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  timestamp: number,
): HandwritingPoint {
  return {
    x: clamp01((clientX - rect.left) / Math.max(rect.width, 1)),
    y: clamp01((clientY - rect.top) / Math.max(rect.height, 1)),
    t: Math.max(0, Math.round(timestamp)),
  };
}

export function createStroke(
  toolState: HandwritingToolState,
  points: HandwritingPoint[],
): HandwritingStroke {
  return {
    id: crypto.randomUUID(),
    tool: toolState.tool,
    color: toolState.color,
    width: toolState.width,
    points,
  };
}

export function canUndo(history: HandwritingHistory): boolean {
  return history.past.length > 0;
}

export function canRedo(history: HandwritingHistory): boolean {
  return history.future.length > 0;
}

function commit(history: HandwritingHistory, present: HandwritingData): HandwritingHistory {
  return {
    present: cloneHandwritingData(present),
    past: trimHistory([...history.past, cloneHandwritingData(history.present)]),
    future: [],
  };
}

function trimHistory(history: HandwritingData[]): HandwritingData[] {
  return history.slice(Math.max(0, history.length - MAX_HISTORY_LENGTH));
}

function cloneHandwritingData(data: HandwritingData): HandwritingData {
  return {
    schemaVersion: 1,
    coordinateSpace: "normalized",
    strokes: data.strokes.map((stroke) => ({
      ...stroke,
      points: stroke.points.map((point) => ({ ...point })),
    })),
  };
}

function isHandwritingData(value: unknown): value is HandwritingData {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === 1 &&
    record.coordinateSpace === "normalized" &&
    Array.isArray(record.strokes) &&
    record.strokes.length <= MAX_STROKES &&
    countPoints(record.strokes) <= MAX_POINTS &&
    record.strokes.every(isHandwritingStroke)
  );
}

function isHandwritingStroke(value: unknown): value is HandwritingStroke {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    (record.tool === "pen" || record.tool === "eraser") &&
    typeof record.color === "string" &&
    isHexColor(record.color) &&
    typeof record.width === "number" &&
    Number.isFinite(record.width) &&
    record.width > 0 &&
    record.width <= MAX_STROKE_WIDTH &&
    Array.isArray(record.points) &&
    record.points.every(isHandwritingPoint)
  );
}

function isHandwritingPoint(value: unknown): value is HandwritingPoint {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.x === "number" &&
    Number.isFinite(record.x) &&
    record.x >= 0 &&
    record.x <= 1 &&
    typeof record.y === "number" &&
    Number.isFinite(record.y) &&
    record.y >= 0 &&
    record.y <= 1 &&
    typeof record.t === "number" &&
    Number.isFinite(record.t) &&
    record.t >= 0
  );
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function countPoints(strokes: unknown[]): number {
  return strokes.reduce<number>((total, stroke) => {
    if (typeof stroke !== "object" || stroke === null || Array.isArray(stroke)) return total;
    const points = (stroke as Record<string, unknown>).points;
    return total + (Array.isArray(points) ? points.length : 0);
  }, 0);
}

function isHexColor(color: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(color);
}
