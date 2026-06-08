# P0 真实 App 闭环验收基线

## 目标

验证当前 StudySeq App 在真实 Tauri 环境中是否能跑通基础学习闭环：

创建学习内容 -> 导入资料 -> 详情页预览 -> 进入阅读页 -> 写笔记 -> 返回详情 -> 重启恢复。

## 样本文件

- `samples/P0-中文测试资料.txt`
- `samples/P0-test-image.png`
- `samples/P0-multipage-test.pdf`

## 验收记录

记录文件：`acceptance-record.md`

## P0 范围

只验证当前已实现能力是否真实可用。发现阻断问题时修复；不新增删除、编辑、文件夹、Office/视频预览、加密、云同步等后置功能。
