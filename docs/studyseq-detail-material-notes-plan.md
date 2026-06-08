# StudySeq Detail, Materials, and Notes Implementation Plan

**Goal:** Build the next verified loop: learning content detail page -> import material -> create plain-text note -> restart recovery, with learning content deletion.

**Architecture:** Rust remains the only SQLite and file-system boundary. React uses routes and Tauri invoke wrappers. The detail page reads one aggregate payload containing the learning content, root-level material files, and plain-text notes.

**Confirmed Scope:**

- Duplicate imported file names get an automatic suffix.
- Materials v1 shows only a root-level file list; no folders.
- Notes v1 contain title and plain-text body only; no groups.
- First preview formats are txt, images, and PDF; Office and video are deferred.
- Delete learning content is included, but it does not cascade-delete materials or notes yet.

**Tasks:**

1. Extend Rust models and SQLite migrations for `material_items` and `notes`.
2. Add repository tests for detail recovery, duplicate import naming, plain-text note recovery, and non-cascade study deletion.
3. Add Tauri commands: `get_learning_detail`, `delete_learning_content`, `import_material_file`, `create_note`.
4. Add frontend API tests and detail page tests.
5. Implement React Router routes: `/` and `/studies/:studyId`.
6. Implement home navigation and delete confirmation.
7. Implement detail page material import and note creation.
8. Verify with frontend tests, typecheck, build, Rust fmt/test/clippy, and Tauri debug build.
