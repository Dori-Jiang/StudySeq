# StudySeq / 知序 V1.6 开发计划

## 文档定位

本文件记录 StudySeq / 知序 V1.6 的开发计划。

- V1.6 主题是“资料库安全边界与隐私收口”。
- 本版本承接 V1.5 安全审查后续候选，专注收紧资料库位置设置和清理报告返回内容。
- 本版本不做新学习功能，不做大 UI 改版，不新增旧独立阅读页，不改变详情页作为学习工作台的主线。
- 总进度仍记录在 `product/docs/studyseq-project-progress.md`；本文件用于展开 V1.6 的版本目标、阶段计划、验收标准和风险。

当前状态（2026-06-15）：A1-A5 自动化实现与自动化验证已完成，版本号已统一为 `1.6.0`；用户已完成真实 App 手测，未发现问题；debug 包和正式 release 包均已重新生成。导入资料链路在收口审查后改为 Rust command 内部打开文件选择器，补充真实 App smoke test 已通过，下一步进入提交与 tag 收口。

## 版本目标

V1.6 目标：让本地资料库位置变更更可靠、更可控，并减少 Tauri command 响应中的本机路径暴露面。

V1.6 成功口径：

- 前端不再向 Rust 提交任意资料库路径字符串来触发迁移。
- 资料库位置变更由 Rust 目录选择结果或 Rust 内部默认位置分支驱动。
- 用户仍能选择新的资料库存放位置，并确认迁移到所选位置下的 `StudySeqData\materials`。
- 用户仍能迁回默认 AppData 资料库位置。
- 迁移失败时旧资料库仍保持可用，不更新 setting，不扩大 asset scope。
- 资料库清理失败时，前端只拿到失败数量，不拿到失败绝对路径。
- 清理结果文案继续说明失败数量和可重试，不展示 `C:\Users\...`、盘符、UNC 路径或完整本机路径。
- V1.5 的“继续”入口、详情页自动打开资料、当前文件夹定位、PDF / 视频 / 图片 / txt 预览不回退。

## 用户价值

V1.6 对用户的表达不是“修技术债”，而是：本地资料库更可靠，迁移状态更明确，清理结果更易理解且不暴露完整本机路径。

用户能得到的直接体验：

1. 选择资料库位置后，App 明确告知将使用所选位置下的 `StudySeqData\materials`。
2. 用户确认后才迁移；取消确认不会迁移。
3. 迁移失败时，App 明确提示原资料仍保留，可以重试或继续使用原位置。
4. 清理无引用文件时，失败提示只显示数量和重试建议，不显示完整本机路径。

## 范围

### 进入 V1.6

- 废弃前端调用 `choose_material_library_storage_root() -> string | null` 后再调用 `set_material_library_location({ path })` 的自由路径链路。
- 新增资料库位置变更准备 command：Rust 打开目录选择器，派生目标资料库目录，生成一次性 token。
- 新增资料库位置变更应用 command：前端只传 token 或 `{ kind: "default" }` 意图。
- Rust 内部保存 token 到目标路径的临时映射；token 一次性、短期有效，不写入 SQLite。
- 默认位置迁回使用显式 `default` 分支，不使用路径字符串哨兵。
- `MaterialLibraryCleanupReport.failedPaths` 改为 `failedPathCount`。
- 更新前端 API 类型、运行时校验和相关测试。
- 更新资料库位置设置文案和清理结果文案。
- 补 Rust command / repository 回归测试，覆盖 token、迁移失败、asset scope 和 cleanup 脱敏。
- 更新项目进度、工作上下文、版本号和真实 App 手测清单。

### 不进入 V1.6

- 递归搜索、全局资料搜索、资料全文搜索。
- Office 预览、Office 转 PDF、Office 外部打开。
- 整文件夹导入、目录同步、文件监听。
- 资料库迁移进度条、后台任务队列、取消迁移。
- 多资料库、历史资料库位置列表、备份系统。
- 打开原文件、打开所在文件夹。
- SQLite 加密、云同步、账号、多端。
- 大设置中心、主题设置、快捷键设置。
- 恢复旧独立阅读页或 `/studies/:studyId/read` 路由。
- 修改根目录 `AGENTS.md`。

