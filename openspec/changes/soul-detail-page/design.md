## Context

聊天列表页 `/soul` 已完成（mock 数据 + 响应式网格），点击卡片仅弹 TODO 提示。现在需要新增 `/soul/[roomId]` 详情页，提供完整的聊天 UI 界面。本次仅做 UI + 路由跳转，不涉及 Socket.IO、缓存、权限等功能逻辑。

现有代码基础：

- TopBar 通用组件（返回/标题/右侧操作区）
- 完整的 light/dark 主题 token（包含 chat-bubble 专用变量）
- NeonCloud class 单例 + zustand store 的成熟模式（`src/app/cloud/`）

## Goals / Non-Goals

**Goals:**

- 实现 `/soul/[roomId]` 路由页面，三段式布局（TopBar + 消息列表 + 底部输入区）
- 使用 mock 数据渲染完整聊天 UI，验证视觉效果
- 建立 core class + zustand store 架构，为后续功能逻辑打基础
- 列表页点击卡片跳转到详情页

**Non-Goals:**

- Socket.IO 实时连接
- 消息缓存（localStorage / IndexedDB）
- 用户账号系统与权限校验
- 加密聊天室密码验证
- 非文本消息类型的实际渲染（仅预留类型）
- 工具栏功能实现（表情、文件、语音/视频通话）

## Decisions

### 1. 输入区使用 div (contenteditable) 而非 input/textarea

**选择**: contenteditable div
**理由**: 后续需要扩展拖拽文件上传、Markdown 解析、URL 检测、Icon 表情、自定义动画表情等富文本能力。textarea 无法承载这些需求，div 方案从一开始就不受限。
**替代方案**: textarea + auto-resize → 简单但后续迁移成本高。

### 2. 头像使用 DiceBear CDN URL

**选择**: `https://api.dicebear.com/9.x/adventurer/svg?seed={userId}` 方式生成
**理由**: 零依赖、稳定（同 seed 同头像）、风格可切换。
**替代方案**: 本地字母头像 → 简单但视觉效果差；Boring Avatars → 也不错但 DiceBear 风格更丰富。

### 3. 消息元信息行：名字与时间同行

**选择**: `用户名 · 14:30` 在同一行
**理由**: 节省纵向空间，列表更紧凑，视觉更干净。Discord / Slack 同思路。
**替代方案**: 时间单独一行（微信/Telegram 风格）→ 太松散。

### 4. 消息操作触发方式：hover + click 兼容

**选择**: 桌面端 hover 浮出，移动端 click 触发
**理由**: 桌面体验流畅，移动端也可用。
**替代方案**: 仅 hover → 移动端不可用；仅 long-press → 桌面端多一步。

### 5. 核心逻辑层模式：class 单例 + zustand

**选择**: 仿 `NeonCloud` 模式：`SoulChat` class 单例 + `useSoulStore` zustand store
**理由**: 与项目已有模式一致，UI 层轻薄，逻辑集中。
**替代方案**: 纯 hooks → 逻辑分散到各组件中，维护困难。

### 6. 消息滚动策略

**选择**: 底部自动跟随 + 用户上滑时不强制打断 + "新消息" 提示
**理由**: 聊天类应用标准交互，用户浏览历史时不被打断。

### 7. 内容列统一宽度约束

**选择**: 在 `page.tsx` 的内容列父容器设置 `max-w-screen-xl mx-auto w-full px-4`，消息区和底部输入区共享同一约束
**理由**: TopBar 使用 `max-w-screen-xl mx-auto` + `m-3`，消息列表和底部输入区必须在同一宽度容器内，否则在宽屏上三段宽度不一致，体验很差。
**替代方案**: 各区域独立设置 `max-w-screen-xl` → 容易遗漏、边框线（如 `border-t`）撑满全屏不协调。

### 8. 消息操作按钮使用纯 CSS 驱动，不使用 JS 状态

**选择**: `MessageActions` 始终渲染在 DOM 中，通过 `opacity` + `pointer-events` + CSS `group-hover` 控制显隐
**理由**: 之前使用 `useState` + 条件渲染（`if (!visible) return null`），hover 时 DOM 插入/移除导致 flex 布局重算，气泡宽高跳动并频繁闪烁（hover 区域变化 → 触发 mouseLeave → 隐藏 → 触发 mouseEnter → 循环）。纯 CSS 方案 DOM 结构恒定，无重排。
**替代方案**: `useState` + `position: absolute` → 能避免布局跳动但仍有 JS 重渲染开销，不如纯 CSS 简洁。

### 9. Soul 页面统一圆角与 hover 规范

**选择**: Soul 列表页 + 详情页统一使用 `rounded-lg`，仅 `TopBar` 的两个圆形 icon 按钮保留圆形；按钮 hover 统一为主按钮 `hover:bg-primary-hover`、中性按钮/图标按钮 `hover:bg-surface-hover`。
**理由**: 消除 `rounded-xl / rounded-md / rounded-full` 混用造成的视觉割裂，保证界面语言一致。
**替代方案**: 保持各组件各自圆角策略 → 可扩展但会持续引入风格不一致问题。

## Risks / Trade-offs

- **[contenteditable 复杂性]** → 一期仅需纯文本输入，用 `innerText` 取值即可避免 HTML 陷阱；后续富文本扩展时再引入结构化节点管理。
- **[DiceBear CDN 依赖]** → 外网不可用时头像显示空白。Mitigation: 加 fallback 到本地字母头像（首字母 + 背景色）。
- **[Mock 数据与真实数据结构不一致]** → 定义 `ChatMessage` 接口时参考 `soul-detail-function` spec 的需求，确保字段对齐。
