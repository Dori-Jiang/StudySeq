$ErrorActionPreference = "Stop"
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new()
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$root = Get-Location
$codexDir = Join-Path $root ".codex"
$inboxPath = Join-Path $codexDir "context-inbox.md"

New-Item -ItemType Directory -Path $codexDir -Force | Out-Null
if (-not (Test-Path -LiteralPath $inboxPath)) {
  New-Item -ItemType File -Path $inboxPath -Force | Out-Null
}

Add-Content -LiteralPath $inboxPath -Value "`n## 上下文压缩前 $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`n- 如果当前阶段有新决策、结构调整、阻塞点或下一步变化，请用中文更新 WORKING-CONTEXT.md。"

$output = @{
  continue = $true
  systemMessage = "压缩前提醒：如本阶段有稳定变化，请用中文更新 WORKING-CONTEXT.md。"
}

$output | ConvertTo-Json -Depth 6 -Compress
