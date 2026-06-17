# StudySeq / 知序 V1.12 开发计划

## 文档定位

本文件记录 StudySeq / 知序 V1.12.0 / V1.12.1 的开发计划。

- V1.12.0 主题是“更多视频格式技术定版 + 第一批支持”。
- V1.12.1 只作为视频格式稳定补丁。
- 总路线见 [`studyseq-pre-v2-roadmap.md`](studyseq-pre-v2-roadmap.md)。

## 架构判断

V1.12 不能把 MKV / AVI / WMV / RMVB 等格式简单追加到 WebView `<video>` 支持清单。

V1.12 先通过 libVLC、libmpv 和派生 MP4 三类路线完成技术定版。商业发布合规是硬 gate：任何路线只要存在 GPL 污染、不可验证二进制、不可替换 LGPL 动态库、插件许可证不清或 codec 专利风险不可接受，就不能进入正式实现。

正式能力必须保持详情页内嵌阅读主线，不外部打开，不恢复旧独立阅读页，不把 StudySeq 做成播放器 App。

## 版本目标

V1.12.0：完成更多视频格式的技术定版、前置 spike、第一批格式支持和派生视频缓存主链路。

V1.12.1：重点收口大文件、长视频、缓存损坏、磁盘不足、删除 / 迁移 / cleanup 和继续播放回归。

## 成功口径

- 现有 MP4 / WebM 继续直接走 WebView video，不回退。
- 第一批新增格式能在详情页内嵌播放，不跳转旧阅读页，不外部打开。
- 若 libVLC 或 libmpv 通过 spike，则 WebView 原生不支持的格式可走原生内嵌播放器直接播放。
- 若 libVLC 和 libmpv 未通过 spike，则 WebView 原生不支持的格式转为派生 MP4 后复用现有 `VideoPreview`。
- 转码失败、格式不支持、磁盘不足、缓存损坏都有稳定错误终态。
- 继续播放时间点仍按 material 维度保存和恢复。
- 派生视频缓存纳入资料库统计、迁移、cleanup、删除学习内容、删除资料、删除文件夹链路。
- 不泄露本机路径，不允许前端拼接播放路径、转码路径或执行命令。
- 商业发布合规材料完整：许可证、动态链接方式、第三方 notices、源码/构建参数披露、插件清单和 codec 风险结论。

## 第一批格式

第一批建议只承诺：

- `mkv`
- `avi`
- `mov`

暂不承诺第一批：

- `wmv`
- `flv`
- `rm`
- `rmvb`

这些格式历史编码和许可证风险更高，先进入 spike 样本，不进入 V1.12.0 成功口径。V1.12.1 可按真实样本结果决定是否补一个格式，但不承诺全覆盖。

## 前置 Spike

V1.12.0 开发前必须先做 spike，不直接改主线能力。

Spike 目标：

- 确认 libVLC 是否能在 Windows 打包内离线播放 MKV / AVI / MOV，并能嵌入当前详情页预览区。
- 确认 libmpv 是否能在 Windows 打包内离线播放 MKV / AVI / MOV，并能嵌入当前详情页预览区。
- 确认派生 MP4 兜底路线：能 remux 时快速换容器，不能 remux 时转码为 H.264 video + AAC audio + MP4 container。
- 验证派生 MP4 能被 WebView2 `<video>` 播放。
- 验证 30 分钟、2 小时、大于 1GB 视频的耗时、CPU、磁盘占用和失败表现。
- 验证中文路径、空格路径、特殊字符文件名。
- 验证离线环境可用。
- 输出许可证、包体增加量、DLL / 插件分发清单、运行时安全边界结论。

Spike 成功后再进入正式实现；失败则 V1.12.0 降级为“技术定版 + 不支持提示增强”或“派生 MP4 兜底”，不硬上半成品播放能力。

Spike 淘汰条件：

