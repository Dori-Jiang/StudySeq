# StudySeq / 知序 项目进度管理

## 管理规则

- 本文件由 `planner` 负责版本目标和阶段规划，由 `doc-updater` 负责阶段结束后的稳定记录更新。
- 本文件用于记录版本目标、开发进度、验收标准、阻塞点、下一步和推迟项。
- 只记录稳定事实和已确认事项，不记录临时想法。
- 新版本目标和阶段进度优先更新本文件，不再为每次讨论新建独立文档。
- `WORKING-CONTEXT.md` 不由单一管理型 agent 维护；阶段结束时由 `doc-updater` 按稳定事实更新。

## 当前阶段

当前进入 **V1.6 开发、验证、真实 App 手测完成，等待提交与 tag 收口阶段**。

V1.5 已完成自动化开发和用户手测；V1.6 已按“资料库安全边界与隐私收口”完成自动化实现、自动化验证、正式 release 发包和真实 App 手测。收口审查后的导入资料链路补充 smoke test 已通过，下一步可提交、推送并创建 V1.6 tag。

V1.6 不做新学习功能，不做大 UI 改版，不新增 SQLite schema；优先处理 V1.5 安全审查留下的两个后续项：资料库位置设置不再让前端传任意路径字符串，资料库清理结果不再向前端返回失败绝对路径。

V1.6 目标是在 V1.5 稳定闭环上收紧本地资料库维护边界：

```text
资料库位置准备
-> Rust 选择目录并生成一次性 token
-> 前端只做确认并提交 token
-> Rust 校验、迁移、更新 state 和 asset scope
-> cleanup 只返回失败数量
-> UI 提示可重试但不展示绝对路径
-> 回归验证与文档收口
```

## 版本目标

### V1：本地学习内容管理闭环

V1 目标：做一个 Windows 桌面端、本地优先、离线可用的学习资料管理与阅读 App。

V1 成功口径：

- 用户能创建学习内容。
- 用户能导入资料。
- 用户能在 App 内阅读 txt、图片、PDF。
- 用户能创建、编辑、删除纯文本笔记。
- 用户能关闭重开 App 后恢复学习内容、资料、笔记和阅读状态。
- 用户删除资料或笔记后，阅读页不引用失效状态。

V1 必须完成：

- 学习内容：创建、列表、删除、编辑基础字段。
- 学习内容基础字段：名称、状态、截止日期、预计工时、进度。
- 详情页：资料导入、资料列表、删除标记、撤回、保存删除。
- 详情页：资料删除失败项保留、错误提示清晰、可再次保存重试。
- 详情页：笔记列表、点开编辑、新建、保存、删除。
- 阅读页：txt、图片、PDF App 内阅读。
- PDF：A4 页框、上一页、下一页、页码、按钮缩放、`Ctrl + 鼠标滚轮` 缩放、中键拖动。
- 笔记：阅读页选择、新建、编辑、切换前自动保存、返回详情前保存。
- 阅读状态：PDF 当前页和缩放按资料恢复。
- 删除状态：删除资料后清理对应 PDF 阅读状态。
- 打包：debug 包可独立启动，不依赖 dev server。

V1 不进入：

- 云同步、账号系统、多端同步。
- Office 资料预览。
- 视频资料预览。
- Markdown / 富文本笔记。
- PDF 搜索、目录、大纲。
- 文件夹资料树。
- 资料重命名。
- 笔记分组。
- 自动学习进度检测。
- 日历中心布局。
- 复杂统计。
- SQLite 加密。
- PDF 页码、滚动位置和缩放比例的精细恢复。

### V1.1：继续阅读与资料治理

V1.1 目标：在不改变 V1 本地优先、离线优先和 App 内阅读主线的前提下，提升 PDF 继续阅读准确性，并让 App 管理的资料库占用可见、可清理。

V1.1 成功口径：

- 用户打开 PDF 到指定页并调整缩放后，返回详情、关闭重开、再次进入时能恢复同一资料、同一页码和同一缩放比例。
- 用户能看到 App 管理资料库的空间占用、资料数量、缺失文件和无引用文件数量。
- 用户能通过清理入口删除 App 管理目录中的无引用资料副本，且不会删除用户原始来源文件。
- 用户能重命名资料；重命名后详情页、阅读页和重启后的显示保持一致。
- 旧 SQLite 数据库能无损升级到 V1.1。

V1.1 必须完成：

- PDF 阅读状态恢复：保存和恢复当前 PDF 资料、当前页码、缩放比例。
- PDF 状态隔离：切换不同 PDF 时不串用旧页码或旧缩放；页码越界时按实际页数校正。
- 阅读状态数据迁移：为旧库补齐 V1.1 所需字段，迁移可重复执行。
- 资料库统计：统计 App 管理副本的数据库记录大小、实际文件大小、资料数量、缺失文件数、无引用文件数。
- 资料库清理：先统计、再确认、再清理无引用 App 管理副本；清理失败时给出明确提示并允许重试。
- 资料重命名：支持中文名、带扩展名名称、同名冲突提示；重命名后预览仍可打开。
- 工程验证：沿用 V1 的前端、Rust 和 Tauri debug build 验收命令。

V1.1 不进入：

- 云同步、账号系统、多端同步。
- Office App 内预览。
- Office 外部打开兜底。
- 视频资料预览或播放。
- PDF 搜索、目录、大纲。
- 文件夹资料树。
- 笔记分组。
- Markdown / 富文本笔记。
- 自动学习进度检测。
- 复杂统计图表。
- SQLite 加密。
- PDF 滚动位置精细恢复。

### V1.3：安全加固与体验一致性收口

V1.3 目标：在 V1.2 的 PDF 目录、视频播放、资料文件夹能力稳定后，处理 V1.2 审查遗留的非阻塞问题，提升安全边界、错误提示一致性和资料区状态连续性。

V1.3 成功口径：

- 资料预览不会读取 App 资料库目录外的 `stored_path`。
- API 错误面向用户展示稳定、友好的中文信息，不暴露底层路径、SQL 或系统错误原文。
- CSP 从 `null` 收紧后，txt、图片、PDF、MP4/WebM 预览仍正常。
- 从文件夹内打开资料并返回后，资料区仍停留在原文件夹。
- 保存笔记、删除笔记失败时不丢输入、不误判成功。
- 资料库清理的数据库删除段具备事务保护，确认文案和实际行为一致。
- V1.2 的 PDF 目录、视频播放、资料文件夹能力不回退。

V1.3 不进入：

- 大 UI 改版。
- 新视频格式支持。
- 视频播放进度记忆。
- PDF 全文搜索。
- Office 预览或 Office 转 PDF。
- 笔记分组。
- 云同步、账号系统、多端同步。
- 拖拽移动资料 / 文件夹。
- 跨学习内容移动资料。

### V1.4：主页最近打开位置

V1.4 目标：在主页学习内容列表中，为每个学习主题显示最近打开位置，帮助用户从上次阅读或播放的位置继续学习。

V1.4 独立开发文档：[`studyseq-v1.4-development-plan.md`](studyseq-v1.4-development-plan.md)。

V1.4 成功口径：

- 主页仍保持单栏学习内容列表，不新增日历、时间线、右侧信息面板或独立足迹列表。
- 每个学习主题栏只显示最近学习相关的三类信息：上次打开时间、上次打开文件、上次打开文件 / 视频到哪里。
- PDF 能显示上次打开页码。
- 视频能显示上次播放时间点，并在再次打开时恢复播放位置。
- 普通文件能显示上次打开文件和时间；无法定位具体位置时不强行展示虚假位置。
- 删除资料或删除学习内容后，主页最近打开摘要不会引用失效资料。

V1.4 不进入：

- 日历打卡。
- 最近自动足迹列表。
- 右侧自动记录规则。
- 近 14 天足迹或热度图。
- 当前重点模块。
- 学习时长统计。
- 连续学习天数。
- 自动计算学习进度百分比。
- 独立学习记录中心。
- 手写笔记。
- Office 转 PDF。

### V1.5：一键继续学习 + 轻量效率收口

V1.5 目标：用户在主页看到最近打开资料后，可以通过轻量“继续”入口直接进入详情页，并在详情页内嵌阅读区打开对应资料；同时补齐当前文件夹资料定位、笔记保存反馈、删除影响提示和预览性能保护这些低风险效率项。

V1.5 独立开发文档：[`studyseq-v1.5-development-plan.md`](studyseq-v1.5-development-plan.md)。

