# StudySeq / 知序 V1.8.1 开发计划

## 文档定位

本文件记录 StudySeq / 知序 V1.8.1 的开发计划。

- V1.8.1 是 V1.8 Office 转 PDF 后的稳定补丁版本。
- 本版本以稳定当前软件为主体，不扩展 Office 能力，不新增产品功能。
- 总进度仍记录在 `product/docs/studyseq-project-progress.md`；本文件用于展开 V1.8.1 的版本目标、阶段计划、验收标准和风险。

当前状态（2026-06-15）：已召集 `planner`、`architect`、`e2e-runner`、`security-reviewer` 进行规划，并补充 `rust-reviewer`、`typescript-reviewer` 做代码级只读复核。V1.8.1 继续收敛为“小修稳定版”：保留 V1.8 架构，重点修复真实 App 手测和审查发现的稳定性风险。A1-A6 已完成，自动化 release gate、正式 release 发包和隔离真实 App 固定样本复查均已通过。

## 版本目标

V1.8.1 目标：不扩展 Office 能力，只围绕 V1.8 已完成的 DOCX / PPTX / XLSX 转 PDF 主线做稳定性修复、真实 App 复查、回归验证和文档收口。

V1.8.1 成功口径：

- DOCX / PPTX / XLSX 仍通过 App 管理资料库内源文件转换为派生 PDF。
- 转换后仍复用现有 `PdfPreview`，不新建 Office 阅读器。
- Office 资料重命名后，转换识别和 XLSX 阅读缩放不因显示名变化而漂移。
- 派生 PDF 写入过程不会留下可被误复用的半成品缓存。
- 删除、重命名、资料库迁移和 cleanup 对 Office 派生 PDF 的处理更一致。
- Office 转换失败、坏缓存、过大文件、缺失副本和库外路径都进入稳定错误终态，不永久 loading，不泄露本机路径。
- V1.8 的 XLSX 宽横向页面、`office-pdf-xlsx-wide-v1` 缓存和 140% 初始缩放下限继续生效。
- txt、图片、普通 PDF、视频、资料文件夹、搜索、继续学习、笔记和资料库位置设置不回退。

## 范围

### 进入 V1.8.1

- Office 类型判断稳定化：Rust 和前端避免各自按不同文件名/路径扩展名判断。
- 派生 PDF 写入稳定化：转换结果先写同目录临时文件，校验后再替换目标 PDF。
- Office 派生缓存生命周期收口：删除、重命名、资料库迁移和 cleanup 对 `.derived/office-pdf*` 的行为明确。
- Office 转换错误终态回归：失败后详情页可返回资料列表，错误文案脱敏且用户可理解。
- 真实 App 手测复查：重点复查 DOCX / PPTX / XLSX、中文文件名、坏文件、重复打开缓存、断网流程和安装包启动。
- 补充风险点测试：只补 Office 转 PDF、派生缓存、错误终态、XLSX 缩放、资料迁移/清理相关测试。
- 版本号、项目进度、工作上下文和发包记录收口。

### 不进入 V1.8.1

- 不支持旧版 `.doc`、`.ppt`、`.xls`。
- 不做 Office 原生预览、编辑、外部打开兜底。
- 不依赖 LibreOffice、system Office 或外部命令。
- 不做批量转换、后台转换队列、转换进度条或取消转换。
- 不做全文搜索、PDF 文本抽取、OCR。
- 不新增 SQLite schema，不提升 `PRAGMA user_version`。
- 不恢复旧独立阅读页或 `/studies/:studyId/read`。
- 不引入新依赖，不重构整个 repository。
- 不把转换路径、输出路径、缓存目录暴露给前端配置。

## 推荐技术边界

V1.8.1 保持 V1.8 的主合同：

```text
前端 previewMaterialFile(materialId)
-> Rust command 只接收 material_id
-> repository 从 SQLite 读取 material
-> 只基于 App 资料库内 stored_path 转换
-> 派生 PDF 写入资料库 .derived 子目录
-> 返回 kind = "pdf" + assetPath
-> 前端继续交给 PdfPreview
```