- 只能弹独立播放器窗口，不能稳定嵌入详情页预览区。
- 需要外部安装 VLC / mpv / codec pack。
- 需要恢复旧独立阅读页。
- 存在 GPL-only 依赖且项目不接受 GPL 化。
- 无法证明 LGPL 动态库可替换、二进制来源和构建参数可追溯。
- VLC / mpv 插件或 FFmpeg 依赖许可证不清。
- codec 专利风险无法接受或无法记录。
- 播放器崩溃、文件锁、进程残留或窗口句柄残留无法稳定处理。

## 技术路线

V1.12 先评估三条路线：

路线 A：libVLC 原生内嵌播放器。

- Rust 侧根据 material id 解析 App 管理资料副本路径，并校验路径仍在资料库内。
- Windows 上创建原生子窗口 `HWND`，由 libVLC 渲染到该区域。
- 前端只提供 `NativeVideoPreviewHost` 占位区域、基础控制和状态显示。
- 不依赖系统安装 VLC；运行时显式指定随包插件目录。
- 必须筛选实际分发的 VLC modules / plugins，排除 GPL-only 或非必要模块。

路线 B：libmpv / mpv 原生内嵌播放器。

- 优先用 `mpv.exe` sidecar + `--wid=<HWND>` + IPC 验证进程隔离；`libmpv` in-process 作为第二阶段评估。
- Rust 侧统一管理 material id 解析、路径校验、播放器生命周期和错误归一。
- 必须证明 mpv 是 LGPL 可接受构建，依赖链没有 GPL-only 或 nonfree 组件。
- 若 sidecar 路线需要 shell capability，权限必须精确到指定二进制和固定参数。

路线 C：本地 remux / 转码为派生 MP4，复用现有播放器。

- Rust 侧负责探测、转码、派生缓存、路径校验和错误归一。
- 前端仍只拿 `MaterialPreview`，用现有 `VideoPreview` 播放 `assetPath`。
- 这条路线符合现有 Office 派生 PDF 模式，边界清楚，前端轻。
- 能 remux 时优先 remux，避免把所有大视频都重编码。

路线选择规则：

- libVLC / libmpv 不得直接进入正式实现；只有通过合规、嵌入、打包、样本和安全矩阵后才能作为候选路线。
- 两条原生路线都通过时，只选择合规负担更低、包体更小、嵌入更稳的一条，不双栈发布。
- 两条原生路线任一合规不清，视为失败。
- 两条原生路线均失败时，回到派生 MP4 兜底路线。

不推荐：

- 在未完成 spike 前直接引入 VLC / mpv / native window 到主线。
- 把 StudySeq 做成播放器 App。
- 继续依赖 WebView 原生 video 作为 MKV / AVI / WMV / RMVB 的正式支持依据。

## 数据模型与派生缓存

V1.12.0 优先不新增 SQLite 表，不提升 `PRAGMA user_version`。若 spike 证明必须持久化转码状态，再单独设计 `derived_materials` 表，并作为 V1.12.0 架构 gate。

派生路径：

```text
<material_library_dir>/<learning_content_id>/.derived/video-mp4-v1/<material_id>.mp4
```

可选 sidecar 元数据：

```text
<material_library_dir>/<learning_content_id>/.derived/video-mp4-v1/<material_id>.json
```

sidecar 记录：

- source material id
- source size
- source modified time
- source mime / extension
- transcode profile version
- output size
- created_at
- completed flag

缓存复用规则：

- 源文件必须位于 App 管理资料库内。
- 派生 MP4 必须位于 `.derived/video-mp4-v1/` 内。
- 源文件 size 和 modified time 与 sidecar 匹配。
- MP4 文件存在且为普通文件。
- sidecar 标记 completed。
- 基础完整性检查通过，至少确认 MP4 头部 / moov 可读或通过转码工具 probe。
- profile version 一致；未来调整转码参数时切到 `video-mp4-v2`。

写入规则：

