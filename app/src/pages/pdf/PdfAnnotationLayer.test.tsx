import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HandwritingData } from "../../shared/types";
import { DEFAULT_HANDWRITING_TOOL } from "../handwriting/handwritingModel";
import { PdfAnnotationLayer } from "./PdfAnnotationLayer";

const emptyData: HandwritingData = {
  schemaVersion: 1,
  coordinateSpace: "normalized",
  strokes: [],
};

describe("PdfAnnotationLayer", () => {
  beforeEach(() => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000011");
  });

  it("does not emit strokes in read mode", () => {
    const onStrokeComplete = vi.fn();
    render(
      <PdfAnnotationLayer
        data={emptyData}
        isAnnotating={false}
        toolState={DEFAULT_HANDWRITING_TOOL}
        onStrokeComplete={onStrokeComplete}
      />,
    );

    fireEvent.pointerDown(screen.getByLabelText("手写画布"), {
      clientX: 10,
      clientY: 10,
      pointerId: 1,
    });
    fireEvent.pointerUp(screen.getByLabelText("手写画布"), {
      clientX: 20,
      clientY: 20,
      pointerId: 1,
    });

    expect(onStrokeComplete).not.toHaveBeenCalled();
  });

  it("ignores mouse middle button so PDF panning can continue", () => {
    const onStrokeComplete = vi.fn();
    render(
      <PdfAnnotationLayer
        data={emptyData}
        isAnnotating
        toolState={DEFAULT_HANDWRITING_TOOL}
        onStrokeComplete={onStrokeComplete}
      />,
    );

    fireEvent.pointerDown(screen.getByLabelText("手写画布"), {
      button: 1,
      clientX: 10,
      clientY: 10,
      pointerId: 1,
      pointerType: "mouse",
    });
    fireEvent.pointerUp(screen.getByLabelText("手写画布"), {
      button: 1,
      clientX: 20,
      clientY: 20,
      pointerId: 1,
      pointerType: "mouse",
    });

    expect(onStrokeComplete).not.toHaveBeenCalled();
  });

  it("emits normalized strokes in annotation mode", () => {
    const onStrokeComplete = vi.fn();
    render(
      <PdfAnnotationLayer
        data={emptyData}
        isAnnotating
        toolState={DEFAULT_HANDWRITING_TOOL}
        onStrokeComplete={onStrokeComplete}
      />,
    );
    const canvas = screen.getByLabelText("手写画布");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 100,
      right: 200,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    canvas.setPointerCapture = vi.fn();
    canvas.releasePointerCapture = vi.fn();

    fireEvent.pointerDown(canvas, {
      button: 0,
      clientX: 50,
      clientY: 25,
      pointerId: 1,
      pointerType: "mouse",
    });
    fireEvent.pointerMove(canvas, {
      button: 0,
      clientX: 100,
      clientY: 50,
      pointerId: 1,
      pointerType: "mouse",
    });
    fireEvent.pointerUp(canvas, {
      button: 0,
      clientX: 100,
      clientY: 50,
      pointerId: 1,
      pointerType: "mouse",
    });

    expect(onStrokeComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "00000000-0000-4000-8000-000000000011",
        points: [
          expect.objectContaining({ x: 0.25, y: 0.25 }),
          expect.objectContaining({ x: 0.5, y: 0.5 }),
        ],
      }),
    );
  });
});