## 推荐技术合同

数据库层面不新增表、不新增列，原则上不提升 `PRAGMA user_version`。V1.6 主要改变 Tauri command 合同和前端 API 响应模型；现有 `app_settings.material_library_dir` 继续保存最终资料库目录。

保留：

```text
get_material_library_location() -> MaterialLibraryLocation
cleanup_material_library() -> MaterialLibraryCleanupReport
```

新增 / 替换：

```text
prepare_material_library_location_change() -> MaterialLibraryLocationCandidate | null
apply_material_library_location_change(input: MaterialLibraryLocationChangeInput) -> MaterialLibraryLocation
```

推荐前端类型：

```ts
type MaterialLibraryLocationCandidate = {
  token: string;
  displayPath: string;
  expiresAt: string;
};

type MaterialLibraryLocationChangeInput =
  | { kind: "selected"; token: string }
  | { kind: "default" };
```

约束：

- `displayPath` 只用于 UI 确认展示，Rust 不信任该值。
- 真正目标路径只存在 Rust `AppState` 的内存 token map 中。
- token 随机、一次性消费、短 TTL，建议 10 分钟。
- `apply` 时重新校验目标路径；repository 迁移失败时不更新 `app_settings`、不更新 `material_library_dir` state、不扩大 asset scope。
- repository 迁移成功后再更新 asset scope 和 state；如果运行时 scope / state 更新失败，会尽力把 DB setting 与 `stored_path` 回滚到旧资料库。
- 旧副本清理仍保持保守 best-effort；迁移成功但旧副本清理失败时，command 返回脱敏数量 `failedCleanupPathCount`，主页只提示数量。
- Tauri asset scope 当前只有追加授权和优先 deny 机制，不能安全“撤销一次 allow”后再重新授权同一路径。因此 V1.6 选择在 repository 迁移成功后再追加新资料库 scope，以保证迁移失败不会扩大 scope；旧资料库 scope 在当前 App 会话内可能残留，但前端只使用当前 DB `stored_path` 和 Rust 校验后的预览路径。
- 删除学习内容或资料时，DB 删除成功但 App 管理副本清理失败会返回脱敏数量 `failedCleanupPathCount`，前端移除已删记录并提示可稍后用资料库清理重试，不返回本机路径。

cleanup 报告推荐改为：

```ts
type MaterialLibraryCleanupReport = {
  deletedOrphanFileCount: number;
  deletedOrphanDatabaseRecordCount: number;
  deletedBytes: number;
  failedPathCount: number;
};
```

V1.6 不返回失败绝对路径。若后续确实需要诊断信息，另行评估脱敏相对路径或本地日志，不进入本版 UI。

## 开发计划

V1.6 采用 A1-A5 分阶段推进。A1 先固定合同，A2-A3 分别处理资料库位置与清理报告，A4 适配前端体验，A5 回归验证和文档收口。

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

## 测试策略

### Rust 测试

- 任意伪造 token 被拒绝。
- token 只能使用一次。
- 过期 token 被拒绝。
- 目录选择后 Rust 派生 `StudySeqData\materials`，前端不参与拼接。
- `{ kind: "default" }` 可迁回默认资料库。
- 相对路径、`..`、系统目录、当前库子目录 / 父目录迁移被拒绝。
- 迁移失败时旧资料库 setting 和 state 保持不变。
- 迁移成功后 `app_settings`、`stored_path`、PDF 页码、视频进度保持可用。
- cleanup 返回 `failedPathCount`，不返回绝对路径。

### 前端测试

- 选择目录返回 candidate 后，用户取消确认时不调用 apply。
- 用户确认时只传 token，不传 path。
- 迁回默认只传 `{ kind: "default" }`。
- 资料库位置显示仍正常。
- cleanup 失败数量文案不依赖 `failedPaths.length`。
- V1.5 继续入口、详情页自动打开、当前文件夹定位不回退。

### 真实 App 手测

1. 从默认资料库迁移到非 C 盘目录，导入并打开 txt / 图片 / PDF / MP4。
2. 重启 App 后资料库位置保持，主页继续入口仍可打开最近资料。
3. 从自定义资料库迁回默认 AppData 位置，资料和阅读状态仍可用。
4. 占用某个无引用 App 管理副本后执行清理，UI 只显示失败数量和可重试提示。
5. 断网状态下，主页、详情页、阅读、视频、笔记和资料库维护均可用。

