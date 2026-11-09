## Why

星球（聊天室）目前只有消息流和访问控制，创建者无法向成员传达公告与规则、沉淀重要消息，也看不到成员并处理违规用户。通话中的共享白板内容只存在于会话内存，通话结束即丢失，无法留存或分享。

## What Changes

- 星球支持**公告**与**群规**：创建者/超级管理员编辑，所有成员可在房间信息中查看；公告更新时向在线成员广播并在聊天页顶部提示
- 星球支持**置顶消息**：创建者/超级管理员可置顶或取消置顶任意消息，聊天页顶部展示置顶条，点击定位到原消息；每个房间最多 3 条
- 星球支持**成员列表**：展示在线成员及角色（创建者、管理员、成员），私密星球额外包含已获批准但离线的成员
- 创建者与超级管理员可**踢出成员**：被踢者立即断开房间并收到提示，私密/加密星球同时撤销其访问权限，公开星球设置短时间禁止重入；创建者不可被踢
- 共享白板支持**保存/导出**：导出 PNG、SVG（客户端渲染，无需服务端），并可一键「保存到房间」将 PNG 作为图片消息发送，留存在聊天记录中

## Capabilities

### New Capabilities

- `room-governance`: 星球公告、群规、置顶消息、成员列表及踢人
- `whiteboard-export`: 共享白板导出为图片/矢量图并保存到房间

### Modified Capabilities

<!-- 无：现有 soul-detail-* 规格的既有要求不变，新增行为均由上述新能力承载 -->

## Impact

- 服务端：`src/server/chat/roomRepository.js`（公告/群规/置顶/封禁数据与权限校验）、`src/server/controller/chatController.js`（新增 socket 事件与广播，复用 `roomMembers` 在线表）
- 前端：`src/app/soul/core/`（类型、transport、store 增加治理状态与动作）、`[roomId]/components/RoomInfoModal.tsx`（公告/群规/成员 Tab）、`MessageActions.tsx`（置顶入口）、`MessageList.tsx`（置顶条与定位）、`SharedWhiteboard.tsx`（导出按钮）、`src/modules/webrtc/whiteboard.ts`（纯函数 SVG 序列化）
- 数据：房间记录新增 `announcement`、`rules`、`pinnedMessageIds`、`bans` 字段，向后兼容（缺省为空）
- 不引入新的 npm 依赖
