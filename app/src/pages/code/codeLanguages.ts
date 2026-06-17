export const SUPPORTED_CODE_LANGUAGES = new Set([
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "markup",
  "css",
  "json",
  "python",
  "rust",
  "go",
  "java",
  "csharp",
  "c",
  "cpp",
  "yaml",
]);

export function canHighlightCode(language: string | null) {
  return language !== null && SUPPORTED_CODE_LANGUAGES.has(language);
}