当前状态（2026-06-14）：A1-D1 自动化部分已完成，版本号已统一为 `1.5.0`；用户已完成真实 App 手测，未发现 V1.5 阻塞问题。

V1.5 成功口径：

- 主页学习内容栏在有最近打开记录时提供“继续”入口。
- 普通点击学习内容仍进入详情页，不强制自动打开最近资料。
- 点击“继续”后仍进入当前详情页 `/studies/:studyId`，不得恢复旧独立阅读页。
- 详情页根据继续意图自动打开目标资料。
- PDF 继续复用当前页码和缩放恢复。
- 视频继续复用播放秒数恢复。
- txt / 图片可直接打开。
- 目标资料位于文件夹内时，返回资料列表后仍停留在该文件夹。
- 目标资料失效、缺失、变成文件夹或预览失败时，详情页非阻塞提示并回到正常详情页状态。
- 资料区支持当前文件夹内的文件名搜索 / 筛选 / 排序，不做全文搜索。
- 笔记保存成功或失败有轻量状态反馈，失败时不丢输入。
- 删除文件夹前更明确展示递归影响摘要。
- 图片预览和文本预览做轻量性能保护，避免大文件搬运造成明显卡顿。

V1.5 不进入：

- 日历、打卡、连续学习天数、学习时长、热度图。
- 独立学习记录中心或最近足迹列表。
- PDF 全文搜索、书签、自定义目录。
- Office 预览、Office 转 PDF、Office 外部打开兜底。
- 新视频格式、字幕、倍速增强、转码。
- 资料全文搜索、PDF 文本抽取、OCR、缩略图全库扫描。
- 笔记分组、富文本、Markdown、标签、双向链接、资料笔记强绑定。
- 自动计算学习进度百分比。
- 整文件夹导入、目录同步、文件监听。
- 打开原文件、打开所在文件夹、保留原路径引用。
- 新增旧独立阅读页或恢复 `/studies/:studyId/read` 路由。

### V1.6：资料库安全边界与隐私收口

V1.6 目标：让本地资料库位置变更更可靠、更可控，并减少 Tauri command 响应中的本机路径暴露面。

V1.6 独立开发文档：[`studyseq-v1.6-development-plan.md`](studyseq-v1.6-development-plan.md)。

当前状态（2026-06-15）：V1.6 A1-A5 自动化实现和自动化验证已完成，版本号已统一为 `1.6.0`；用户已完成真实 App 手测，未发现问题；debug 包和正式 release 包均已重新生成。实现采用一次性 token：Rust 负责目录选择、目标路径派生、token 生成和迁移应用；前端只负责确认和提交 token。收口审查发现的资料重命名回滚失败静默吞错、导入资料前端持有本机路径 authority、导入成功后前端仍收到 `originalPath` 三个阻塞项已修复。导入资料链路在收口审查后改为 Rust command 内部文件选择，并已通过真实 App 补充 smoke test。

V1.6 成功口径：

- 前端不再向 Rust 提交任意资料库路径字符串来触发迁移。
- 资料库位置变更由 Rust 目录选择结果或 Rust 内部默认位置分支驱动。
- 用户仍能选择新的资料库存放位置，并确认迁移到所选位置下的 `StudySeqData\materials`。
- 用户仍能迁回默认 AppData 资料库位置。
- 迁移失败时旧资料库仍保持可用，不更新 setting，不扩大 asset scope。
- 资料库清理失败时，前端只拿到失败数量，不拿到失败绝对路径。
- 清理结果文案继续说明失败数量和可重试，不展示 `C:\Users\...`、盘符、UNC 路径或完整本机路径。
- V1.5 的“继续”入口、详情页自动打开资料、当前文件夹定位、PDF / 视频 / 图片 / txt 预览不回退。

当前实现说明：

- 旧 `choose_material_library_storage_root` + `set_material_library_location({ path })` Tauri command 链路已移除；repository 内部保留 `set_material_library_location` 作为 Rust 内部迁移方法。
- `prepare_material_library_location_change` 生成 10 分钟一次性 token；`apply_material_library_location_change` 只接受 `{ kind: "selected", token }` 或 `{ kind: "default" }`。
- repository 迁移失败前不追加新 asset scope；迁移成功后再追加当前资料库 scope 并更新运行时 state；若 scope / state 更新失败，会尽力把 DB setting 与 `stored_path` 回滚到旧资料库。
- Tauri asset scope 追加授权没有安全撤销 API；旧资料库 scope 在同一 App 会话内可能残留，但前端只使用当前 DB `stored_path` 和 Rust 校验后的预览路径。
- 资料库旧副本清理仍是 best-effort；清理失败返回脱敏数量 `failedCleanupPathCount`，不暴露旧路径给前端。
- 删除学习内容或资料时，DB 删除成功但 App 管理副本清理失败会返回脱敏数量 `failedCleanupPathCount`，前端移除已删记录并提示可稍后用资料库清理重试，不返回本机路径。

V1.6 不进入：

- 递归搜索、全局资料搜索、资料全文搜索。
- Office 预览、Office 转 PDF、Office 外部打开。
- 整文件夹导入、目录同步、文件监听。
- 资料库迁移进度条、后台任务队列、取消迁移。
- 多资料库、历史资料库位置列表、备份系统。
- 打开原文件、打开所在文件夹。
- SQLite 加密、云同步、账号、多端。
- 大设置中心、主题设置、快捷键设置。
- 恢复旧独立阅读页或 `/studies/:studyId/read` 路由。

### V2：后续扩展候选

V2 以后再评估：

- Office 转 PDF 后 App 内阅读。
- 视频转码或播放内核。
- PDF 全文搜索。
- 复杂资料树和拖拽移动。
- 笔记分组。
- 云同步、账号、多端同步。
- SQLite 加密。
- 自动进度检测和学习记录统计。

## 已完成

- 产品命名已确认：中文 `知序`，英文 `StudySeq`。
- v1 技术文档已完成：`product/docs/studyseq-v1-technical-design.md`。
- 原始产品策划、产品设计文档和 UI 概念 HTML 已保留作参考。
- V1 设计已经固定到当前 App 实现；后续实现以详情页内嵌阅读主线为准。
- 技术路线已确认：

```text
Tauri 2 + Vite + React + TypeScript + Rust + SQLite
```

