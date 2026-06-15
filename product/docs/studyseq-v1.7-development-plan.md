# StudySeq / 知序 V1.7 开发计划

## 文档定位

本文件记录 StudySeq / 知序 V1.7 的开发计划。

- V1.7 主题是“当前学习内容资料定位增强”。
- 本版本承接 V1.5 真实 App 手测观察项：资料搜索只覆盖当前文件夹，不能搜索更下一级文件夹。
- V1.6 已完成资料库安全边界与隐私收口，V1.7 回到一个小而明确的学习效率功能。
- 本版本不做全文搜索、PDF 文本抽取、OCR、跨学习内容全局搜索，也不把 Office 转 PDF 纳入正式功能。
- `office2pdf` 只作为隔离技术实验记录在 `spikes/office2pdf/`，不进入 V1.7 release gate。
- 总进度仍记录在 `product/docs/studyseq-project-progress.md`；本文件用于展开 V1.7 的版本目标、阶段计划、验收标准和风险。

当前状态（2026-06-15）：V1.7 自动化实现、自动化验证、隔离真实 App 手测和发包验证均已完成，版本号已统一为 `1.7.0`，debug 包和正式 release 包均已生成。`office2pdf` 已新增隔离 spike 并通过最小 PPTX 自检，但不接正式 App。

## 版本目标

V1.7 目标：用户在详情页资料区可以从当前学习内容的整棵资料树中快速定位资料，并能直接进入资料所在文件夹或打开资料。

V1.7 成功口径：

- 资料区搜索支持两档范围：`当前文件夹` / `当前学习内容`。
- `当前文件夹` 保持 V1.5 既有行为，只搜索当前层直接子项。
- `当前学习内容` 递归搜索当前学习内容下所有未待删资料和文件夹。
- 搜索只匹配资料名、文件夹名和文件扩展名，不读取资料正文。
- 当前学习内容搜索结果显示资料名、类型和逻辑资料树路径。
- 点击文件结果时，先进入文件所在父文件夹，再在详情页内嵌阅读区打开资料。
- 点击文件夹结果时，进入该文件夹，不调用资料预览。
- 搜索结果不展示 `storedPath`、原始路径、盘符、AppData、UNC 路径、UUID 物理目录或 asset URL。
- pending-deleted 子树不会出现在当前学习内容搜索结果中。
- 预览失败后不再停留在“正在加载资料预览”。
- PDF 翻页或缩放后立即返回资料列表时，仍保存最后阅读状态。
- V1.5 / V1.6 已有继续入口、资料库位置安全边界、预览边界和删除闭环不回退。

## 用户价值

V1.5 已经让用户能在当前文件夹内定位资料。V1.7 解决资料层级变深后的实际摩擦：用户不必逐层点开文件夹寻找资料，而是可以在当前学习内容内按名称或扩展名定位。

用户能得到的直接体验：

1. 在资料区选择搜索范围。
2. 输入关键词，例如课程名、章节名、`pdf`、`.pptx`。
3. 在结果中看见资料位于哪个逻辑文件夹路径。
4. 点击文件后直接打开阅读，并且返回资料列表时停留在该文件所在文件夹。
5. 点击文件夹后直接进入该文件夹继续整理资料。

这仍然是详情页资料区的轻量定位能力，不是全局资料中心、全文搜索引擎或 Office 预览系统。

## 范围

### 进入 V1.7

- `MaterialExplorer` 增加搜索范围分段控件：`当前文件夹` / `当前学习内容`。
- 当前文件夹模式继续使用现有大图标资源管理器网格。
- 当前学习内容模式在存在搜索或筛选条件时，使用紧凑结果列表展示名称、类型和逻辑路径。
- 基于已加载的 `LearningDetail.materials` 做前端资料树递归搜索。
- 递归搜索匹配资料 / 文件夹名称和扩展名，大小写不敏感。
- 递归搜索排除 pending-deleted 子树。
- 搜索、路径构建和防环逻辑提取为纯函数，优先放在 `app/src/pages/materials/materialTree.ts` 或独立 `materialSearch.ts`。
- 点击文件结果时调用 `onCurrentFolderChange(file.parentId)` 后复用现有 `onOpenFile(file)`。
- 点击文件夹结果时调用 `onCurrentFolderChange(folder.id)`，并切回当前文件夹模式。
- 补预览失败终态，避免 `preview === null` 时永久 loading。
- 补 PDF 快速返回时保存最后页码 / 缩放的测试与修复。
- 更新项目进度、工作上下文、版本号和真实 App 手测清单。

