# StudySeq / 知序 V2 前开发路线

## 定位

本路线记录 2026-06-16 确认的版本边界：代码高亮、基础手写笔记、PDF 页面手写批注和更多视频格式播放必须在 V2.0 之前完成；V2.0 之后主线转为当前能力的稳定性修复。

V2.0 不是继续追加大功能的版本，而是功能冻结后的稳定发布。

详细开发计划：

- V1.9：[`studyseq-v1.9-development-plan.md`](studyseq-v1.9-development-plan.md)
- V1.10：[`studyseq-v1.10-development-plan.md`](studyseq-v1.10-development-plan.md)
- V1.11：[`studyseq-v1.11-development-plan.md`](studyseq-v1.11-development-plan.md)
- V1.12：[`studyseq-v1.12-development-plan.md`](studyseq-v1.12-development-plan.md)
- V1.13 / V2.0：[`studyseq-v1.13-v2.0-release-plan.md`](studyseq-v1.13-v2.0-release-plan.md)

## 总原则

- 继续以详情页作为主学习工作台，不恢复旧独立阅读页。
- 新能力都服务“资料阅读 + 笔记 + 继续学习”，不新建代码中心、手写中心、PDF 中心或视频中心。
- 前端继续只通过 Tauri `invoke` 调 Rust command；SQLite 只由 Rust repository 访问。
- 涉及派生文件时统一放在资料库 `.derived/` 下，并纳入资料库统计、迁移、清理和删除链路。
- 每个功能版本都要保留降级路径：新预览失败时不破坏已有 txt、图片、PDF、Office 派生 PDF、MP4/WebM 和笔记主线。

## 版本路线

| 版本 | 主题 | 目标 | 主要不做 |
|---|---|---|---|
| V1.8.2 | 预留稳定补丁 | 只在 V1.8.1 真实使用出现阻塞问题时切出 | 不做新能力 |
| V1.9.0 | 代码文件载入与高亮 | 常见代码文件作为资料进入 App 内阅读，支持只读高亮 | 不做 IDE、编辑、运行、调试、Git |
| V1.9.1 | 代码预览稳定补丁 | 大文件、多编码、中文路径、主题和降级体验收口 | 不扩语言范围到失控 |
| V1.10.0 | 基础手写笔记 | 在学习内容下创建、编辑和保存基础手写笔记 | 不做压感、OCR、无限白板、协作 |
| V1.10.1 | 手写笔记稳定补丁 | 绘制性能、窗口缩放、删除和旧库升级回归 | 不接 PDF 页面批注 |
| V1.11.0 | PDF 页面手写批注 | 在当前 `PdfPreview` 页上直接手写，批注按资料和页码持久化 | 不改写原 PDF、不导出带批注 PDF |
| V1.11.1 | PDF 批注稳定补丁 | 缩放、翻页、目录跳转、Office 派生 PDF 和删除清理回归 | 不做评论气泡、签名、协作批注 |
| V1.12.0 | 更多视频格式技术定版 + 第一批支持 | 明确转码/播放路线，完成第一批可交付格式 | 不做剪辑、字幕系统、播放列表 |
| V1.12.1 | 视频格式扩展稳定补丁 | 大文件、长视频、缓存损坏、磁盘不足、继续播放回归 | 不承诺所有历史格式 |
| V1.13.0 | V2 前功能冻结 | 不加功能，只做四项能力全量回归、旧库升级和发布候选 | 不换 UI 主结构、不换资料库架构 |
| V2.0 | 稳定发布 | 发布 V2 稳定包，确认 V2 后进入 `2.0.x` 稳定修复线 | 不新增产品能力 |

## V1.9：代码文件载入与高亮

目标：代码资料作为正式资料类型进入详情页内嵌阅读区。

范围：

- 识别常见代码扩展名，例如 `ts`、`tsx`、`js`、`jsx`、`py`、`rs`、`go`、`java`、`cpp`、`c`、`h`、`cs`、`json`、`yaml`、`html`、`css`。
- 扩展资料预览合同，新增代码预览类型或在文本预览中返回 `language` 元数据。
- 新增 `CodePreview`，支持语法高亮、行号、复制、横向滚动和高亮失败降级。
- 继续复用现有文本编码检测和大小限制。

技术边界：

- 可新增一个离线、本地打包的前端高亮库；不要引入 IDE 级依赖。
- 高亮输出必须安全渲染，不能把代码内容当 HTML 注入。
- Rust 继续负责读取、编码识别、大小限制和语言推断，前端不直接读文件系统。

验收重点：

- UTF-8、GBK、中文注释、长文件、未知扩展和无扩展文件。
- 高亮失败能降级为等宽纯文本。
- 删除资料仍只删除 App 管理副本，不影响原始文件。

