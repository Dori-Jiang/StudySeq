# StudySeq / 知序 项目进度管理

## 管理规则

- 本文件由 `project_manager` 子智能体维护。
- 本文件用于记录项目进度、阶段状态、阻塞点、下一步和推迟项。
- 只记录稳定事实和已确认事项，不记录临时想法。
- `WORKING-CONTEXT.md` 不由 `project_manager` 管理。

## 当前阶段

已进入实现落地阶段。

`app/` 已跑通两个本地优先闭环：

```text
学习内容 -> SQLite -> 主页展示 -> 重启恢复
学习内容详情页 -> 导入资料 -> 创建纯文本笔记 -> 重启恢复
详情页轻量预览 -> 阅读页 -> txt/图片/PDF 预览 -> 笔记创建/选择/编辑 -> 阅读状态恢复
阅读体验收口 -> 预览关闭 -> 笔记自动保存 -> PDF 翻页/缩放 -> 返回详情前保存
```

## 已完成

- 产品命名已确认：中文 `知序`，英文 `StudySeq`。
- 产品策划书已完成：`product/docs/studyseq-product-plan.md`。
- 产品设计文档已完成：`product/docs/studyseq-product-design.md`。
- v1 技术文档已完成：`product/docs/studyseq-v1-technical-design.md`。
- 三个 HTML 概念原型已固定：
  - `product/design/homeConcept.html`
  - `product/design/detailConcept.html`
  - `product/design/readerConcept.html`
- 技术路线已确认：

```text
Tauri 2 + Vite + React + TypeScript + Rust + SQLite
```

- `project_manager` 子智能体已建立。
- `technical_lead` 子智能体已建立。
- `app/` 已建立 Tauri 2 + Vite + React + TypeScript + Rust + SQLite 最小骨架。
- 已实现学习内容创建、SQLite 持久化、主页列表展示。
- 已通过 Rust 测试验证学习内容创建后重新打开数据库仍可恢复。
- 已实现主页删除学习内容，删除前二次确认。
- 已实现学习内容详情页。
- 已实现资料导入到 App 本地资料库。
- 已实现同名资料文件导入时自动追加后缀。
- 已实现详情页根目录资料文件列表。
- 已实现纯文本笔记创建和详情页笔记列表。
- 已通过测试验证资料和笔记在数据库重启后可恢复。
- 已通过测试验证删除学习内容暂不级联删除资料和笔记。
- 已实现详情页资料轻量预览。
- 已实现阅读页最小闭环。
- 已实现 Rust 统一资料预览接口：txt、图片、PDF。
- 已实现阅读页笔记选择、创建和编辑。
- 已实现阅读状态保存：当前资料、当前笔记、分栏比例。
- 已通过 Rust 测试验证阅读状态在数据库重启后可恢复。
- 已实现详情页轻量预览关闭，关闭后完全清空预览。
- 已实现切换笔记前自动保存当前笔记。
- 已实现返回详情前自动保存当前笔记和阅读状态。
- 已实现 PDF 上一页、下一页、页码显示和缩放。
- 已配置并验证前端测试、类型检查、前端构建、Rust 测试、Rust fmt、Rust clippy、Tauri debug build。

## 进行中

- 项目准备进入真实 App 内资料预览和笔记自动保存手工验收。

## 阻塞点

- PDF.js 已构建通过，但仍需要在实际 Tauri App 内用真实多页 PDF 做人工验收。
- Codex App hooks 页面仍需重新 review/trust 已变更 hooks。

## 下一步

1. 用真实 txt、图片、多页 PDF 在 App 内做手工验收。
2. 验收笔记切换、返回详情前的自动保存。
3. 视使用情况补充资料删除、笔记删除、资料重命名、学习内容编辑。
4. 增强 PDF 搜索/目录和阅读状态粒度。
5. 继续保持验证命令：`npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run build`、`cargo fmt --check`、`cargo test`、`cargo clippy -- -D warnings`、`npm.cmd run tauri -- build --debug`。

## 推迟项

- 云同步。
- 账号系统。
- 自动进度检测。
- 日历中心布局。
- 复杂统计图表。
- 学习节点拆解。
- 复杂富文本编辑器。
- Markdown 或复杂富文本笔记。
- SQLite 加密。
- Office 资料预览。
- 视频资料预览。

## 风险

### Rust / SQLite 边界不清

影响：如果前端直接操作 SQLite，后续数据边界会混乱。

建议：v1 从一开始就通过 Rust command 统一访问 SQLite。

### 资料导入导致 App 占用空间增加

影响：资料越多，占用越大，后续备份、迁移和清理成本会上升。

建议：v1 明确采用导入模式，先记录原始路径和 App 内存储路径，后续预留资料库清理能力。

### App 内预览范围较大

影响：PDF、Office、视频、图片、网页、文本等学习资料都要求 App 内预览，会增加 v1 实现成本。

建议：先设计统一 preview adapter，按格式逐步实现；不能以系统外部打开替代主要阅读路径。

### 删除语义需要保持一致

影响：学习内容、资料、笔记如果联动删除不清楚，容易误删资料或笔记。

建议：v1 所有删除都二次确认；学习内容、资料、笔记按对象独立删除。

## 最近更新

- 2026-06-08：完成 `app/` 最小技术骨架和学习内容持久化闭环；Tauri debug build 已输出 MSI 和 NSIS 安装包。
- 2026-06-08：确认 v1 技术决策：纯文本笔记、资料导入到 App 本地资料库、学习资料必须 App 内预览、SQLite 暂不加密、删除二次确认且独立删除。
- 2026-06-08：建立本项目进度管理文档，并指定由 `project_manager` 子智能体维护。
- 2026-06-08：完成学习内容详情页、资料导入、纯文本笔记创建、删除学习内容和详情数据重启恢复闭环。
- 2026-06-08：完成阅读页最小闭环：详情页轻量预览、txt/图片/PDF App 内预览、笔记创建/选择/编辑、阅读状态保存。
- 2026-06-08：完成阅读体验收口与数据安全补强：预览关闭、笔记自动保存、PDF 翻页/缩放、返回详情前保存。
