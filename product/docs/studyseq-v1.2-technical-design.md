# StudySeq / 知序 V1.2 技术设计

## 文档定位

本文件是 V1.2 的技术设计文档，承接 `studyseq-v1.2-prd.md` 的范围定稿（PDF 目录、视频播放、资料文件夹），给出实现方案、阶段划分、文件级改动清单与测试策略。实现时以本文件为基线；与代码现状冲突时，以实际代码核对后修正本文件。

## 概述

V1.2 在现有 Tauri 2 + React + Rust + SQLite 主线上交付三项能力：PDF 目录（大纲）、视频播放（MP4/WebM）、资料文件夹。实现顺序遵循 PRD 定稿：先无迁移低风险的 PDF 目录，再纯增量的视频播放，最后做触及数据模型与详情页结构的资料文件夹。

现状关键事实（已核对代码）：

- 数据库当前 `PRAGMA user_version = 3`；`material_items` 表**没有** `parent_id` 和 `kind` 列，且 `original_path` / `stored_path` 为 `NOT NULL`（`app/src-tauri/src/repository.rs` 第 841-851 行附近）。落地文件夹必须做一次**表重建式迁移**（SQLite 无法 ALTER 去掉 NOT NULL）。
- PDF 预览走 `preview_material_file` 返回 data URL，前端 `MaterialPreviewPane.tsx`（460 行）内含完整 PdfPreview 实现；data URL 方案对视频不可行，`preview_material_file` 目前对所有类型先 `std::fs::read` 整文件，视频路径必须绕开。
- `tauri.conf.json` 未启用 assetProtocol，CSP 为 null；`Cargo.toml` 的 tauri 依赖 `features = []`（启用 asset 协议需加 `protocol-asset` feature）。
- `guess_mime_type` 不识别视频后缀（mp4/webm 现在落为 `application/octet-stream` → 预览 kind 为 Unsupported），即**导入链路已能接受视频文件**，只是无法预览。
- `StudyDetailPage.tsx` 已 860 行，超出 800 行软上限，资料文件夹改造前必须先拆分组件。
- 删除学习内容的级联实现是"遍历 `list_materials` 逐个 `delete_material_item`"，引入文件夹递归删除后该写法会二次删除报错，需要重构。

## 范围（含 / 不含）

**含：**

1. PDF 目录：pdfjs `getOutline()` 读取大纲，可收起的目录面板，多级层级展示，点击跳页，与现有页码/缩放恢复兼容，无大纲/异常大纲降级。
2. 视频播放：MP4（H.264+AAC）/ WebM 内嵌播放，asset 协议流式加载，后缀预判 + 解码失败兜底，不支持格式友好提示，重命名/删除/级联/统计与现有资料一致。
3. 资料文件夹：v4 迁移落地 `parent_id` + `kind`，新建文件夹、移入文件夹（菜单操作）、面包屑导航、大图标平铺资料区、文件夹随删（递归）、旧库无损升级。

**不含（PRD 已裁定）：** 滚动位置保存、PDF 全文搜索、目录搜索过滤、自定义书签、Office 预览、MKV/AVI/FLV 等格式、视频进度记忆、倍速/字幕、转码、拖拽移动、跨学习内容移动、笔记分组、云同步。

## 架构变化

