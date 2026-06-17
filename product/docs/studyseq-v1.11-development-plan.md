# StudySeq / 知序 V1.11 开发计划

## 文档定位

本文件记录 StudySeq / 知序 V1.11.0 / V1.11.1 的开发计划。

- V1.11.0 主题是“PDF 页面手写批注”。
- V1.11.1 只作为 PDF 批注稳定补丁。
- V1.11 必须复用 V1.10 的通用笔迹模型。
- 总路线见 [`studyseq-pre-v2-roadmap.md`](studyseq-pre-v2-roadmap.md)。

## 架构边界

- PDF 批注只叠加在现有详情页 `PdfPreview`。
- 不恢复 `/studies/:studyId/read`。
- 不改写原 PDF。
- 不把批注写入 `.derived/`，因为批注是用户内容，不是可重建缓存。
- 前端只做 Canvas 交互和 API 调用；Rust command / repository 负责校验、持久化和删除清理。

## 版本目标

V1.11.0：在详情页当前 `PdfPreview` 页面上直接手写批注，批注按资料和页码持久化。

V1.11.1：只修复 V1.11.0 的坐标、保存、删除和 Office 派生 PDF 回归问题，不新增批注产品形态。

## 成功口径

- 用户在 PDF 当前页进入批注模式后可手写、擦除、撤销、重做、清除当前页、保存。
- 批注按 `material_id + page_number` 隔离。
- 缩放、翻页、目录跳转、中键拖动后批注不明显漂移。
- 多个 PDF 之间批注不串用。
- Office 派生 PDF 可叠加批注，但不改写 Office 源文件或派生 PDF。
- 删除 PDF 资料、Office 源资料、资料文件夹或学习内容时，关联批注被清理。
- 不导出带批注 PDF，不改写原 PDF。
- V1.8.1 的 PDF 页码、缩放、目录和 Office 派生 PDF 主线不回退。

## 范围

进入 V1.11.0：

- 新增 PDF 页批注数据模型。
- 新增按 `material_id + page_number` 读取、保存、删除批注的 repository / command。
- 在 `PdfPreview` 页面层叠加批注 Canvas。
- 增加阅读 / 批注模式、显示 / 隐藏批注、清除当前页。
- 翻页前 flush 当前页批注，防止快速切页丢笔迹。
- 删除资料、文件夹、学习内容时清理批注。

进入 V1.11.1：

- 坐标漂移复查。
- 快速绘制、快速翻页、关闭 App 后最后一次批注不丢。
- Office 派生 PDF、XLSX 宽页、横版 PDF 回归。
- 删除和 cleanup 链路无孤儿批注。
- PDF 阅读性能不明显下降。

不进入：

- 改写原 PDF。
- 导出带批注 PDF。
- 评论气泡、签名、图章、高亮文本选择。
- OCR、全文搜索、批注搜索。
- 协作批注、云同步。
- PDF 多页连续滚动批注。
- 压感和笔倾斜。

## 数据模型

如果 V1.10.0 用 `user_version = 7`，V1.11.0 建议升到 `8`。

新增表：

```sql
CREATE TABLE IF NOT EXISTS pdf_page_annotations (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  stroke_data_json TEXT NOT NULL,
  stroke_schema_version INTEGER NOT NULL DEFAULT 1,
  page_width REAL NOT NULL,
  page_height REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(material_id, page_number)
);

CREATE INDEX IF NOT EXISTS idx_pdf_page_annotations_material
ON pdf_page_annotations(material_id, page_number);
```

说明：

- 独立于 `material_reading_states`，因为阅读状态是“当前位置”，批注是“用户内容”。
- 批注绑定源 `material_id`，不是派生 PDF 路径。
- `page_width/page_height` 来自 PDF 页面标准 viewport，用于兼容和漂移排查。

## 接口合同

建议 command：

- `get_pdf_page_annotation(material_id, page_number) -> Option<PdfPageAnnotation>`
- `save_pdf_page_annotation(input) -> PdfPageAnnotation`
- `delete_pdf_page_annotation(material_id, page_number)`

repository 内部 helper：

- `delete_pdf_annotations_for_material(material_id)`
- 删除学习内容或资料子树时批量清理批注。

输入字段：

- `materialId`
- `pageNumber`
- `pageWidth`
- `pageHeight`
- `strokeData`

Rust 边界：

- command 不接文件路径，只接 `material_id/page_number`。
- repository 校验 material 存在、kind 为 file、属于当前 DB。
- 保存前校验 page_number >= 1、page 尺寸 > 0、stroke JSON 版本和大小。
- 不把批注写入 PDF 文件，也不写 `.derived/`。
- 删除 material subtree 时，同事务删除 `pdf_page_annotations`。
- 删除学习内容时删除其所有 material 关联批注。

## 前端组件

- `PdfAnnotationLayer.tsx`：叠加在 `pdf-page-sheet` 内，尺寸跟随 `sheetWidth/sheetHeight`。
- `PdfAnnotationToolbar.tsx`：批注模式、显示/隐藏、笔、橡皮、颜色、粗细、撤销、重做、清除当前页。
- `pdfAnnotationApi.ts` 或并入现有 `learningContentApi.ts`。
- `pdfAnnotationModel.ts`：复用 V1.10 stroke 模型。
- `PdfPreview` 增加可选 props：`materialId`、`annotationEnabled`、`showAnnotations`、`onAnnotationSaveStateChange`。
- `MaterialPreviewPane` 只在 `preview.kind === "pdf"` 时传入批注能力。

## 保存策略