- 项目 agent 团队已改为任务型角色：`planner` 负责规划，`architect` 负责跨层技术判断，`doc-updater` 负责稳定记录。
- `app/` 已建立 Tauri 2 + Vite + React + TypeScript + Rust + SQLite 骨架。
- 已实现学习内容创建、SQLite 持久化、主页列表展示。
- 已实现主页删除学习内容，删除前二次确认。
- 已实现主页展示名称、状态、进度、截止日期和学习内容行内进度条。
- 已实现主页编辑学习内容完整基础字段：名称、状态、预计工时、截止日期、进度。
- 已实现学习内容详情页。
- 已实现详情页学习内容进度条显示。
- 已实现资料导入到 App 本地资料库。
- 已实现同名资料文件导入时自动追加后缀。
- 已实现详情页根目录资料文件列表。
- 已实现资料大小按 `B / KB / MB / GB` 显示。
- 已实现资料删除标记、撤回、保存后正式删除。
- 已实现资料删除失败项保留、错误提示和再次保存重试。
- 已确认资料删除只删除 App 管理副本和数据库记录，不删除用户原始来源文件。
- 已取消详情页轻量预览，详情页资料只保留阅读入口。
- 已实现纯文本笔记创建。
- 已实现详情页笔记列表点开编辑。
- 已实现详情页笔记删除，删除前二次确认。
- 已实现阅读页。
- 已实现 Rust 统一资料预览接口：txt、图片、PDF。
- 已实现阅读页 txt、图片、PDF App 内阅读。
- 已实现 PDF A4 页框、上一页、下一页、页码显示、按钮缩放、`Ctrl + 鼠标滚轮` 缩放、中键拖动。
- 已实现阅读页笔记选择、创建、编辑和删除当前笔记。
- 已实现切换笔记前自动保存当前笔记。
- 已实现返回详情前自动保存当前笔记和阅读状态。
- 已移除旧 `reading_states` 状态链路；当前阅读状态只保留按资料保存的 PDF 页码和缩放。
- 已实现删除资料后清理对应 `material_reading_states` 状态。
- 已实现 V1.1 PDF 阅读状态表 `material_reading_states`，按资料独立保存页码和缩放。
- 已实现 `PRAGMA user_version` 数据库迁移，旧 SQLite 可无损补齐 V1.1 表结构。
- 已实现资料库统计：资料数量、数据库记录大小、实际引用文件大小、磁盘占用、缺失文件数、无引用文件数。
- 已实现资料库清理：清理 App 管理目录内无引用文件，自动删除不再关联学习内容的孤儿资料记录和对应 App 管理副本，不删除用户原始来源文件。
- 已实现资料重命名：支持中文名、带扩展名名称、同名自动追加后缀，重命名后预览仍可打开。
- 已实现删除学习内容时级联删除关联资料、笔记和资料阅读状态；删除前使用 App 内确认弹窗明确提示用户，且不删除用户原始来源文件。
- 已实现阅读页 PDF 当前页和缩放恢复，切换不同 PDF 时按 `material_id` 隔离状态，并采用低频防抖保存。
- 已修复详情页内嵌 PDF 阅读器未接入阅读状态的问题；详情页打开 PDF 也会恢复和保存当前页码、缩放比例。
- 已优化详情页内嵌 PDF 阅读流畅度：复用已加载 PDF 文档、预渲染当前页相邻页，并对连续缩放渲染做防抖。
- 已删除废弃的独立阅读页实现、`/studies/:studyId/read` 路由、对应测试和专属样式，避免后续功能继续接入旧页面。
- 已删除旧 `reading_states` 前后端接口、类型、命令、repository 方法和新库建表逻辑；旧库升级会删除该旧表。
- 已恢复保留 `product/Learning_OS_Product_Summary.pdf` 和 `product/Learning_OS_Product_Summary_CN.pdf`。
- 已实现详情页资料库统计手动刷新、清理前强制刷新、清理结果提示和资料重命名入口。
- 已完成详情页阅读框中等上移微调，只压缩顶部垂直间距，不改变资料、笔记、PDF 阅读和分栏结构。
- 已通过测试验证学习内容、资料、笔记、阅读状态可持久化。
- 已通过测试验证学习内容完整字段编辑和资料删除失败重试。
- 已通过测试验证 V1.1 数据迁移、PDF 阅读状态、详情页内嵌 PDF 继续阅读、资料库统计清理、资料重命名和前端关键交互。
- 已通过完整工程验证：前端测试、类型检查、前端构建、Rust fmt、Rust 测试、Rust clippy、Tauri release build。
- 已修复 V1.1 release 包启动时出现黑色控制台窗口的问题，并新增静态检查脚本防回归。
- 已生成 V1.1 release 包：`app/src-tauri/target/release/studyseq.exe`、`app/src-tauri/target/release/bundle/msi/StudySeq_1.1.0_x64_en-US.msi`、`app/src-tauri/target/release/bundle/nsis/StudySeq_1.1.0_x64-setup.exe`。

## 待发布

- 如需要远端发布，推送当前 V1.1 提交并按发布流程创建 tag。
- 当前已完成本地提交和本地 V1.1 release 发包。

## 阻塞点

- 暂无阻塞点。

## V1 手工验收标准

必须使用真实 Tauri App 验收：

1. 新建学习内容，关闭重开 App 后仍存在。
2. 编辑名称、状态、预计工时、截止日期、进度，关闭重开后正确恢复。
3. 导入 txt、图片、多页 PDF，详情页列表显示正确。
4. 关闭重开 App 后，已导入资料仍可阅读。
5. txt 能正常显示正文。
6. 图片能正常显示。
7. PDF 能翻页、按钮缩放、`Ctrl + 鼠标滚轮` 缩放、中键拖动。
8. 创建笔记后，关闭重开 App 后仍存在。
9. 点开已有笔记编辑，保存后详情页和阅读页都能看到更新。
10. 阅读页编辑笔记后，切换笔记、返回详情、关闭重开后内容不丢。
11. 调整阅读页分栏比例后，退出再进入能恢复。
12. 删除资料进入可撤回状态；撤回后资料恢复。
13. 保存资料删除后，资料正式从 App 管理副本和数据库记录中删除。
14. 删除当前阅读资料后，再进入阅读页不报错，不引用失效资料。
15. 删除当前笔记后，阅读页回到新建笔记状态，不保留失效选择。
16. 断网状态下，上述流程全部可用。
17. debug 包独立启动，不访问 `localhost`。

## V1 工程验收标准

发布前必须全部通过：

```text
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
cargo fmt --check
cargo test
cargo clippy -- -D warnings
npm.cmd run tauri -- build --debug
```

发布前还要确认：

- 无硬编码密钥、token、密码。
- 前端不直接访问 SQLite。
- SQLite、文件复制、文件删除、资料预览只由 Rust repository / command 层处理。
- 进度只能是 0 到 100。
- 状态只能是固定枚举。
- 删除前有二次确认或明确撤回路径。
- 新安装环境可以完成数据库初始化。
- Windows 真实路径、中文文件名、同名资料导入后缀逻辑可用。
- 打包后的 PDF worker 路径可用。

## V1.1 开发内容

### P0：PDF 当前页和缩放恢复

目标：让 PDF 资料真正支持“继续阅读”。

实现内容：

- 前端在 PDF 翻页和缩放时保存当前页码和缩放比例。
- 阅读状态需要记录当前 PDF 资料、页码和缩放比例。
- Rust 新增 `MaterialReadingState` / `SaveMaterialReadingStateInput`。
- SQLite 新增 `material_reading_states`，按 `material_id` 保存 PDF 状态。
- SQLite 迁移采用 `PRAGMA user_version`。
- 恢复 PDF 时必须在页数加载后校正页码，避免越界。

### P0：资料库空间占用统计和清理入口

目标：让用户知道 App 管理资料库占了多少空间，并能清理无引用副本。

实现内容：

- 显示当前学习内容的资料数量和总大小。
- 显示 App 管理资料库的总占用、缺失文件数、无引用文件数。
- 清理入口只清理 App 管理目录中的无引用文件。
- 不再关联学习内容的孤儿资料数据库记录和对应 App 管理副本可自动清理。
- 资料库统计不在每次进入详情页时全量扫描，采用手动刷新和低频刷新口径。
- 清理前必须二次确认。
- 清理前必须强制刷新统计。
- 清理失败时保留错误提示，允许再次重试。

安全口径：

- 清理只作用于 App 管理副本。
- 不删除用户原始来源文件。
- 不做全盘扫描，只扫描 App 管理资料目录。

### P1：资料重命名

目标：补齐最小资料管理能力。

实现内容：

- 详情页资料行提供重命名入口。
- 名称不能为空。
- 同一学习内容下重名时自动追加后缀。
- 支持中文名和带扩展名名称。
- 重命名后详情页、阅读页、重启后显示一致。
- 重命名失败时不能留下数据库和文件系统不一致的半成功状态。

## V1.1 手工验收标准

必须使用真实 Tauri App 验收：

1. 打开 PDF 到第 N 页，调整缩放比例，返回详情后再次进入能恢复页码和缩放。
2. 打开 PDF 到第 N 页，调整缩放比例，关闭重开 App 后能恢复页码和缩放。
3. 切换到另一个 PDF 后，不串用上一个 PDF 的页码和缩放。
4. PDF 页码超过实际页数时，能自动校正到有效页码。
5. 资料库统计能显示资料数量、总大小、缺失文件数和无引用文件数。
6. 导入资料后，资料库占用统计增加。
7. 删除资料并保存后，资料库占用统计变化正确。
8. 清理入口只清理 App 管理目录中的无引用文件。
9. 清理入口不会删除用户原始来源文件。
10. 清理失败时有明确提示，并可再次重试。
11. 资料重命名后，详情页显示新名称。
12. 资料重命名后，阅读页仍可打开并预览。
13. 资料重命名后，关闭重开 App 仍显示新名称。
14. 同一学习内容下资料重名时有明确提示，不覆盖已有资料。
15. 中文文件名、空格、常见标点名称可正常处理。
16. 断网状态下，上述流程全部可用。

## V1.1 工程验收标准

发布前必须全部通过：

```text
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
cargo fmt --check
cargo test
cargo clippy -- -D warnings
npm.cmd run tauri -- build --debug
```

发布前还要确认：

- 旧 SQLite 数据库可以无损升级到 V1.1。
- 新增迁移可重复执行，不破坏已有数据。
- 前端仍不直接访问 SQLite。
- 资料统计、清理、重命名只通过 Rust command / repository 执行。
- 清理只处理 App 管理目录，不触碰用户原始来源路径。
- 资料重命名的文件系统操作和数据库更新有明确失败处理。
- PDF worker 在打包后的真实 Tauri App 中仍可用。

