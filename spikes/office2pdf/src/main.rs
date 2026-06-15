use std::env;
use std::fs;
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use std::time::Instant;

use office2pdf::config::{ConvertOptions, Format};

fn main() {
    if let Err(error) = run() {
        eprintln!("office2pdf spike failed: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let args: Vec<String> = env::args().skip(1).collect();

    match args.as_slice() {
        [] => run_minimal_pptx_self_check(),
        [input] => convert_file(Path::new(input), None),
        [input, output] => convert_file(Path::new(input), Some(Path::new(output))),
        _ => Err("usage: cargo run -- [input.docx|input.pptx|input.xlsx] [output.pdf]".to_string()),
    }
}

fn run_minimal_pptx_self_check() -> Result<(), String> {
    let output = PathBuf::from("out").join("minimal-pptx.pdf");
    let data = build_minimal_pptx()?;
    convert_bytes(&data, Format::Pptx, &output)
}

fn convert_file(input: &Path, output: Option<&Path>) -> Result<(), String> {
    let data = fs::read(input).map_err(|error| format!("failed to read input: {error}"))?;
    let format = detect_format(input)?;
    let output = output
        .map(Path::to_path_buf)
        .unwrap_or_else(|| input.with_extension("pdf"));

    convert_bytes(&data, format, &output)
}

fn detect_format(input: &Path) -> Result<Format, String> {
    let extension = input
        .extension()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "input has no supported extension".to_string())?;

    Format::from_extension(extension)
        .ok_or_else(|| format!("unsupported extension: .{extension}; expected docx, pptx, or xlsx"))
}

fn convert_bytes(data: &[u8], format: Format, output: &Path) -> Result<(), String> {
    let started = Instant::now();
    let result = office2pdf::convert_bytes(data, format, &ConvertOptions::default())
        .map_err(|error| format!("conversion failed: {error}"))?;

    if !result.pdf.starts_with(b"%PDF") {
        return Err("converter returned bytes that do not start with %PDF".to_string());
    }

    if let Some(parent) = output.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("failed to create output directory: {error}"))?;
        }
    }

    fs::write(output, &result.pdf).map_err(|error| format!("failed to write PDF: {error}"))?;

    println!("format: {format:?}");
    println!("input_bytes: {}", data.len());
    println!("output_bytes: {}", result.pdf.len());
    println!("elapsed_ms: {}", started.elapsed().as_millis());
    println!("warnings: {}", result.warnings.len());
    for warning in result.warnings {
        println!("warning: {warning}");
    }
    println!("output: {}", output.display());

    Ok(())
}

fn build_minimal_pptx() -> Result<Vec<u8>, String> {
    let cursor = Cursor::new(Vec::new());
    let mut zip = zip::ZipWriter::new(cursor);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    zip.start_file("[Content_Types].xml", options)
        .map_err(|error| error.to_string())?;
    zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>"#)
        .map_err(|error| error.to_string())?;

    zip.start_file("_rels/.rels", options)
        .map_err(|error| error.to_string())?;
    zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>"#)
        .map_err(|error| error.to_string())?;

    zip.start_file("ppt/presentation.xml", options)
        .map_err(|error| error.to_string())?;
    zip.write_all(
        br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldSz cx="9144000" cy="6858000"/>
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId2"/>
  </p:sldIdLst>
</p:presentation>"#,
    )
    .map_err(|error| error.to_string())?;

    zip.start_file("ppt/_rels/presentation.xml.rels", options)
        .map_err(|error| error.to_string())?;
    zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>"#)
        .map_err(|error| error.to_string())?;

    zip.start_file("ppt/slides/slide1.xml", options)
        .map_err(|error| error.to_string())?;
    zip.write_all(
        br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="0" y="0"/><a:ext cx="9144000" cy="1000000"/></a:xfrm>
        </p:spPr>
        <p:txBody>
          <a:bodyPr/>
          <a:p><a:r><a:t>StudySeq office2pdf spike</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>"#,
    )
    .map_err(|error| error.to_string())?;

    zip.finish()
        .map(|cursor| cursor.into_inner())
        .map_err(|error| error.to_string())
}