- 先写同目录临时文件。
- 转码完成后校验输出。
- 校验通过再原子替换正式缓存。
- 失败清理临时文件，不留下可复用半成品。
- 坏缓存重新生成，不能进入永久 loading。

## Rust service / command 边界

新增内部 service：

- `video_transcode_service.rs`
- `derived_video_cache.rs`
- `native_video_service.rs`，仅在原生播放器路线通过 spike 后进入主线

Repository 仍负责资料查询、路径合法性、预览合同组合和 cleanup 入口；转码细节下沉 service，避免继续膨胀 `repository.rs`。

前端 invoke 仍只通过 Rust command：

- 优先复用 `preview_material_file(materialId)`。
- 如需要取消或重试，再新增窄 command：`cancel_video_transcode(materialId)`、`retry_video_transcode(materialId)`。
- 原生播放器 spike 使用窄 command，不让前端传任意路径：
  - `probe_native_video_backend(backend)`
  - `start_native_video_preview({ materialId, backend, rect, startSeconds })`
  - `resize_native_video_preview({ sessionId, rect })`
  - `control_native_video_preview({ sessionId, action, positionSeconds? })`
  - `close_native_video_preview({ sessionId })`

不建议前端传入路径、转码参数、输出目录或命令参数。

`MaterialPreview` 合同建议扩展：

```text
kind: "video" | "native_video" | "unsupported"
assetPath?: string
mimeType?: string
playbackEngine?: "web" | "native" | "derived_mp4"
derivedFromMaterialId?: string
previewStatus?: "ready" | "processing" | "failed"
errorCode?: "unsupported_video_format" | "native_video_unavailable" | "native_video_unsupported_format" | "native_video_attach_failed" | "native_video_operation_failed" | "transcode_failed" | "insufficient_disk_space" | "missing_material_copy" | "unsafe_material_path"
```

原生播放器事件通过 Tauri event 回传：

- `ready`
- `time_update`
- `ended`
- `error`
- `closed`

原生播放器路线继续复用 material 维度的继续播放时间点；如现有保存逻辑只允许 `kind=video`，正式实现时需调整为“资料是视频 MIME 且路径在资料库内”。

## 前端状态

前端只管理 UI 状态：

- 正在准备视频。
- 转码进度；如 Rust 能稳定提供百分比再展示，否则只展示 indeterminate loading。
- 转码失败和重试按钮。
- 磁盘不足提示。
- 不支持格式提示。
- 继续播放恢复状态。

V1.12.0 不做复杂后台任务 UI。用户点击某个视频时才触发该资料的按需转码。

## 开发计划

| 阶段 | 主题 | 主要工作 | 验收标准 | 建议 agent |
| --- | --- | --- | --- | --- |
| A0 | 商业合规预审 | 收集 libVLC / libmpv / FFmpeg / binding / codec / DLL 分发许可证、二进制来源、构建参数和插件清单 | 能明确判断闭源商业发布是否可接受 | `security-reviewer`、`architect` |
| A1a | libVLC spike | 验证 Windows 离线打包、HWND 内嵌、MKV / AVI / MOV 样本、插件清单、包体和失败终态 | 能决定 libVLC 是否可进入候选路线 | `architect`、`rust-reviewer`、`security-reviewer` |
| A1b | libmpv spike | 验证 mpv sidecar / libmpv、LGPL 构建证据、HWND 内嵌、MKV / AVI / MOV 样本、包体和失败终态 | 能决定 libmpv 是否可进入候选路线 | `architect`、`rust-reviewer`、`security-reviewer` |
| A1c | 派生 MP4 兜底复核 | 验证 remux / 转码方案、许可证、包体、样本和失败结论 | 原生路线失败时仍有可控兜底路线 | `architect`、`security-reviewer` |
| A2 | 技术路线决策 | 对 libVLC / libmpv / 派生 MP4 进行决策表收口 | 只允许一条正式主线进入实现 | `planner` |
| A3 | 主线实现 | 按 A2 决策实现 native service 或 `derived_video_cache` 和转码 service | 第一批格式在详情页内嵌播放 | `rust-reviewer`、`typescript-reviewer` |
| A4 | 前端接入 | 原生播放器 host 或准备中 / 失败 / 重试状态；MP4/WebM 继续复用 `VideoPreview` | 现有 MP4/WebM 不回退 | `react-reviewer` |
| A5 | 生命周期 | 删除、cleanup、资料库迁移、播放器 session 关闭和文件锁处理 | 派生视频或原生播放器资源不残留、不误删 | `database-reviewer`、`security-reviewer` |
| A6 | 发包验证 | 真实样本矩阵、release gate、商业合规材料、文档和版本号 | 第一批格式可发布 | `e2e-runner` |

