# StudySeq / 知序 V1.9 开发计划

## 文档定位

本文件记录 StudySeq / 知序 V1.9.0 / V1.9.1 的开发计划。

- V1.9.0 主题是“代码文件载入与代码高亮”。
- V1.9.1 只作为代码预览稳定补丁，不扩大功能面。
- 总路线见 [`studyseq-pre-v2-roadmap.md`](studyseq-pre-v2-roadmap.md)。
- 总进度仍记录在 [`studyseq-project-progress.md`](studyseq-project-progress.md)。

当前状态（2026-06-16）：V1.9.0 已完成开发、subagent 复核、隔离真实 App 固定样本 smoke、完整 release gate 和 debug/release 发包。`e2e-runner` 复核并修正真实 App smoke 选择器口径；`security-reviewer` 未发现 Critical / High 阻断项，并推动移除前端 `dialog:default` capability。真实 App smoke 证据文件为 `C:\Users\123\AppData\Local\Temp\studyseq-v190-smoke-20260616215425\cdp-smoke-v2.json`。

## 版本目标

V1.9.0：在现有详情页学习工作台中，让常见代码文件作为资料进入 App 内只读预览，并支持代码高亮、行号、横向滚动和纯文本兜底。

V1.9.1：围绕 V1.9.0 的代码预览做稳定补丁，重点收口大文件、多编码、中文路径、HTML 注入安全、主题可读性和降级体验。

## 成功口径

- 代码资料仍通过“导入资料 -> App 管理副本 -> 详情页内嵌阅读”主线打开。
- 不恢复 `/studies/:studyId/read`，不新建代码中心或独立阅读页。
- 前端仍只调用 Tauri invoke，不直接读文件系统。
- Rust repository 负责文件类型判断、资料库边界校验、读取、编码识别、大小限制和语言推断。
- SQLite 不新增表，不提升 `PRAGMA user_version`；语言信息预览时动态推断。
- Rust 不返回高亮 HTML，只返回代码文本和元数据。
- 前端高亮失败、语言不支持、文件过大或解码不确定时，降级为等宽纯文本。
- 代码内容包含 `<script>`、HTML 标签、事件属性等字符串时，只按文本显示，不执行、不注入 DOM。
- txt、图片、PDF、Office 派生 PDF、MP4/WebM、资料文件夹、搜索、继续学习、笔记不回退。

## 范围

进入 V1.9.0：

- 支持常见代码扩展名识别和只读预览。
- 新增 `code` 资料预览类型。
- 新增 `CodePreview` 前端组件。
- 新增前端高亮库，按固定语言白名单加载。
- 复用现有 `encoding_rs` / `chardetng` 多编码链路。
- 大文件禁用高亮并截断预览，避免主线程卡死。
- 补充 Rust repository、API decoder、组件和详情页回归测试。

进入 V1.9.1：

- 修复真实样本中的语言识别、编码、性能和展示问题。
- 收口大文件阈值、行号性能、错误文案、主题对比度。
- 补充固定样本真实 App 手测和 release gate。

不进入：

- IDE、编辑、保存代码、运行代码、调试、终端、LSP、代码补全。
- Git diff、仓库浏览、项目树、跨文件跳转。
- 全文搜索、代码搜索、符号搜索。
- Markdown / 富文本笔记。
- 代码执行或脚本解释。
- 所有语言全覆盖。
- 代码预览设置中心、多主题切换。
- 云同步、账号、多端。
- 旧独立阅读页。

## 高亮库原则

V1.9.0 推荐采用 `prismjs`：

- `app/package.json` 新增 `prismjs`。
- 如 TypeScript 需要，新增 `@types/prismjs`；若类型覆盖不足，用本地最小声明替代。
- 只使用 Prism token stream 转 React 节点，不使用 `dangerouslySetInnerHTML`。
- 不使用 `Prism.highlightAll` 自动扫描 DOM。
- 不加载远程语法包、主题或 worker。
- 只注册 V1.9 白名单语言，避免包体和性能失控。
- 高亮异常必须 catch 并回退纯文本。

不优先选 Shiki：高亮质量更接近 VS Code，但默认 HTML 输出、主题/语言/引擎和包体复杂度更高，更适合作为后续质量升级备选。

## 语言范围

V1.9.0 承诺高亮：

- Web：`ts`、`tsx`、`js`、`jsx`、`html`、`css`、`json`
- 后端 / 系统：`py`、`rs`、`go`、`java`、`cs`
- C 系：`c`、`h`、`cpp`、`hpp`
- 配置：`yaml`、`yml`

V1.9.0 只做纯文本兜底，不承诺高亮：

