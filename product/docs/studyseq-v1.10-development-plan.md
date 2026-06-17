# StudySeq / 知序 V1.10 开发计划

## 文档定位

本文件记录 StudySeq / 知序 V1.10.0 / V1.10.1 的开发计划。

- V1.10.0 主题是“基础手写笔记”。
- V1.10.1 只作为手写笔记稳定补丁。
- V1.11 的 PDF 页面手写批注必须复用 V1.10 的通用笔迹模型。
- 总路线见 [`studyseq-pre-v2-roadmap.md`](studyseq-pre-v2-roadmap.md)。

## 架构判断

V1.10 先抽象通用笔迹模型，V1.11 再复用并绑定 PDF 页。

核心边界：

- 前端只做 Canvas 交互、临时 UI 状态和调用 API。
- Rust command 负责输入校验、权限/归属校验、错误脱敏。
- repository 独占 SQLite 读写和删除级联。
- 笔迹数据进 SQLite，不进资料库 `.derived/`，因为它是用户创作数据，不是可重建缓存。

## 版本目标

V1.10.0：在学习内容详情页右侧笔记区新增“手写笔记”类型，支持创建、编辑、保存、删除基础笔迹。

V1.10.1：不新增产品能力，只修复 V1.10.0 真实使用中的稳定性、性能和数据边界问题。

## 成功口径

- 用户可在某个学习内容下新建手写笔记，关闭 App 后重新打开仍可编辑。
- 支持笔、橡皮、颜色、粗细、撤销、重做、清空、保存失败提示。
- 鼠标、触控板、普通手写笔可用；不承诺压感。
- 窗口缩放后笔迹位置不明显漂移。
- 删除学习内容会删除关联手写笔记。
- 现有纯文本笔记、资料阅读、PDF 页码/缩放、视频继续播放不回退。

## 范围

进入 V1.10.0：

- 新增手写笔记数据模型。
- 新增通用 stroke JSON schema。
- 新增轻量 Canvas 手写编辑器。
- 新增手写笔记 CRUD command 和前端 API。
- 详情页笔记区新增手写笔记入口，不新建“手写中心”。
- 支持基础工具：笔、橡皮、颜色、粗细、撤销、重做、清空、保存、删除。

进入 V1.10.1：

- 绘制性能收口。
- 保存并发和失败重试收口。
- 窗口缩放、分栏拖动、DPR 变化回归。
- 删除、重启、旧库升级回归。

不进入：

- 压感、笔倾斜、OCR、图形识别。
- 无限白板、多页白板、协作。
- 手写转文本、搜索手写内容。
- 手写笔记导出图片/PDF。
- PDF 页面批注。
- 云同步。

## 数据模型

当前库已到 `PRAGMA user_version = 6`，V1.10.0 建议升到 `7`。

新增表：

```sql
CREATE TABLE IF NOT EXISTS handwriting_notes (
  id TEXT PRIMARY KEY,
  learning_content_id TEXT NOT NULL,
  title TEXT NOT NULL,
  stroke_data_json TEXT NOT NULL,
  stroke_schema_version INTEGER NOT NULL DEFAULT 1,
  canvas_width REAL NOT NULL DEFAULT 1,
  canvas_height REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_handwriting_notes_learning_content
ON handwriting_notes(learning_content_id, updated_at DESC);
```

`stroke_data_json` 建议版本化：

```json
{
  "schemaVersion": 1,
  "coordinateSpace": "normalized",
  "strokes": [
    {
      "id": "uuid",
      "tool": "pen",
      "color": "#1f2937",
      "width": 0.006,
      "points": [
        { "x": 0.12, "y": 0.24, "t": 123 }
      ]
    }
  ]
}
```

建议限制：

- 单条手写笔记 JSON 2-5MB。
- stroke 2000 条。
- points 100000 个。
- 超限提示用户拆分或清理。

## Rust command / repository 边界

command：

- `list_handwriting_note_summaries(learning_content_id)`
- `get_handwriting_note(id)`
- `create_handwriting_note(input)`
- `update_handwriting_note(input)`
- `delete_handwriting_note(id)`

repository：

- 校验 `learning_content_id` 存在。
- 所有 SQL 参数化。
- 保存前校验 JSON 可解析、版本受支持、stroke/point/大小上限。
- 删除 `learning_contents` 时同事务删除 `handwriting_notes`。
- `LearningDetail` 可只带 summary，不带完整 `stroke_data_json`；选中某个手写笔记时再按需读取。

## 前端组件