V1.12.1 阶段：

- B1：大文件、长视频、坏缓存、磁盘不足和取消 / 重试稳定化。
- B2：真实 App 样本矩阵全量复查，决定是否把 WMV / FLV / RMVB 继续后置。
- B3：版本号、文档和发包收口，不继续扩新格式清单。

## 迁移 / cleanup / 删除

- 删除视频资料：删除源副本、阅读状态、对应派生 MP4 和 sidecar。
- 删除文件夹：递归删除子树内视频派生缓存。
- 删除学习内容：删除该学习内容 `.derived/video-mp4-v1`。
- 重命名资料：不影响 material id，可保留缓存；格式判断必须 MIME / 源扩展稳定信息优先。
- cleanup：有效派生视频不应被误删为 orphan；无源资料引用的派生视频应可清理。
- 缓存损坏：删除坏缓存后允许重新生成。

## 测试计划

Rust：

- MP4 / WebM 仍直接返回 `kind=video`，不触发转码。
- MKV / AVI / MOV 按最终决策命中原生播放器或派生转码路线。
- 原生播放器 resolver 只接受 App 管理资料库内副本，拒绝外部路径、缺失副本、文件夹和非视频资料。
- 原生播放器 command 只接收 `material_id`、session id 和控制参数，不接收任意路径。
- 缓存存在且 sidecar 匹配时复用。
- 半成品缓存、坏缓存、缺失 sidecar 不复用。
- 源文件缺失、库外路径、非普通文件路径被拒绝。
- 磁盘不足返回稳定错误码。
- 删除资料 / 删除文件夹 / 删除学习内容清理派生视频。
- cleanup 不误删有效派生视频，能删除 orphan 派生视频。
- 所有转码命令使用参数数组，不拼接 shell 字符串。
- 原生播放器 session 在切换资料、删除资料、资料库迁移和关闭 App 时能关闭，避免文件锁和残留进程。
- 配置快照不新增宽泛 `fs` / `shell` 权限；如使用 sidecar，权限必须精确到指定二进制和参数。

前端：

- 新 preview status 能显示准备中、失败、重试、不支持。
- 成功派生后仍渲染 `VideoPreview`。
- 原生播放器路线渲染 `NativeVideoPreviewHost`，不误走 HTML `<video>`。
- 继续播放时间点对派生视频仍生效。
- 继续播放时间点对原生播放器仍生效。
- 切换资料、返回详情、重启恢复不丢状态。
- 错误文案不包含本机路径。
- 旧 MP4 / WebM 文案和行为不变化。
- 原生播放器失败、崩溃或 backend 不可用时能回到详情页稳定错误态。

## 真实 App 样本矩阵