### 不进入 V1.7

- 全文搜索、PDF 文本抽取、OCR。
- 跨学习内容全局搜索。
- 搜索历史、收藏搜索、多选搜索结果、路径树搜索中心。
- 移动资料弹窗里的递归搜索。
- Office 预览、Office 转 PDF、Office 外部打开兜底。
- 把 `office2pdf` 接入 Tauri command、正式 UI、正式 API 或 release gate。
- 打包 LibreOffice。
- 整文件夹导入、目录同步、文件监听。
- 打开原文件、打开所在文件夹。
- 新增旧独立阅读页或恢复 `/studies/:studyId/read` 路由。
- 新增 SQLite schema、SQLite FTS、`PRAGMA user_version` 迁移。
- 修改根目录 `AGENTS.md`。

## office2pdf 实验边界

`office2pdf` 可继续作为开发期 spike 保留，但不属于 V1.7 正式交付。

当前实验位置：

```text
spikes/office2pdf/
```

当前实验结论：

- 固定依赖 `office2pdf = "=0.6.0"`。
- 直接许可证为 Apache-2.0。
- 已通过最小 PPTX 自检：运行时生成 PPTX，转换为 `out/minimal-pptx.pdf`，输出以 `%PDF` 开头，warnings 为 0。
- 构建目录和输出目录已被 `.gitignore` 忽略。

隔离约束：

- 不加入 `app/src-tauri/Cargo.toml`。
- 不新增 Tauri command。
- 不新增前端 UI 或 API。
- 不参与 `npm.cmd test`、`cargo test`、`tauri build` 的正式回归口径。
- 不提交外部样本 Office 文件；如需真实样本，必须记录来源和许可证。

后续若要产品化 Office 转 PDF，必须重新做安全设计：

- 前端只传 `material_id`，不得传输入 / 输出路径。
- Rust 从数据库解析库内副本并 canonical 校验资料库边界。
- 输出 PDF 只能写入 App 管理的缓存或派生目录。
- 转换任务需要超时、大小限制、解压比例 / 条目数限制、图片像素限制。
- 禁止解析外部 `file://`、`http(s)://` 资源。
- 失败只返回稳定错误码和用户友好文案，不暴露绝对路径。
- 转换产物绑定源资料 hash 和 converter 版本。
- 正式接入前必须完成传递依赖许可证和 advisory 审计。

## 推荐技术合同

V1.7 正式功能不新增 Rust command，不新增 SQLite schema，不提升 `PRAGMA user_version`。

搜索基于现有数据：

```text
getLearningDetail(studyId) -> LearningDetail
LearningDetail.materials -> MaterialItem[]
```

推荐前端内部类型：

```ts
type MaterialSearchScope = "current-folder" | "learning-content";

type MaterialSearchResult = {
  material: MaterialItem;
  typeLabel: string;
  logicalPath: string;
};
```

路径规则：

- 逻辑路径只来自 `parentId` 资料树。
- 推荐展示父级链，例如 `根目录 / 第一章 / 第二节`。
- 文件名本身可以作为结果主标题，不必重复放进路径末尾。
- 不使用、不展示 `storedPath`。
- 不从物理路径推导扩展名；扩展名从 `material.name` 推导。

状态边界：

- 搜索状态留在 `MaterialExplorer`。
- 当前文件夹状态继续由 `StudyDetailPage` 持有并传入资料区。
- 阅读打开状态继续由 `StudyDetailPage.handleOpenMaterial` 管理。
- 资料树搜索和路径构建保持纯函数，便于单测覆盖。

点击结果：

```text
folder result click
-> onCurrentFolderChange(folder.id)
-> switch scope to current-folder
-> optionally clear search term

file result click
-> onCurrentFolderChange(file.parentId)
-> onOpenFile(file)
-> inline reader opens in StudyDetailPage
```

## 开发计划

V1.7 采用 A1-A6 分阶段推进。A1 先锁测试和纯函数合同，A2-A3 完成 UI 与点击流，A4-A5 修复稳定性观察项，A6 回归验证和文档收口。