- `HandwritingCanvas.tsx`：Canvas 绘制和 pointer events。
- `handwritingModel.ts`：stroke 数据、归一化坐标转换、undo/redo reducer。
- `HandwritingToolbar.tsx`：笔、橡皮、颜色、粗细、撤销、重做、清空、保存。
- `HandwritingNoteEditor.tsx`：装配 toolbar、canvas、保存状态。
- 详情页右侧笔记区保留现有文本笔记体验，新增手写笔记列表/入口。

## 保存策略

- UI 内保留未保存 stroke 状态。
- 用户停止绘制后 800-1200ms 防抖保存。
- 切换笔记、返回资料列表、关闭当前学习内容前触发一次 flush。
- 保存中显示轻量状态。
- 失败时保留 dirty 状态和重试按钮。
- 每次保存全量 JSON，V1.10 不做增量 stroke 日志。

## 坐标系统

- 使用归一化坐标：`x/y` 均为 `0..1`。
- stroke width 归一化到画布短边比例，渲染时乘以当前画布尺寸。
- 不保存屏幕像素、滚动位置或设备 DPR。
- `canvas_width/canvas_height` 只作为创建时参考比例和兼容调试。

## 开发计划

| 阶段 | 主题 | 主要工作 | 验收标准 | 建议 agent |
| --- | --- | --- | --- | --- |
| A1 | 数据模型和 migration | 新增手写笔记表、DTO、repository 测试 | 旧库升级成功，新库建表完整 | `database-reviewer`、`tdd-guide` |
| A2 | Rust command | 新增 CRUD command，校验 JSON 大小、stroke 数、point 数、学习内容归属 | 非法输入被拒绝，错误不泄露路径 | `rust-reviewer`、`security-reviewer` |
| A3 | 前端 API 和类型 | 增加手写笔记合同和 decoder | API payload 异常 fail fast | `typescript-reviewer` |
| A4 | Canvas 编辑器 | 实现笔、橡皮、颜色、粗细、撤销、重做、清空 | 基础绘制闭环可用 | `react-reviewer` |
| A5 | 详情页接入 | 在笔记区加入手写入口 | 不改变详情页主工作台结构 | `ui-ux-designer` |
| A6 | 保存与错误态 | 防抖保存、显式保存、dirty 状态、保存失败保留画布 | 失败不丢笔迹 | `tdd-guide` |
| A7 | 回归和真实 App 手测 | 自动化、debug/release App 手测 | 主线能力不回退 | `e2e-runner` |

V1.10.1 阶段：

- B1：Canvas 分层渲染、requestAnimationFrame、重绘范围优化。
- B2：保存并发串行化、最后一次保存优先、失败重试。
- B3：超限、空笔记、删除后切换、窗口缩放回归。
- B4：固定手写样本隔离 App 复测。

## 删除 / 迁移 / cleanup

- 删除学习内容：同事务删除 `handwriting_notes`。
- 删除纯文本笔记：不影响手写笔记。
- 资料库 cleanup：不处理手写笔记，因为它不在资料库文件系统。
- migration 失败：事务回滚，`user_version` 不提升。
- 发现损坏 `stroke_data_json` 时，不自动删除；返回“笔记数据损坏，无法打开”，保留记录供后续修复。

## 测试计划

Rust：

- v6 -> v7 migration。
- 新库直接建表。
- 创建、更新、删除手写笔记。
- 删除学习内容级联删除手写笔记。
- 非法 JSON、超大 JSON、越界坐标、未知版本被拒绝。
- 学习内容不存在返回稳定错误。

前端：

- API decoder。
- stroke reducer undo/redo。
- 坐标归一化转换。
- Canvas pointer 输入生成 stroke。
- 保存失败不清空当前画布。
- `StudyDetailPage.test.tsx` 覆盖文本笔记和手写入口互不破坏。

## 真实 App 手测

- 新建学习内容 -> 新建手写笔记 -> 画几笔 -> 重启恢复。
- 鼠标绘制、触控板绘制、手写笔基础输入。
- 缩放窗口、拖动详情页左右分栏后笔迹不漂移。
- 保存失败模拟后画布仍保留未保存内容。
- 删除手写笔记后重启仍不存在。
- 删除学习内容后手写笔记不残留。
- txt、图片、PDF、Office 派生 PDF、MP4/WebM、资料文件夹、纯文本笔记回归。

## 风险

- stroke JSON 过大导致保存卡顿：限制单条笔记大小、stroke 数和 point 数。
- 保存竞态导致丢最后一笔：V1.10.1 必须串行化保存并最后写入优先。
- DPR / 窗口变化导致漂移：全程归一化坐标，不存像素。
- 画布失败时用户误判已保存：保存状态必须明确，失败保留 dirty 状态。
- 损坏 JSON 自动删除会造成数据丢失：只提示损坏，不自动清理。

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