1. **`MaterialPreviewKind` 新增 `Video`**；`preview_material_file` 重构为"先判 kind 再读字节"，video / unsupported 不再整文件读入内存（顺带修掉现状对不支持文件也全量读取的问题）。
2. **视频字节经 Tauri 内建 asset 协议流式提供**（详见选型），scope 只读限定资料库目录。架构口径说明：这是 Tauri 受 scope 管控的内建文件服务通道，不是前端绕过 invoke 做持久化；SQLite 读写仍只经 Rust repository，不违反铁律。
3. **`material_items` 升级为树形模型**：`parent_id TEXT NULL`（NULL=根）、`kind TEXT NOT NULL DEFAULT 'file'`、`original_path`/`stored_path` 变可空（folder 行为 NULL）。**文件夹是纯逻辑层级，不在磁盘创建对应目录**——`materials/<learning_content_id>/` 物理平铺布局不变，因此文件改名、孤儿扫描、清理逻辑的磁盘侧完全不受影响。
4. **接口形态对 V1 设计的修正**：V1 设计预留了 `list_material_items(learning_content_id, parent_id)` 分层查询接口；本设计改为 `get_learning_detail` 继续全量返回含文件夹的扁平列表（带 `parentId`），前端按 `parentId` 分组导航。理由：单个学习内容资料量级为数十条，全量返回成本可忽略，导航零延迟，且不破坏现有"详情页一次加载"模式；省去新命令与状态同步复杂度。
5. **前端组件拆分**：PdfPreview 从 `MaterialPreviewPane.tsx` 独立成文件；资料区从列表组件升级为 `materials/` 目录下的资源管理器组件族，`StudyDetailPage.tsx` 回归容器职责，行数回落到软上限以内。

依赖变化：**不新增任何 npm 包或 crate**。唯一变更是 `Cargo.toml` 中 tauri 依赖开启 `protocol-asset` feature（启用既有内建能力的 feature flag，非新依赖）。

---

## 实现步骤（分阶段）

### 功能一：PDF 目录（大纲）

#### 阶段 A1：PdfPreview 拆分重构（无行为变化）

- **做什么**：把 `PdfPreview` 组件及 `loadPdfDocument`/页面缓存等 helper 从 `app/src/pages/MaterialPreviewPane.tsx` 迁出：
  - 新建 `app/src/pages/pdf/PdfPreview.tsx`（组件 + 工具栏 + 平移缩放交互）；
  - 新建 `app/src/pages/pdf/pdfDocumentCache.ts`（文档/页面/渲染缓存与 `PdfDocumentProxy` 等类型，类型上补充 `getOutline` / `getDestination` / `getPageIndex` 签名）；
  - `MaterialPreviewPane.tsx` 只保留按 kind 分发，约 90 行。
- **为什么**：MaterialPreviewPane 已 460 行，叠加目录面板必然超限；拆分后大纲与后续视频分支都有干净落点。
- **风险**：纯移动代码引入回归 → 本阶段不改任何行为，靠既有前端测试（pdfjs mock 的是 `pdfjs-dist/legacy/build/pdf.mjs` 模块路径，不受文件移动影响）保持绿。
- **验证**：`npm.cmd test`、`npm.cmd run typecheck`（在 `app/`）。

#### 阶段 A2：大纲数据逻辑（TDD，纯逻辑先行）

- **做什么**：新建 `app/src/pages/pdf/pdfOutline.ts`，导出：

  ```ts
  type PdfOutlineNode = { id: string; title: string; pageNumber: number | null; children: PdfOutlineNode[] };
  async function loadPdfOutline(document: PdfDocumentProxy): Promise<PdfOutlineNode[]>;
  ```

  实现要点：
  - `document.getOutline()` 返回 null/空数组 → 返回 `[]`（前端据此显示"该 PDF 无目录"）。
  - 每个条目的 `dest` 解析：字符串型命名目标先 `getDestination(name)`，得到数组后取 `[0]` 的页引用走 `getPageIndex(ref) + 1`；任一环节抛错或形状不符 → 该节点 `pageNumber = null`（条目仍展示但不可跳转），**单节点失败不拖垮整棵树**（逐节点 try/catch）。
  - 防御异常大纲：节点总数上限（500）+ 递归深度上限（8 层），超出截断；标题 trim 后为空的给占位文案。
  - 解析在打开 PDF 后惰性触发一次并随文档缓存复用，不阻塞首页渲染。