| 阶段 | 主题 | 目标 | 主要工作 | 验收标准 | 建议 agent |
| --- | --- | --- | --- | --- | --- |
| A1 | 递归搜索合同与纯函数 | 先锁定搜索语义和路径展示 | 新增 / 扩展 `materialTree` 测试；实现递归搜索、扩展名匹配、逻辑路径构建、pending-deleted 排除、防环保护 | 当前文件夹不递归；当前学习内容递归；路径为逻辑路径；异常树不死循环 | `tdd-guide`、`typescript-reviewer` |
| A2 | 资料区范围控件 | 在现有资料区加入两档搜索范围 | `MaterialExplorer` 增加 `当前文件夹 / 当前学习内容` 分段控件；当前文件夹保留网格；当前学习内容搜索态切紧凑列表 | 控件不挤占详情页 header；空搜索不铺全库；空结果文案区分两种范围 | `react-reviewer`、`ui-ux-designer` |
| A3 | 搜索结果跳转与打开 | 让搜索结果服务于资料区导航和内嵌阅读 | 文件点击先切父文件夹再打开；文件夹点击进入文件夹并切回当前文件夹模式；补集成测试 | 返回资料列表后停留在文件所在文件夹；点击文件夹不调用 preview | `tdd-guide`、`react-reviewer` |
| A4 | 预览失败终态 | 修复打开资料失败后卡 loading | 为 preview 加失败态或打开失败回退；`MaterialPreviewPane` 不再在失败后永久显示 loading | `previewMaterialFile` reject 后无“正在加载资料预览”；用户仍可返回资料列表 | `tdd-guide`、`typescript-reviewer` |
| A5 | PDF 快速返回保存 | 锁定防抖保存的最后状态 | 打开 PDF 后翻页 / 缩放，立即返回资料列表，flush 最后阅读状态；补测试与必要修复 | `saveMaterialReadingState` 收到最后页码 / 缩放 | `tdd-guide`、`react-reviewer` |
| A6 | 回归验证与文档收口 | 确认 V1.7 不破坏 V1.5/V1.6 主线 | 跑前端/Rust/Tauri 验证；更新进度和上下文；版本号统一为 `1.7.0`；真实 App 手测清单执行 | 自动化命令通过；真实 App 手测通过；文档状态一致 | `e2e-runner`、`doc-updater` |

## 测试策略

### P0 自动化测试

纯函数测试：

- 当前文件夹范围只匹配当前层，不能匹配下级文件夹里的资料。
- 当前学习内容范围递归匹配所有文件夹下的文件 / 文件夹名称。
- 扩展名匹配支持 `pdf`、`.pdf`、大小写混合。
- 搜索结果显示根目录、一级文件夹、多级中文路径。
- pending-deleted 父文件夹及所有子孙不出现在结果中。
- 孤儿 parent、环形 parent 不导致递归死循环。

`MaterialExplorer` 测试：

- 搜索范围切换控件可用。
- 当前文件夹模式仍显示现有网格。
- 当前学习内容搜索态显示紧凑结果列表。
- 空搜索且类型为全部时，不默认铺出全库，显示“输入关键词搜索当前学习内容中的资料”。
- 当前学习内容无结果时显示“当前学习内容没有匹配资料”。
- 结果行显示资料名、类型和逻辑路径，不显示 `storedPath`。
- 点击文件触发父文件夹切换和打开资料 callback。
- 点击文件夹触发进入文件夹，不触发 preview。

`StudyDetailPage` 测试：

- 点击嵌套文件搜索结果后，详情页真的切到对应文件夹并打开资料。
- 点击嵌套文件后返回资料列表，仍停留在该文件所在文件夹。
- `previewMaterialFile` reject 后不再显示“正在加载资料预览”，返回资料列表按钮仍可用。
- PDF 翻页 / 缩放后立即返回资料列表，最终阅读状态仍保存。
- pending-deleted 子树的页面级流程保留 1 条集成测试，其余细节交给纯函数和资料区测试。

### P1 自动化测试

- 空输入 / 纯空格不进入全学习内容结果态，避免把整棵树摊平。
- 中文、空格、括号、`C++`、多点文件名、无扩展名文件都能稳定处理。
- 类型筛选和排序在两种范围下行为明确。
- 长路径和长文件名不挤爆结果行。

### 不需要新增的测试

如果 V1.7 正式搜索只基于 `detail.materials` 前端派生，则不新增：

- Rust repository 测试。
- Tauri command 测试。
- SQLite 迁移测试。
- `learningContentApi` payload 测试。

只有未来新增后端搜索 command 或 SQLite FTS 时，才需要补这些测试。

### office2pdf spike 验证

