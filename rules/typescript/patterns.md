# TypeScript Patterns

- Keep product domain logic in `product/app/shared/core`.
- Keep persistence code in `product/app/shared/db`.
- Keep desktop-specific system integration in `product/app/desktop/src-tauri`.
- Avoid coupling React components directly to SQLite or filesystem APIs.

