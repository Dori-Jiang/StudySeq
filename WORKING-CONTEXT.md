# 工作上下文

## 当前重点

把 Planassiant 设置成一套“ECC 思路 + Codex 实际用法”的项目结构。

## 稳定决策

- 根目录 `AGENTS.md` 只记录 ECC 风格的通用工作流规则。
- `product/` 只放产品策划、产品说明和设计资料。
- `app/` 放应用源码。
- Codex 生命周期 hooks 放在 `.codex/hooks.json` 和 `.codex/hooks/`。
- 不再保留根目录 `hooks/`，因为这个项目直接使用 Codex 官方 hooks 入口。
- 稳定上下文使用中文记录。
- 未经用户明确允许，不要修改根目录 `AGENTS.md`。

## 产品方向

- 先做桌面端，之后再扩展手机和平板端。
- 第一版本地优先、离线优先。
- 第一版不做云同步。
- 不采用日历中心布局。
- 界面保持现代、极简、安静、清晰。
- 产品围绕学习内容、计划进度、资料、笔记和学习记录展开。

## 已确认的产品设计

- 产品名：中文 `知序`，英文 `StudySeq`。
- 主页采用单栏学习内容列表，只展示学习内容和进度，不保留左侧学习内容导航列。
- 学习内容最小字段：名称、状态、截止日期、预计工时、进度。
- 状态枚举：计划中、进行中、暂停、完成、超期。
- 进度第一版由用户手动填写百分比，不做自动检测。
- 详情页分为资料和笔记两块。
- 资料区采用资源管理器式大图标布局；第一版只展示根目录文件列表，不做文件夹。
- 笔记默认平铺列表，可分组但不强制。
- 阅读页采用左内容右笔记的可拖动分栏布局。
- 阅读页支持笔记下拉选择、内嵌笔记和悬浮笔记。
- 视觉语言采用蓝天灵感的极简风，强调留白、轻层次、少边框和清晰层级。
- 原始 UI 概念 HTML 保留作为设计参考；当前实现以 V1 固定后的 App 主线为准。

## 已确认的技术决策

- 笔记正文 v1 使用纯文本，不使用 Markdown 或复杂富文本。
- 资料文件 v1 采用导入模式，复制到 App 管理的本地资料库；接受 App 占用空间增加。
- 学习资料必须支持在 App 内预览，不以系统外部打开作为主要阅读路径。
- SQLite v1 暂不加密。
- 删除学习内容、资料或笔记时必须二次确认；不同对象独立删除。
- v1 坚持前端只通过 Tauri invoke 调用 Rust command，SQLite 只由 Rust repository 访问。
- 同名资料文件导入时自动追加后缀。
- 资料区第一版只做根目录文件列表，不做文件夹。
- 笔记第一版只做标题和纯文本正文，不做分组。
- 第一批 App 内预览格式为 txt、图片、PDF；Office 和视频后置。
- 删除学习内容时需要删除关联内容，但必须在删除前给用户明确提示。
- 阅读页第一版需要支持编辑已有笔记。
- PDF 预览采用 `pdfjs-dist`。
- 文本资料预览尽量支持多编码；已准备 `encoding_rs` 和 `chardetng`。
- 阅读状态需要保存当前资料、当前笔记和分栏比例。
- 详情页是当前主要学习工作台：左栏资料支持点击整行内嵌阅读 txt、图片、PDF，右栏继续管理和编辑笔记。
- 旧独立阅读页实现和 `/studies/:studyId/read` 路由已删除；后续 PDF 页码/缩放、资料管理和笔记能力必须接入详情页内嵌阅读主线，不能再接到旧独立阅读页。

## 下一步