## V1.3 开发计划

V1.3 采用 A1-A7 分阶段推进。阶段顺序按 `planner`、`architect`、`doc-updater` 三个 agent 的结论合并：先安全边界，再错误合同，再清理一致性和前端状态，最后真实 App 回归与发包。

| 阶段 | 主题 | 目标 | 主要工作 | 验收标准 | 建议 agent |
| --- | --- | --- | --- | --- | --- |
| A1 | 资料预览路径防御 | 补齐 `preview_material_file` 的只读路径安全边界 | repository 读取 `stored_path` 后，用 App 资料库目录做 canonical 校验；库外路径返回稳定错误；补库内、库外、缺失文件、folder、video/unsupported 用例 | 库内 txt/图片/PDF 正常预览；库外路径不被读取；Rust 测试覆盖 | `tdd-guide`、`rust-reviewer`、`security-reviewer` |
| A2 | API 错误合同收敛 | 避免向前端透传底层 DB/IO 错误原文 | 将 `ApiError` 调整为稳定 `code + message` 合同；数据库、文件系统、路径越界、状态不可用等错误映射为用户友好中文文案；前端统一消费稳定错误 | UI 不显示本机绝对路径、SQL 或系统错误原文；前端/Rust 错误路径测试通过 | `security-reviewer`、`typescript-reviewer` |
| A3 | CSP 安全策略收口 | 将 Tauri CSP 从 `null` 收紧为可运行的最小策略 | 更新 `tauri.conf.json`；确保 PDF worker/canvas、图片/data URL、asset 视频流、txt 预览可用；分 debug/release 真实 App 验证 | 打包后 txt、图片、PDF、MP4/WebM 均可预览；MKV 等仍显示不支持；无关键 CSP 阻断 | `security-reviewer`、`typescript-reviewer`、`e2e-runner` |
| A4 | 资料库清理一致性 | 让 cleanup 的数据库删除段可重试、可收敛 | 孤儿资料记录和阅读状态删除放入事务；文件系统删除仍按可重试副作用处理；修正清理确认文案与实际行为 | 清理失败不产生半清理 DB 状态；重复清理可收敛；确认文案准确描述清理对象 | `tdd-guide`、`database-reviewer`、`rust-reviewer` |
| A5 | 资料区位置恢复 | 保留用户在资料文件夹中的当前上下文 | 将 `currentFolderId` 提升到详情页或等价受控状态；阅读模式切换不丢当前文件夹；删除当前文件夹后回到合理层级 | 子文件夹内打开资料并返回后仍停留原文件夹；不新增数据库持久化需求 | `typescript-reviewer`、`react-reviewer` |
| A6 | 笔记操作错误处理 | 补齐保存/删除笔记失败态 | 保存笔记、删除笔记路径增加 try/catch；保存失败保留输入；删除失败不从 UI 移除笔记；错误提示统一 | 保存失败不丢内容；删除失败有明确提示；用户可继续编辑或重试；前端测试覆盖 | `tdd-guide`、`typescript-reviewer` |
| A7 | 回归验证与发布准备 | 确认 V1.2 主线不回退并准备 V1.3 release | 跑完整工程验证；真实 App 手测大 MP4 Range、WebM/MKV、中文名视频、V1.1 旧库升级、文件夹嵌套/移动/递归删除、删除学习内容无残留、断网全流程；版本号统一为 `1.3.0` 后发包 | 前端测试、类型检查、构建、Rust fmt/test/clippy、Tauri debug build 通过；真实 App 手测通过；正式包生成 | `e2e-runner`、`build-error-resolver`、`doc-updater` |

### V1.3 自动化完成记录

| 阶段 | 状态 | 完成内容 | 自动化验证 |
| --- | --- | --- | --- |
| A1 | 已完成 | `preview_material_file` 从 command 层传入 App 资料库目录，读取前做 canonical 路径校验；库外、相对穿越、缺失副本、folder、video/unsupported 均有 Rust 覆盖。 | `cargo test preview` 通过；全量 `cargo test` 通过。 |
| A2 | 已完成 | `ApiError` 改为稳定 `code + message`；DB/IO 错误映射为用户友好中文文案；前端只展示稳定 `ApiError` message，未知运行时错误统一显示通用文案。 | `errors::tests::api_error_hides_database_and_io_details` 通过；`toUserMessage` 和页面错误泄露测试通过。 |
| A3 | 已完成自动化部分 | `tauri.conf.json` CSP 从 `null` 收紧为最小策略，保留 data URL、asset 视频、PDF worker 所需来源。 | `npm.cmd run build`、`npm.cmd run tauri -- build --debug`、`npm.cmd run tauri -- build` 通过；真实 App CSP 手测待执行。 |
| A4 | 已完成 | `MaterialLibraryStats` 增 `orphanDatabaseRecordCount`；cleanup 孤儿记录和阅读状态删除改为单事务；确认文案改为无引用文件 + 孤儿资料记录，缺失文件只作为统计提示。 | Rust cleanup 测试、前端确认文案测试通过；全量前端/Rust 测试通过。 |
| A5 | 已完成 | `currentFolderId` 提升到 `StudyDetailPage` 受控状态；内嵌阅读返回后保留当前文件夹；删除当前文件夹后回到最近仍存在的父级。 | `StudyDetailPage.test.tsx` 覆盖打开资料返回、删除当前文件夹回退。 |
| A6 | 已完成 | 保存笔记和删除笔记增加 try/catch；保存失败保留草稿；删除失败不移除笔记并允许重试。 | `StudyDetailPage.test.tsx` 覆盖新建保存失败、更新失败、删除失败和删除重试。 |
| A7 | 已完成自动化部分 | 版本号统一为 `1.3.0`，debug 包和正式 release 包均已生成。 | V1.3 工程验收命令全部通过；真实 App 手工验收待用户执行。 |

## V1.4 开发计划

V1.4 采用 A1-A6 分阶段推进。阶段顺序先稳定数据合同，再接入 PDF / 视频 / 普通文件的最近位置保存，最后改造主页 UI 和回归验证。

详细开发计划、验收标准和风险记录见 [`studyseq-v1.4-development-plan.md`](studyseq-v1.4-development-plan.md)。

| 阶段 | 主题 | 目标 | 主要工作 | 验收标准 | 建议 agent |
| --- | --- | --- | --- | --- | --- |
| A1 | 最近打开数据模型 | 定义主页最近打开摘要的数据来源 | 为资料最近打开状态设计字段或表结构；覆盖 `last_opened_at`、最近位置类型、PDF 页码、视频秒数、普通文件空位置；确定旧库迁移策略 | 旧 SQLite 可升级；无记录时主页稳定显示空状态；删除资料后不留悬空摘要 | `architect`、`database-reviewer` |
| A2 | 后端保存与查询命令 | 让 Rust / Tauri 层负责最近打开状态 | 新增或扩展 command：打开资料时记录时间；PDF 翻页保存页码；视频播放保存秒数；主页列表返回每个学习内容的最近打开摘要 | Rust 测试覆盖保存、查询、旧数据为空、资料删除清理和学习内容删除清理 | `tdd-guide`、`rust-reviewer` |
| A3 | 视频播放进度记忆 | 补齐视频继续播放能力 | 在现有视频预览中保存 `currentTime`；重新打开同一视频时恢复播放时间点；切换资料时隔离状态 | MP4 / WebM 重新打开能回到上次位置；切换视频不串位置；不支持格式不写入播放位置 | `typescript-reviewer`、`e2e-runner` |
| A4 | PDF / 普通文件最近位置统一 | 统一主页展示口径 | 复用已有 PDF 阅读状态输出页码；普通文件只记录上次打开时间和文件名；位置不存在时不展示虚假位置 | PDF 显示“第 N 页”；视频显示 `00:24:18`；普通文件显示文件名和上次打开时间 | `typescript-reviewer` |
| A5 | 主页主题栏 UI 改造 | 将最近打开摘要嵌入每个学习主题栏 | 每个学习主题栏展示三项：上次打开时间、上次打开文件、上次打开到哪里；不新增右侧栏、日历、时间线或独立记录区 | 主页仍是单栏列表；无记录显示“暂无打开记录”；长文件名不挤压操作按钮 | `react-reviewer`、`a11y-architect` |
| A6 | 回归验证与文档收口 | 确认 V1.4 不破坏 V1.2 / V1.3 主线 | 更新项目文档和验收标准；跑前端、Rust、Tauri 构建；真实 App 手测 PDF、视频、普通文件、删除资料、删除学习内容、旧库升级 | 自动化命令通过；真实 App 下 PDF / 视频 / 普通文件最近位置正确；删除后无失效引用 | `e2e-runner`、`doc-updater` |

