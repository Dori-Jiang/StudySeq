# StudySeq / 知序 v1 技术文档

## 技术结论

StudySeq / 知序 v1 使用：

```text
Tauri 2 + Vite + React + TypeScript + Rust + SQLite
```

第一版目标不是做复杂平台，而是先做一个稳定、离线、本地优先的桌面 App：

```text
主页管理学习内容
详情页管理资料和笔记
阅读页支持左内容右笔记
数据保存在本机 SQLite
```

## 关键假设

- v1 只做桌面端，优先 Windows。
- 数据只存在本机，不依赖网络。
- 第一版不做云同步、账号、自动进度、日历中心。
- 资料文件 v1 采用导入模式：复制到 App 管理的本地资料库，会增加应用占用空间。
- 学习资料必须支持在 App 内预览，不以系统外部打开作为主要阅读路径。
- 笔记正文 v1 使用纯文本，不使用 Markdown 或复杂富文本。
- SQLite v1 暂不加密。
- 进度由用户手动维护。
- 应用源码放在 `app/`。

## 成功标准

- 可以创建、编辑、删除学习内容。
- 主页展示名称、状态、截止日期、预计工时、进度。
- 详情页展示资料区和笔记区。
- 可以添加文件夹、导入文件、创建多个纯文本笔记。
- 阅读页可以左侧在 App 内预览资料，右侧切换和编辑纯文本笔记。
- 删除学习内容、资料或笔记前必须二次确认；不同对象独立删除。
- App 重启后数据仍存在。
- 基础测试、构建、打包命令可运行。

## 技术栈

```text
桌面壳：Tauri 2
前端：Vite + React + TypeScript
路由：React Router
状态：Zustand
样式：CSS Modules 或普通 CSS
数据库：SQLite
本地能力：Rust command
测试：Vitest + React Testing Library + Rust test
```

## 架构分层

```text
前端 UI 层
- 页面、组件、表单、阅读布局

前端应用层
- 路由
- invoke 封装
- 表单校验
- 页面数据加载

Tauri 命令层
- 前端调用 Rust 的入口
- 参数校验
- 错误转换
- 文件系统能力入口

Rust 业务层
- 学习内容服务
- 资料服务
- 笔记服务
- 阅读状态服务

Rust 数据层
- SQLite repository
- migration
- 本地路径处理
```

## 目录结构建议

```text
app/
  package.json
  src/
    main.tsx
    app/
      routes.tsx
      layout/
    pages/
      HomePage.tsx
      StudyDetailPage.tsx
      ReaderPage.tsx
    features/
      study/
      materials/
      notes/
      reader/
    shared/
      api/
      components/
      styles/
      types/
  src-tauri/
    src/
      main.rs
      commands/
      services/
      repositories/
      models/
      errors.rs
      paths.rs
    migrations/
```

## 核心数据模型

```text
LearningContent
- 学习内容

MaterialItem
- 资料文件夹或导入文件

Note
- 纯文本笔记

NoteGroup
- 可选笔记分组

ReadingState
- 阅读页状态

AppSetting
- 应用配置
```

状态枚举：

```text
planned     计划中
active      进行中
paused      暂停
completed   完成
overdue     超期
```

## SQLite 表设计

```sql
learning_contents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  deadline TEXT,
  estimated_hours REAL DEFAULT 0,
  progress INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_opened_at TEXT
);
```

