## Context

- 现状：`/soul` 仍为占位页面（Hello World），而项目已有成熟的页面骨架与主题 token（`TopBar`、`ThemeToggle`、`bg-background`/`bg-surface`/`border-border` 等）。
- 约束：
  - 本阶段 **UI Only**：不接入 Socket.IO / HTTP，不引入真实数据层。
  - 组件与样式保持与现有页面一致：Tailwind token + antd（用于 App message、必要的基础组件）。
- 目标用户路径：访问 `/soul` → 看到聊天室列表（grid）→ 点击卡片或按钮得到明确反馈（占位提示）。

## Goals / Non-Goals

**Goals:**

- 在 `/soul` 落地“聊天室列表”UI，包含响应式 grid 与房间卡片信息展示
- 提供 UI 三态：Loading（Skeleton）、Empty（空态）、Error（错误态+重试）
- 交互闭环：卡片/按钮点击有明确反馈（message）
- 主题兼容：浅/深色下可读，边框/背景/文字与现有 token 一致
- 为后续接入实时数据层预留替换点（“数据来源可替换”，UI 结构不动）

**Non-Goals:**

- 不实现真实聊天室在线列表、加入/退出/创建房间、鉴权与成员信息
- 不实现聊天室详情页、消息列表与发送能力
- 不新增后端接口/Socket.IO 协议

## Decisions

- **页面结构复用现有模式**
  - 选择：`TopBar middle="星球"` + `right={<ThemeToggle />}`，内容区使用 `pt-20`（为固定 TopBar 留出空间），容器使用 `max-w-screen-xl mx-auto px-4`。
  - 理由：`cloud` 页已验证此布局（固定 TopBar + 滚动内容），减少新的布局差异。
  - 备选：使用首页 `container mx-auto px-4 py-20`。未选原因：需要额外处理 TopBar 固定高度与滚动区域。

- **卡片样式优先使用 Tailwind token（不直接用 antd Card）**
  - 选择：参考现有 `src/components/card/index.tsx` 的风格（`bg-surface`/`border-border`/hover 抬升/阴影）。
  - 理由：与现有 token 体系一致，暗色主题下表现更可控；避免 antd Card 在视觉上“像另一套 UI”。
  - 备选：antd `Card` + `Skeleton`/`Empty`。未选原因：需要额外样式覆盖以对齐 token。

- **状态机用本地 UI state 表达（mock 驱动）**
  - 选择：在页面内维护 `viewState: 'loading' | 'ready' | 'empty' | 'error'`，以及 `rooms: ChatRoom[]`。
  - 理由：UI-only 阶段无需引入 store；后续接入数据层时只替换数据获取与状态转移即可。
  - 备选：使用 Zustand store。未选原因：对于 UI-only 初期过重，且可能引入全局依赖。

- **点击反馈采用 antd message（方案 A）**
  - 选择：使用 `App.useApp().message.info('TODO: join room')`。
  - 理由：项目已在 `cloud` 页使用 `App` provider；实现成本最低且符合“明确反馈”要求。
  - 备选：跳转 `/soul/rooms/[id]`。未选原因：需要新增路由与占位页，超出当前最小闭环。

## Risks / Trade-offs

- **[Risk]** Loading/Empty/Error 的视觉实现与现有风格不一致 → **Mitigation**：复用 `bg-surface`/`border-border`/文字 token，尽量不引入新的 UI 套件外观。
- **[Risk]** future data layer 接入时状态迁移成本高 → **Mitigation**：将 mock 数据生成与状态切换集中在单一函数（后续替换为真实 fetch/subscribe）。
- **[Trade-off]** 不做详情页跳转会降低“可探索性” → **Mitigation**：在卡片按钮上提供 message 占位，并在 tasks 中明确后续可扩展点。