### V1.4 自动化完成记录

| 阶段 | 状态 | 完成内容 | 自动化验证 |
| --- | --- | --- | --- |
| A1 | 已完成 | 复用并扩展 `material_reading_states`，新增 `last_opened_at`、`position_kind`、`video_position_seconds`；新增 `app_settings` 保存资料库位置，数据库升级到 `user_version = 6`；主页摘要由 Rust repository 通过 `material_items` join 生成，并在 Tauri 主页列表命令中过滤失效资料副本。 | Rust 覆盖新库 v6、v1/v3 旧库升级、旧 PDF 状态保留、无记录空状态、失效副本过滤和资料库位置安全校验。 |
| A2 | 已完成 | `list_learning_contents` 返回 `recentOpen`；`preview_material_file` 成功预览普通文件/PDF/图片/视频后记录打开时间；`save_material_reading_state` 写入 PDF 最近页码；新增 `save_video_playback_state` 保存视频秒数且校验 App 资料库副本仍存在。 | Rust 覆盖普通文件/PDF/视频摘要、删除资料清理、folder/不存在资料拒绝、视频进度库内/缺失副本拒绝。 |
| A3 | 已完成 | `VideoPreview` 支持从上次秒数恢复播放；播放位置按 10 秒阈值、暂停、跳转和卸载低频保存；切换资料仍靠 `key={material.id}` 隔离状态；metadata-only 卸载不会写入 0。 | `VideoPreview.test.tsx` 和 `StudyDetailPage.test.tsx` 覆盖恢复、保存、跳转、早期卸载和 stale 请求。 |
| A4 | 已完成 | PDF 主页显示“第 N 页”；视频显示 `MM:SS` 或 `HH:MM:SS`；普通文件只显示打开时间和文件名，不显示虚假位置。 | `HomePage.test.tsx` 覆盖 PDF/视频/空状态展示。 |
| A5 | 已完成 | 主页仍为单栏学习内容列表，在每个学习主题栏内嵌最近打开摘要；不新增日历、时间线、右侧信息面板或统计模块；长文件名使用截断/换行样式；最近打开摘要作为链接可访问描述。 | `HomePage.test.tsx` 覆盖无统计模块、摘要展示和可访问描述；前端构建通过。 |
| A6 | 已完成 | 版本号统一为 `1.4.0`；文档记录 V1.4 自动化完成状态；真实 App 手工验收已由用户完成，未发现问题。 | 当前已通过 `npm.cmd test`（10 文件、126 测试）、`npm.cmd run typecheck`、`npm.cmd run build`、`cargo fmt --check`、`cargo test`（63 测试）、`cargo clippy -- -D warnings`、`npm.cmd run tauri -- build --debug`；用户完成真实 App 手工验收。 |

V1.4 审查修复：PDF 页码状态保存现在要求资料是库内存在的 PDF；视频预览和视频进度保存都要求 App 管理副本存在且位于资料库内；主页 `recentOpen` 查询过滤失效副本；视频进度保存不再刷新 `last_opened_at`；视频组件 metadata-only 卸载不会写入 0；详情页打开资料成功/失败都增加过期请求保护；主页最近打开摘要加入可访问描述；前端 API 对最近打开位置和阅读状态做轻量运行时校验。

V1.4 产品层空间治理：主页新增资料库位置设置，目录选择由 Rust command 执行，用户选择的是存放位置，App 实际使用其下 `StudySeqData\materials` 专用目录；支持迁回默认 AppData 位置；启动和迁移后只把当前资料库目录加入 Tauri asset scope，不授权用户选择的根目录；导入命令只接受文件选择器授权过的来源文件；保存的资料库路径会做安全校验；迁移成功后只清理已确认迁移的旧副本，不整目录删除用户手放文件。

V1.4 收口中同时修复资料移动旧问题：重名资料移动时 `next_available_path` 始终返回资料库目录内路径，避免在 `app/src-tauri` 工作目录生成 `笔记 (1).txt` 这类残留。

## V1.5 开发计划

V1.5 采用 A/B/C/D 四组推进。A 组先闭合“一键继续学习”，B 组合并低风险效率项，C 组做预览性能与安全边界，D 组回归验证与文档收口。

详细开发计划、验收标准和风险记录见 [`studyseq-v1.5-development-plan.md`](studyseq-v1.5-development-plan.md)。

| 阶段 | 主题 | 目标 | 主要工作 | 验收标准 | 建议 agent |
| --- | --- | --- | --- | --- | --- |
| A1 | 继续学习合同 | 固定主页到详情页的继续意图 | 明确 query 合同；前端测试先覆盖有/无 `recentOpen`、链接参数、详情页只处理一次继续意图 | 有记录才显示继续入口；query 中 `materialId` 不会触发重复打开循环 | `planner`、`tdd-guide` |
| A2 | 主页继续入口 | 把 V1.4 最近打开摘要变成可执行入口 | 在学习内容栏增加独立“继续”按钮或链接；保留整行进入详情页行为；处理长文件名和操作按钮布局 | 普通点击仍只进详情；点“继续”才自动打开最近资料；主页仍是单栏列表 | `ui-ux-designer`、`react-reviewer` |
| A3 | 详情页自动打开资料 | 在当前详情页主线中恢复学习现场 | 读取 query；在 `getLearningDetail` 后查找目标资料；校验目标是文件；设置当前文件夹；调用现有打开资料逻辑；复用过期请求保护 | PDF / 视频 / txt / 图片可自动打开；文件夹内资料返回后停留原文件夹；失效资料降级不崩 | `architect`、`typescript-reviewer` |
| B1 | 当前文件夹资料定位 | 降低资料数量变多后的查找摩擦 | 在资料区做当前文件夹内文件名搜索、类型筛选、排序；不做全文搜索；不新增 command | 中文/英文/扩展名可过滤；文件夹上下文不丢；空结果有轻提示 | `ui-ux-designer`、`typescript-reviewer` |
| B2 | 笔记保存状态 | 让用户明确笔记是否保存成功 | 保存成功显示“已保存 HH:MM”；保存失败保留输入并显示错误；不引入富文本和复杂自动保存 | 成功状态只在保存成功后出现；失败不清空标题/正文；重启后数据一致 | `tdd-guide`、`react-reviewer` |
| B3 | 删除影响提示 | 减少文件夹递归删除误判 | 删除文件夹前更明确显示包含文件数和子文件夹数；删除栏摘要同步递归影响 | 用户能看到真实影响范围；删除仍只影响 App 管理副本 | `security-reviewer`、`react-reviewer` |
| C1 | 图片 / 文本预览性能收口 | 降低大图和大文本预览卡顿风险 | 图片预览改走 asset URL 或等价轻量路径；文本预览增加大小保护和明确提示 | 大图不经 invoke/base64 大量搬运；超大文本有稳定提示；txt/图片/PDF/视频不回退 | `architect`、`rust-reviewer`、`typescript-reviewer` |
| C2 | 安全边界回归 | 确保新增入口和效率项不扩大文件访问面 | 继续入口、搜索、预览、删除提示都不绕过 Rust 边界；评估资料库位置设置和删除副本失败可见化是否本版处理 | 不读取库外文件；不扩大 asset scope；错误文案不泄露底层路径 | `security-reviewer`、`e2e-runner` |
| D1 | 回归验证与文档收口 | 确认 V1.5 不破坏 V1.2-V1.4 主线 | 更新项目进度、工作上下文和版本号；跑前端/Rust/Tauri 自动化验证；整理真实 App 手测清单 | 自动化命令通过；真实 App 手测完成；文档状态一致 | `e2e-runner`、`doc-updater` |

### V1.5 自动化完成记录

