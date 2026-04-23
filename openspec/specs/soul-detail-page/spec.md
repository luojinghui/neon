# Soul 聊天详情页 — UI Spec

> **范围**：仅 UI 实现 + 路由跳转。功能逻辑（Socket.IO、缓存、权限等）由 `soul-detail-function` spec 覆盖。

---

## 1. 路由与导航

### 1.1 路由定义

- 详情页路由：`/soul/[roomId]`，作为 Next.js 动态路由页面
- 列表页 `/soul` 点击聊天室卡片 → `router.push(/soul/${room.id})`

### 1.2 TopBar

复用共享 `TopBar` 组件：

- **左侧**：返回按钮（已有逻辑，回退到列表页）
- **中间**：聊天室名称（从 roomId 或 mock 数据获取）
- **右侧**：ThemeToggle 主题切换

---

## 2. 整体布局

```
┌─────────────────────────────────────────────────────┐
│  TopBar: [←]    「聊天室名称」         [ThemeToggle] │
├─────────────────────────────────────────────────────┤
│                                                     │
│            MessageList (flex-1, scrollable)          │
│                                                     │
├─────────────────────────────────────────────────────┤
│  ChatInput: [输入区域(div)]                  [发送]  │
│  ChatToolbar: [😀] [📎] [🎤] [📹]                   │
└─────────────────────────────────────────────────────┘
```

页面 `h-screen flex flex-col`，三段式：

- TopBar：固定顶部（`max-w-screen-xl mx-auto` + `m-3` 浮动栏）
- 内容列：`max-w-screen-xl mx-auto w-full px-4`，统一约束消息区和底部输入区的宽度，与 TopBar 视觉对齐
  - MessageList：`flex-1 overflow-y-auto`，撑满剩余空间
  - 底部区域：固定底部，包含输入行 + 工具行

**宽度对齐规则**：三段（TopBar / 消息列表 / 底部输入区）必须在同一个 `max-w-screen-xl` 约束下，不可各自独立设置宽度或使用全屏宽度。

---

## 3. 消息列表 (MessageList)

### 3.1 布局规则

- 远端消息（对方）：**左对齐**，头像在左
- 本端消息（自己）：**右对齐**，头像在右
- 消息列表从底部开始，新消息在最下方

### 3.2 单条消息结构 (MessageBubble)

**远端消息（左侧）：**

```
┌──────┐  用户名  ·  14:30
│Avatar│  ┌───────────────────────┐
└──────┘  │ 消息内容气泡           │
          │ (bg: chat-other)      │
          └───────────────────────┘
```

**本端消息（右侧）：**

```
                    14:31  ·  我  ┌──────┐
   ┌───────────────────────┐     │Avatar│
   │ 消息内容气泡           │     └──────┘
   │ (bg: chat-self)       │
   └───────────────────────┘
```

### 3.3 元信息行

名字与时间同行显示，**不独占一行**：

- 用户名：`text-sm font-medium text-foreground`
- 分隔符 `·`：`text-foreground-muted mx-1`
- 时间：`text-xs text-foreground-muted`
- 本端消息元信息行右对齐，时间在名字左侧

### 3.4 头像

使用 DiceBear 生成随机头像：

- 基于 `userId` 作为 seed，保证同一用户头像稳定
- 圆形裁剪，尺寸 `w-8 h-8` (32px)
- 推荐风格：`adventurer` 或 `bottts`（可后续配置）

### 3.5 消息操作 (MessageActions)

- **触发方式**：桌面端 hover 整条消息行时浮出（CSS `group-hover`），纯 CSS 驱动，不使用 JS 状态切换
- **位置**：气泡旁侧（远端消息在右侧，本端消息在左侧）
- **渲染策略**：操作按钮**始终存在于 DOM 中**，通过 `opacity-0 / opacity-100` + `pointer-events-none / auto` 控制可见性，**不使用条件渲染**（避免 DOM 插入/移除导致布局跳动和闪烁）
- **一期操作按钮**：

| 按钮 | 图标 | 行为 |
|------|------|------|
| 复制 | 📋 | `navigator.clipboard.writeText()` |
| 下载 | ⬇️ | 文本导出为 `.txt` 文件 |
| 更多 | ··· | 预留，一期点击提示"开发中" |

### 3.6 滚动行为

- 新消息到达时：如果用户在底部附近（距底 ≤ 100px），自动滚到最新
- 用户向上浏览历史消息时：不强制滚动，底部出现"新消息"提示气泡
- 点击"新消息"提示 → 平滑滚到底部

---

## 4. 底部输入区域

### 4.1 输入行

```
┌───────────────────────────────────────┐ ┌──────┐
│  div 输入区域 (contenteditable)        │ │ 发送 │
└───────────────────────────────────────┘ └──────┘
```

- **输入框**：使用 `div` 模拟（contenteditable 方向），不用 input/textarea
- 默认单行高度，内容增多自动撑高（max 5 行后 scroll）
- `Enter` 发送，`Shift+Enter` 换行
- placeholder: `"输入消息..."`
- 发送按钮：`bg-primary text-white`，内容为空时 disabled 样式

**扩展能力预留**（一期不实现，架构上不阻塞）：

- 拖拽上传文件
- Markdown 语法解析
- URL 自动检测与预览
- Icon 表情插入
- 自定义动画表情插入

### 4.2 工具行 (ChatToolbar)

输入行下方一行，紧贴排列的方块 mini icon：

```
[😀]  [📎]  [🎤]  [📹]
```

