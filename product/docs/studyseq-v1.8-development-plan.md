# StudySeq / 知序 V1.8 开发计划

## 文档定位

本文件记录 StudySeq / 知序 V1.8 的开发计划。

- V1.8 主题是“Office 转 PDF 最小闭环”。
- 本版本把 `spikes/office2pdf/` 中验证过的纯 Rust 转换路线接入正式 App。
- “完整能力”在本版本只指 `DOCX / PPTX / XLSX -> PDF`，不包含旧版 `.doc / .ppt / .xls`。
- 总进度仍记录在 `product/docs/studyseq-project-progress.md`；本文件用于展开 V1.8 的版本目标、阶段计划、验收标准和风险。

当前状态（2026-06-15）：V1.8 自动化实现、Rust 审查修复、自动化验证和 debug/release 发包验证已完成；真实 App 手测反馈修复正在收口。版本号已统一为 `1.8.0`，`office2pdf = "=0.6.0"` 已从隔离 spike 正式接入 App。

## 版本目标

V1.8 目标：用户导入 DOCX、PPTX、XLSX 后，可以在详情页内把它们转换为 PDF，并复用现有 PDF 阅读器在 App 内阅读。

V1.8 成功口径：

- DOCX、PPTX、XLSX 资料在详情页显示为可转换资料。
- 打开这三类资料时，Rust 只基于 App 资料库内副本执行转换。
- 转换输出只写入 App 管理目录内的派生 PDF，不写到用户原始来源位置。
- 转换成功后，前端以现有 `PdfPreview` 打开派生 PDF。
- 再次打开同一资料时，优先复用未过期的派生 PDF，避免重复转换。
- 失败只返回稳定错误码和用户友好文案，不展示本机路径、AppData、盘符、UNC 路径或 asset URL。
- 现有 txt、图片、PDF、视频预览不回退。
- V1.6 的资料库路径安全边界和 V1.7 的资料搜索逻辑不回退。

## 范围

### 进入 V1.8

- 正式接入 `office2pdf = "=0.6.0"` 到 `app/src-tauri/Cargo.toml`。
- 支持新式 Office 格式：`.docx`、`.pptx`、`.xlsx`。
- Office 资料打开时转换为 PDF，再走现有 PDF 预览组件。
- 转换输入必须来自数据库中的 `material_id`，前端不得提交输入路径或输出路径。
- Rust 对输入资料副本做资料库目录 canonical 校验。
- Rust 对输出路径做资料库目录校验，只写入 App 管理目录。
- 失败时使用稳定错误码和中文提示。
- 加入基本大小限制和缓存复用规则。
- 更新项目进度、工作上下文、版本号和真实 App 手测清单。

### 不进入 V1.8

- 不支持旧版 `.doc`、`.ppt`、`.xls`。
- 不做 Office 原生预览，不在 WebView 直接渲染 Office。
- 不打包 LibreOffice，不调用系统 Office，不做外部打开兜底。
- 不做批量转换。
- 不做整文件夹导入、目录同步、文件监听。
- 不做全文搜索、PDF 文本抽取、OCR、SQLite FTS。
- 不做 Office 转换后的编辑能力。
- 不恢复旧独立阅读页或 `/studies/:studyId/read`。
- 不新增 SQLite schema，不提升 `PRAGMA user_version`。
- 不修改根目录 `AGENTS.md`。

## 推荐技术合同

V1.8 原则上不新增独立前端页面。Office 资料继续作为 `MaterialItem` 存在，预览时返回 `kind = "pdf"`：

```text
preview_material_file(material_id)
-> if PDF: return PDF assetPath
-> if DOCX/PPTX/XLSX: convert library copy to derived PDF, return PDF assetPath
-> else: keep existing preview behavior
```

派生 PDF 放在资料库内部的 App 管理子目录：

```text
DOCX/PPTX: <material_library_dir>/<learning_content_id>/.derived/office-pdf/<material_id>.pdf
XLSX:      <material_library_dir>/<learning_content_id>/.derived/office-pdf-xlsx-wide-v1/<material_id>.pdf
```

缓存复用规则：

- 源 Office 副本存在且位于资料库内。
- 派生 PDF 存在且位于资料库内。
- 派生 PDF 修改时间不早于源文件修改时间。
- 派生 PDF 文件头必须以 `%PDF` 开头。
- 若上述任一条件不满足，则重新转换。