| 阶段 | 状态 | 完成内容 | 自动化验证 |
| --- | --- | --- | --- |
| A1 | 已完成 | 固定继续入口合同为 `/studies/:studyId?continue=1&materialId=<materialId>`；普通详情入口不携带继续意图。 | 前端测试覆盖链接参数和 query 自动打开。 |
| A2 | 已完成 | 主页最近打开摘要新增独立“继续”入口，保留整行进入详情页行为。 | `HomePage.test.tsx` 覆盖继续入口显示/隐藏。 |
| A3 | 已完成 | 详情页按继续意图自动打开目标资料，保持文件夹上下文，失效目标轻提示。 | `StudyDetailPage.test.tsx` 覆盖自动打开、缺失降级和过期请求保护。 |
| B1 | 已完成 | 当前文件夹内资料搜索、类型筛选和排序已接入；搜索范围为本级资料夹，不递归搜索下级文件夹。 | 前端全量测试通过；真实 App 手测确认本级搜索符合 V1.5 范围。 |
| B2 | 已完成 | 笔记保存成功/失败状态已接入，失败不丢输入。 | `StudyDetailPage.test.tsx` 覆盖保存反馈。 |
| B3 | 已完成 | 删除影响提示显示文件/文件夹递归摘要。 | `StudyDetailPage.test.tsx` 覆盖删除摘要。 |
| C1 | 已完成 | 图片/PDF/视频走 `assetPath` 预览，文本预览增加 2MB 保护。 | Rust preview 测试和前端 asset URL 测试通过。 |
| C2 | 已完成自动化审查 | 继续入口不绕过 `previewMaterialFile`；`assetPath` 来自 Rust 校验后的资料库副本；UI 不展示清理失败绝对路径。 | `security-reviewer` 未发现 P0；P1/P2 记录为 V1.6 候选。 |
| D1 | 已完成 | 版本号统一为 `1.5.0`，文档和工作上下文完成收口；真实 App 手测完成。 | 自动化验证通过；真实 App 手测通过，观察项已记录。 |

当前自动化验证结果（2026-06-14）：

- `npm.cmd test`：10 个测试文件、130 个测试通过。
- `npm.cmd run typecheck`：通过。
- `npm.cmd run build`：通过。
- `cargo fmt --check`：通过。
- `cargo test`：64 个 Rust 测试通过。
- `cargo clippy -- -D warnings`：通过。
- `npm.cmd run tauri -- build --debug`：通过。

V1.5 安全审查后续候选：

- 资料库位置设置曾接受前端传入路径字符串；V1.6 已改为 Rust prepare + 一次性 token + apply。
- `MaterialLibraryCleanupReport.failedPaths` command 响应曾包含清理失败绝对路径；V1.6 已改为只返回 `failedPathCount`。

V1.5 真实 App 手测观察项（2026-06-14）：

- 搜索功能只搜索本级资料夹内容，不能搜索更下一级文件夹内容。结论：符合 V1.5 “当前文件夹资料定位”范围；递归搜索、全局资料搜索和全文搜索继续后置。
- 删除最近打开资料后，主页不引用已删除的失效资料，但会自动接续引用更上一次新打开的有效资料。结论：符合“主页不引用失效资料”的验收口径，属于最近打开摘要的有效记录回退行为。

## V1.6 开发计划

V1.6 采用 A1-A5 分阶段推进。A1 先固定合同，A2-A3 分别处理资料库位置与清理报告，A4 适配前端体验，A5 回归验证和文档收口。

详细开发计划、验收标准和风险记录见 [`studyseq-v1.6-development-plan.md`](studyseq-v1.6-development-plan.md)。

| 阶段 | 主题 | 目标 | 主要工作 | 验收标准 | 建议 agent |
| --- | --- | --- | --- | --- | --- |
| A1 | 资料库位置合同 | 固定前端不传任意路径的 command 合同 | 设计 `prepare_material_library_location_change`、`apply_material_library_location_change`、`MaterialLibraryLocationCandidate`、`MaterialLibraryLocationChangeInput`；明确旧 path API 废弃策略 | 前端只能拿 candidate 和 token；默认迁回只传 `{ kind: "default" }` | `planner`、`architect`、`tdd-guide` |
| A2 | Rust token 与迁移闭环 | 让 Rust 掌握目录 authority | Rust command 打开目录选择器；派生 `StudySeqData\materials`；生成一次性 token；apply 时消费 token 并调用现有 repository 迁移；成功后更新 state 和 asset scope | 伪造 token / 过期 token / 重复 token 被拒绝；迁移失败不破坏旧库；asset scope 只加入最终资料库目录 | `tdd-guide`、`rust-reviewer`、`security-reviewer` |
| A3 | 清理报告脱敏 | 停止向前端返回失败绝对路径 | `MaterialLibraryCleanupReport.failedPaths` 改为 `failedPathCount`；repository 仍准确统计失败数量；更新 Rust 测试 | command 响应不包含盘符、用户目录、UNC 或完整绝对路径；清理失败仍可重试 | `tdd-guide`、`security-reviewer`、`database-reviewer` |
| A4 | 前端 API 与体验适配 | 保持用户操作清晰，前端不承担路径安全责任 | 更新 `learningContentApi.ts`、类型和运行时校验；资料库设置 UI 改为 prepare -> 确认 -> apply；清理文案改读 `failedPathCount`；迁移失败文案说明原资料仍保留 | 用户取消确认不迁移；确认时只传 token；清理失败只显示数量和重试建议；不展示绝对路径 | `typescript-reviewer`、`react-reviewer`、`ui-ux-designer` |
| A5 | 回归验证与文档收口 | 确认 V1.6 不破坏 V1.4/V1.5 主线 | 跑前端/Rust/Tauri 自动化验证；真实 App 手测资料库迁移、迁回默认、cleanup 失败、PDF/图片/txt/视频预览；版本号统一为 `1.6.0`；更新项目文档 | 自动化命令通过；真实 App 手测通过；`WORKING-CONTEXT.md` 和项目进度一致 | `e2e-runner`、`doc-updater` |

当前实现状态（2026-06-15）：

| 阶段 | 状态 | 当前证据 |
| --- | --- | --- |
| A1 | 已完成 | Rust / TypeScript 合同已切到 `prepare_material_library_location_change` 与 `apply_material_library_location_change`；旧自由 path Tauri command 不再注册。 |
| A2 | 已完成 | Rust 负责目录选择、`StudySeqData\materials` 派生、10 分钟一次性 token、过期清理和 token 消费；repository 迁移失败前不追加新 asset scope；运行时更新失败会回滚 DB setting 与 `stored_path`。 |
| A3 | 已完成 | cleanup 报告从 `failedPaths` 改为 `failedPathCount`；前端 API 拒绝旧 `failedPaths` payload；删除副本残留和迁移旧副本残留都返回 `failedCleanupPathCount`。 |
| A4 | 已完成 | 主页资料库位置改为 prepare -> 确认 -> apply；取消确认不迁移；迁回默认只传 `{ kind: "default" }`；清理、删除副本残留和迁移旧副本残留只显示数量。 |
| A5 | 已完成 | 版本号已统一为 `1.6.0`；自动化验证命令已通过；debug 包和正式 release 包均已生成；真实 App 手测已通过；导入资料链路改动后的补充 smoke test 已通过。 |

V1.6 自动化验证结果（2026-06-15）：

- `npm.cmd test`：通过，10 个文件、137 个测试。
- `npm.cmd run typecheck`：通过。
- `npm.cmd run build`：通过。
- `cargo fmt --check`：通过。
- `cargo test`：通过，72 个 Rust 测试。
- `cargo clippy -- -D warnings`：通过。
- `npm.cmd run tauri -- build --debug`：通过，生成 `target/debug/studyseq.exe`、`StudySeq_1.6.0_x64_en-US.msi`、`StudySeq_1.6.0_x64-setup.exe`。
- `npm.cmd run tauri -- build`：通过，生成 `target/release/studyseq.exe`、`StudySeq_1.6.0_x64_en-US.msi`、`StudySeq_1.6.0_x64-setup.exe`。

V1.6 收口审查修复：

- Rust：资料重命名时若 DB 更新失败且文件回滚也失败，不再静默吞掉回滚错误，改为返回 `material_rename_rollback_failed`，避免 DB 与磁盘不一致被误判为普通数据库失败。
- 前端 / Tauri：资料导入不再由前端打开文件选择器并传 `sourcePath`，改为 Rust command 内部打开文件选择器；前端只传 `learningContentId` 和 `parentId`，取消选择返回 `null` 且不改变资料列表。
- 前端 DTO：`MaterialItem.originalPath` 仍可在 repository / SQLite 内部保存治理信息，但序列化给前端时跳过，前端类型和测试夹具已移除该字段，避免导入成功后把用户原始路径带入 UI state。

## V1.3 手工验收标准

必须使用真实 Tauri App 验收：

当前状态：**待用户手工执行**。以下项目未由自动化测试替代。