本版本允许做小范围 helper 抽取，但不改变 ownership：

- Office 格式判断仍属于 Rust repository 边界。
- `MaterialPreviewPane` 不关心转换细节，只处理 `pdf` 预览。
- 派生 PDF 仍是文件系统缓存，不入 SQLite。
- 资料库迁移可以不迁移派生 PDF，但必须有明确清理或重建策略。

## 开发计划

V1.8.1 采用 A1-A6 分阶段推进。

| 阶段 | 优先级 | 主题 | 主要工作 | 验收标准 | 建议 agent |
| --- | --- | --- | --- | --- | --- |
| A1 | P0 | Office 类型判断稳定化 | Rust 侧基于 material 的稳定信息判断 Office 格式；前端 XLSX 缩放不再只依赖显示名；覆盖重命名后继续预览 | `.xlsx` 改名后仍能按 Office 派生 PDF 预览，XLSX 140% 下限仍生效 | `architect`、`typescript-reviewer`、`rust-reviewer` |
| A2 | P0 | 派生 PDF 写入和坏缓存收口 | 转换结果写入临时文件，校验 `%PDF` 后 rename；失败清理临时文件；坏缓存不被复用 | 半成品或坏缓存不会进入空白/永久 loading；成功缓存可复用 | `tdd-guide`、`rust-reviewer` |
| A3 | P0 | 派生缓存生命周期 | 删除 Office、重命名 Office、删除学习内容、删除文件夹、资料库 cleanup、资料库迁移后的派生缓存处理一致 | 正式副本和 `.derived/office-pdf*` 不出现明显残留；失败只返回数量或友好提示 | `security-reviewer`、`database-reviewer` |
| A4 | P1 | 错误终态和 UI 回归 | 补充损坏 Office、过大 Office、缺失副本、库外路径、旧 Office 格式的前后端错误展示测试 | 详情页不永久 loading，不展示 AppData、盘符、UNC 路径或 asset URL | `typescript-reviewer`、`security-reviewer` |
| A5 | P1 | 真实 App 稳定复查 | 用固定样本和真实 App 验证 DOCX / PPTX / XLSX、普通 PDF、txt、图片、视频、文件夹、笔记、继续学习、断网 | 关键流程可复现通过，手测问题记录为修复项或后续推迟项 | `e2e-runner` |
| A6 | P1 | 文档、版本和发包收口 | 版本号统一为 `1.8.1`；更新进度、上下文、验证命令和产物路径；重新生成 debug/release 包 | 自动化验证通过，真实 App 复查通过，文档记录和产物版本一致 | `doc-updater`、`build-error-resolver` |

## 当前实现状态

已落地：

- A1 Office 类型判断稳定化：Rust 侧 Office 判断改为 `mime_type` 优先；只有 `mime_type` 缺失或为 `application/octet-stream` 时才回退 App 管理副本路径扩展名。前端 XLSX 140% 初始缩放和旧 Office 不支持提示同样改为 MIME 优先，避免普通 PDF 只因显示名像 `.xlsx` / `.doc` 而走错分支。
- A2 派生 PDF 写入和坏缓存收口：Office 转换结果先写同目录临时 PDF，校验后再替换目标缓存；旧缓存替换前会先备份，目标不是普通文件时直接失败；缓存复用同时要求 `%PDF` 文件头和 `%%EOF` 尾标记，避免半成品缓存被误复用。
- A3 派生缓存生命周期：Office 资料重命名会清理已有派生 PDF 缓存，清理失败返回脱敏数量并由前端提示稍后重试；资料库迁移计划会包含既有 Office 派生 PDF；资料引用和清理路径继续基于稳定 Office 格式判断。
- A4 前端回归覆盖：XLSX 重命名后仍保持 140% 缩放下限；普通 PDF 即使显示名带 `.xlsx` 也不套用 XLSX 缩放；显式 `application/pdf` 的 `.doc` 显示名不会误走旧 Office 提示。
- A5 真实 App 稳定复查：使用临时 identifier `com.studyseq.desktop.v181test` 和隔离数据目录完成固定样本复查，未触碰正式 `com.studyseq.desktop` 用户数据。已验证真实 Tauri App 中的 DOCX / PPTX / XLSX 转 PDF、XLSX 140% 缩放、XLSX 版本化缓存、普通 PDF 低缩放恢复、txt、图片、WebM、嵌套文件夹返回上下文、坏 DOCX 友好失败、重复打开复用派生缓存、删除 Office 资料不删除原始来源文件、重启恢复、CDP offline 模式下本地 txt/PDF 阅读。
- A6 版本和自动化发包收口：`app/package.json`、`app/package-lock.json`、`app/src-tauri/Cargo.toml`、`app/src-tauri/Cargo.lock`、`app/src-tauri/tauri.conf.json` 已统一到 `1.8.1`；自动化 release gate 已通过；正式 release 包已生成。

