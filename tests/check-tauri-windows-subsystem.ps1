$ErrorActionPreference = "Stop"

$mainPath = Join-Path $PSScriptRoot "..\app\src-tauri\src\main.rs"
$mainSource = Get-Content -Raw -Path $mainPath

if ($mainSource -notmatch '#!\[cfg_attr\(not\(debug_assertions\), windows_subsystem = "windows"\)\]') {
  Write-Error "Release Windows builds must use the GUI subsystem so StudySeq does not open a console window."
}
