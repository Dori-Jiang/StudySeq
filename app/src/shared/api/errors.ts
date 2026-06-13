export const GENERIC_ERROR_MESSAGE = "操作失败，请稍后重试";

type ApiErrorLike = {
  code: string;
  message: string;
};

export function toUserMessage(error: unknown) {
  if (isApiErrorLike(error)) {
    const message = error.message.trim();
    return message || GENERIC_ERROR_MESSAGE;
  }

  return GENERIC_ERROR_MESSAGE;
}

function isApiErrorLike(error: unknown): error is ApiErrorLike {
  if (typeof error !== "object" || error === null) return false;

  const candidate = error as Partial<ApiErrorLike>;
  return typeof candidate.code === "string" && typeof candidate.message === "string";
}