- `toml`、`xml`、`sql`、`sh`、`ps1`、`md`、无扩展文件、未知扩展文件。

V1.9.1 原则上不扩语言范围；只有别名漏判或白名单内语言识别错误才修。

## 涉及文件 / 模块

Rust：

- `app/src-tauri/src/models.rs`：`MaterialPreviewKind` 增加 `Code`；`MaterialPreview` 增加代码元数据字段。
- `app/src-tauri/src/repository.rs`：扩展格式判断、语言推断、代码读取上限、多编码解码和 repository 测试。
- `app/src-tauri/src/errors.rs`：必要时新增代码预览稳定错误。
- `app/src-tauri/src/commands.rs`：command 签名不变，只补 command 层回归测试。
- `app/src-tauri/Cargo.toml` / `Cargo.lock` / `tauri.conf.json`：仅版本号更新；不新增 Rust 依赖。

前端：

- `app/src/shared/types.ts`：扩展 `MaterialPreviewKind` 和 `MaterialPreview`。
- `app/src/shared/api/learningContentApi.ts`：补 decoder 运行时校验。
- `app/src/pages/MaterialPreviewPane.tsx`：新增 `preview.kind === "code"` 分支。
- `app/src/pages/code/CodePreview.tsx`：只读代码视图。
- `app/src/pages/code/codeHighlighter.ts`：Prism 语言注册、token 到 React 节点转换、异常兜底。
- `app/src/pages/code/codeLanguages.ts`：扩展名 / MIME / Prism language 映射。
- `app/src/pages/StudyDetailPage.tsx`：尽量不改主结构，只接入现有预览状态。
- `app/src/styles.css`：代码预览样式、行号、横向滚动、截断提示。
- `app/package.json` / `package-lock.json`：新增前端高亮依赖和版本号。

## 数据合同

`preview_material_file(materialId)` command 不新增参数。

`MaterialPreview.kind` 新增：

```ts
"code"
```

`MaterialPreview` 建议新增字段：

```ts
language: string | null
languageLabel: string | null
lineCount: number | null
isTruncated: boolean
highlightingMode: "highlight" | "plain_too_large" | "plain_unknown_language" | "plain_decode_lossy" | null
```

合同规则：

- `text`：代码文本或截断后的代码文本。
- `language`：前端高亮库使用的稳定 id，例如 `typescript`、`tsx`、`python`、`rust`。
- `languageLabel`：UI 展示用，例如 `TypeScript`、`Rust`。
- `encoding`：沿用现有字段。
- `isTruncated`：文件超过预览上限时为 `true`。
- Rust 返回的 `text` 永远是普通字符串，不包含可信 HTML。
- `assetPath`、`dataUrl` 对 `code` 固定为 `null`。

大文件初始阈值：

- `<= 1MB`：允许高亮。
- `1MB - 2MB`：只显示纯文本，禁用高亮。
- `> 2MB`：只读取前 2MB 或前 20000 行，纯文本截断显示。

## 开发计划

| 阶段 | 主题 | 主要工作 | 验收标准 | 建议 agent |
| --- | --- | --- | --- | --- |
| A1 | Rust 预览合同 | 扩展 `MaterialPreviewKind::Code`、预览 DTO、语言白名单、读取上限 | Rust 能返回稳定 `code` 预览 payload | `architect`、`rust-reviewer` |
| A2 | 类型判断与编码 | MIME 优先、octet-stream 回退副本扩展名；覆盖 UTF-8/GBK/UTF-16/lossy | 重命名显示名不影响代码预览判断 | `tdd-guide` |
| A3 | 前端 API | decoder 校验新增字段，非法 payload fail fast | API 测试覆盖 code payload | `typescript-reviewer` |
| A4 | CodePreview | 行号、横向滚动、复制、截断提示、纯文本兜底 | 不撑破详情页布局，不使用 HTML 注入 | `react-reviewer`、`security-reviewer` |
| A5 | 回归与安全 | 回归现有资料预览；检查 `dangerouslySetInnerHTML`、依赖 audit | txt/PDF/Office/视频/笔记不回退 | `security-reviewer` |
| A6 | 发包收口 | 版本号、文档、debug/release 包 | release gate 全绿 | `doc-updater`、`build-error-resolver` |

阶段状态（2026-06-16）：