安全边界：

- 前端只传 `material_id`。
- Rust 从 SQLite 读取 `stored_path`。
- 输入和输出均必须确认在当前资料库目录内。
- 不读取、不写入用户原始来源文件。
- 错误响应不包含绝对路径和转换器内部原文。

## 开发计划

V1.8 采用 A1-A6 分阶段推进。

| 阶段 | 主题 | 目标 | 主要工作 | 验收标准 | 建议 agent |
| --- | --- | --- | --- | --- | --- |
| A1 | 转换合同与依赖接入 | 固定 Office 转 PDF 的正式边界 | 接入 `office2pdf`；新增 Office 格式识别；固定派生 PDF 路径规则和缓存规则 | DOCX/PPTX/XLSX 被识别为可转换；旧格式仍 unsupported | `architect`、`rust-reviewer` |
| A2 | Rust 转换实现 | 只基于库内副本生成派生 PDF | 在 repository 预览链路中转换 Office；输入/输出路径校验；大小限制；稳定错误码 | 转换成功返回 `kind=Pdf` 和派生 PDF assetPath；失败不泄露路径 | `tdd-guide`、`security-reviewer` |
| A3 | 前端接入 | 复用现有 PDF 阅读器 | API decoder 保持兼容；Office 资料打开后进入 PDF 预览；unsupported 文案区分旧 Office | DOCX/PPTX/XLSX 可在详情页内阅读；旧 doc/ppt/xls 显示不支持 | `typescript-reviewer`、`react-reviewer` |
| A4 | 样本与回归测试 | 覆盖最小可用格式和失败路径 | 增加最小 DOCX/PPTX/XLSX 转换测试；库外路径、缺失副本、缓存复用测试 | Rust/前端目标测试通过 | `tdd-guide` |
| A5 | 真实 App 手测 | 验证真实 Office 文件质量 | 中文文件名、真实 PPTX/DOCX/XLSX、失败样本、重复打开缓存、断网流程 | 手测清单通过，质量问题记录为后续优化 | `e2e-runner` |
| A6 | 文档与发包收口 | 固定版本状态 | 更新进度、上下文、版本号；跑完整 release gate；生成 debug/release 包 | 自动化验证通过，版本号统一为 `1.8.0` | `doc-updater`、`build-error-resolver` |

## 测试策略

### P0 自动化测试

Rust：

- DOCX / PPTX / XLSX 扩展名识别为 Office 可转换格式。
- `.doc / .ppt / .xls` 不进入转换链路。
- 库外 `stored_path` 被拒绝。
- 缺失 Office 副本返回稳定错误。
- 转换输出以 `%PDF` 开头。
- 派生 PDF 路径在资料库内。
- 派生 PDF 新于源文件时复用缓存。
- 坏派生 PDF 缓存不会被复用，会重新转换。
- 派生 PDF 不会被资料库 stats/cleanup 当作 orphan。
- 删除 Office 资料时同步删除对应派生 PDF。
- 转换失败不返回本机路径。

前端：

- `previewMaterialFile` 收到 `kind = "pdf"` 后复用现有 PDF 预览。
- unsupported Office 旧格式显示“暂不支持预览这种资料”或更明确的 Office 不支持文案。
- UI 不展示 `storedPath`、AppData、盘符、UNC 路径或 asset URL。

### P1 手工测试

- 真实 PPTX：多页、中文内容、图片。
- 真实 DOCX：中文段落、标题、简单表格。
- 真实 XLSX：多列数据、中文表头。
- PPTX 横版和 XLSX 宽表格转 PDF 后，阅读区页面外框应匹配 PDF 真实宽高比。
- XLSX 转 PDF 应使用宽横向页面，避免真实表格被压成窄列；详情页首次打开仍应进入更适合表格阅读的缩放档位，旧的过低保存缩放不应继续压小内容。
- 中文文件名和空格文件名。
- 重复打开同一 Office 资料，确认不会明显重复等待转换。
- 转换失败后仍可返回资料列表，资料区不进入永久 loading。
- 断网状态下可转换和阅读。

## 验证命令

开发中窄回归：

```powershell
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

Set-Location 'G:\PRJ\计划软件Planassiant\app'
npm.cmd run tauri -- build --debug
npm.cmd run tauri -- build
```

依赖审查：