- **为什么**：把"pdfjs 接口 + 不规范数据"这一最大不确定性收进一个可被 Vitest 全覆盖的纯函数模块。
- **风险**：pdfjs dest 形态繁多 → 测试用假 documentProxy 枚举 dest 为数组、命名字符串、null、解析抛错四种形态。
- **验证**：`npm.cmd test`（先红后绿）、`npm.cmd run typecheck`。

#### 阶段 A3：目录面板 UI 与跳转接线

- **做什么**：
  - 新建 `app/src/pages/pdf/PdfOutlinePanel.tsx`：树形渲染（嵌套 `<ul>` 体现层级，多级缩进）、空状态文案"该 PDF 没有目录"、`onJump(pageNumber)` 回调、`pageNumber === null` 条目禁用态。
  - `app/src/pages/pdf/PdfPreview.tsx`：工具栏加"目录"切换按钮（默认收起）；展开时面板以侧栏出现在 `pdf-viewer` 内，不挤占收起状态布局；点击条目调用现有 `setPageNumber`——跳页后 `onStateChange` 既有链路自动触发防抖保存，页码/缩放恢复逻辑零改动即兼容（这是把目录做在 `setPageNumber` 之上的核心理由）。
  - `app/src/styles.css`：目录侧栏样式（淡蓝极简、少边框）。
- **风险**：面板挤压阅读区 → 默认收起 + 固定窄宽度；断网无影响（pdfjs 全本地）。
- **验证**：`npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run build`；手测：带大纲 PDF、无大纲 PDF、跳转后重开恢复页码。

---

### 功能二：视频播放（MP4/WebM）

#### 流式加载机制选型（关键决策）

**推荐：Tauri 2 内建 asset 协议（`convertFileSrc` + `assetProtocol` scope），不做自定义协议。**

| 维度 | asset 协议 | 自定义 `register_uri_scheme_protocol` |
| --- | --- | --- |
| Range 请求 | Tauri 2 的 asset 协议处理器原生实现 HTTP Range/206 分块响应，官方文档明确以视频流播放为目标场景 | 需自己解析 Range 头、构造 `Content-Range`、处理并发 seek，代码量 100+ 行且全是边界 |
| 内存 | 按需分块读取，数百 MB 文件不整读 | 取决于自己实现质量 |
| 安全 | scope 白名单（限定资料库目录、只读） | 需自建路径校验 |
| 维护 | 配置级启用，零自维护代码 | 长期自担 |

结论：asset 协议在能力、安全、维护成本上全面占优；自定义协议仅作为"WebView2 上实测发现 range 缺陷"时的兜底预案（见风险表），不进入计划工作量。

具体配置：

- `app/src-tauri/Cargo.toml`：`tauri = { version = "2.9.5", features = ["protocol-asset"] }`。
- `app/src-tauri/tauri.conf.json`：`app.security.assetProtocol = { "enable": true, "scope": ["$APPDATA/materials/**"] }`（`$APPDATA` 即 `app_data_dir`，与 `lib.rs` 中 `material_library_dir = data_dir.join("materials")` 对齐；只覆盖 App 管理副本，天然守住"绝不动用户原始文件"）。CSP 当前为 null 无需调整；若未来启用 CSP，须补 `media-src 'self' asset: http://asset.localhost`。
- 前端用 `convertFileSrc(material.storedPath)`（`@tauri-apps/api/core`，已有依赖）生成 `<video src>`。

**格式判定策略（两层）**：

1. 后缀预判（Rust `guess_mime_type`）：`mp4 → video/mp4`、`webm → video/webm` 判为可播；`mkv/avi/flv/rmvb/wmv/mov` 等映射为对应 `video/*` mime 但 `preview_kind` 仍归 Unsupported，前端据 `mimeType.startsWith("video/")` 显示专属文案"暂不支持该视频格式（当前仅支持 MP4 / WebM）"。
2. 解码失败兜底（前端）：`<video>` 的 `onError` 事件（覆盖 H.265 编码的 .mp4 等"后缀对、编码不支持"情形）→ 替换为同款友好提示，不黑屏不崩溃。

