## Why

聊天列表页 `/soul` 已完成，但点击聊天室卡片只弹 TODO 提示，无法进入聊天室。需要实现聊天详情页 UI，为后续 Socket.IO 实时聊天功能打基础。

## What Changes

- 新增 `/soul/[roomId]` 动态路由页面，展示聊天室详情 UI
- 列表页点击卡片改为路由跳转到详情页
- 新增消息列表、消息气泡、输入区、工具栏等聊天 UI 组件
- 新增 `core/index.ts` 核心逻辑层（class 单例模式，仿 NeonCloud）
- 新增 zustand store 管理聊天状态
- 一期使用 mock 数据，不涉及 Socket.IO 连接

## Capabilities

### New Capabilities

- `soul-detail-page`: 聊天室详情页 UI 布局、消息展示、输入区域、工具栏

### Modified Capabilities

- `chat-list`: 列表页点击卡片改为路由跳转（而非 TODO 提示）

## Impact

- 新增文件: `src/app/soul/[roomId]/` 目录下的页面和组件
- 新增文件: `src/app/soul/core/index.ts`, `src/app/soul/store.ts`
- 修改文件: `src/app/soul/page.tsx`（跳转逻辑）
- 依赖: DiceBear（头像生成，CDN URL 方式，无需安装包）
