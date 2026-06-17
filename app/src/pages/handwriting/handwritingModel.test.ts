import { describe, expect, it, vi } from "vitest";

import {
  clearHandwriting,
  createHandwritingHistory,
  createStroke,
  DEFAULT_HANDWRITING_TOOL,
  parseHandwritingData,
  pointerToNormalizedPoint,
  pushStroke,
  redoHandwriting,
  serializeHandwritingData,
  undoHandwriting,
} from "./handwritingModel";

describe("handwritingModel", () => {
  it("pushes strokes and supports undo redo clear", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");
    const initial = createHandwritingHistory();
    const stroke = createStroke(DEFAULT_HANDWRITING_TOOL, [{ x: 0.1, y: 0.2, t: 1 }]);

    const withStroke = pushStroke(initial, stroke);
    const undone = undoHandwriting(withStroke);
    const redone = redoHandwriting(undone);
    const cleared = clearHandwriting(redone);

    expect(withStroke.present.strokes).toHaveLength(1);
    expect(undone.present.strokes).toHaveLength(0);
    expect(redone.present.strokes[0].id).toBe("00000000-0000-4000-8000-000000000001");
    expect(cleared.present.strokes).toHaveLength(0);
    vi.restoreAllMocks();
  });

  it("converts pointer coordinates into normalized points", () => {
    const rect = {
      left: 10,
      top: 20,
      width: 200,
      height: 100,
    } as DOMRect;

    expect(pointerToNormalizedPoint(60, 70, rect, 12.4)).toEqual({
      x: 0.25,
      y: 0.5,
      t: 12,
    });
    expect(pointerToNormalizedPoint(-100, 999, rect, 1)).toEqual({
      x: 0,
      y: 1,
      t: 1,
    });
  });

  it("parses and serializes versioned handwriting data", () => {
    const json = '{"schemaVersion":1,"coordinateSpace":"normalized","strokes":[]}';

    const parsed = parseHandwritingData(json);

    expect(parsed.strokes).toEqual([]);
    expect(serializeHandwritingData(parsed)).toBe(json);
  });

  it("rejects unknown handwriting schemas", () => {
    expect(() =>
      parseHandwritingData('{"schemaVersion":2,"coordinateSpace":"normalized","strokes":[]}'),
    ).toThrow("Invalid handwriting data");
  });
});
