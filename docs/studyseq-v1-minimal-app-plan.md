# StudySeq v1 Minimal App Implementation Plan

**Goal:** Build the first runnable `app/` skeleton and verify the loop: learning content -> SQLite -> home page display -> restart recovery.

**Architecture:** React renders the home page and calls Tauri commands through a small API wrapper. Rust owns validation, SQLite access, migrations, and persistence. Tests cover domain validation, repository persistence, and frontend API behavior.

**Tech Stack:** Tauri 2, Vite, React, TypeScript, Rust, rusqlite, Vitest, React Testing Library.

## Tasks

1. Create the Vite + React + TypeScript + Tauri project structure under `app/`.
2. Add Rust domain tests for learning content validation and SQLite persistence.
3. Implement Rust models, repository, app state, migration, and Tauri commands.
4. Add frontend tests for API mapping and home page behavior.
5. Implement the home page with list loading and a create form.
6. Verify with `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run build`, `cargo test`, and a restart-recovery integration test.

## Success Evidence

- `app/src-tauri` contains a real Rust crate with SQLite persistence.
- `app/src` contains a React home page that invokes Rust commands.
- Tests prove a learning content created in SQLite is visible after reopening the database.
- Build and test commands complete successfully from `app/`.