- A1-A6 已完成。
- 完整 release gate 已通过：`npm.cmd test`（12 文件、173 测试）、`npm.cmd run typecheck`、`npm.cmd run build`、`npm.cmd audit --audit-level=high`、`rg "dangerouslySetInnerHTML" src` 无命中、`cargo fmt --check`、`cargo test`（93 测试）、`cargo clippy -- -D warnings`、Windows 子系统静态检查、`npm.cmd run tauri -- build --debug`、`npm.cmd run tauri -- build`。
- debug/release 产物已生成：`app/src-tauri/target/debug/studyseq.exe`、`app/src-tauri/target/debug/bundle/msi/StudySeq_1.9.0_x64_en-US.msi`、`app/src-tauri/target/debug/bundle/nsis/StudySeq_1.9.0_x64-setup.exe`、`app/src-tauri/target/release/studyseq.exe`、`app/src-tauri/target/release/bundle/msi/StudySeq_1.9.0_x64_en-US.msi`、`app/src-tauri/target/release/bundle/nsis/StudySeq_1.9.0_x64-setup.exe`。

V1.9.1 阶段：

- B1：补真实样本暴露的 Rust 类型识别、多编码、截断和错误文案问题。
- B2：补前端高亮异常、纯文本兜底、主题对比度、超长行和行号性能问题。
- B3：固定样本真实 App 复查、版本号 `1.9.1`、文档和发包收口。

## 测试计划

Rust：

- 覆盖 `.ts/.tsx/.js/.jsx/.py/.rs/.go/.java/.cpp/.c/.h/.cs/.json/.yaml/.html/.css` 识别。
- MIME 优先、octet-stream 回退、显示名重命名后不漂移。
- UTF-8、BOM、UTF-16LE/BE、GBK/GB18030、lossy fallback。
- 大文件只读上限内内容，返回 `isTruncated=true`，不整文件搬运。
- 库外 `stored_path` 返回稳定错误，不读取。
- unknown ext 走 unsupported 或 text/plain 兜底，不误判代码。
- code 预览记录最近打开，删除资料仍只删 App 管理副本。

前端：

- `learningContentApi.test.ts` 覆盖 `code` payload decoder。
- `CodePreview.test.tsx` 覆盖高亮、纯文本兜底、截断提示、复制按钮、超长行。
- 注入样本：`<script>alert(1)</script>`、`<img src=x onerror=alert(1)>`、`</span><script>`。
- 模拟 Prism 抛错，断言回退纯文本。
- `MaterialPreviewPane` / `StudyDetailPage` 覆盖 code 分支和现有格式不回退。

安全检查：

- `rg "dangerouslySetInnerHTML" app/src` 确认 `CodePreview` 不使用。
- `npm.cmd audit --audit-level=high` 检查新增依赖。
- code review 重点看 HTML 注入、路径泄露、大文件读取和错误文案脱敏。

## 真实 App 手测

- 导入并打开：`.ts`、`.tsx`、`.py`、`.rs`、`.json`、`.yaml`、`.html`、`.css`。
- 中文路径、中文文件名、空格文件名、长文件名。
- 中文注释 UTF-8、GBK/GB18030、UTF-16LE/BE。
- HTML 文件包含 `<script>`、`onerror`、闭合标签逃逸文本，确认不执行。
- 1MB 内代码高亮正常。
- 1MB 以上文件降级纯文本，不明显卡顿。
- 2MB 以上文件截断提示明确，App 不假死。
- 未知扩展 / 无扩展文件显示纯文本或 unsupported，不崩溃。
- 重命名代码资料后仍按原 App 副本类型预览。
- 删除代码资料只删除 App 管理副本，不删除原始来源文件。
- 断网状态下代码预览可用。
- 回归 PDF 页码/缩放、Office 派生 PDF、视频继续播放、资料搜索、笔记保存、文件夹返回位置。
- MSI/NSIS 安装包启动无黑色控制台窗口。

## 风险

- 高亮库 HTML 注入风险：只使用 token stream 转 React 节点，禁止 `dangerouslySetInnerHTML`。
- 大文件卡顿：Rust 限制读取，前端限制高亮阈值，超过阈值纯文本截断。
- 多编码误判：保留 `encoding` 展示和 lossy 标记，无法可靠识别时用纯文本兜底。
- 语言范围膨胀：V1.9.0 固定白名单，V1.9.1 不新增语言。
- 包体增长：只注册白名单语言；新增依赖后检查 build 产物和 audit。
- 类型判断漂移：沿用 V1.8.1 的 MIME 优先原则，显示名变化不影响预览判断。
- DOM 过大：截断行数和字节数，超长行横向滚动，不做虚拟化。
- 错误路径泄露：错误文案不返回 AppData、盘符、UNC、asset URL。

## 验证命令

```powershell
Set-Location 'G:\PRJ\计划软件Planassiant\app'
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd audit --audit-level=high
rg "dangerouslySetInnerHTML" src

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
