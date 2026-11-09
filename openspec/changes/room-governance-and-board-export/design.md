## Context

- 房间数据由 `RoomRepository`（文件持久化）管理，权限判定已有 `requireManagedRoom`（创建者或超级管理员）与 `revokeRoomAccess`。
- 在线成员已由 `chatController.js` 的 `roomMembers: Map<roomId, Set<socketId>>` 维护，socket 的 `data.user` 含 `userId/name/avatarUrl`。
- 白板条目 `BoardItem`（stroke/shape/text）保存在通话会话的 `presentation.items` 中，仅在客户端内存，经 WebRTC 同步；`SharedWhiteboard` 内以 SVG 渲染。
- 约束：Socket.IO `path: "/im"` 不变；使用浏览器 API 的组件保持 Client Component；业务逻辑收敛到 `soul/core`。

## Goals / Non-Goals

**Goals**

- 公告、群规、置顶消息、成员列表、踢人，权限一致且服务端强校验
- 白板导出 PNG/SVG，并可保存为房间图片消息
- 数据结构向后兼容，旧房间无需迁移

**Non-Goals**

- 禁言、多级管理员/任命、操作审计日志、多条公告历史
- 通话中的参与者踢出（本期仅处理星球成员；如需要另起变更）
- 白板服务端持久化、二次编辑、导入
- 固定星球（`isFixed`）的公告/群规编辑由超级管理员负责，不开放给普通用户

## Decisions

### 1. 权限模型：复用「创建者 / 超级管理员」

`requireManagedRoom(roomId, actor, isAdmin)` 已定义可管理者。公告、群规、置顶、踢人均走它；其余成员只读。成员列表所有已加入用户可读。角色展示：`owner`（`room.ownerId`）、`admin`（超级管理员在线身份）、`member`。

### 2. 公告/群规存为房间字段

`announcement: { text, updatedAt, updatedBy }`、`rules: { text, updatedAt }`，文本上限 500 / 2000 字，纯文本（前端按换行渲染，不解析 HTML）。随 `toPublicRoom` 返回，更新时广播 `room:updated`（沿用现有房间更新通道，若无则新增 `room:governance`）。客户端以 `announcement.updatedAt` 与 localStorage 已读时间比较，决定是否显示顶部提示。

### 3. 置顶消息：只存 id

`pinnedMessageIds: string[]`（≤3，新置顶在前）。`toPublicRoom` 附带置顶消息的摘要（id、发送者、类型、截断内容）以免客户端需先拉历史。消息被撤回/删除时服务端同步从置顶中移除并广播。点击置顶条定位：消息在已加载范围内则滚动高亮，否则调用现有历史接口向前加载直到命中（上限若干页，失败提示「消息较早，请上滑查看」）。

### 4. 成员列表：在线为主，私密房间补离线成员

事件 `room:members` 返回：在线成员来自 `roomMembers`（按 `userId` 去重，同一用户多标签页合并）；私密/加密房间再合并 `getRoomAccessRecords` 中状态为 approved 的记录，标记 `online: false`。公开房间无成员表，只显示在线者。排序：创建者 > 管理员 > 在线成员 > 离线成员。上线/下线广播沿用现有 `onlineCount` 更新时顺带推送增量，客户端也可在打开面板时拉取。

### 5. 踢人

事件 `room:kick { roomId, targetUserId }`：

1. 校验操作者可管理该房间；目标不能是创建者、不能是自己
2. 找到目标所有 socket：`socket.leave`、从 `roomMembers` 移除、向其发送 `room:kicked { roomId, reason }`，并清理其通话状态（复用 `calls` 的离开逻辑）
3. 私密/加密房间：调用 `revokeRoomAccess` 并清除密码访问记录，目标需重新申请/输密码
4. 公开房间：写入 `bans[userId] = expiresAt`（默认 10 分钟），`join` 时拒绝并返回 `ROOM_BANNED`
5. 向房间广播成员变更；客户端被踢者跳转列表页并提示

封禁到期懒清理（读取时判断），不引入定时器。

### 6. 白板导出：客户端纯函数序列化

把 `BoardItemView` 的绘制逻辑抽出为 `modules/webrtc/whiteboard.ts` 中的纯函数 `boardToSvg(items, { padding, background })`，返回自包含 SVG 字符串（计算 `fitBoardItems` 包围盒，白色背景，文字用系统字体族）。`SharedWhiteboard` 与导出共用同一份绘制规格，避免两处漂移。

- **SVG**：Blob 下载 `whiteboard-YYYYMMDD-HHmm.svg`
- **PNG**：SVG 经 `Image` 绘制到 `canvas`（2× 缩放，长边上限 4096px），`toBlob` 下载
- **保存到房间**：将 PNG Blob 走现有图片消息上传/发送流程（`soulChat` 的附件发送），在聊天记录中留存；仅在已加入房间且有发送权限时可用
- 空白板禁用导出；导出前 `flushStyle()`/结束编辑，确保草稿已提交

文字 `<text>` 在 canvas 栅格化时依赖系统字体，不嵌入字体文件（Non-goal）。

## Risks / Trade-offs

- 公开房间无成员表，离线成员不可见 → 文档中明确，仅私密房间展示离线成员
- 公开房间踢人只能靠短期封禁（浏览器 UUID 可被重置绕过）→ 接受，定位为「冷却」而非永久封号
- 置顶定位依赖历史分页，极早期消息可能无法一次定位 → 设上限并给出降级提示
- 置顶/公告的广播与现有 `room:updated` 语义耦合 → 实现时先确认现有事件，必要时新增独立事件而不改动旧事件载荷

## Open Questions

- 「会议 owner/管理员」按**星球创建者 + 超级管理员**理解；若指通话参与者踢出，需另行确认
- 「保存」是否仅需下载，或同意「保存到房间」作为图片消息（本设计默认两者都提供）