```sql
material_items (
  id TEXT PRIMARY KEY,
  learning_content_id TEXT NOT NULL,
  parent_id TEXT,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  original_path TEXT,
  stored_path TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

```sql
note_groups (
  id TEXT PRIMARY KEY,
  learning_content_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

```sql
notes (
  id TEXT PRIMARY KEY,
  learning_content_id TEXT NOT NULL,
  group_id TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

```sql
reading_states (
  id TEXT PRIMARY KEY,
  learning_content_id TEXT NOT NULL,
  material_id TEXT,
  active_note_id TEXT,
  split_ratio REAL DEFAULT 0.68,
  note_mode TEXT DEFAULT 'inline',
  updated_at TEXT NOT NULL
);
```

## Tauri / Rust 命令边界

前端不直接操作 SQLite，只调用 Rust 命令。

建议命令：

```text
list_learning_contents()
create_learning_content(input)
update_learning_content(id, input)
delete_learning_content(id)

get_learning_detail(id)

list_material_items(learning_content_id, parent_id)
create_material_folder(input)
import_material_file(input)
rename_material_item(id, name)
delete_material_item(id)
preview_material_file(id)
reveal_material_file(id)

list_notes(learning_content_id)
create_note(input)
update_note(id, input)
delete_note(id)

get_reading_state(learning_content_id)
save_reading_state(input)
```

Rust 负责：

```text
数据校验
SQLite 读写
文件路径校验
错误转换
migration
```

前端负责：

```text
界面交互
表单状态
轻量校验
调用 command
展示错误
```

## 页面路由

```text
/                         主页
/studies/:studyId          详情页
/studies/:studyId/read     阅读页
```

阅读页参数：

```text
/studies/:studyId/read?materialId=xxx&noteId=yyy
```

## 本地文件策略

v1 默认使用“导入到应用资料库”：

```text
用户选择文件
-> Rust 复制文件到 App 管理的本地资料库
-> SQLite 保存原始路径和 App 内存储路径
-> 阅读时在 App 内预览资料
-> 删除资料条目时，二次确认后删除 App 内副本和记录
-> 不删除用户原始来源文件
```

App 内副本不存在时显示：

```text
导入文件已丢失或损坏
```

注意：导入模式会增加 App 占用空间，但能保证学习资料集中管理和离线可用。

## 实现阶段

1. 初始化 Tauri + Vite + React + TypeScript 骨架。
2. 建立 SQLite migration 和 Rust repository。
3. 完成学习内容 CRUD 和主页。
4. 完成资料导入、资料树和纯文本笔记列表。
5. 完成阅读页分栏、资料内预览、笔记选择、阅读状态保存。
6. 增加导入文件丢失处理、预览失败提示、错误提示。
7. 加测试和最小打包检查。

## 测试检查

前端：

```text
npm run typecheck
npm run test
npm run build
```

Rust / Tauri：

```text
cargo test
cargo fmt --check
cargo clippy
cargo tauri build
```

关键测试点：

```text
进度只能是 0-100
状态只能是固定枚举
删除学习内容时关联数据处理一致
删除前必须二次确认
导入文件副本不存在时不崩溃
阅读页分栏比例能保存和恢复
笔记切换不丢当前编辑内容
```

## 主要风险

风险：SQLite 访问放在前端

影响：数据边界混乱，后续难维护

建议：从 v1 开始就由 Rust command 统一访问数据库。

风险：资料导入会增加 App 占用空间

影响：资料越多，占用越大；后续备份、迁移和清理成本会上升

建议：v1 明确采用导入模式，并预留资料库目录、文件体积显示和后续清理能力。

风险：全部学习资料都要求 App 内预览

影响：PDF、Office、视频、图片、网页、文本等格式的预览能力会明显增加 v1 成本

建议：先建立统一 preview adapter，按格式逐步实现；不能把系统外部打开作为主要阅读路径。

风险：笔记编辑器过重

影响：拖慢 v1

建议：v1 只做纯文本笔记，不做 Markdown 和复杂富文本。

风险：SQLite 暂不加密

影响：本机文件可被有本地访问权限的人读取。

建议：v1 接受该边界；后续如进入敏感资料场景再评估加密。

## 已确认技术决策

- 笔记正文 v1 使用纯文本。
- 资料文件 v1 采用导入模式，复制到 App 管理的本地资料库。
- 学习资料必须支持在 App 内预览。
- SQLite v1 暂不加密。
- 删除学习内容、资料或笔记时必须二次确认；不同对象独立删除。

## 推荐下一步

先做最小闭环：

```text
Tauri 骨架
-> SQLite
-> 学习内容 CRUD
-> 主页展示
-> 重启后数据恢复
```

不要一开始就做阅读器、复杂文件预览、富文本编辑器。