| 类型 | 样本 | 预期 |
| --- | --- | --- |
| 既有格式 | 100MB MP4 | 直接播放，拖动进度，继续播放 |
| 既有格式 | WebM | 直接播放，不转码 |
| 第一批 | MKV H.264 + AAC | 原生播放或派生 MP4 后播放，继续播放可恢复 |
| 第一批 | MKV H.265 + AAC | 原生播放或派生 MP4 后播放；不支持时稳定失败 |
| 第一批 | MKV H.265 + AC3 | 原生播放或派生 MP4 后播放；记录 codec / 专利风险 |
| 第一批 | AVI Xvid + MP3 | 原生播放或派生 MP4 后播放；不支持时稳定失败 |
| 第一批 | AVI MJPEG / PCM | 原生播放或派生 MP4 后播放；不支持时稳定失败 |
| 第一批 | MOV iPhone H.264 + AAC | 原生播放或派生 MP4 后播放，音画正常 |
| 第一批 | MOV HEVC / HDR / 旋转 metadata | 原生播放或派生 MP4 后播放；记录画面方向和色彩表现 |
| 非承诺 | WMV | 不承诺成功，记录 spike 结果 |
| 非承诺 | FLV | 不承诺成功，记录 spike 结果 |
| 非承诺 | RMVB | 不承诺成功，记录 spike 结果 |
| 边界 | 中文名 + 空格路径 | 不泄露路径，能播放或稳定失败 |
| 边界 | 长路径 / 特殊字符文件名 | 不泄露路径，能播放或稳定失败 |
| 边界 | 大于 1GB 长视频 | 不白屏，不永久 loading |
| 边界 | 2 小时视频 | 不白屏，不永久 loading，CPU / 内存可接受 |
| 边界 | 损坏视频 | 稳定失败，可重试 |
| 边界 | 假扩展名 / 无音轨 / 无视频轨 | 稳定失败或降级，不崩溃 |
| 边界 | 低磁盘空间 | 稳定磁盘不足提示 |
| 回归 | txt / 图片 / PDF / Office 派生 PDF | 不回退 |
| 回归 | 删除资料 / cleanup / 资料库迁移 | 派生视频生命周期正确，原生播放器 session 已关闭 |
| 回归 | 播放中删除 / 重命名资料 | 不吞错误，不删除用户原始来源文件，不残留进程 |
| 离线 | 断网启动和播放 | 完全本地可用 |

## 许可证 / 包体 / 安全风险

商业发布合规未通过时，V1.12 不发布该播放能力。合规结论必须在正式实现前完成，不允许先把依赖接入主线再补审。

许可证：

- libVLC 可作为 LGPL 组件评估，但不得把完整 VLC 应用或未经筛选的插件目录直接打进闭源商业包。
- libVLC 必须形成插件 / module 分发白名单，排除 GPL-only、DVD 解密、网络流媒体、录制 / 转码等非 V1.12 必需模块。
- libmpv 默认不是商业闭源友好路线；只有可复现的 LGPL 构建、无 GPL-only 文件、无 GPL 链接库时才可进入候选。
- FFmpeg 或等价依赖必须明确 LGPL / GPL 配置；禁止 `--enable-gpl`、`--enable-nonfree` 和不可再分发构建进入闭源商业发行包。
- 禁止无意识引入 GPL 污染发行包，除非项目明确接受 GPL 化。
- 记录实际启用 codec、链接方式、分发方式、许可证文本和第三方 notices。
- Windows 下 LGPL 组件必须动态链接，并允许用户替换接口兼容的 DLL。
- 安装包和 About / EULA 必须说明使用的第三方组件、许可证、源码获取方式和构建参数。
- H.264 / H.265 / AAC / MPEG-4 / MP3 / AC3 等 codec 专利风险必须单独记录；开源许可证通过不等于专利授权通过。

Spike 必须收集的合规证据：

- 二进制来源：下载 URL、版本、commit / tag、SHA256、是否官方构建或自构建。
- 构建证据：完整 configure / meson / cmake 参数、build log、`ffmpeg -L`、`ffmpeg -buildconf`、`ffmpeg -codecs`、`ffmpeg -formats`。
- DLL 依赖图：证明动态链接且没有隐藏静态合入。
- 分发清单：实际进入安装包的 DLL、plugins、modules、scripts、docs、license 文件逐项许可证。
- GPL 排除证明：VLC module 白名单、mpv LGPL 构建证明、FFmpeg 无 GPL / nonfree 参数。
- 用户替换证明：替换 libVLC / libmpv / FFmpeg DLL 后 App 仍能加载 ABI 兼容版本。
- notices 草案：About、EULA、第三方许可证页、源码下载页文本。
- codec 样本矩阵：mkv / mov / avi 分别记录内部 codec 和商业发布风险。