**存量数据兼容**：旧版本导入过的视频 mime 已存为 `application/octet-stream`。在 `preview_kind` 计算前增加规则：当 mime 缺失或为 octet-stream 时按 `stored_path` 扩展名重新猜测。纯读取时兜底，**不需要数据迁移**。

#### 阶段 B1：Rust 层视频识别与预览改造（TDD）

- **做什么**（文件均在 `app/src-tauri/src/`）：
  - `models.rs`：`MaterialPreviewKind` 增 `Video`。
  - `repository.rs`：
    - `guess_mime_type` 增视频后缀映射（含不支持格式的 `video/*` 映射）；
    - `preview_kind` 增 `video/mp4 | video/webm → Video`；
    - `preview_material_file` 重构：先按 mime（含 octet-stream 扩展名兜底）定 kind，`Video`/`Unsupported` 分支不读文件字节，`Video` 返回 `kind=Video` + mime（不带 data_url；前端用已持有的 `storedPath`）。
  - 导入链路确认项：`import_material_file` 对任意后缀已可用，无需改动（B1 测试中固化这一行为）。
- **验证**：`cargo test`、`cargo fmt --check`、`cargo clippy -- -D warnings`（在 `app/src-tauri/`）。

#### 阶段 B2：asset 协议配置 + 前端播放组件

- **做什么**：
  - 按上文修改 `Cargo.toml` 与 `tauri.conf.json`（capabilities 文件无需改，asset 协议是配置项不是 capability 权限）。
  - `app/src/shared/types.ts`：`MaterialPreviewKind` 增 `"video"`。
  - 新建 `app/src/pages/VideoPreview.tsx`：`convertFileSrc(storedPath)` + `<video controls>`（原生播放/暂停/进度/音量/全屏），`onError` 切换到不支持提示；卸载时暂停释放。
  - `app/src/pages/MaterialPreviewPane.tsx`：增 `kind === "video"` 分支；Unsupported 且 mime 为 `video/*` 时显示视频专属文案。
- **风险控制**：本阶段第一件事是用数百 MB 真实 MP4 在 `tauri dev` 下做 spike 手测拖动进度（提前暴露 range 问题，再写组件细节）。
- **验证**：`npm.cmd test`（mock `convertFileSrc`）、`npm.cmd run typecheck`、`npm.cmd run tauri -- build --debug` + 手测：数百 MB MP4 拖动、WebM、MKV 提示、中文文件名视频、断网播放、重命名/删除/级联删除/统计计入。

---

### 功能三：资料文件夹

#### 关键决策

- **迁移方案：v4 表重建**。因 `stored_path`/`original_path` 现为 NOT NULL，无法用 `ALTER ADD COLUMN` 满足 folder 行；在单个事务内：建 `material_items_new`（含 `parent_id TEXT`、`kind TEXT NOT NULL DEFAULT 'file'`、两个路径列可空）→ `INSERT INTO ... SELECT`（存量行 `kind='file'`、`parent_id=NULL` 即全部保留在根目录）→ drop 旧表 → rename → 建索引 `idx_material_items_scope(learning_content_id, parent_id)` → `user_version = 4`。
- **删除文件夹策略：随删（递归删除），不选"需先清空"**。理由：① 与"删除学习内容级联删除"的既有产品心智一致；② 嵌套层级下"先清空"要求用户逐层手动操作，体验差；③ 实现上递归收集子树后复用既有单文件删除路径，风险可控。配套要求：二次确认文案必须写明"将删除文件夹「X」及其中 N 个资料（M 个文件、K 个子文件夹），仅删除 App 管理副本，不影响原始文件"。
- **同名规则**：重名判定范围从"整个学习内容"收窄为"同一父级的兄弟节点"（文件与文件夹同池判重），导入/重命名/新建文件夹/移动入夹均自动追加 ` (n)` 后缀；磁盘物理重名仍由既有 `next_available_path` 在平铺目录内独立兜底（不同文件夹下显示名相同、物理名带后缀，属预期）。