| 图标 | 含义 | 一期行为 |
|------|------|----------|
| 😀 | 表情 | 提示"开发中" |
| 📎 | 文件 | 提示"开发中" |
| 🎤 | 语音通话 | 提示"开发中" |
| 📹 | 视频通话 | 提示"开发中" |

- 图标样式：方块 icon，无文字说明
- 尺寸：`w-8 h-8`，`rounded-md`
- 颜色：`text-foreground-muted`，hover 时 `text-foreground` + `bg-surface-hover`

---

## 5. 主题适配

直接使用已有 CSS 变量和 Tailwind token，无需新增变量：

| 元素 | Light token | Dark token |
|------|-------------|------------|
| 本端气泡背景 | `chat-self` | `chat-self` |
| 本端气泡文字 | `chat-self-foreground` | `chat-self-foreground` |
| 对方气泡背景 | `chat-other` | `chat-other` |
| 对方气泡文字 | `chat-other-foreground` | `chat-other-foreground` |
| 输入区背景 | `surface` | `surface` |
| 页面背景 | `background` | `background` |
| 工具栏 icon | `foreground-muted` | `foreground-muted` |

---

## 6. 消息类型定义

```typescript
type MessageType = 'text' | 'image' | 'video' | 'audio'
                 | 'file' | 'link' | 'markdown' | 'music';

interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;  // DiceBear URL，可由 senderId 生成
  type: MessageType;
  content: string;
  timestamp: number;
  isLocal: boolean;       // true = 本端发送
}
```

一期仅实现 `type: 'text'`，其余类型预留。

---

## 7. 文件结构

```
src/app/soul/
├── page.tsx                          ← 已有：聊天列表页
<!-- ├── [roomId]/ -->
│   ├── page.tsx                      ← 新增：详情页入口
│   └── components/
│       ├── MessageList.tsx           ← 消息列表（滚动、加载更多）
│       ├── MessageBubble.tsx         ← 单条消息渲染（头像+名字+时间+气泡+操作）
│       ├── MessageActions.tsx        ← 消息操作浮层（复制/下载/更多）
│       ├── ChatInput.tsx             ← div 输入区 + 发送按钮
│       ├── ChatToolbar.tsx           ← 扩展工具行（表情/文件/语音/视频 icon）
│       ├── types.ts                  ← ChatMessage 等类型定义
│       └── mock.ts                   ← mock 消息数据
├── core/
│   └── index.ts                      ← 核心逻辑 class（仿 NeonCloud 模式）
├── store.ts                          ← zustand 状态管理
└── components/                       ← 已有：列表页组件
    ├── ChatRoomCard.tsx
    ├── ChatRoomGrid.tsx
    ├── ChatRoomCardSkeleton.tsx
    ├── types.ts
    └── mock.ts
```

### 组件职责边界

| 组件 | 职责 | 不做什么 |
|------|------|----------|
| `[roomId]/page.tsx` | 组装布局、初始化 core、注入 store | 不含业务逻辑 |
| `MessageList` | 消息循环渲染、滚动管理、"新消息"提示 | 不关心单条消息长什么样 |
| `MessageBubble` | 单条消息 UI（头像/名字/时间/气泡），按 type 分发渲染 | 不管列表滚动 |
| `MessageActions` | hover/click 浮出的操作按钮 | 不执行业务逻辑，回调给 core |
| `ChatInput` | div 输入区、发送按钮、键盘事件 | 不管消息发送逻辑 |
| `ChatToolbar` | 工具 icon 展示与点击 | 一期全部 placeholder |
| `core/index.ts` | 所有非 UI 逻辑（发送/接收/缓存/socket） | 不直接操作 DOM |
| `store.ts` | zustand 状态（消息列表/输入内容/UI 状态） | 不含副作用逻辑 |

---

## 8. 一期 / 后续能力分层

| 能力 | 一期（本 spec） | 后续（soul-detail-function） |
|------|-----------------|-------------------------------|
| 路由跳转 | ✅ | — |
| 页面布局 | ✅ | — |
| TopBar + 主题切换 | ✅ | — |
| 消息列表 UI | ✅ (mock 数据) | 真实 Socket.IO 数据 |
| 文本消息气泡 | ✅ | — |
| 其他消息类型渲染 | 类型预留 | 逐步实现 |
| DiceBear 头像 | ✅ | — |
| 消息操作（复制/下载） | ✅ UI + 逻辑 | — |
| 消息操作（更多） | ✅ 占位 | 功能实现 |
| div 输入区 | ✅ 基础输入+发送 | Markdown/URL/拖拽/表情 |
| 工具栏 icon | ✅ 占位 | 功能实现 |
| 滚动行为 | ✅ | — |
| Socket.IO 连接 | — | ✅ |
| 消息缓存 | — | ✅ |
| 用户账号/权限 | — | ✅ |
| 加密聊天室验证 | — | ✅ |

---

## 9. 技术要求

- 分析现有 `src/app/soul/` 代码，按上述文件结构创建页面和组件
- 核心非 UI 逻辑放 `core/index.ts`，参考 `src/app/cloud/core.ts` 的 class 单例模式
- 状态管理使用 zustand（参考 `src/app/cloud/store.ts`）
- 颜色使用已有主题 token，不新增 CSS 变量
- 圆角规范统一：除 TopBar 的两个圆形 icon 按钮外，其余 UI 元素统一使用 `rounded-lg`
- 按钮 hover 统一：主按钮使用 `hover:bg-primary-hover`，中性按钮/图标按钮统一使用 `hover:bg-surface-hover`
- 一期使用 mock 数据渲染，确保 UI 完整可交互