实验验证单独运行：

```text
cd spikes/office2pdf
cargo fmt --check
cargo check
cargo run
```

该命令不纳入 V1.7 正式 release gate。实验输出记录在 README 或后续 spike 报告中，不作为正式 App 功能验收。

## 设计口径

- 搜索控件放在资料区现有控制条内，不放到详情页 header。
- 当前文件夹模式保留资源管理器式大图标布局。
- 当前学习内容搜索结果使用紧凑列表，避免把路径和类型硬塞进大图标卡片。
- 路径是辅助定位信息，视觉权重低于资料名。
- 文件夹结果点击后切回普通文件夹浏览体验，避免用户以为仍处在全局搜索中心。
- 不做搜索历史、不做快捷键提示、不做独立搜索页。
- 保持详情页“资料 -> 阅读 -> 笔记”的主线，不让搜索成为新的主工作台。

## 安全与隐私边界

- 不扫描磁盘目录，不调用 `read_dir` / `walkdir` 搜索资料库物理路径。
- 不从 `storedPath` 派生展示路径或扩展名。
- 不展示本机绝对路径、盘符、UNC、AppData、资料库 UUID 目录或 asset URL。
- 搜索只基于当前学习内容的逻辑资料树和 SQLite 已返回元数据。
- 点击文件仍走现有 `previewMaterialFile` 边界，不直接绕过后端校验。
- 删除待确认子树不出现在搜索结果中，避免用户从搜索入口绕过删除确认语义。

## 验证命令

最小 RED/GREEN 验证，在 `app/`：

```text
npm.cmd test -- src/pages/materials/materialTree.test.ts src/pages/materials/MaterialExplorer.test.tsx src/pages/StudyDetailPage.test.tsx
npm.cmd run typecheck
```

如果不新增 `MaterialExplorer.test.tsx`，至少运行：

```text
npm.cmd test -- src/pages/materials/materialTree.test.ts src/pages/StudyDetailPage.test.tsx
```

release 前完整验证：

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

根目录 `package.json` 目前只是占位脚本，不用根目录 `npm test` 作为有效验证。

当前自动化验证结果（2026-06-15）：

- `npm.cmd test`：通过，11 个测试文件、154 个测试通过。
- `npm.cmd test -- src/pages/materials/materialTree.test.ts src/pages/materials/MaterialExplorer.test.tsx src/pages/StudyDetailPage.test.tsx`：通过，3 个测试文件、71 个测试通过。
- `npm.cmd run typecheck`：通过。
- `npm.cmd run build`：通过。
- `cargo fmt --check`：通过。
- `cargo test`：通过，72 个 Rust 测试通过。
- `cargo clippy -- -D warnings`：通过。
- `npm.cmd run tauri -- build --debug`：通过，生成 `target/debug/studyseq.exe`、`StudySeq_1.7.0_x64_en-US.msi`、`StudySeq_1.7.0_x64-setup.exe`。
- `npm.cmd run tauri -- build`：通过，生成 `target/release/studyseq.exe`、`StudySeq_1.7.0_x64_en-US.msi`、`StudySeq_1.7.0_x64-setup.exe`。
- `spikes/office2pdf` 自检：`cargo fmt --check`、`cargo check`、`cargo run` 通过；最小 PPTX 转 PDF warnings 为 0。该实验仍不纳入正式 release gate。

当前真实 App 手测结果（2026-06-15）：

- 使用临时 identifier `com.studyseq.desktop.v17test` 和隔离数据目录执行，不触碰正式 `com.studyseq.desktop` 用户数据；手测后已关闭临时 App，并重新生成官方 debug/release 构建产物。
- 当前文件夹模式搜索 `章节` 不命中二级文件夹内 PDF，显示“当前文件夹没有匹配资料”。
- 当前学习内容模式搜索 `资料` 同时命中根目录 `根资料.txt`、一级文件夹 `一级资料.txt`、二级文件夹 `章节资料.PDF`。
- 搜索 `pdf`、`.pdf`、`PDF` 均命中 `章节资料.PDF`。
- 搜索结果列表只显示资料名、类型和逻辑路径，例如 `根目录 / 第一章 / 第二节`；结果列表未出现 `AppData`、`StudySeqData`、`com.studyseq`、盘符、material id、asset URL 或物理路径。
- 点击 `章节资料.PDF` 搜索结果后进入内嵌 PDF 阅读区，显示 `第 1 / 2 页`；点击放大后显示 `120%`。
- 立即返回资料列表后，资料区停留在 `根目录 > 第一章 > 第二节`，且隔离 SQLite 中 `mat-nested-v17` 的 `material_reading_states.scale = 1.2`、`position_kind = pdf_page`。
- 点击文件夹结果 `第二节` 后只进入该文件夹，不打开阅读区，不出现“正在加载资料预览”。
- 标记删除父文件夹 `第一章` 后，当前学习内容搜索不再返回其子树中的 `章节资料.PDF` 和 `一级资料.txt`；撤回删除后搜索结果恢复。
- 将隔离库中的 `一级资料.txt` 临时指向缺失副本后，真实 App 显示“资料副本不存在，请重新导入”，没有停留在“正在加载资料预览”，且可以返回资料列表；测试后已恢复该隔离记录的原 `stored_path`。