#### 阶段 C1：迁移 + 模型 + repository（TDD，仅 Rust）

- **做什么**（`app/src-tauri/src/`）：
  - `repository.rs::migrate`：新库建表语句直接用新 schema；旧库走上述 v4 重建迁移。
  - `models.rs`：`MaterialItem` 增 `parent_id: Option<String>`、`kind: MaterialKind`（新枚举 `File | Folder`），`original_path`/`stored_path` 改 `Option<String>`；新增 `CreateMaterialFolderInput`、`MoveMaterialItemInput`；`ImportMaterialFileInput` 增 `parent_id: Option<String>`。
  - `errors.rs`：新增 `FolderNotFound`、`InvalidMoveTarget`（循环/跨学习内容/目标非文件夹）等错误。
  - `repository.rs` 新增/修改函数清单：
    - 新增 `create_material_folder(learning_content_id, parent_id, name)`（校验父级存在且为 folder 且同属一个学习内容；同级重名追加后缀；不建物理目录）；
    - 新增 `move_material_item(id, new_parent_id)`（目标为根或 folder；同学习内容；**禁止把文件夹移入自身或其后代**——沿 parent 链上溯检测；目标内重名追加后缀）；
    - 修改 `import_material_file`：接受 `parent_id` 并校验，重名判定改为同级范围（`next_material_name` 增 parent 维度）；
    - 修改 `delete_material_item`：folder 分支先递归收集子树，文件行删磁盘副本 + 记录 + 阅读状态，文件夹行只删记录；新增 `count_material_subtree(id)` 供确认文案用（返回文件数/文件夹数）；
    - 重构 `delete_learning_content`：不再逐项调 `delete_material_item`（避免递归后二次删除报 MaterialNotFound），改为：枚举 `kind='file'` 行删磁盘副本 → 批量删 `material_reading_states` → 批量删 `material_items` → 删笔记与内容；
    - 修改 `rename_material_item`：folder 分支纯 DB 改名（无文件系统操作），file 分支重名判定收窄到同级；
    - 修改 `list_materials`/`get_material`/`list_all_materials`/`list_orphan_materials`：SELECT 增列；统计与清理路径**只把 `kind='file'` 且 `stored_path` 非空的行纳入引用集**（folder 行 NULL 路径直接参与会出错，必须点名）；`cleanup_material_library` 对孤儿 folder 行只删记录。
- **风险**：表重建迁移失败 → 全程单事务（失败自动回滚到 v3 可继续用），并以"手工构造 v3 库 → open → 断言数据完整 + user_version=4"的测试覆盖（仿照现有迁移测试写法）。
- **验证**：`cargo test`、`cargo fmt --check`、`cargo clippy -- -D warnings`。

#### 阶段 C2：command 层 + 前端 invoke 封装与类型

- **做什么**：
  - `commands.rs` / `lib.rs`：新增 `create_material_folder`、`move_material_item`、`count_material_subtree` command 并注册；`import_material_file` input 透传 `parentId`。
  - `app/src/shared/types.ts`：`MaterialItem` 增 `parentId: string | null`、`kind: "file" | "folder"`，`storedPath`/`originalPath` 改 `string | null`；新增输入类型。
  - `app/src/shared/api/learningContentApi.ts`：新增 `createMaterialFolder`、`moveMaterialItem`、`countMaterialSubtree` 封装。
  - 修复类型涟漪：`VideoPreview` 等使用 `storedPath` 处加空值守卫；现有测试 fixture 补新字段。
- **验证**：`cargo test`、`cargo clippy -- -D warnings`、`npm.cmd test`、`npm.cmd run typecheck`。

#### 阶段 C3：资料区资源管理器化（前端结构改造）