1. 打包后的真实 App 中，txt、图片、PDF、MP4/WebM 预览不被 CSP 阻断。
2. MKV、AVI 等不支持格式仍显示明确的不支持提示。
3. 非 App 资料库目录内的 `stored_path` 不会被预览接口读取。
4. 打开文件夹内资料并返回后，资料区仍停留在原文件夹。
5. 保存笔记失败时有明确提示，原输入内容不丢失。
6. 删除笔记失败时有明确提示，不出现 UI 与数据库状态不一致。
7. 资料库清理前确认文案与实际清理对象一致。
8. 清理失败时可重试，重复清理后状态可收敛。
9. V1.1 真实库副本升级后，资料、文件夹和阅读状态保持可用。
10. V1.2 已有 PDF 目录、视频播放、资料文件夹能力不回退。
11. 删除学习内容后，多层文件夹资料无孤儿记录或无引用 App 副本残留。
12. 断网状态下，上述流程全部可用。

## V1.3 工程验收标准

发布前必须全部通过：

```text
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
cargo fmt --check
cargo test
cargo clippy -- -D warnings
npm.cmd run tauri -- build --debug
```

当前自动化验证结果（2026-06-12）：

| 命令 | 结果 | 备注 |
| --- | --- | --- |
| `npm.cmd test` | 通过 | 10 个测试文件、100 个测试通过；jsdom canvas 未实现提示为测试环境噪声，退出码为 0。 |
| `npm.cmd run typecheck` | 通过 | `tsc --noEmit` 通过。 |
| `npm.cmd run build` | 通过 | Vite production build 通过。 |
| `cargo fmt --check` | 通过 | Rust 格式检查通过。 |
| `cargo test` | 通过 | 48 个 Rust 测试通过。 |
| `cargo clippy -- -D warnings` | 通过 | 无 clippy warning。 |
| `npm.cmd run tauri -- build --debug` | 通过 | 已生成 debug app 和 debug MSI/NSIS 包。 |

正式发包前再运行：

```text
npm.cmd run tauri -- build
```

当前正式发包验证结果（2026-06-12）：

- `npm.cmd run tauri -- build` 已通过。
- 正式 exe：`app/src-tauri/target/release/studyseq.exe`
- 正式 MSI：`app/src-tauri/target/release/bundle/msi/StudySeq_1.3.0_x64_en-US.msi`
- 正式 NSIS：`app/src-tauri/target/release/bundle/nsis/StudySeq_1.3.0_x64-setup.exe`

## 下一步

1. 提交、推送，并按项目节奏创建 V1.6 tag。
2. 进入 V1.7 前先确认版本策略和范围，避免在 V1.6 收口后继续追加功能。

## 推迟项

- 云同步。
- 账号系统。
- 自动进度检测。
- 日历中心布局。
- 复杂统计图表。
- 学习节点拆解。
- Markdown 或复杂富文本笔记。
- SQLite 加密。
- Office 资料预览。
- Office 转 PDF。
- 新视频格式支持。
- PDF 全文搜索。
- 复杂资料树和拖拽移动。
- 递归搜索下级文件夹资料名称。
- 全局资料搜索中心。
- 跨学习内容移动资料。
- 笔记分组。
- PDF 滚动位置精细恢复。
- Office 外部打开兜底。
- 资料全文搜索。
- PDF 文本抽取。
- OCR。
- 缩略图全库扫描。
- 笔记富文本、Markdown、标签和双向链接。
- 整文件夹导入、目录同步和文件监听。
- 打开原文件或打开所在文件夹。
- 资料库迁移进度条、后台任务队列和取消迁移。
- 多资料库、历史资料库位置列表和备份系统。
- 大设置中心、主题设置和快捷键设置。

## 风险

### 删除学习内容会影响关联内容

影响：删除学习内容会删除关联内容；如果提示不清晰，用户可能误删资料或笔记。

建议：删除前必须给出明确提示，让用户知道会删除关联内容后再确认。

### 资料删除涉及文件系统和数据库两步

影响：可能出现文件删了但数据库未删，或数据库删了但文件仍在。

建议：Rust 层保持明确顺序和错误返回；UI 对失败项保留提示，不要假装全部成功。

### PDF.js 在真实 Tauri 环境与测试环境不同

影响：自动测试通过不代表真实多页 PDF、worker、data URL 和大文件都稳定。

建议：真实多页 PDF 手工验收作为 V1 发布门槛。

### 资料导入导致 App 占用空间增加

影响：资料越多，占用越大，后续备份、迁移和清理成本会上升。

建议：V1 明确采用导入模式；产品文案明确删除资料只删除 App 管理副本，不删除原始来源文件。

### SQLite 暂不加密

影响：本机有文件访问权限的人可以读取学习数据。

建议：V1 接受该边界；对外只表达“本地保存、不上传”，不要宣传加密安全。

### 页面状态继续膨胀

影响：`StudyDetailPage.tsx` 后续继续加功能会变重。

建议：下一轮只在必要时抽 `PdfPreview`、`NoteEditor`、`useDetailReaderState`，不要提前大拆。

### V1.1 SQLite 迁移风险

影响：当前数据库初始化以建表为主，旧用户库不会自动获得新增阅读状态字段。

建议：V1.1 先补可重复执行的 `ALTER TABLE` 迁移策略，并增加旧库升级测试。

### 资料库清理误删风险

影响：清理逻辑如果越界扫描或误判引用，可能删除仍需要的 App 管理副本。

建议：只扫描 App 管理资料目录；先统计、再确认、再执行；不触碰用户原始来源文件。

### 资料重命名一致性风险

影响：文件重命名成功但数据库更新失败，或数据库更新成功但文件重命名失败，会导致资料打不开。

建议：实现前先定清楚操作顺序、失败回滚和重试提示，并覆盖锁文件、同名冲突、非法文件名测试。

## 最近更新

