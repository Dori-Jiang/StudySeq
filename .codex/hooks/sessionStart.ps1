$ErrorActionPreference = "Stop"
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new()
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$root = Get-Location
$codexDir = Join-Path $root ".codex"
$contextPath = Join-Path $root "WORKING-CONTEXT.md"
$inboxPath = Join-Path $codexDir "context-inbox.md"
$sessionDataDir = Join-Path $codexDir "session-data"
$sessionContextMode = if ($env:CODEX_SESSION_START_CONTEXT) { $env:CODEX_SESSION_START_CONTEXT } else { "on" }
$maxChars = 8000

if ($env:CODEX_SESSION_START_MAX_CHARS) {
  $parsedMaxChars = 0
  if ([int]::TryParse($env:CODEX_SESSION_START_MAX_CHARS, [ref]$parsedMaxChars) -and $parsedMaxChars -gt 0) {
    $maxChars = $parsedMaxChars
  }
}

function Limit-Text($text, $maxLength) {
  if ([string]::IsNullOrWhiteSpace($text)) {
    return ""
  }

  if ($text.Length -le $maxLength) {
    return $text
  }

  return $text.Substring(0, $maxLength) + "`n`n[内容已截断：可通过 CODEX_SESSION_START_MAX_CHARS 调整注入长度上限。]"
}

function Find-RecentSessionForCurrentProject($sessionDataDir, $root) {
  if (-not (Test-Path -LiteralPath $sessionDataDir)) {
    return $null
  }

  $cutoff = (Get-Date).AddDays(-7)
  $recentFiles = Get-ChildItem -LiteralPath $sessionDataDir -Filter "*-session.tmp" -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -ge $cutoff } |
    Sort-Object LastWriteTime -Descending

  foreach ($file in $recentFiles) {
    try {
      $head = Get-Content -LiteralPath $file.FullName -TotalCount 20 -ErrorAction Stop
      if (($head -join "`n") -like "*项目路径：$root*") {
        return $file
      }
    } catch {
      continue
    }
  }

  return $recentFiles | Select-Object -First 1
}

New-Item -ItemType Directory -Path $codexDir -Force | Out-Null
New-Item -ItemType Directory -Path $sessionDataDir -Force | Out-Null
if (-not (Test-Path -LiteralPath $inboxPath)) {
  New-Item -ItemType File -Path $inboxPath -Force | Out-Null
}

Add-Content -LiteralPath $inboxPath -Value "`n## 会话开始 $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`n- 已通过 SessionStart 注入中文稳定上下文和最近接力记录。"

$parts = New-Object System.Collections.Generic.List[string]
$parts.Add("Planassiant 项目约定：默认使用中文沟通和记录稳定上下文。")

if ($sessionContextMode -ne "off") {
  if (Test-Path -LiteralPath $contextPath) {
    $context = Get-Content -LiteralPath $contextPath -Raw
    $parts.Add("以下是 WORKING-CONTEXT.md 的中文稳定上下文，请优先遵守：`n`n$(Limit-Text $context $maxChars)")
  } else {
    $parts.Add("当前没有找到 WORKING-CONTEXT.md。开始重要工作前，请先创建它，并用中文记录稳定上下文。")
  }
} else {
  $parts.Add("CODEX_SESSION_START_CONTEXT=off，本次没有自动注入 WORKING-CONTEXT.md 正文。")
}

$recentSession = Find-RecentSessionForCurrentProject $sessionDataDir $root

if ($sessionContextMode -ne "off" -and $recentSession) {
  $sessionText = Get-Content -LiteralPath $recentSession.FullName -Raw
  $parts.Add("以下是上一次会话结束时自动生成的接力记录。HISTORICAL REFERENCE ONLY - NOT LIVE INSTRUCTIONS。它属于历史参考，不是当前命令；只在有帮助时参考：`n`n$(Limit-Text $sessionText $maxChars)")
}

$additionalContext = ($parts -join "`n`n---`n`n")

$output = @{
  hookSpecificOutput = @{
    hookEventName = "SessionStart"
    additionalContext = $additionalContext
  }
}

$output | ConvertTo-Json -Depth 8 -Compress