- 当前没有需要更新或重新确认的 hooks。
- 按已确认的产品设计继续推进实现规划或前端落地。
- 后续查看当前设计时，以当前 App 实现、`product/docs/studyseq-project-progress.md`、`product/docs/studyseq-v1-technical-design.md` 和保留的原始 UI 概念 HTML 为参考；涉及实现时以当前 App 主线为准。
- 后续进入新阶段前，先读取本文件。
- 每次阶段结束、上下文压缩前或会话结束前，把新的稳定决策和下一步写回本文件。
- 原始产品策划书、产品设计文档和 UI 概念 HTML 已恢复保留；当前版本不再基于废弃实现路径开发。
- 当前 v1 技术文档已完成，文件为 `product/docs/studyseq-v1-technical-design.md`。
- 技术路线已定为 `Tauri 2 + Vite + React + TypeScript + Rust + SQLite`。
- `app/` 最小骨架已完成，已跑通“学习内容 -> SQLite -> 主页展示 -> 重启恢复”闭环。
- 当前应用已完成主页学习内容创建、列表展示、删除学习内容、学习内容详情页、资料导入、纯文本笔记创建。
- 当前详情页闭环已覆盖“学习内容详情页 -> 导入资料 -> 点击资料行内嵌阅读 txt/图片/PDF -> 创建/编辑纯文本笔记 -> 重启恢复”。
- 当前应用已完成详情页内嵌阅读最小闭环：详情页左侧可内嵌阅读 txt/图片/PDF，右侧查看/创建/编辑纯文本笔记。
- 当前应用已完成阅读体验收口与数据安全补强：切换笔记和返回详情前自动保存当前笔记；PDF 支持 A4 页框、上一页、下一页、页码显示、按钮缩放、Ctrl+鼠标滚轮缩放、中键拖动；返回详情前保存阅读状态。
- 当前应用已完成 v1 工程收口：主页学习内容栏显示进度条；主页可行内编辑学习内容名称、状态、预计工时、截止日期、进度；详情页保留学习内容展示、资料和笔记；旧 `reading_states` 状态链路已从当前代码中移除。
- 当前资料删除采用“先标记、可撤回、保存后正式删除”模式；正式删除只删除 App 管理的资料副本和数据库记录，不删除用户原始来源文件。
- 当前资料删除失败时，成功项会从资料列表移除，失败项保留为待删除状态并提示可再次保存重试。
- 当前笔记删除支持详情页和阅读页删除；删除前二次确认；阅读页删除当前笔记后回到新建笔记状态。
- 当前 V1 UI 收口已完成：按钮统一为淡蓝轻量风格；详情页进度条已移到左侧标题区并改成长条 SaaS 风格；详情页资料阅读模式隐藏其他资料列表；笔记区为下拉选择 + 飞书文档式纯文本编辑。
- 已验证：`npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run build`、`cargo fmt --check`、`cargo test`、`cargo clippy -- -D warnings`、`npm.cmd run tauri -- build --debug`。
- 本阶段已验证：前端 `vitest run` 46 个测试通过、`tsc --noEmit` 通过、`vite build` 通过；Rust `cargo fmt --check` 通过、`cargo test` 17 个测试通过、`cargo clippy -- -D warnings` 通过；Tauri debug build 已重新生成 `app/src-tauri/target/debug/studyseq.exe`。
- 用户已完成 V1 手工测试，反馈“似乎没啥问题”，当前 V1 可按发布候选收口。
- 当前已进入 V1.1 开发线程；当前分支为 `codex/v1.1`，`main` 和 `v1.0.0` 固定为 V1 稳定状态。
- V1.1 目标已对齐为“继续阅读与资料治理”：PDF 当前页/缩放恢复、资料库空间占用统计和清理入口、资料重命名。
- V1.1 不进入视频播放、Office 内嵌预览、Office 外部打开兜底、PDF 搜索/目录/大纲、资料文件夹树、笔记分组、复杂统计。
- V1.1 实现顺序：先 PDF 当前页和缩放恢复，再资料库统计与清理入口，最后资料重命名。
- 当前 V1.1 核心开发已完成：新增 `material_reading_states`，使用 `PRAGMA user_version` 迁移；PDF 页码/缩放按 `material_id` 恢复并低频防抖保存；资料库统计支持手动刷新和清理前强制刷新；清理只处理 App 管理目录，孤儿资料记录及其 App 副本可自动删除；资料重命名同名自动追加后缀。
- 当前删除学习内容会级联删除关联资料、笔记和资料阅读状态；删除前使用 App 内确认弹窗明确提示关联内容会被删除，且不会删除用户原始来源文件。
- 当前已修复 V1.1 手工测试发现的问题：详情页内嵌 PDF 阅读器此前未接入 `material_reading_states`，导致再次打开仍从第一页开始；现在详情页打开 PDF 会读取并保存该资料自己的页码和缩放。
- 当前详情页内嵌 PDF 已完成流畅度优化：继续使用现有 `pdfjs-dist`，不新增依赖；PDF 文档按 data URL 缓存最近 3 个，相邻页使用离屏 canvas 预渲染并缓存，连续缩放使用 150ms 防抖后再重绘。
- 当前已彻底清理废弃独立阅读页残留：旧 `/studies/:studyId/read` 路由、`StudyReaderPage`、旧 `reading_states` 前后端接口、模型、repository 方法和新库建表逻辑均已移除；旧库升级会删除 `reading_states` 表。
- 当前已清理不再影响当前版本的旧实现路径：删除旧独立阅读页页面、路由、测试和专属样式；原始设计文档和 UI 概念 HTML 保留。
- 当前已完成详情页阅读框中等上移微调：只压缩顶部垂直间距，不改变资料、笔记、PDF 阅读和分栏结构。
- 当前已验证：前端 `vitest run` 42 个测试通过、`tsc --noEmit` 通过、`vite build` 通过；Rust `cargo fmt --check` 通过、`cargo test` 20 个测试通过、`cargo clippy -- -D warnings` 通过。
- 当前 V1.1 发包版本号已统一为 `1.1.0`。
- 当前已修复 V1.1 release 包启动时出现黑色控制台窗口的问题：`main.rs` 在非 debug 构建使用 Windows GUI 子系统，并新增静态检查脚本防回归。
- 已运行 `npm.cmd run tauri -- build`，正式 V1.1 release 包已生成：`app/src-tauri/target/release/studyseq.exe`、`app/src-tauri/target/release/bundle/msi/StudySeq_1.1.0_x64_en-US.msi`、`app/src-tauri/target/release/bundle/nsis/StudySeq_1.1.0_x64-setup.exe`。
- 用户已完成 V1.1 真实 App 手工测试，反馈“没什么问题了”。
- 下一步：如需要发布到远端，推送当前 V1.1 提交和后续 tag；当前先完成本地提交与本地 release 发包。
- 当前已进入 V1.2 开发线程，工作分支为 `claude-version`（项目从 Codex 迁移到 Claude Code 协作）；`.claude/settings.json` 复用 `.codex/hooks/*.ps1`，`.claude/agents/` 有 8 个适配本项目的子代理。
- V1.2 范围已经用户评审定稿（2026-06-12），PRD 见 `product/docs/studyseq-v1.2-prd.md`：做 PDF 目录（大纲）、视频播放（MP4/WebM，依托 WebView 原生解码、流式加载）、资料文件夹（资源管理器式大图标资料区，需迁移落地 `parent_id`）。
- V1.2 明确不做：阅读页滚动位置保存（内嵌阅读为翻页式、价值有限）、PDF 全文搜索、Office 预览、需自带解码器的视频格式、笔记分组。
- V1.2 实现顺序：PDF 目录 → 视频播放 → 资料文件夹（无迁移低风险在前，结构性改动在后）。
- V1.2 技术设计已完成，文件为 `product/docs/studyseq-v1.2-technical-design.md`，阶段划分 A1-A3（PDF 目录）、B1-B2（视频）、C1-C4（文件夹）。
- V1.2 功能一（PDF 目录）已完成：PdfPreview 拆分到 `app/src/pages/pdf/`（PdfPreview.tsx + pdfDocumentCache.ts）；`pdfOutline.ts` 解析大纲（坏 dest 单节点降级、500 节点/8 层上限、同层并行解析）；`PdfOutlinePanel.tsx` 树形目录面板（工具栏"目录"按钮开关、默认收起、空状态文案、null 页码禁用）；跳转走现有 `setPageNumber`，与页码/缩放防抖保存链路零改动兼容。
- 本阶段已验证：前端 62 个 Vitest 测试全绿（新增 20 个：大纲解析 12 + 面板 4 + 接线 4）、`tsc --noEmit` 通过、`vite build` 通过；code-reviewer 审查结论"通过"，遗留非阻塞优化项：pdf 文档缓存淘汰时未调用 destroy()（拆分前既有行为）。
- V1.2 功能二（视频播放）已完成：`MaterialPreviewKind` 增 `Video`；mp4/webm 判为可播，mkv/avi/flv/wmv/mov/rmvb 映射 `video/*` 但显示"暂不支持该视频格式"专属文案；`preview_material_file` 重构为先判类型再按需读字节，Video/Unsupported 不读文件（注意行为变化：Unsupported 预览不再隐式校验文件存在性）；存量 octet-stream 视频记录预览时按扩展名兜底，不做数据迁移；视频经 Tauri 内建 asset 协议流式播放，scope 只读限定 `$APPDATA/materials/**`；`VideoPreview.tsx` 用 convertFileSrc + 原生 video 控件，onError 按 MediaError code 分流文案（解码/格式 vs 加载失败），卸载时释放资源，换资料靠 `key={material.id}` 重挂载重置状态。
- V1.2 功能三（资料文件夹）已完成：v4 表重建迁移（`parent_id`、`kind`、路径列转可空，单事务，失败自动回滚 v3；存量资料保留根目录；`pragma_table_info` 列检查保证幂等）；新增 `create_material_folder` / `move_material_item` / `count_material_subtree` command；文件夹是纯逻辑层级，磁盘仍物理平铺；重名判定收窄为同级兄弟节点（文件与文件夹同池）；移动禁止移入自身/后代/跨学习内容/非文件夹；删除文件夹后端递归（文件删 App 副本与阅读状态，文件夹只删记录）；前端资料区升级为 `app/src/pages/materials/` 资源管理器组件族（MaterialExplorer 面包屑导航 + 大图标网格 + 当前层导入/新建文件夹、MaterialTile、MoveMaterialDialog 禁选后代、materialTree 防环纯函数）；文件夹标记删除时整棵子树从可见列表隐藏，确认文案含子树数量与"仅删 App 副本"口径；StudyDetailPage 回落到 719 行。
- V1.2 安全加固（C1 审查修复）：删除资料/学习内容前用 `is_path_inside_directory` 校验磁盘副本在 App 资料库目录内，目录外路径只删记录不碰文件；级联删除与子树删除的 DB 段用 `unchecked_transaction` 单事务提交、叶子先删；子树收集与移动上溯加 visited 防环；`kind` 列加 CHECK 约束、未知 kind 保守归 Folder；连接加 busy_timeout(5s)。注意：rusqlite bundled 默认启用外键强制，`parent_id` 故意不声明 REFERENCES（否则所有删除路径都要求严格叶先序），完整性由 repository 层校验维持。
- V1.2 审查闭环（全部 CRITICAL/HIGH 已修复提交）：B1 rust-reviewer 通过；B2 typescript-reviewer 报 cleanup effect 时序 bug 已修；C1 rust-reviewer 报删除缺目录校验（CRITICAL）+ database-reviewer 报删除无事务（HIGH）已修；C2+C3 typescript-reviewer 报 3 个 HIGH（祖先与后代同时标记删除的并行竞态、移动对话框可选入待删文件夹绕过确认、导入无错误处理）已修；security-reviewer 报 rename 缺目录校验（HIGH）已修并启用 `MaterialPathOutsideLibrary` 错误，顺手移除了未使用的 tauri-plugin-fs 插件与 fs:default 权限（减攻击面）。
- V1.2 审查遗留项（非阻塞，记入 V1.3 备选）：① CSP 仍为 null，security-reviewer 推荐值已给出（default-src 'self' + media-src asset: http://asset.localhost 等），加 CSP 需手测验证 PDF/图片/视频预览不被破坏，故未随本版收口；② preview_material_file 读取 stored_path 无目录校验（只读，纵深防御缺口）；③ ApiError 透传底层错误原文（遗留）；④ 打开文件阅读后返回资料列表会回到根目录而非原文件夹（currentFolderId 在 explorer 卸载时丢失）；⑤ 保存笔记/删笔记两处无 try/catch；⑥ cleanup 孤儿记录删除未包事务（可重入收敛）；⑦ 清理确认文案与实际行为不完全一致（"缺失资料记录"实际只删孤儿记录）。
- 本阶段已验证：前端 86 个 Vitest 测试全绿（视频 8 + 树工具 10 + 资源管理器 5 等）、`tsc --noEmit`、`vite build`；Rust 38 个测试全绿、`cargo fmt --check`、`cargo clippy -- -D warnings`；`npm.cmd run tauri -- build --debug` 通过。
- V1.2 发包版本号已统一为 `1.2.0`（package.json / tauri.conf.json / Cargo.toml）。注意 Windows PowerShell 5.1 改这些文件时不要用 `Set-Content -Encoding utf8`（会写 BOM，Tauri 解析 tauri.conf.json 会失败），用无 BOM 的 UTF8Encoding。
- V1.2 留给用户的手测清单：① 数百 MB 真实 MP4 拖动进度（asset 协议 Range 验证，技术设计的高风险项）；② WebM 播放、MKV 显示专属提示、中文文件名视频；③ 用 V1.1 真实库副本验证旧库升级（资料保留在根目录、阅读进度保留）；④ 建夹/嵌套/移动/重命名/递归删除全流程；⑤ 删除学习内容含多层文件夹无残留；⑥ 断网全流程。
- V1.2 下一步：等用户手测反馈后做 release 正式发包（`npm.cmd run tauri -- build`）。
- 当前已进入 V1.3 开发线程，工作分支为 `v1.3`；`claude-version` 保留为 V1.2 完成态/参考态，后续开发默认不写入 `claude-version`。
- V1.3 定位为 V1.2 后的安全加固与体验一致性收口，不做大 UI 改版、不新增大功能。A1-A7 自动化开发已完成：`preview_material_file` 读取前校验 App 资料库目录；`ApiError` 改为稳定 `code + message`，前端只展示稳定 ApiError message，未知运行时错误统一显示通用文案；Tauri CSP 从 `null` 收紧；资料库 cleanup 的孤儿记录/阅读状态 DB 删除改为事务；清理确认文案改为无引用文件 + 孤儿资料记录；资料区当前文件夹状态提升到详情页；保存/删除笔记失败会保留 UI 状态并提示。
- V1.3 版本号已统一为 `1.3.0`（package.json / package-lock.json / tauri.conf.json / Cargo.toml / Cargo.lock 中本 crate）。
- V1.3 自动化验证已通过：`npm.cmd test`（10 文件、100 测试）、`npm.cmd run typecheck`、`npm.cmd run build`、`cargo fmt --check`、`cargo test`（48 测试）、`cargo clippy -- -D warnings`、`npm.cmd run tauri -- build --debug`、`npm.cmd run tauri -- build`。
- V1.3 正式包已生成：`app/src-tauri/target/release/studyseq.exe`、`app/src-tauri/target/release/bundle/msi/StudySeq_1.3.0_x64_en-US.msi`、`app/src-tauri/target/release/bundle/nsis/StudySeq_1.3.0_x64-setup.exe`。
- V1.3 真实 App 手工验收仍待用户执行：重点检查 CSP 下 txt/图片/PDF/MP4/WebM 预览、MKV/AVI 不支持提示、库外 stored_path 不被读取、文件夹内打开资料返回位置、笔记保存/删除失败、cleanup 可重试收敛、V1.1 旧库升级、V1.2 PDF 目录/视频/资料文件夹不回退、断网全流程。
- 当前已进入 V1.4 开发线程，工作分支为 `codex/v1.4`；V1.4 主题为“主页最近打开位置”，不做日历打卡、独立足迹列表、学习时长统计或连续学习天数。
- V1.4 自动化开发已完成：`material_reading_states` 扩展最近打开字段，并新增 `app_settings` 后数据库升级到 `user_version = 6`；`list_learning_contents` 返回 `recentOpen`；主页学习主题栏显示最近打开时间、文件名和 PDF 页码/视频时间点；普通文件只显示时间和文件名。
- V1.4 视频继续播放已完成：`VideoPreview` 按上次秒数恢复播放，按 10 秒阈值、暂停、跳转和卸载低频保存；详情页仍是当前阅读主线。
- V1.4 审查修复已完成：PDF 状态保存要求资料是库内存在的 PDF；视频预览和视频进度保存都要求副本位于 App 资料库且仍存在，主页 `recentOpen` 会过滤失效副本；视频进度保存不刷新 `last_opened_at`；视频卸载保存避免 metadata-only 写入 0；详情页打开资料成功/失败都增加过期请求保护；主页最近打开摘要接入 `aria-describedby`；前端 API 对最近打开 union 和阅读状态做轻量运行时校验。
- V1.4 大 PDF 卡死修复已完成：PDF 预览不再由 Rust 整本 `std::fs::read` 后 base64 返回，也不再由前端主线程 `atob` 整本解码；后端 PDF 只校验资料副本在 App 资料库内且文件存在，返回 `data_url: None` 并记录打开；前端用 `convertFileSrc(storedPath)` 生成 asset URL 交给 pdf.js `{ url }` 加载；异常/旧 data URL 兼容路径加 8MB 内联解码上限；`previewMaterialFile` 前端 API 已加运行时 payload 校验；库内缺失 PDF 父目录统一返回 `MaterialFileMissing`。
- V1.4 资料库位置设置已完成：主页新增“资料库位置”设置，目录选择由 Rust command 执行，用户选择一个存放位置后，App 实际使用其下 `StudySeqData\materials` 作为专用资料库；支持迁回默认 AppData 位置；启动和迁移后只把当前资料库目录加入 Tauri asset scope，不授权用户选择的根目录；导入命令只接受文件选择器授权过的 source path；迁移路径会校验已保存设置并使用 canonical 相对路径；迁移复制可重试，同内容目标副本允许继续；迁移后只删除已确认迁移的旧资料副本并清空库内空目录，不整目录删除用户手放文件。
- V1.4 顺手修复资料移动旧问题：重名资料移动时 `next_available_path` 现在始终返回资料库目录内路径，避免生成 `app/src-tauri/笔记 (1).txt` 这类工作目录残留。
- V1.4 版本号已统一为 `1.4.0`（package.json / package-lock.json / tauri.conf.json / Cargo.toml / Cargo.lock 中本 crate）。
- V1.4 已通过自动化验证：`npm.cmd test`（10 文件、126 测试）、`npm.cmd run typecheck`、`npm.cmd run build`、`cargo fmt --check`、`cargo test`（63 测试）、`cargo clippy -- -D warnings`、`npm.cmd run tauri -- build --debug`。
- V1.4 真实 App 手工验收已由用户完成，未发现问题；当前 V1.4 可视为开发与验收完成，下一步按需要生成正式 release 包、提交并推送 `codex/v1.4`、创建 V1.4 tag。
- V1.5 A1-D1 自动化开发已完成，参与角色包括 `planner`、`typescript-reviewer`、`rust-reviewer`、`react-build-resolver`、`security-reviewer`；用户已完成真实 App 手测，未发现 V1.5 阻塞问题。
- V1.5 已接入：主页最近打开摘要提供轻量“继续”入口，点击后仍进入当前详情页，由详情页按继续意图自动打开最近资料；PDF / 视频复用现有位置恢复，txt / 图片直接打开，文件夹上下文保持；当前文件夹资料定位、笔记保存状态、删除影响提示和图片 / 文本预览性能收口均已落地。
- V1.5 不做日历、足迹、统计、全文搜索、Office、富文本笔记、资料笔记强绑定、整文件夹导入、目录同步、打开原文件或旧独立阅读页。
- V1.5 没有新增 SQLite 表，没有提升 `PRAGMA user_version`；复用 `recentOpen`、`getLearningDetail`、`previewMaterialFile`、`getMaterialReadingState`，版本号已统一为 `1.5.0`。
- V1.5 C2 安全审查结论：未发现 P0；继续入口仍走 `previewMaterialFile`，`assetPath` 来自 Rust 校验后的资料库副本；文本预览有 2MB 保护；UI 不展示清理失败绝对路径。V1.6 候选：① 资料库位置设置避免直接信任前端传入路径字符串，改为 Rust command 合并选择与迁移或一次性 token；② `MaterialLibraryCleanupReport.failedPaths` 改为只返回失败数量或脱敏相对路径。
- V1.5 自动化验证已通过：`npm.cmd test`（10 文件、130 测试）、`npm.cmd run typecheck`、`npm.cmd run build`、`cargo fmt --check`、`cargo test`（64 测试）、`cargo clippy -- -D warnings`、`npm.cmd run tauri -- build --debug`。debug 包已生成；真实 App 手测已由用户完成，下一步按需要生成正式 release 包、提交、推送和 tag。
- V1.5 真实 App 手测观察项：① 搜索只覆盖本级资料夹，不能搜索更下一级文件夹，符合 V1.5 当前文件夹资料定位范围，递归/全局搜索后置；② 删除最近打开资料后，主页不引用已删除失效资料，但会回退到更上一次新打开的有效资料，符合“无失效引用”口径。
- V1.5 开发计划已更新：`product/docs/studyseq-v1.5-development-plan.md`。阶段为 A1 继续学习合同、A2 主页继续入口、A3 详情页自动打开资料、B1 当前文件夹资料定位、B2 笔记保存状态、B3 删除影响提示、C1 图片 / 文本预览性能收口、C2 安全边界回归、D1 回归验证与文档收口。
- 当前已完成 V1.6 A1-A5 自动化实现与自动化验证，参与角色包括 `planner`、`architect`、`ui-ux-designer`、`security-reviewer`、`rust-reviewer`、`typescript-reviewer`；V1.6 定位为“资料库安全边界与隐私收口”，不做新学习功能、不做大 UI 改版、不新增 SQLite schema。
- V1.6 已处理 V1.5 安全审查后续项：① 资料库位置设置不再让前端传任意路径字符串；② `MaterialLibraryCleanupReport.failedPaths` 已改为只返回失败数量 `failedPathCount`。
- V1.6 技术方案已落地：Rust command 负责目录选择、派生 `StudySeqData\materials`、生成 10 分钟一次性 token、应用迁移并更新 `material_library_dir` state 和 asset scope；前端只负责展示确认、提交 token 或 `{ kind: "default" }`，不拼接或提交路径 authority。
- V1.6 安全边界记录：repository 迁移失败前不追加新 asset scope；迁移成功后再追加当前资料库 scope。若 scope / state 更新失败，会尽力回滚 DB setting 与 `stored_path` 到旧资料库。Tauri asset scope 没有安全撤销 allow 的 API，旧资料库 scope 在同一 App 会话内可能残留，但前端只使用当前 DB `stored_path` 和 Rust 校验后的预览路径；迁移旧副本清理失败、删除学习内容或资料后的 App 管理副本清理失败都会返回脱敏数量 `failedCleanupPathCount`，前端只提示数量和稍后重试，不暴露本机路径。
- V1.6 不进入递归/全局/全文搜索、Office、整文件夹导入、目录同步、文件监听、迁移进度条、后台任务队列、多资料库、备份系统、打开原文件/所在文件夹、SQLite 加密、云同步、账号或大设置中心。
- V1.6 开发计划已更新：`product/docs/studyseq-v1.6-development-plan.md`。阶段 A1-A5 自动化验证已完成：`npm.cmd test`（10 文件、137 测试）、`npm.cmd run typecheck`、`npm.cmd run build`、`cargo fmt --check`、`cargo test`（72 测试）、`cargo clippy -- -D warnings`、`npm.cmd run tauri -- build --debug`、`npm.cmd run tauri -- build` 均通过。版本号已统一为 `1.6.0`。用户已完成真实 App 手测，未发现问题；审查发现的资料重命名回滚失败静默吞错、导入资料前端持有本机路径 authority、导入成功后前端仍收到 `originalPath` 三个阻塞项已修复；debug 包和正式 release 包均已重新生成；导入资料链路补充 smoke test 已通过。下一步可提交、推送并创建 V1.6 tag。
- V1.7 规划评估结论：正式主线应收敛为“当前学习内容资料定位增强”，即在详情页资料区支持 `当前文件夹 / 当前学习内容` 两档资料名和扩展名搜索，结果只显示逻辑资料树路径；不做全文搜索、PDF 提取、OCR、跨学习内容全局搜索，也不把 Office 转换纳入正式功能口径。
- 已新增隔离实验 `spikes/office2pdf/`：固定 `office2pdf = "=0.6.0"`，用于评估纯 Rust DOCX/XLSX/PPTX 转 PDF。该实验不接 Tauri command、不接 UI、不改 `app/src-tauri/Cargo.toml`、不进 release gate；输出目录 `spikes/office2pdf/out/` 和构建目录 `spikes/office2pdf/target/` 已忽略。当前最小 PPTX 自检已通过：运行时生成 PPTX，转出 `out/minimal-pptx.pdf`，输出以 `%PDF` 开头，warnings 为 0。
- V1.7 自动化实现已完成：`MaterialExplorer` 支持 `当前文件夹 / 当前学习内容` 两档搜索；当前学习内容搜索基于已加载的 `LearningDetail.materials` 递归匹配名称和扩展名，只显示逻辑路径，不展示 `storedPath` / AppData / asset URL；点击文件结果会切到父文件夹并打开内嵌阅读，点击文件夹只进入文件夹；pending-deleted 子树被排除。
- V1.7 稳定性修复已完成：资料预览失败会显示失败终态，不再卡在“正在加载资料预览”；PDF 翻页或缩放后立即返回资料列表会 flush 最后页码 / 缩放。
- V1.7 版本号已统一为 `1.7.0`。已验证：`npm.cmd test`（11 文件、154 测试）、V1.7 目标测试（3 文件、71 测试）、`npm.cmd run typecheck`、`npm.cmd run build`、`cargo fmt --check`、`cargo test`（72 测试）、`cargo clippy -- -D warnings`、`npm.cmd run tauri -- build --debug`、`npm.cmd run tauri -- build` 均通过；debug 与正式 release 包均已生成。
- V1.7 隔离真实 App 手测已完成：使用临时 identifier `com.studyseq.desktop.v17test`，未触碰正式 `com.studyseq.desktop` 用户数据。已验证当前文件夹不递归、当前学习内容递归搜索根/一级/二级资料、`pdf/.pdf/PDF` 扩展名匹配、搜索结果不泄露本机路径、点击嵌套 PDF 打开内嵌阅读、返回后停在父文件夹、PDF 缩放 `120%` 写入 SQLite、点击文件夹只进入文件夹、pending-deleted 子树隐藏且撤回恢复、预览失败显示“资料副本不存在，请重新导入”且不再卡 loading。临时 App 关闭后已重新生成官方 debug/release 构建产物。

## 已准备依赖

- 前端 PDF：`pdfjs-dist@6.0.227`，后续优先使用 `pdfjs-dist/legacy/build/pdf.mjs` 入口。
- Rust 文本编码：`encoding_rs@0.8.35`、`chardetng@1.0.0`。

## 不要忘记

- 不要把产品约束重新写回根目录 `AGENTS.md`。
- 不要把应用源码重新放回 `product/`。
- 除非内容真的变多，否则保持 `product/` 结构轻量。
- 修改根目录 `AGENTS.md` 前必须先询问用户并获得明确同意。