## 风险与缓解

### command 合同切换导致资料库设置不可用

影响：前端从两步 path 流程切到 token 流程，mock、类型和 UI 状态都要同步。

缓解：A1 先用测试锁定新合同；A2/A4 分别处理 Rust 与前端；保留用户可见交互不大改。

### 迁移失败导致状态不一致

影响：复制文件、更新 DB setting、更新 asset scope 是跨文件系统和数据库的组合操作。

缓解：继续沿用 V1.4 保守策略；repository 迁移成功后再更新 asset scope 和运行时 state，repository 失败时旧资料库保留可用且不追加新 scope。Tauri asset scope 的追加授权与 SQLite 更新不是同一事务；若 scope / state 更新失败，command 会尽力把 DB setting 和 `stored_path` 回滚到旧资料库并返回失败。旧资料库 scope 在同一 App 会话内可能残留，但当前 UI 只渲染 DB 中的当前 `stored_path`。

### 脱敏后调试信息减少

影响：只返回失败数量后，开发者不能直接从 UI 响应定位具体路径。

缓解：V1.6 以隐私和边界收口优先；若后续确需诊断，再评估脱敏相对路径或本地 debug 日志。

### 设置页范围膨胀

影响：容易从安全收口变成完整设置中心。

缓解：V1.6 只整理资料库位置、迁移状态、清理结果；不做主题、快捷键、账号、备份、同步。

## 验证命令

在 `app/`：

```text
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

在 `app/src-tauri/`：

```text
cargo fmt --check
cargo test
cargo clippy -- -D warnings
```

最终 debug 打包：

```text
npm.cmd run tauri -- build --debug
```

正式发包前再运行：

```text
npm.cmd run tauri -- build
```

当前自动化验证结果（2026-06-15）：

- `npm.cmd test`：通过，10 个文件、137 个测试。
- `npm.cmd run typecheck`：通过。
- `npm.cmd run build`：通过。
- `cargo fmt --check`：通过。
- `cargo test`：通过，72 个 Rust 测试。
- `cargo clippy -- -D warnings`：通过。
- `npm.cmd run tauri -- build --debug`：通过，生成 `target/debug/studyseq.exe`、`StudySeq_1.6.0_x64_en-US.msi`、`StudySeq_1.6.0_x64-setup.exe`。
- `npm.cmd run tauri -- build`：通过，生成 `target/release/studyseq.exe`、`StudySeq_1.6.0_x64_en-US.msi`、`StudySeq_1.6.0_x64-setup.exe`。

收口审查补充修复：

- 资料重命名时，若 DB 更新失败且文件回滚也失败，不再静默吞掉回滚错误，改为返回稳定错误码 `material_rename_rollback_failed`。
- 资料导入时，文件选择已收进 Rust command；前端不再通过 `@tauri-apps/plugin-dialog` 直接获取源文件路径，也不再向导入 command 传 `sourcePath`。
- `MaterialItem.originalPath` 仍可在 repository / SQLite 内部保存治理信息，但不再序列化给前端，避免导入成功后把用户原始路径带入 UI state。

真实 App 手测：用户已完成，未发现问题。覆盖资料库迁移、迁回默认、cleanup 失败脱敏、删除资料副本残留提示、PDF / 图片 / txt / 视频预览、主页继续入口。

补充真实 App smoke test：用户已完成，未发现问题。覆盖“导入资料 -> 选择文件 -> 出现在资料列表 -> 可预览”，确认收口审查后改为 Rust command 内部打开文件选择器的导入链路可用。

## 后续候选

以下内容有价值，但不进入 V1.6：

- 递归搜索 / 全局资料搜索。
- 资料全文搜索、PDF 文本抽取、OCR。
- Office 预览 / Office 转 PDF。
- 整文件夹导入、目录同步、文件监听。
- 资料库迁移进度条和后台任务队列。
- 打开原文件或打开所在文件夹。
- SQLite 加密、云同步、账号系统。
- 大设置中心、主题设置、快捷键设置。