- **做什么**：
  - 新建 `app/src/pages/materials/MaterialExplorer.tsx`：持有 `currentFolderId` 状态；按 `parentId` 过滤当前层（文件夹排前、文件排后）；面包屑（根目录 › 文件夹 › …，点击任意层级跳转）；"新建文件夹"与"导入资料"（导入归属当前层）入口；大图标网格平铺。
  - 新建 `app/src/pages/materials/MaterialTile.tsx`：大图标块（文件夹图标 / 按 mime 的文件图标 + 下方名称），单击文件夹进入、单击文件走既有内嵌阅读；操作入口（重命名 / 删除 / 移动到…）。
  - 新建 `app/src/pages/materials/MoveMaterialDialog.tsx`：列出该学习内容全部文件夹 + 根目录供选择（禁选自身与后代），调 `moveMaterialItem`。
  - 迁移 `MaterialLibraryStatsPanel`、`MaterialDeletionBar` 到 `app/src/pages/materials/` 独立文件；`StudyDetailPage.tsx` 删除内联资料组件，行数回落至约 500 行。
  - 删除语义：文件沿用"标记—撤回—保存"模式；**文件夹标记删除时整棵子树从可见列表隐藏**（前端按 pending 集合 + 祖先链过滤），确认弹窗用 `countMaterialSubtree` 显示内部数量与"仅删 App 副本"口径；保存时调 `delete_material_item(folderId)` 由后端递归。
  - `app/src/styles.css`：explorer 网格、面包屑、tile 样式（蓝天极简、留白、少边框）。
- **风险**：详情页交互回归面大 → 既有用例先适配（导入、删除、重命名、内嵌阅读在根目录下必须全绿），再叠加文件夹用例。
- **验证**：`npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run build`。

#### 阶段 C4：回归收口

- **做什么**：对照 PRD 验收全量回归：旧库升级（拿 V1.1 真实库副本手测）、级联删除无孤儿、统计不漏文件夹内资料、清理逻辑、重启恢复层级、断网全流程；`tauri.conf.json` / `package.json` / `Cargo.toml` 版本号统一 `1.2.0`；更新 `WORKING-CONTEXT.md` 稳定决策。
- **验证**：全套命令 + `npm.cmd run tauri -- build --debug` 手工测试。

---

## 测试策略

TDD：每个行为变化先写失败测试再实现。

**Rust（cargo test，`app/src-tauri/`）**，新增约 12-15 个用例：

| 域 | 测试点 |
| --- | --- |
| 视频 | mp4/webm 导入得到正确 mime；preview 返回 `Video` 且无 data_url、不读字节；mkv 返回 Unsupported + `video/*` mime；存量 octet-stream 的 .mp4 记录 preview 兜底为 Video |
| 迁移 | 手工构造 v3 schema + 数据 → open → 资料完整保留在根（parent_id NULL、kind file）、user_version=4、可立即建文件夹 |
| 文件夹 | 建夹/嵌套建夹；同级重名后缀（文件与文件夹同池）；不同文件夹允许同名 |
| 移动 | 移入/移回根；拒绝移入自身/后代；拒绝跨学习内容；目标重名后缀 |
| 删除 | 递归删除文件夹（磁盘副本 + 记录 + 阅读状态全清、不动原始文件）；删除学习内容含多层文件夹无残留、无 MaterialNotFound |
| 统计/清理 | 文件夹内文件计入统计、folder 行不参与路径扫描；孤儿 folder 行被清理 |

**前端（Vitest，`app/`）**，新增约 15-20 个用例：

- `pdfOutline.test.ts`：无大纲→空；多级层级保留；数组 dest / 命名 dest / 坏 dest（pageNumber null）/ 单节点抛错不影响其余；超限截断。
- `PdfOutlinePanel.test.tsx`：层级渲染、点击触发 onJump、null 页码禁用、空状态文案、展开收起。
- `VideoPreview.test.tsx`：video 元素 src 来自 mock 的 convertFileSrc；触发 error 事件后显示不支持提示；unsupported + video mime 显示专属文案。
- `MaterialExplorer` / `StudyDetailPage.test.tsx`：大图标平铺渲染；进入文件夹/面包屑返回；当前层导入归属；新建文件夹；移动对话框禁选后代；文件夹标记删除隐藏子树且确认文案含数量；根目录既有行为（导入/重命名/删除/阅读）回归。

