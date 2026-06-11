import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom 未实现媒体播放接口，stub 掉以便断言释放行为且消除测试噪音
Object.defineProperty(HTMLMediaElement.prototype, "pause", {
  writable: true,
  value: vi.fn(),
});
Object.defineProperty(HTMLMediaElement.prototype, "load", {
  writable: true,
  value: vi.fn(),
});

afterEach(() => {
  cleanup();
});
