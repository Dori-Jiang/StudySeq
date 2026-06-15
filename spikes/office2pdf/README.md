# office2pdf Spike

This is an isolated experiment for evaluating `office2pdf` as a pure-Rust Office-to-PDF converter.

It is not part of the StudySeq app runtime:

- no Tauri command
- no UI
- no `app/src-tauri/Cargo.toml` dependency
- no release gate
- no committed sample Office files

## Current Scope

- Dependency: `office2pdf = "=0.6.0"`
- Direct license: Apache-2.0
- Supported input formats from the crate API: DOCX, PPTX, XLSX
- Default self-check: generate a minimal PPTX in memory, convert it to PDF, and write the PDF to `out/`

Before production use, run a full transitive license and advisory audit, then design a safe Tauri boundary around `material_id` only. Do not accept frontend-provided input/output paths in a formal implementation.

## Run

From this directory:

```powershell
cargo run
```

This writes `out/minimal-pptx.pdf`.

To test a real file manually:

```powershell
cargo run -- "C:\path\to\input.pptx" "out\input.pdf"
```

The output path is optional. If omitted, the spike writes next to the input with a `.pdf` extension.

## Evaluation Notes To Capture

- conversion success/failure
- output starts with `%PDF`
- input and output byte sizes
- elapsed conversion time
- warnings emitted by `office2pdf`
- visual quality for real DOCX/PPTX/XLSX samples
- dependency size and license/advisory audit result
