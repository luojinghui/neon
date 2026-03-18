## Why

`/soul` 页面目前仍是占位内容（Hello World），无法承载“星球”模块后续的聊天室能力演进。先落地聊天室列表的 UI 与交互骨架，可以在不引入后端/实时复杂度的前提下，快速建立可用页面与稳定的组件拆分，为后续接入 Socket.IO 数据层做准备。

## What Changes

- 在 `/soul` 实现“聊天室列表”页面（UI Only）
- 使用现有 `TopBar` + `ThemeToggle` 的页面骨架，保持与现有页面一致的布局与主题风格
- 聊天室采用响应式 grid 布局，提供房间卡片（名称/简介/人数/在线状态 badge/主要操作按钮）
- 提供 UI 层状态：Loading（Skeleton）、Empty（空态）、Error（错误态+重试）
- 点击卡片或按钮给出明确反馈（使用 antd `message.info` 的占位提示）

## Capabilities

### New Capabilities

- `chat-list`: 星球页聊天室列表（UI Only），包含 grid 展示、三态与点击反馈

### Modified Capabilities

- (none)

## Impact

- **Affected route**: `src/app/soul/page.tsx`
- **New UI components**: 预计新增 `src/app/soul/components/*`（卡片、grid、skeleton、空/错态等）
- **Dependencies**: 复用现有 `antd`（`App` message、Skeleton/Empty 可选）、`Tailwind` token（`bg-background`/`bg-surface`/`border-border` 等）、`TopBar`/`ThemeToggle`
