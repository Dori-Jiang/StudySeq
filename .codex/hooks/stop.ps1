$ErrorActionPreference = "Stop"
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new()
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

function Get-TextFromContent($content) {
  if ($null -eq $content) {
    return ""
  }

  if ($content -is [string]) {
    return $content
  }

  $items = @()
  foreach ($item in @($content)) {
    if ($null -eq $item) {
      continue
    }

    if ($item.text) {
      $items += [string]$item.text
    } elseif ($item.type -eq "input_text" -and $item.text) {
      $items += [string]$item.text
    } elseif ($item.type -eq "output_text" -and $item.text) {
      $items += [string]$item.text
    }
  }

  return ($items -join "`n")
}

function Shorten($text, $maxLength) {
  if ([string]::IsNullOrWhiteSpace($text)) {
    return ""
  }

  $clean = ($text -replace "\s+", " ").Trim()
  if ($clean.Length -le $maxLength) {
    return $clean
  }

  return $clean.Substring(0, $maxLength) + "..."
}

$root = Get-Location
$codexDir = Join-Path $root ".codex"
$inboxPath = Join-Path $codexDir "context-inbox.md"
$sessionDataDir = Join-Path $codexDir "session-data"

New-Item -ItemType Directory -Path $codexDir -Force | Out-Null
New-Item -ItemType Directory -Path $sessionDataDir -Force | Out-Null
if (-not (Test-Path -LiteralPath $inboxPath)) {
  New-Item -ItemType File -Path $inboxPath -Force | Out-Null
}

$stdin = [Console]::In.ReadToEnd()
$hookInput = $null
if (-not [string]::IsNullOrWhiteSpace($stdin)) {
  try {
    $hookInput = $stdin | ConvertFrom-Json
  } catch {
    $hookInput = $null
  }
}

$sessionId = if ($hookInput -and $hookInput.session_id) { [string]$hookInput.session_id } else { "unknown-session" }
$turnId = if ($hookInput -and $hookInput.turn_id) { [string]$hookInput.turn_id } else { "unknown-turn" }
$transcriptPath = if ($hookInput -and $hookInput.transcript_path) { [string]$hookInput.transcript_path } else { "" }
$lastAssistantMessage = if ($hookInput -and $hookInput.last_assistant_message) { [string]$hookInput.last_assistant_message } else { "" }

$userMessages = New-Object System.Collections.Generic.List[string]
$assistantMessages = New-Object System.Collections.Generic.List[string]
$toolNames = New-Object System.Collections.Generic.HashSet[string]

if ($transcriptPath -and (Test-Path -LiteralPath $transcriptPath)) {
  foreach ($line in Get-Content -LiteralPath $transcriptPath -ErrorAction SilentlyContinue) {
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }

    try {
      $entry = $line | ConvertFrom-Json
    } catch {
      continue
    }

    if ($entry.type -eq "response_item" -and $entry.payload) {
      $payload = $entry.payload
      if ($payload.type -eq "message") {
        $text = Get-TextFromContent $payload.content
        if (-not [string]::IsNullOrWhiteSpace($text)) {
          if ($payload.role -eq "user") {
            $userMessages.Add($text) | Out-Null
          } elseif ($payload.role -eq "assistant") {
            $assistantMessages.Add($text) | Out-Null
          }
        }
      } elseif ($payload.type) {
        $toolNames.Add([string]$payload.type) | Out-Null
      }
    } elseif ($entry.type -eq "event_msg" -and $entry.payload) {
      if ($entry.payload.type -eq "user_message" -and $entry.payload.message) {
        $userMessages.Add([string]$entry.payload.message) | Out-Null
      }
    }
  }
}

if ($assistantMessages.Count -eq 0 -and -not [string]::IsNullOrWhiteSpace($lastAssistantMessage)) {
  $assistantMessages.Add($lastAssistantMessage) | Out-Null
}

$recentUsers = @($userMessages | Select-Object -Last 5 | ForEach-Object { "- " + (Shorten $_ 240) })
$recentAssistants = @($assistantMessages | Select-Object -Last 3 | ForEach-Object { "- " + (Shorten $_ 240) })
$tools = @($toolNames | Sort-Object | Select-Object -First 20 | ForEach-Object { "- " + $_ })

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$safeSessionId = $sessionId -replace '[^A-Za-z0-9_.-]', '_'
$sessionFile = Join-Path $sessionDataDir "$safeSessionId-session.tmp"

$summary = @"
# Codex 会话接力记录

生成时间：$timestamp
会话 ID：$sessionId
轮次 ID：$turnId
项目路径：$root
Worktree：$root

## 最近用户消息

$($recentUsers -join "`n")

## 最近助手回复

$($recentAssistants -join "`n")

## 本轮出现过的工具/事件类型

$($tools -join "`n")

## 给下一轮 Codex 的提醒

- 这是自动生成的临时接力记录，不是长期项目规则。
- 稳定决策、项目结构、下一步和阻塞点应继续用中文维护在 WORKING-CONTEXT.md。
- 如果本轮已经产生新决策，请在下一次重要工作前把稳定内容整理进 WORKING-CONTEXT.md。
"@

Set-Content -LiteralPath $sessionFile -Value $summary -Encoding UTF8
Add-Content -LiteralPath $inboxPath -Value "`n## 会话结束 $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`n- 已自动生成接力记录：$sessionFile`n- 如本轮有稳定变化，请用中文更新 WORKING-CONTEXT.md。"

$output = @{
  continue = $true
  systemMessage = "已保存 Codex 会话接力记录；下一次 SessionStart 会自动注入 WORKING-CONTEXT.md 和最近接力记录。"
}

$output | ConvertTo-Json -Depth 6 -Compress
