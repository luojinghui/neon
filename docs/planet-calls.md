# 星球音视频通话

## 交互

- 聊天输入区提供「语音通话」「视频通话」两个入口。语音只请求麦克风；选择视频才请求摄像头。移动设备会先展示授权说明，由用户点击继续后调用浏览器授权。
- 同一星球最多 4 人，发起后其他成员看到加入提示；没有自动接听、预览或设备探测采集。点击加入默认使用语音，摄像头保持关闭，也可以直接选择视频入口加入。
- 通话提供麦克风、摄像头、挂断三个主要操作；移动端开启视频后支持前后摄像头切换。静音同样释放麦克风，再次开启时按需申请。
- 完整通话视图与可拖动小窗使用同一实例及同一组媒体元素。小窗下可以继续发送聊天消息。视图切换不会重新申请设备或重建连接；Escape 可切换视图。
- 同一浏览器身份只能参加一通通话，避免多标签页回声。只有一个人时等待 60 秒后自动结束；多人通话中成员独立离开，剩余成员继续通话。
- 离开聊天室、挂断、页面卸载、连接断开、房间删除或访问权限撤销都会释放本地设备。信令恢复后只恢复房间提示，需用户主动重新加入。

## 模块边界

`src/modules/webrtc` 不依赖 React、Socket.IO 或星球的状态库：

| 文件 | 职责 |
| --- | --- |
| `types.ts` | 通话、参与者、信令以及传输适配接口 |
| `media.ts` | 单独按需获取音频/视频；关闭时 stop 并移除轨道；取消后迟到的授权结果立即释放 |
| `peer.ts` | RTCPeerConnection、音视频 transceiver、Perfect Negotiation、ICE 缓存与有限重连 |
| `session.ts` | 通话状态、异步取消、成员连接、设备开关及统一销毁 |

`SocketChatTransport.callTransport()` 把现有 `/im` 连接适配到模块。页面通过 `RoomCallProvider` 管理生命周期，全屏与小窗仅改变展示方式。

`src/server/webrtc/callSignaling.js` 负责房间内通话状态和定向信令，复用聊天室的已加入与访问权限校验。每次信令校验发送者、接收者、房间、通话 ID；参与者身份取自服务端。信令有大小限制及频率限制，不广播 SDP/ICE，也不记录媒体或信令内容到聊天历史。拒绝跨房间请求、过期通话以及未加入通话的转发。内部浏览器 UUID 不进入通话事件。

状态流为 `idle → joining → active → idle`。房间状态带递增版本防止旧响应覆盖实时事件；每次加入使用独立 attemptId，避免取消请求或迟到响应退出下一次通话。

初期采用最多 4 人的 mesh（每对成员独立连接），将移动端上行与编解码成本限制在合理范围。未来大规模多人通话应替换为 SFU；现有媒体、界面和传输接口可以继续使用。信令状态保存在单个 Node 进程内，当前部署需单实例；横向扩容前需引入共享通话状态、分布式身份占用及 Socket.IO 适配器。

## 部署

本机 `localhost` 可开发；手机访问内网 HTTP 地址不能使用摄像头/麦克风，应部署 HTTPS。生产网络尤其移动网络和对称 NAT 需要可达的 TURN，仅配置 STUN 不能保证互通。

```dotenv
WEBRTC_STUN_URLS=stun:your-turn.example.com:3478
WEBRTC_TURN_URLS=turn:your-turn.example.com:3478?transport=udp,turns:your-turn.example.com:5349?transport=tcp
WEBRTC_TURN_SECRET=与-coturn-static-auth-secret-一致
WEBRTC_RELAY_ONLY=false
```

TURN 服务启用 coturn 的 `use-auth-secret`、相同的 `static-auth-secret`、正确的 realm、TLS 证书及中继端口。共享密钥只放服务端环境变量，加入成功后按需下发有效期 24 小时的 HMAC 临时凭证；更长的通话需重新加入以更新凭证。使用 `WEBRTC_RELAY_ONLY=true` 可强制中继并验收 TURN 连通性。反向代理应允许 `/im` WebSocket，且不要通过 Permissions-Policy 禁止同源 microphone/camera。

协议实现参考 [W3C WebRTC](https://www.w3.org/TR/webrtc/)、[Perfect Negotiation](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation) 和 [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)。

## 验收

运行 `pnpm test:webrtc`、`pnpm test:soul`、`pnpm lint` 和 `pnpm build`。自动化覆盖房间权限、信令隔离、并发与人数限制、取消竞态、设备按需获取和释放。

构建后还可运行 `pnpm test:webrtc:browser`（需要 Node.js 20+、Playwright 与 Chromium；已有独立运行时可通过 `PLAYWRIGHT_MODULE_PATH` 指定 Playwright 包目录，通过 `PLAYWRIGHT_EXECUTABLE_PATH` 指定 Chromium）。该测试启动临时数据服务器，以不同浏览器身份和模拟音视频设备验证真实 WebRTC 连接、音频接收、视频解码、三人 mesh、移动端授权提示及窗口切换，截图保存在 `.cache/webrtc-qa/`。它不会启用真实摄像头；设备和跨网络验收仍需按下列步骤进行。

设备验收至少使用两种独立浏览器身份：

1. 桌面发起语音、另一端点击加入，双向音频正常，摄像头指示灯不亮。
2. 任意一方主动开启视频，另一方看到画面；关闭后采集轨道结束，语音继续。
3. 全屏、小窗切换并拖动，发送聊天消息时通话不间断。
4. 手机先看到授权说明；拒绝权限后可重试语音，取消授权或在授权期间离开不会残留采集。
5. 覆盖 iOS Safari / Android Chrome 的声音播放提示、前后摄像头和后台恢复；移动系统可能暂停后台通话，本功能不承诺锁屏持续通话。
6. 刷新、断网、关闭标签页、撤销房间权限后设备停止，其他成员状态更新。
7. 使用手机蜂窝网络与另一 Wi-Fi 网络进行双向媒体验证，再强制 relay 验证实际 TURN 部署。