**集成/手工**：每阶段"验证"小节所列；视频大文件拖动与旧库升级为两条必做手测线。

## 风险与缓解

| 风险 | 等级 | 缓解 |
| --- | --- | --- |
| asset 协议 range 在 WebView2 实测有缺陷（视频拖动失败/整读） | 高（功能二核心） | B2 第一步用数百 MB 文件 spike 验证再写 UI；兜底预案：Rust `register_uri_scheme_protocol` 自实现 Range（已留接缝：前端只在 `VideoPreview.tsx` 一处生成 URL，可整体替换） |
| v4 表重建迁移损坏旧数据 | 高（数据安全） | 单事务执行（失败回滚到 v3 可继续用）；v3→v4 升级专项测试；C4 用真实 V1.1 库副本手测 |
| `delete_learning_content` 与递归删除互踩（双删报错） | 中 | C1 明确重构为按表批量删除 + 专项级联测试 |
| 统计/清理把 folder 行（NULL stored_path）当文件处理 | 中 | C1 点名修改 + 专项测试 |
| `storedPath` 转可空的前后端类型涟漪 | 中 | C2 集中处理，`typecheck` + `clippy -D warnings` 把关 |
| `StudyDetailPage` 拆分引入交互回归 | 中 | A1/C3 均"先保既有测试绿，再加新行为"；拆分提交与行为提交分开 |
| PDF 大纲数据不规范（坏 dest、深嵌套、空标题） | 中 | 逐节点容错 + 数量/深度上限 + 降级为不可点条目；空大纲明确空态 |
| 同后缀不同编码视频（H.265 mp4）黑屏 | 低 | `onError` 兜底提示，测试覆盖 |
| 中文/特殊字符文件路径经 convertFileSrc 编码问题 | 低 | B2 手测项固化（中文名视频、含空格路径） |

## 验证命令

每阶段按其"验证"小节执行，最终收口全量跑：

```text
# 前端（app/）
npm.cmd test
npm.cmd run typecheck
npm.cmd run build

# Rust（app/src-tauri/）
cargo fmt --check
cargo test
cargo clippy -- -D warnings

# 集成（app/）
npm.cmd run tauri -- build --debug
```

提交粒度：A1 / A2+A3 / B1 / B2 / C1 / C2 / C3 / C4 各为可独立合并的 Conventional Commit（`refactor:`、`feat:`、`test:` 按内容选型），每个提交点相关命令全绿。

## 主要涉及文件一览

- Rust：`app/src-tauri/src/repository.rs`、`models.rs`、`commands.rs`、`errors.rs`、`lib.rs`；`app/src-tauri/Cargo.toml`、`app/src-tauri/tauri.conf.json`
- 前端既有：`app/src/pages/StudyDetailPage.tsx`、`MaterialPreviewPane.tsx`、`StudyDetailPage.test.tsx`；`app/src/shared/types.ts`、`app/src/shared/api/learningContentApi.ts`、`app/src/styles.css`
- 前端新建：`app/src/pages/pdf/PdfPreview.tsx`、`pdf/pdfDocumentCache.ts`、`pdf/pdfOutline.ts`、`pdf/PdfOutlinePanel.tsx`、`app/src/pages/VideoPreview.tsx`、`app/src/pages/materials/MaterialExplorer.tsx`、`materials/MaterialTile.tsx`、`materials/MoveMaterialDialog.tsx`、`materials/MaterialLibraryStatsPanel.tsx`、`materials/MaterialDeletionBar.tsx`