## 真实 App 手测清单

1. 在根目录、一级文件夹、二级文件夹中分别放入资料，搜索文件名确认都能在当前学习内容范围命中。
2. 在当前文件夹模式搜索，确认不会命中下级文件夹里的资料。
3. 搜索 `pdf`、`.pdf`、大写扩展名和中文关键词。
4. 搜索结果路径只显示逻辑文件夹路径，不显示本机路径。
5. 点击二级文件夹里的 PDF 结果，确认进入父文件夹并打开 PDF；返回资料列表后仍在该父文件夹。
6. 点击文件夹结果，确认进入文件夹，不打开阅读区。
7. 标记删除一个父文件夹后，搜索确认父文件夹和子资料都不出现；撤回后重新出现。
8. 模拟或触发资料预览失败，确认不会卡在“正在加载资料预览”，并且能返回资料列表。
9. 打开 PDF，翻页或缩放后立即返回资料列表，再重新打开确认恢复到最后状态。
10. 回归主页“继续”入口、资料库位置设置、资料导入、资料删除、笔记保存、txt / 图片 / PDF / 视频预览。
11. 断网状态下，搜索、打开资料、笔记和资料库维护仍可用。
12. 手动运行 `spikes/office2pdf` 自检，确认实验仍独立，不影响正式 App。

## 风险与缓解

### 搜索状态和阅读状态混杂

影响：搜索词、范围、当前文件夹、选中资料和预览加载态都在详情页附近活动，容易让 `StudyDetailPage` 再次膨胀。

缓解：搜索状态留在 `MaterialExplorer`；资料树算法放纯函数；阅读打开继续复用 `StudyDetailPage.handleOpenMaterial`。

### 当前学习内容模式把全库摊平

影响：空搜索时如果展示整棵资料树，会让资料区从浏览器变成杂乱结果列表。

缓解：当前学习内容模式在空搜索且类型为全部时只显示提示，不默认铺出全库。

### 逻辑路径误用真实路径

影响：如果直接展示 `storedPath`，会破坏 V1.6 刚收紧的隐私边界。

缓解：路径只由 `parentId` 树构建；测试明确断言不出现 `storedPath`。

### 点击文件后返回位置不符合预期

影响：用户通过搜索打开嵌套资料后，返回列表却回到搜索前位置，会找不到刚才资料。

缓解：文件结果点击先切到父文件夹，再打开资料，并补集成测试。

### 预览失败仍卡 loading

影响：打开失败时用户被困在阅读 loading 状态。

缓解：引入明确失败态或打开失败回退；测试断言 loading 消失且返回按钮可用。

### PDF 防抖保存丢最后状态

影响：用户翻页或缩放后马上返回，最后页码 / 缩放可能没保存。

缓解：返回资料列表时 flush 或保存最后阅读状态，并用 fake timers 测试锁定。

### office2pdf 实验误入正式应用

影响：依赖体积、许可证、安全边界和转换失败率未评估就进入 release。

缓解：保持在 `spikes/office2pdf/`；不接 app 依赖、不接 UI、不进 release gate；后续产品化另开计划。

## 后续候选

以下内容有价值，但不进入 V1.7：

- Office 转 PDF 产品化。
- Office 内嵌预览。
- 全文搜索、PDF 文本索引、OCR。
- 跨学习内容全局资料搜索。
- 搜索历史、收藏搜索、搜索快捷入口。
- 移动资料弹窗快速定位目标文件夹。
- 整文件夹导入、目录同步、文件监听。
- 资料缩略图全库扫描。
- 打开原文件或打开所在文件夹。