## V1.10：基础手写笔记

目标：学习内容下可以创建和编辑基础手写笔记，不要求压感。

范围：

- 新增手写笔记数据模型，建议独立于现有纯文本笔记。
- 笔迹用版本化 JSON 保存，坐标使用归一化坐标。
- 前端新增轻量 Canvas 手写编辑器。
- 支持笔、橡皮、颜色、粗细、撤销、重做、清空、保存和删除。
- 保存失败时保留当前 UI 状态，避免用户误以为已落盘。

技术边界：

- 优先使用 Canvas + Pointer Events，不先引入重型白板库。
- Rust command 负责校验 stroke 数量、点数量、JSON 大小和所属学习内容。
- 需要 SQLite migration，先做 repository 测试，再接 command 和前端。

验收重点：

- 鼠标、触控板和手写笔基础输入。
- 重启后笔迹仍在，窗口缩放后不明显漂移。
- 删除学习内容时关联手写笔记处理符合删除规则。

## V1.11：PDF 页面手写批注

目标：在当前 PDF 阅读页上直接手写批注，并按资料和页码持久化。

范围：

- 复用 V1.10 的笔迹模型和基础绘制工具。
- 新增 PDF 页批注数据，按 `material_id + page_number` 隔离。
- 在现有 `PdfPreview` 上叠加批注 Canvas。
- 支持阅读 / 批注模式切换、显示 / 隐藏批注、清除当前页批注和保存失败提示。
- 删除 PDF 资料、Office 源资料或学习内容时清理对应批注。

技术边界：

- 批注绑定原始资料 id 和页码，不直接写回原 PDF。
- 坐标存 PDF 页面归一化坐标或 PDF point，不存屏幕像素。
- Office 派生 PDF 可以复用批注能力，但要确认派生 PDF 重新生成后页码和尺寸的稳定性。

验收重点：

- 缩放、翻页、目录跳转、中键拖动后批注不明显漂移。
- 多 PDF 批注互不串用。
- V1.8.1 的 PDF 页码、缩放、目录和 Office 派生 PDF 主线不回退。

## V1.12：更多视频格式

目标：在不破坏现有 MP4/WebM 的前提下，支持更多本地视频格式。

建议成功口径：

- 第一批优先评估 `mov`、`m4v`、`mkv`、`avi`。
- `wmv`、`flv`、`rm`、`rmvb` 只有在转码依赖、许可证、包体和真实样本验证通过后再进入承诺清单。

范围：

- 完善 Rust 侧视频 MIME 和扩展名识别。
- 设计派生可播缓存，例如 `.derived/video-mp4-v1/<material_id>.mp4`。
- WebView2 不能直接播放的格式，走本地转码为 MP4 后复用现有 `VideoPreview`。
- 派生视频缓存纳入资料库统计、迁移、清理和删除。
- 转码失败、缓存损坏、磁盘空间不足都进入稳定错误终态。

技术边界：

- 不要继续假设 WebView 原生 `<video>` 能覆盖 MKV、AVI、WMV、RMVB 等格式。
- 如引入 FFmpeg 或等价能力，必须先做许可证、包体、Windows 打包、性能和安全审查。
- 执行本地转码时必须使用参数数组，不拼接 shell 命令字符串。

验收重点：

- 每个承诺支持格式至少 2 个真实样本通过。
- 大文件、长视频、中文文件名、断网和重启恢复。
- 视频继续播放位置不回退，MP4/WebM 稳定路径不受影响。

## V1.13 与 V2.0

V1.13.0 是 V2 前功能冻结版本，只做发布候选和全量回归：

- 从 V1.8.1 真实库升级到最新库的迁移测试。
- 代码、高亮、手写笔记、PDF 批注和视频扩展互相回归。
- 学习内容、资料、笔记、手写笔记、PDF 批注和派生视频的删除链路确认。
- 资料库迁移、cleanup、离线模式、安装包启动和 release gate 回归。

V2.0 进入条件：

- 四项能力都已在 V1.x 完成并通过真实 App 验收。
- 自动化 release gate 全绿。
- V1.8.1 核心流程零回归。
- P0/P1 问题为 0，P2 有明确延期记录。

V2.0 之后：

- 只开 `2.0.1`、`2.0.2` 这类稳定修复版本。
- 修复方向包括崩溃、数据迁移、预览失败、性能、打包、错误提示、清理和兼容性。
- 不再塞新的产品能力。

## 通用验证命令

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

新增依赖后补跑：

```powershell
Set-Location 'G:\PRJ\计划软件Planassiant\app'
npm.cmd audit --audit-level=high

Set-Location 'G:\PRJ\计划软件Planassiant\app\src-tauri'
cargo tree
```

`cargo-audit` 本机可用时，V2 前也应补跑。
