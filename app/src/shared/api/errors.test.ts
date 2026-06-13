import { describe, expect, it } from "vitest";

import { GENERIC_ERROR_MESSAGE, toUserMessage } from "./errors";

describe("toUserMessage", () => {
  it("uses stable backend ApiError messages", () => {
    expect(
      toUserMessage({
        code: "material_path_outside_library",
        message: "资料路径超出 App 管理目录，已拒绝访问",
      }),
    ).toBe("资料路径超出 App 管理目录，已拒绝访问");
  });

  it("does not expose raw runtime errors or paths", () => {
    expect(toUserMessage(new Error("SQL error at C:\\Users\\123\\secret.sqlite"))).toBe(
      GENERIC_ERROR_MESSAGE,
    );
    expect(toUserMessage("C:\\Users\\123\\secret.txt")).toBe(GENERIC_ERROR_MESSAGE);
    expect(toUserMessage({ message: "database disk image is malformed" })).toBe(
      GENERIC_ERROR_MESSAGE,
    );
  });
});
