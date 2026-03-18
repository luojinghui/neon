# Claude 使用指南（Neon / Soul Planet）

本文档沉淀本仓库的 **技术栈**、**架构约束/约定**、以及 **OpenSpec 工作流（opsx）规则**，用于协助在本项目中进行一致的开发与协作。

## 技术栈

- **运行时**：Node.js（Next.js + 自定义 Express Server）
- **Web 框架**：Next.js `15.2.6`（App Router 位于 `src/app/`）
- **UI**：React `19.0.0`、Ant Design（`antd`）、Tailwind CSS
- **状态管理**：Zustand
- **实时能力**：Socket.IO（服务端路径 `/im`）
- **包管理**：pnpm（以 `pnpm-lock.yaml` 为准）
- **Lint/格式化**：`next lint`，Prettier 配置见 `prettier.config.js`

## 项目结构（概览）

- **Next App Router 页面**
  - `src/app/page.tsx`：入口页（跳转到 `/cloud` 与 `/soul`）
  - `src/app/cloud/page.tsx`：“云传”页面
  - `src/app/soul/page.tsx`：“星球”页面（当前较简）
- **自定义服务端**
  - `src/server.js`：Express + Next request handler + Socket.IO
- **OpenSpec**
  - `openspec/`：OpenSpec 配置与变更（change）产物
  - `openspec/config.yaml`：schema 配置（当前为 `spec-driven`）

## 架构约束与工程约定

### 服务端/运行时约束

- **服务端入口统一**：应用通过 `src/server.js` 启动（Express 托管 Next + 静态资源 + Socket.IO）。
- **端口可配置**：服务端监听 `process.env.PORT`（默认 `3000`）。
- **Socket.IO 配置稳定**：服务端使用 `path: "/im"` 且 `cors: true`；除非同步更新客户端，否则不要随意修改。

### Next.js 约束

- **App Router** 固定在 `src/app/`。
- 使用浏览器 API 的页面/组件必须保持为 **Client Component**（`'use client'`），例如：`localStorage`、`window`、拖拽、剪贴板等能力。
- 业务逻辑优先收敛到 feature 内（例如 `src/app/cloud/core.ts` + `store.ts`），避免跨页面散落的全局状态与工具函数。

### 本地开发约束

- 统一使用 `pnpm` 执行命令。
- **开发启动**：`pnpm dev` 通过自定义 server 启动，并开启 polling 以规避 macOS 上的 watcher 限制（EMFILE）。
- **生产启动**：`pnpm start` 以 `NODE_ENV=production` 启动自定义 server（遵循 Next 生产模式行为）。

## OpenSpec 工作流规则（opsx）

本仓库使用 OpenSpec 的 **spec-driven** schema。变更（change）位于 `openspec/changes/<change-name>/`。

### `/opsx:propose`

用于 **创建新变更** 并一次性生成所需产物：

- 创建变更骨架：`openspec new change "<name>"`
- 生成产物（常见）：
  - `proposal.md`：做什么/为什么做
  - `design.md`：怎么做
  - `tasks.md`：实现步骤
- 用 `openspec status --change "<name>" --json` 决定依赖顺序，并判断是否达到可开始实现的状态（apply-ready）。

### `/opsx:apply`

用于从某个变更中 **按任务实现**：

- 选择变更（指定 name；若不明确则列出并选择）
- 读取 apply 指令：`openspec instructions apply --change "<name>" --json`
- 按 CLI 返回的 `contextFiles` 阅读上下文（proposal/design/specs/tasks 等）
- 逐条实现任务，并在 `tasks.md` 中勾选完成（`- [ ]` → `- [x]`）
- 变更尽量小而聚焦，且与产物保持一致；若实现过程中发现设计偏差，应先回写到对应产物再继续

### `/opsx:explore`

用于 **探索/调查/梳理思路**（不做实现）：

- 允许阅读文件、检索代码、定位问题
- 不允许实现功能（但如果用户明确要求，允许创建/更新 OpenSpec 产物来记录结论）

### `/opsx:archive`

用于在完成后 **归档变更**：

- 不要猜测变更名；若未提供，则通过 `openspec list --json` 让用户选择
- 若产物或任务未完成，需提示并在继续前确认
- 归档目录：`openspec/changes/archive/YYYY-MM-DD-<change-name>/`

## 提交/评审约定（仓库内）

- 优先保持小而可审的 diff。
- 没有明确收益不要引入新工具或新范式。
- UI 改动保持与现有 Tailwind + antd 风格一致。