- 2026-06-08：完成 `app/` 最小技术骨架和学习内容持久化闭环；Tauri debug build 已输出 MSI 和 NSIS 安装包。
- 2026-06-08：确认 v1 技术决策：纯文本笔记、资料导入到 App 本地资料库、学习资料必须 App 内预览、SQLite 暂不加密、删除二次确认。
- 2026-06-08：建立本项目进度管理文档，并指定由 `project_manager` 子智能体维护。
- 2026-06-08：完成学习内容详情页、资料导入、纯文本笔记创建、删除学习内容和详情数据重启恢复闭环。
- 2026-06-08：完成阅读页最小闭环：txt/图片/PDF App 内预览、笔记创建/选择/编辑、阅读状态保存。
- 2026-06-08：完成阅读体验收口与数据安全补强：笔记自动保存、PDF 翻页/缩放、返回详情前保存。
- 2026-06-08：完成详情页资料操作修正：删除按钮短文案、撤回、文件大小 MB 显示、取消详情页轻量预览、笔记点开编辑。
- 2026-06-09：完成 PDF 阅读页体验修正：A4 页框、`Ctrl + 鼠标滚轮` 缩放、中键拖动。
- 2026-06-09：明确 V1 版本目标和验收标准，本文件作为后续版本目标与进度的统一记录位置。
- 2026-06-09：完成 V1 工程收口补齐：学习内容完整字段编辑、进度条显示、资料删除失败项保留和重试。
- 2026-06-09：完成 V1 自动化工程验收并重新生成 Tauri debug 包，真实 App 手工验收仍待用户执行。
- 2026-06-09：按手工测试反馈调整：主页学习内容栏显示进度条，学习名称、状态、预计工时、截止日期、进度改为在主页行内编辑。
- 2026-06-09：完成 V1 UI 细节收口：按钮统一淡蓝轻量风格，详情页资料阅读隐藏其他资料，笔记改为下拉选择和飞书文档式编辑，详情页进度条移到左侧并改成长条 SaaS 风格。
- 2026-06-09：用户完成 V1 手工测试并反馈暂无明显问题，V1 可进入发布候选收口。
- 2026-06-09：`project_manager` 和 `technical_lead` 对齐 V1.1 目标与开发内容，确认 V1.1 聚焦 PDF 当前页/缩放恢复、资料库空间占用统计和清理入口、资料重命名。
- 2026-06-09：完成 V1.1 核心开发：PDF 页码/缩放按资料恢复、`PRAGMA user_version` 迁移、资料库统计和清理、资料重命名；前端测试 50 个通过，Rust 测试 22 个通过。
- 2026-06-09：完成 V1.1 完整工程验证并重新生成 Tauri debug 包：`app/src-tauri/target/debug/studyseq.exe`、`app/src-tauri/target/debug/bundle/msi/StudySeq_0.1.0_x64_en-US.msi`、`app/src-tauri/target/debug/bundle/nsis/StudySeq_0.1.0_x64-setup.exe`。
- 2026-06-09：根据手工测试反馈修复详情页内嵌 PDF 继续阅读路径；此前 PDF 页码/缩放只接入旧阅读页，详情页再次打开会回到第一页；修复后前端测试 51 个通过并重新生成 Tauri debug 包。
- 2026-06-09：恢复保留原始产品策划、产品设计文档和 UI 概念 HTML；按“不能再把功能接入废弃设计实现”口径，删除旧独立阅读页页面、`/studies/:studyId/read` 路由、对应测试和专属样式；清理后前端测试 40 个通过并重新生成 Tauri debug 包。
- 2026-06-10：恢复 `Learning_OS_Product_Summary*.pdf`，彻底移除旧 `reading_states` 前后端链路和新库建表逻辑，并增加旧库升级删除旧表的迁移；清理后前端测试 39 个通过、Rust 测试 20 个通过并重新生成 Tauri debug 包。
- 2026-06-10：完成详情页内嵌 PDF 流畅度优化：PDF 文档缓存限制为最近 3 个、相邻页离屏预渲染缓存限制为 6 页、缩放渲染延迟 150ms 防抖；前端测试 40 个通过、Rust 测试 20 个通过，并重新生成 Tauri debug 包。
- 2026-06-10：确认删除学习内容时需要删除关联内容，但必须给用户明确提示；当前没有需要更新的 hooks；V1.1 改动暂时不提交。
- 2026-06-10：完成删除学习内容级联清理：同步删除关联资料副本、资料记录、资料阅读状态和笔记；首页删除确认文案已明确提示关联内容会被删除、原始来源文件不会删除；前端测试 40 个通过、Rust 测试 20 个通过，并重新生成 Tauri debug 包。
- 2026-06-10：根据手工测试反馈修复主页删除学习内容无可见提示的问题；将 `window.confirm` 改为 App 内确认弹窗，确认前不会删除，取消会保留学习内容，删除失败会在弹窗内提示并允许重试。
- 2026-06-10：修复删除确认弹窗遮罩只覆盖页面内容区域的问题；根因为弹窗位于带 `transform` 动画的路由容器内，现已改为 portal 到 `document.body`，遮罩覆盖整个窗口。
- 2026-06-10：用户完成 V1.1 真实 App 手工测试，反馈“没什么问题了”；当前等待是否提交和是否准备 V1.1 发包的确认。
- 2026-06-12：移除旧 `project_manager` 和 `technical_lead` 项目 agent；后续由 `planner` 替代版本规划职责，由 `architect` 替代跨层技术判断职责，由 `doc-updater` 维护稳定项目记录。
- 2026-06-12：由 `planner`、`architect`、`doc-updater` 三个项目 agent 共同规划 V1.3；确认 V1.3 定位为安全加固与体验一致性收口，不做大 UI 改版、不新增大功能；开发阶段记录为 A1-A7。
- 2026-06-10：按手工视觉反馈完成详情页阅读框中等上移：压缩详情页顶部 padding、返回按钮下边距、标题块间距和标题区下边距，资料/笔记双栏整体上移。
- 2026-06-10：确认提交当前 V1.1 改动并准备 V1.1 发包；版本号统一调整为 `1.1.0`。
- 2026-06-10：完成 V1.1 release build，生成 `StudySeq_1.1.0_x64_en-US.msi` 和 `StudySeq_1.1.0_x64-setup.exe`。
- 2026-06-10：根据正式包手工反馈修复启动时出现黑色控制台窗口的问题；release 构建入口改为 Windows GUI 子系统，并新增 `tests/check-tauri-windows-subsystem.ps1`。
- 2026-06-14：确认 V1.4 方向为“主页最近打开位置”：功能放在主页，每个学习主题栏只显示上次打开时间、上次打开文件、上次打开文件 / 视频到哪里；不做日历打卡、独立最近足迹、右侧自动记录规则、近 14 天足迹、当前重点、学习时长统计或连续学习天数。
- 2026-06-14：完成 V1.4 自动化开发：数据库升级到 `user_version = 6`，主页列表返回最近打开摘要，PDF/普通文件/视频最近位置接入详情页主线，视频支持播放秒数恢复；版本号统一为 `1.4.0`。
- 2026-06-14：完成 V1.4 审查修复：补齐 PDF/视频状态边界校验、最近打开失效副本过滤、视频卸载保存保护、详情页异步过期保护、主页最近打开可访问描述和 API 运行时轻量校验；同时修复重名资料移动可能落到工作目录的旧路径问题；自动化验证更新为前端 123 个测试、Rust 61 个测试通过。
- 2026-06-14：完成 V1.4 产品层资料库位置设置：主页可选择资料库存放位置，App 使用所选位置下的 `StudySeqData\materials` 专用目录并支持迁回默认 AppData 位置；目录选择不授权根目录，路径安全校验、动态 asset scope、导入来源授权、迁移可重试和迁移后保守清理旧副本已接入；解决大资料长期占用 C 盘的根因。
- 2026-06-14：用户完成 V1.4 真实 App 手工验收，未发现问题；V1.4 进入 release 准备阶段。
- 2026-06-14：召集 `planner`、`architect`、`ui-ux-designer`、`security-reviewer`、`e2e-runner` 规划 V1.5；结论收敛为“一键继续学习”，即主页最近打开摘要提供轻量继续入口，详情页按继续意图自动打开最近资料，PDF / 视频复用现有位置恢复；资料搜索、笔记系统、全文搜索、Office 和统计类能力后置。
- 2026-06-14：新增 V1.5 独立开发计划 `product/docs/studyseq-v1.5-development-plan.md`，阶段为 A1 继续学习合同、A2 主页继续入口、A3 详情页自动打开资料、B1 当前文件夹资料定位、B2 笔记保存状态、B3 删除影响提示、C1 图片 / 文本预览性能收口、C2 安全边界回归、D1 回归验证与文档收口。
- 2026-06-14：按用户希望加快开发进度，将低风险 V1.6 候选合并进 V1.5，主题调整为“一键继续学习 + 轻量效率收口”；新增 B1 当前文件夹资料定位、B2 笔记保存状态、B3 删除影响提示、C1 图片 / 文本预览性能收口，全文搜索、Office、富文本笔记、整文件夹导入等高风险项仍后置。
- 2026-06-14：完成 V1.5 A1-D1 自动化开发与收口：主页“继续”入口、详情页自动打开最近资料、当前文件夹资料定位、笔记保存状态、递归删除影响摘要、图片/PDF/视频 `assetPath` 预览和文本 2MB 保护均已接入；版本号统一为 `1.5.0`；自动化验证通过。
- 2026-06-14：用户完成 V1.5 真实 App 手测，未发现阻塞问题；两条观察项已记录：搜索只覆盖本级资料夹，删除最近打开资料后会回退到上一条有效最近打开资料。
- 2026-06-14：召集 `planner`、`architect`、`ui-ux-designer`、`security-reviewer` 规划 V1.6；结论收敛为“资料库安全边界与隐私收口”，不做新学习功能或大 UI 改版；新增 V1.6 独立开发计划 `product/docs/studyseq-v1.6-development-plan.md`，阶段为 A1 资料库位置合同、A2 Rust token 与迁移闭环、A3 清理报告脱敏、A4 前端 API 与体验适配、A5 回归验证与文档收口。
- 2026-06-15：完成 V1.6 A1-A5 自动化实现与自动化验证：资料库位置设置改为 Rust prepare + 一次性 token + apply；前端不再提交任意路径字符串；cleanup 报告改为 `failedPathCount`；删除副本残留和迁移旧副本残留返回 `failedCleanupPathCount`；scope / state 更新失败会尽力回滚 DB setting 与 `stored_path`；版本号统一为 `1.6.0`；用户完成真实 App 手测，未发现问题。
- 2026-06-15：V1.6 收口审查修复三个阻塞项：资料重命名回滚失败不再静默吞错；资料导入改为 Rust command 内部打开文件选择器，前端不再持有源文件路径 authority；`MaterialItem.originalPath` 不再序列化给前端。重新验证通过：前端 137 测试、Rust 72 测试、typecheck、build、fmt、clippy、Tauri debug build、Tauri release build 均通过；debug 包和正式 release 包均已重新生成；导入资料链路补充真实 App smoke test 已通过，V1.6 可进入提交/tag 收口。