待完成：无。

## 验证记录

2026-06-15 已通过：

- `npm.cmd test`：11 个测试文件、163 个测试通过。jsdom canvas 未实现提示为测试环境噪声，退出码为 0。
- `npm.cmd run typecheck`
- `npm.cmd run build`
- `cargo fmt --check`
- `cargo test`：88 个 Rust 测试通过。
- `cargo clippy -- -D warnings`
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\check-tauri-windows-subsystem.ps1`
- `npm.cmd audit --audit-level=high`：0 个漏洞。
- `cargo tree -i office2pdf`：`office2pdf v0.6.0` 仅由 `studyseq v1.8.1` 依赖。
- `npm.cmd run tauri -- build`
- `npm.cmd run tauri -- build --debug --no-bundle`：使用临时 `CARGO_TARGET_DIR=C:\Users\123\AppData\Local\Temp\studyseq-v181-final-debug-target` 通过。
- `npm.cmd run tauri -- build`：本轮重新通过并生成正式 MSI / NSIS。
- 隔离真实 App 固定样本复查：`com.studyseq.desktop.v181test` debug 构建，样本和证据位于 `C:\Users\123\AppData\Local\Temp\studyseq-v181-a5\`。
- completion audit 复跑：再次通过 `npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run build`、`cargo fmt --check`、`cargo test`、`cargo clippy -- -D warnings`、Windows 子系统静态检查、`npm.cmd audit --audit-level=high`、`cargo tree -i office2pdf`、`npm.cmd run tauri -- build --debug --no-bundle` 和 `npm.cmd run tauri -- build`；本轮 debug 复跑使用临时 `CARGO_TARGET_DIR=C:\Users\123\AppData\Local\Temp\studyseq-v181-audit-debug-target`。

未运行：

- `cargo audit`：本机未安装 `cargo-audit`。

发包产物：

- 正式 exe：`app/src-tauri/target/release/studyseq.exe`
- 正式 MSI：`app/src-tauri/target/release/bundle/msi/StudySeq_1.8.1_x64_en-US.msi`
- 正式 NSIS：`app/src-tauri/target/release/bundle/nsis/StudySeq_1.8.1_x64-setup.exe`
- 临时 debug exe：`C:\Users\123\AppData\Local\Temp\studyseq-v181-debug-20260615223223\debug\studyseq.exe`
- 临时 debug MSI：`C:\Users\123\AppData\Local\Temp\studyseq-v181-debug-20260615223223\debug\bundle\msi\StudySeq_1.8.1_x64_en-US.msi`
- 临时 debug NSIS：`C:\Users\123\AppData\Local\Temp\studyseq-v181-debug-20260615223223\debug\bundle\nsis\StudySeq_1.8.1_x64-setup.exe`
- A5 隔离 debug exe：`C:\Users\123\AppData\Local\Temp\studyseq-v181-a5-target\debug\studyseq.exe`
- 最终临时 debug exe：`C:\Users\123\AppData\Local\Temp\studyseq-v181-final-debug-target\debug\studyseq.exe`
- completion audit 临时 debug exe：`C:\Users\123\AppData\Local\Temp\studyseq-v181-audit-debug-target\debug\studyseq.exe`

说明：主 target 的 `app/src-tauri/target/debug/studyseq.exe` 被运行中进程占用，首次 `npm.cmd run tauri -- build --debug` 在覆盖该文件时被 Windows 拒绝；本轮未杀进程，改用临时 `CARGO_TARGET_DIR` 成功生成 debug 包。

## 真实 App 固定样本复查记录

2026-06-15 已完成隔离真实 App 复查：

- 隔离方式：临时 Tauri config 覆盖 identifier 为 `com.studyseq.desktop.v181test`，临时 target 为 `C:\Users\123\AppData\Local\Temp\studyseq-v181-a5-target`，数据目录为 `C:\Users\123\AppData\Roaming\com.studyseq.desktop.v181test`。
- 固定样本：中文/空格/长文件名 DOCX，横版多页 PPTX，宽表多 sheet XLSX，普通 PDF，中文 txt，PNG，WebM，损坏 DOCX，嵌套文件夹，预置笔记和最近打开状态。
- UI 复查结果：txt 正常显示；图片通过 asset URL 加载且自然尺寸为 640x360；普通 PDF 恢复第 2 页和 80% 缩放；WebM 显示视频播放器；DOCX/PPTX/XLSX 均转为 PDF 并渲染到 `PdfPreview`；XLSX 完整渲染后显示 140% 缩放；坏 DOCX 显示 Office 转 PDF 失败并可返回资料列表；嵌套文件夹内 Office 打开后返回仍停留在该文件夹。
- 缓存复查结果：DOCX/PPTX 派生 PDF 写入 `.derived/office-pdf/`，XLSX 写入 `.derived/office-pdf-xlsx-wide-v1/`；三者均以 `%PDF` 开头并包含 `%%EOF`；重复打开后派生 PDF 修改时间不变，证明复用缓存。
- 删除复查结果：通过真实 UI 删除 DOCX 后，App 管理副本和对应派生 PDF 被删除，临时来源目录中的原始 DOCX 仍存在。
- 重启复查结果：关闭并重启隔离 App 后，主页最近打开摘要、资料列表和笔记仍恢复；已删除 DOCX 不再出现，符合删除验证预期。
- 离线复查结果：WebView2 CDP offline 模式下，txt 和普通 PDF 仍可本地阅读，未出现网络加载失败。
- 证据文件：`cdp-evidence-final.json`、`cache-reuse-evidence.json`、`delete-office-evidence-final.json`、`offline-smoke-evidence.json`、`restart-evidence.json` 均位于 `C:\Users\123\AppData\Local\Temp\studyseq-v181-a5\`。
- 边界说明：本轮真实 App 复查通过预置隔离数据库和 App 管理资料库执行，未自动化覆盖系统文件选择器导入链路；导入链路本身沿用 V1.6 已通过的 Rust 文件选择器路径。

## 必测清单

### 自动化

- Office 格式判断覆盖 `mime_type`、`stored_path`、重命名后的显示名变化。
- `.doc / .ppt / .xls` 继续 unsupported。
- XLSX 派生 PDF 继续写入 `office-pdf-xlsx-wide-v1`。
- XLSX 派生 PDF 打开时保底 140% 初始缩放，普通 PDF 低缩放恢复不变。
- 派生 PDF 好缓存复用，坏缓存重建。
- 派生 PDF 写入失败不会留下目标半成品。
- 删除 Office 资料、删除包含 Office 的文件夹、删除学习内容会清理对应派生 PDF。
- 资料库 cleanup 不把当前有效派生 PDF 当 orphan。
- 资料库迁移后 Office 派生缓存策略可重复、可解释、可回归。
- 转换失败返回稳定错误码和中文用户文案。

### 真实 App 手测

- 真实 DOCX：中文标题、段落、简单表格。
- 真实 PPTX：多页、横版、中文内容、图片。
- 真实 XLSX：多列宽表、中文表头、合并单元格或多 sheet 样本。
- 中文文件名、空格文件名、较长文件名。
- 同一 Office 资料重复打开，应明显复用缓存。
- 损坏 DOCX/PPTX/XLSX 显示友好失败，可返回资料列表。
- 普通 PDF 页码/缩放/目录/横版比例不回退。
- txt、图片、MP4/WebM、旧不支持视频格式不回退。
- 嵌套文件夹中的 Office 资料可打开，返回后文件夹上下文正确。
- 主页“继续”打开最近 Office 派生 PDF 不走旧阅读页。
- 删除 Office 资料后原始来源文件仍存在。
- 断网状态下导入、转换、阅读、笔记可用。
- MSI/NSIS 安装包启动无黑色控制台窗口。

## 验证命令

开发中窄回归：

```powershell
Set-Location 'G:\PRJ\计划软件Planassiant\app'
npm.cmd test -- StudyDetailPage.test.tsx PdfPreview.test.tsx