包体：

- 记录 Windows 安装包增加量。
- 如果增加过大，需要评估是否延后或拆可选能力。
- V1.12 不做在线下载解码器，保持离线优先。
- 记录 libVLC 路线 DLL / plugins 增量、libmpv 路线 DLL / sidecar 增量、派生 MP4 兜底路线增量。

安全：

- 只处理 App 管理资料库内副本。
- 原生播放器命令只接收 `material_id`、session id 和播放控制参数，不接收任意路径。
- Rust 侧必须按 `material_id -> repository -> stored_path -> canonical path` 解析，并确认路径仍在当前资料库下。
- 转码进程只接受 Rust 组装的参数数组。
- 不拼接 shell 命令字符串。
- 不允许前端传任意路径。
- 输出只能写 `.derived/video-mp4-v1/`。
- 错误只返回稳定 code 和用户可读 message。
- 对超大文件、超长时长、异常 metadata 设置上限和超时。
- 转码失败不能阻塞 App 主线程。
- 播放器 DLL、插件和 sidecar 不得放进资料库目录，不纳入资料库 cleanup / stats。
- 删除、重命名、资料库迁移和退出 App 前必须关闭相关 native session，避免文件锁、进程残留或句柄残留。
- 原生窗口嵌入必须验证 z-index、resize、DPI、焦点、滚轮和多显示器边界；验证不通过不得进入正式实现。

## 决策表

| 结果 | 判定 | V1.12 走向 |
| --- | --- | --- |
| libVLC 通过，libmpv 淘汰 | 采用 libVLC | 进入正式实现，但只做详情页内嵌视频预览 |
| libmpv 通过，libVLC 淘汰 | 采用 libmpv | 进入正式实现，补充 LGPL 构建复现文档 |
| 两者都通过 | 选合规负担更低、包体更小、嵌入更稳的一方 | 另一方记录为淘汰备选，不双栈发布 |
| 两者技术通过但合规不清 | 全部淘汰 | 回到派生 MP4 兜底路线或提示增强 |
| 两者都不能可靠嵌入详情页 | 全部淘汰 | 不接受独立播放器窗口作为替代 |
| 两者都失败 | 不做原生内嵌播放器路线 | V1.12.0 改为技术定版或派生 MP4 兜底 |

## 不进入范围

- 不做播放器 App。
- 不把 libVLC / libmpv 作为未经 spike 的主线依赖。
- 不做剪辑、截取、合并、导出。
- 不做字幕系统。
- 不做播放列表。
- 不做后台批量转码队列。
- 不做全局媒体库。
- 不做倍速增强和音频增强。
- 不做云端转码。
- 不做打开原始来源文件。
- 不依赖系统外部播放器、系统 codec pack 或在线下载解码器。
- 不恢复旧独立阅读页。
- 不承诺所有历史视频格式。
- 不把派生缓存做成独立管理 UI。

## 验证命令

```powershell
Set-Location 'G:\PRJ\计划软件Planassiant\app'
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd audit --audit-level=high

Set-Location 'G:\PRJ\计划软件Planassiant\app\src-tauri'
cargo fmt --check
cargo test
cargo clippy -- -D warnings
cargo tree

Set-Location 'G:\PRJ\计划软件Planassiant'
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\check-tauri-windows-subsystem.ps1

Set-Location 'G:\PRJ\计划软件Planassiant\app'
npm.cmd run tauri -- build --debug
npm.cmd run tauri -- build
```

`cargo-audit` 本机可用时也应补跑。