```powershell
Set-Location 'G:\PRJ\计划软件Planassiant\app'
npm.cmd audit --audit-level=high

Set-Location 'G:\PRJ\计划软件Planassiant\app\src-tauri'
cargo tree -i office2pdf
```

## 风险

### 转换质量不可完全保证

影响：真实 DOCX/PPTX/XLSX 的复杂布局可能和原文件不完全一致。

策略：V1.8 只承诺“可转换为 App 内可读 PDF”，不承诺像素级还原；复杂样本质量问题记录到后续版本。

### XLSX 版式可能被 PDF 转换压窄

影响：真实 XLSX 转出的 PDF 可能存在表格内容偏小、页面白边较多或文字被压成窄列的问题。

策略：V1.8 使用 `office2pdf 0.6.0` 的 `paper_size` 和 `landscape` 选项，对 XLSX 生成宽横向页面（1190.56pt x 841.89pt）；XLSX 派生 PDF 写入 `office-pdf-xlsx-wide-v1` 版本化缓存目录，避免复用旧窄版式缓存；前端识别 `.xlsx` 派生 PDF 后仍使用 140% 阅读缩放下限，普通 PDF 不受影响。

### 解析 Office 文件扩大攻击面

影响：Office 文件是压缩包和复杂文档结构，可能触发转换器 bug 或资源消耗。

策略：只处理 App 资料库内副本；限制输入大小；失败脱敏；不解析外部资源；后续视情况增加更细的 zip 条目数和超时隔离。

### 派生 PDF 增加资料库占用

影响：同一 Office 资料会额外生成 PDF，占用空间增加。

策略：派生文件放在 App 管理目录；V1.8 已将派生 PDF 纳入资料库 stats/cleanup 的引用判定，删除 Office 资料时同步删除对应派生 PDF。

## 当前验证结果

2026-06-15 已通过：

- `npm.cmd test`：11 个前端测试文件、159 个测试通过。
- `npm.cmd run typecheck`
- `npm.cmd run build`
- `cargo fmt --check`
- `cargo test`：81 个 Rust 测试通过。
- `cargo clippy -- -D warnings`
- `npm.cmd run tauri -- build --debug`
- `npm.cmd run tauri -- build`

补充修复：

- `PdfPreview` 已改为按当前 PDF 页真实宽高比计算页面外框，不再固定 A4 竖版比例。
- `PdfPreview.test.tsx` 新增横版 PDF 适配测试，覆盖 PPTX/XLSX 转换后更常见的横向或宽页面场景。
- `.xlsx` 派生 PDF 打开时使用 140% 阅读缩放下限，避免真实 XLSX 转 PDF 后内容被旧的 70% 等过低缩放继续压小；普通 PDF 继续尊重保存缩放。
- `PdfPreview.test.tsx` 覆盖初始缩放下限；`StudyDetailPage.test.tsx` 覆盖 XLSX 派生 PDF 抬升到 140% 和普通 PDF 保留 70%。
- XLSX 转换端使用宽横向自定义页面（1190.56pt x 841.89pt）改善真实表格被压成窄列的问题；XLSX 派生 PDF 写入 `.derived/office-pdf-xlsx-wide-v1`，旧 `.derived/office-pdf` XLSX 缓存不再复用。
- Rust 测试新增覆盖：XLSX 转换选项、XLSX 版本化缓存目录、DOCX/PPTX 默认转换选项不变、删除 XLSX 资料时同步清理新旧派生 PDF 缓存。

已生成 V1.8 产物：

- debug exe：`app/src-tauri/target/debug/studyseq.exe`
- debug MSI：`app/src-tauri/target/debug/bundle/msi/StudySeq_1.8.0_x64_en-US.msi`
- debug NSIS：`app/src-tauri/target/debug/bundle/nsis/StudySeq_1.8.0_x64-setup.exe`
- release exe：`app/src-tauri/target/release/studyseq.exe`
- release MSI：`app/src-tauri/target/release/bundle/msi/StudySeq_1.8.0_x64_en-US.msi`
- release NSIS：`app/src-tauri/target/release/bundle/nsis/StudySeq_1.8.0_x64-setup.exe`

## 推迟项

- 旧版 Office `.doc / .ppt / .xls`。
- Office 转换质量优化。
- 转换进度条和取消任务。
- 后台转换队列。
- 批量转换。
- 派生 PDF 独立管理 UI。
- Office 全文抽取和搜索。
- 外部 Office 打开兜底。