Set-Location 'G:\PRJ\计划软件Planassiant\app\src-tauri'
cargo test office
```

完整 release gate：

```powershell
Set-Location 'G:\PRJ\计划软件Planassiant\app'
npm.cmd test
npm.cmd run typecheck
npm.cmd run build

Set-Location 'G:\PRJ\计划软件Planassiant\app\src-tauri'
cargo fmt --check
cargo test
cargo clippy -- -D warnings

Set-Location 'G:\PRJ\计划软件Planassiant'
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\check-tauri-windows-subsystem.ps1

Set-Location 'G:\PRJ\计划软件Planassiant\app'
npm.cmd run tauri -- build --debug
npm.cmd run tauri -- build
```

依赖检查：

```powershell
Set-Location 'G:\PRJ\计划软件Planassiant\app'
npm.cmd audit --audit-level=high

Set-Location 'G:\PRJ\计划软件Planassiant\app\src-tauri'
cargo tree -i office2pdf
```

如果本机可用 `cargo-audit`，发布前补跑：

```powershell
Set-Location 'G:\PRJ\计划软件Planassiant\app\src-tauri'
cargo audit
```

## 风险

### Office 类型判断漂移

影响：资料重命名后，Rust 转换判断、前端 XLSX 缩放判断和实际源文件类型不一致。

策略：V1.8.1 优先修复；类型判断以导入时记录和 Rust 稳定合同为准，前端不只看显示名。

### 派生 PDF 半成品被复用

影响：转换或写入中断后可能留下以 `%PDF` 开头但不可读的文件，后续打开进入空白或失败。

策略：临时文件 + 校验 + rename；失败清理临时文件；坏缓存回归测试。

### 资料库迁移后的旧派生缓存残留

影响：迁移只搬正式副本时，旧资料库 `.derived` 可能长期占空间。

策略：V1.8.1 明确清理策略；至少确保不会影响新库预览、cleanup 统计和用户原始文件。

### 运行期 asset scope 只追加不收窄

影响：资料库迁移后同一 App 会话内旧资料库 scope 可能仍可读。

策略：V1.8.1 先记录并验证；若 Tauri 无撤销 API，则以后端校验、当前 DB `stored_path` 和必要的重启/刷新提示收口，不在本版引入大协议改造。

### 真实 Office 转换质量波动

影响：复杂 PPTX / XLSX / DOCX 版式可能仍不完全符合原文件。

策略：本版只承诺稳定和可读，不承诺像素级还原；复杂版式优化列入后续 Office 转换质量专项。

## 推迟项

- 旧版 Office `.doc / .ppt / .xls`。
- Office 原生预览或编辑。
- Office 外部打开兜底。
- LibreOffice / system Office 接入。
- 转换进度条、取消转换、后台队列。
- 批量转换。
- 派生 PDF 管理 UI。
- Office 全文抽取和搜索。
- `stored_path` DTO 合同大调整。
- 资料库 asset 协议令牌化大改造。
