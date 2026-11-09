## 1. 服务端：数据与权限

- [x] 1.1 在 `roomRepository.js` 为房间增加 `announcement`、`rules`、`pinnedMessageIds`、`bans` 字段，加载旧数据时缺省为空，并更新 `toPublicRoom`（含置顶消息摘要）
- [x] 1.2 实现 `updateAnnouncement`、`updateRules`（长度校验、`requireManagedRoom` 权限）
- [x] 1.3 实现 `pinMessage` / `unpinMessage`（上限 3、消息存在校验）；撤回/删除消息时同步移除置顶
- [x] 1.4 实现 `kickMember`（创建者/自己校验、私密与加密房间撤销访问、公开房间 10 分钟封禁）与 join 时的封禁拦截 `ROOM_BANNED`
- [x] 1.5 实现成员列表组装：在线（`roomMembers`，按 userId 去重）+ 私密房间已批准离线成员，含角色与排序
- [x] 1.6 在 `roomRepository.test.js` 及 socket 测试中补充公告、群规、置顶、踢人、封禁、旧数据兼容用例

## 2. 服务端：Socket 事件

- [x] 2.1 在 `chatController.js` 新增 `room:announcement`、`room:rules`、`room:pin`、`room:unpin`、`room:members`、`room:kick` 事件，沿用 `respond`/`requireJoinedRoom`
- [x] 2.2 实现治理变更广播与 `room:kicked` 定向通知，踢人时清理被踢者的通话状态
- [x] 2.3 成员上下线时触发成员列表变更广播

## 3. 前端 core 与状态

- [x] 3.1 在 `soul/core/types.ts` 增加公告、群规、置顶、成员、角色类型与新错误码
- [x] 3.2 在 `socketTransport.ts` / `core/index.ts` 增加对应动作与事件监听，被踢时清理房间缓存并跳转列表
- [x] 3.3 在 `store.ts` 增加治理状态（公告已读时间存 localStorage）

## 4. 前端 UI：房间治理

- [x] 4.1 `RoomInfoModal` 增加公告、群规编辑与展示（管理者可编辑，成员只读）
- [x] 4.2 `RoomInfoModal` 增加成员列表（角色标签、在线状态、管理者「移出」带二次确认）
- [x] 4.3 聊天页顶部增加公告提示条与置顶条，点击置顶定位并高亮原消息（必要时加载历史）
- [x] 4.4 `MessageActions` 为管理者增加「置顶/取消置顶」
- [x] 4.5 处理被踢与被封禁提示（保持现有强制跳转到列表页的约定）

## 5. 白板导出

- [x] 5.1 在 `modules/webrtc/whiteboard.ts` 抽出纯函数 `boardToSvg`，`SharedWhiteboard` 的渲染与其共享绘制规格
- [x] 5.2 实现 SVG 下载与 PNG 栅格化下载（2×，长边 ≤ 4096px）
- [x] 5.3 实现「保存到房间」：PNG 走现有图片消息发送流程
- [x] 5.4 在白板工具栏增加导出菜单（PNG / SVG / 保存到房间），空白板禁用，导出前提交编辑草稿
- [x] 5.5 为 `boardToSvg` 增加单元测试（包围盒、各图形、文字、空输入）

## 6. 验证

- [x] 6.1 `pnpm lint` 与类型检查通过
- [ ] 6.2 真机联调：双浏览器验证公告广播、置顶定位、踢人（公开/私密/加密）与白板导出内容一致