- 当前页批注按页加载，翻页时先 flush 当前页，再加载目标页。
- 防抖保存 800-1200ms。
- 清除当前页时，推荐空 strokes 删除该页记录，减少 DB 体积。
- 保存失败时保留画布状态，批注模式按钮显示未保存状态。
- 翻页时若当前页保存失败，提醒继续翻页可能丢失未保存修改，但不要卡死阅读。
- 不把 PDF 阅读状态和批注保存绑成一个 API；页码/缩放继续用 `material_reading_states`。

## 坐标系统

- 使用 PDF 页面归一化坐标。
- `x = pointerX / displayedPageWidth`
- `y = pointerY / displayedPageHeight`
- width 使用页面短边归一化比例。
- 渲染时按当前 `sheetWidth/sheetHeight` 转回像素。
- 不保存滚动位置、缩放比例或 canvas 像素。
- Office 派生 PDF 重新生成后页尺寸变化可能导致旧批注轻微漂移，V1.11.1 做稳定复查。

## 开发计划

| 阶段 | 主题 | 主要工作 | 验收标准 | 建议 agent |
| --- | --- | --- | --- | --- |
| C1 | PDF 批注 schema | 新增 `pdf_page_annotations`，复用 stroke JSON | migration 可从 v7 升到 v8 | `database-reviewer` |
| C2 | repository / command | 按 material/page 读取保存删除；校验资料可预览为 PDF | 非 PDF 资料不能保存批注 | `rust-reviewer`、`security-reviewer` |
| C3 | PdfPreview 叠加层 | 在 `.pdf-page-sheet` 内叠加 annotation canvas | 页面缩放后对齐 | `react-reviewer` |
| C4 | 模式控制 | 阅读/批注模式、显示/隐藏、清除当前页 | 阅读操作不被批注层误拦截 | `ui-ux-designer` |
| C5 | 保存链路 | 翻页前 flush，防抖保存，失败提示 | 快速翻页不丢批注 | `tdd-guide` |
| C6 | 删除 / cleanup | 删除资料、文件夹、学习内容时清理批注 | DB 无孤儿批注 | `database-reviewer` |
| C7 | 回归手测 | PDF 页码、缩放、目录、Office 派生 PDF 回归 | V1.8.1 / V1.2 主线不退 | `e2e-runner` |

V1.11.1 阶段：

- D1：固定样本对比缩放、横版、目录跳转，确认坐标偏移可接受。
- D2：保存队列、最后写入优先、页面切换 flush。
- D3：Office 派生 PDF、XLSX 宽页、普通 PDF 混合回归。
- D4：子树删除、学习内容删除、orphan cleanup。
- D5：自动化 + 真实 App 固定样本 release gate。

## 删除 / 迁移 / cleanup

- 删除单个资料：删除 `material_reading_states` 后，同时删除 `pdf_page_annotations`。
- 删除文件夹：对子树所有 file 批量删除批注。
- 删除学习内容：删除该学习内容下所有资料批注、手写笔记、文本笔记和资料记录。
- 资料库迁移：不需要迁移批注文件，因为批注在 SQLite。
- cleanup：增加 DB orphan 清理，删除找不到 `material_items.id` 的 `pdf_page_annotations`。
- PDF 资料重命名：保留批注，因为 `material_id` 不变。
- PDF 资料移动文件夹：保留批注。
- PDF 资料重新导入为新资料：不继承旧批注。

## 测试计划

Rust：

- v7 -> v8 migration。
- 保存/读取同一 material 不同页批注。
- 多 material 批注隔离。
- 非 PDF material 保存批注被拒绝。
- 删除 material / folder / learning content 清理批注。
- orphan annotation cleanup。

前端：

- `PdfAnnotationLayer` 坐标转换。
- 缩放后 stroke 对齐。
- 翻页加载不同批注。
- 目录跳转后加载目标页批注。
- 阅读模式下中键拖动、Ctrl 滚轮不被批注层拦截。
- 批注模式下 pointer 绘制不触发 PDF pan。
- `PdfPreview.test.tsx` 覆盖目录、页码、缩放、横版 PDF。
- `StudyDetailPage.test.tsx` 覆盖打开 PDF 后批注入口。

## 真实 App 手测

- 普通 PDF 第 1 页/第 2 页分别批注，重启后仍隔离。
- 缩放 80%、100%、160% 下批注不漂移。
- 中键拖动后继续批注，位置正确。
- 目录跳转后目标页批注正确加载。
- 横版 PDF 批注位置正确。
- Office DOCX/PPTX/XLSX 派生 PDF 可批注；重复打开缓存后批注仍在。
- 删除 PDF 资料后批注不残留。
- 删除包含 PDF 的文件夹后批注不残留。
- 删除学习内容后批注和手写笔记都不残留。
- 断网状态下 PDF 阅读和批注可用。
- 安装包启动无控制台窗口，release/debug 均可打开批注。

## 风险

- PDF.js 不同页面尺寸、旋转页、横版页会放大坐标误差。
- Office 派生 PDF 重新生成后页数或页面尺寸变化，旧批注可能无法完全对齐。
- Canvas 大量 stroke 可能影响 PDF 缩放和翻页性能。
- 保存竞态可能导致旧页保存覆盖新页状态，必须用 `material_id + page_number` 和保存队列隔离。
- 批注模式可能破坏现有中键拖动、Ctrl 滚轮缩放，需要重点回归。

## 验证命令

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
npm.cmd audit --audit-level=high
npm.cmd run tauri -- build --debug
npm.cmd run tauri -- build
```
