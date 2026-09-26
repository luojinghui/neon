# 星球音视频通话

## 交互

- 聊天输入区提供「语音通话」「视频通话」两个入口。语音只请求麦克风；选择视频才请求摄像头。移动设备在权限尚未允许时先展示授权说明，同一设备每天最多展示一次；权限已允许或当天已提示后直接调用浏览器授权。
- 同一星球最多 4 人，发起后其他成员看到加入提示；没有自动接听、预览或设备探测采集。点击加入默认使用语音，摄像头保持关闭，也可以直接选择视频入口加入。
- 底部仅保留麦克风、视频、挂断三个图标按钮，无文字或悬浮提示，挂断使用水平听筒。麦克风开启时，图标内的填充高度跟随现有音轨的实时音量，静音或挂断释放分析器，不额外采集或播放声音。移动端前后摄像头切换放在个人画面右上角。入会后开启视频不再重复弹应用授权说明，浏览器权限仍由浏览器管理。静音同样释放麦克风，再次开启时按需申请。
- 顶部参会者入口展示姓名、连接状态、麦克风和摄像头状态，随加入、离开及设备开关同步更新。Escape 优先关闭参会者列表或画面设置。
- 完整通话视图与可拖动小窗使用同一实例及同一组媒体元素。手机小窗宽 246px，底部只显示图标，可以继续发送聊天消息。视图切换不会重新申请设备或重建连接；Escape 优先关闭画面设置，再切换视图。
- 同一浏览器身份只能参加一通通话，避免多标签页回声。只有一个人时连续等待一小时后自动结束；有人加入即取消计时，其他人全部离开后为剩余成员重新计满一小时。最后一人主动离开时立即清理通话。
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

## 个人画面效果

设置包含美白、柔肤、5 款 2D 脸部贴纸、4 款面部 Mesh 化身和 6 款虚拟背景。通话中的旧卡通贴贴、头顶挂件及配色选项已移除。面部化身使用 MediaPipe 的 468 个关键点和标准面部拓扑绘制整脸，包含眼睛、嘴部的可变形覆盖面；卡通人像、猫、狐、熊猫跟随面部位置与表情。纹理以标准脸坐标绘制并在 GPU 缓存，不依赖头顶或脸侧的插画卡片。标准拓扑来源及 SHA-256 记录在 `src/modules/video-effects/face-mesh.json`，Apache-2.0 许可见 `public/mediapipe/0.10.35/LICENSE`，可运行 `node scripts/prepare-face-mesh.cjs` 校验并重新生成。

`src/modules/video-effects` 与静态照片编辑器分离：

- `processor.ts` 消费已有摄像头轨道，使用 `requestVideoFrameCallback`（缺失时用 rAF）按新帧渲染，目标采集/输出为 30 fps，最长边不超过 640px。
- `inference.ts` 和 `public/call-effects/vision-worker.js` 将同步检测放进 Worker。最多一个帧在途，处理完成后取最新画面，不积压视频帧。配置初始化在 Worker 串行执行；迟到、切换配置前或超过 200ms 的结果丢弃。
- 仅开 2D 贴纸/化身/美颜时加载人脸模型，不加载分割或旧挂件资源；仅开背景时加载约 244 KiB 的 `selfie_segmenter_landscape.tflite`，替代实时管线原有约 15.6 MiB 的多类别模型。模型和 WASM 由 `prepare:vision` 准备到本地、按版本缓存，运行时不依赖外部模型站点。
- 检测输入最长边 320px，处理较慢时为 256px；输出分辨率独立。检测间隔约 33–66ms，去掉旧的 100–500ms 等待。跟踪预测限制在 30ms / 1.8% 坐标范围，过期脸部覆盖与分割在 250ms 后失效。
- `renderer.ts` 直接把摄像头上传 GPU，复用纹理、着色器、顶点缓冲和索引，WebGL canvas 直接 `captureStream`。2D 贴纸和 Mesh 都在同一 GPU 画布完成；不再经过全尺寸 2D → WebGL → 2D 拷贝。未开启的磨皮和背景计算跳过，分割边缘使用空间细化，不以长时间平均产生拖影。
- Worker 或 OffscreenCanvas 不可用时使用主线程兼容路径；该路径优先 WASM CPU，避免主线程首次同步编译大量 GPU 内核。它的性能仍取决于设备。设置底部显示实测绘制帧率及分割结果年龄（从输入取样到当前绘制，包含检测和调度延迟）。

本地预览和远端使用同一处理轨道。选择效果不申请设备；默认全关。恢复原貌、关闭/切换摄像头、挂断或离开房间时，释放 Worker、模型、WebGL 和输出轨道。异步返回不会恢复已关闭的效果。失败时回到原画，显示重试入口。虚拟背景不保证遮挡真实环境。

通话主画面可通过点选任意缩略画面切换，包含自己的画面；缩略画面不显示放大文字或图标。个人预览始终镜像，多人布局保留其余参与者的缩略图。切换只改变布局，媒体节点与连接不重建。退出的主画面参与者自动回退至仍在线的成员。设置面板打开时展示自己的主画面；窄屏为面板留出空间。整体沿用网站亮暗主题色，叠加静态星点和行星轨道。

挂断先从本地通话快照移除自己，忽略离开过程中排队到达的自身参会状态，避免服务端确认前输入框上方闪现自己的通话邀请条。媒体元素在布局清理阶段解除绑定，恢复焦点使用 `preventScroll`，小窗挂断不修改页面滚动锁。

## 部署

屏幕、多人白板和文档演示见 [通话共享](call-sharing.md)，包含 PPT 转换依赖与资源同步说明。

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

运行 `pnpm test:webrtc`、`pnpm test:experience`、`pnpm test:soul`、`pnpm lint` 和 `pnpm build`。自动化覆盖房间权限、信令隔离、并发与人数限制、取消竞态、设备按需获取和释放、效果处理器切换与失败回退、共享人像渲染回归。

构建后还可运行 `pnpm test:webrtc:browser`（需要 Node.js 20+、Playwright 与 Chromium；已有独立运行时可通过 `PLAYWRIGHT_MODULE_PATH` 指定 Playwright 包目录，通过 `PLAYWRIGHT_EXECUTABLE_PATH` 指定 Chromium）。该测试启动临时数据服务器，以不同浏览器身份和模拟音视频设备验证真实 WebRTC 连接、音频接收、视频解码、三人 mesh、移动端授权提示及窗口切换，截图保存在 `.cache/webrtc-qa/`。它不会启用真实摄像头；设备和跨网络验收仍需按下列步骤进行。

可选设置 `WEBRTC_EFFECTS_TEST_IMAGE` 为本地人像 JPEG 路径，测试将其用作合成摄像头，额外验证真实 WASM/模型初始化、脸部追踪、WebGL、2D/Mesh 与背景组合、处理轨道发送及资源释放。该图片仅供本地测试，不上传模型服务或加入仓库。手机布局测试采用 Chromium 视口与触控模拟，不能替代真机 Safari/GPU 性能验收。

设备验收至少使用两种独立浏览器身份：

1. 桌面发起语音、另一端点击加入，双向音频正常，摄像头指示灯不亮。
2. 任意一方主动开启视频，另一方看到画面；关闭后采集轨道结束，语音继续。
3. 全屏、小窗切换并拖动，发送聊天消息时通话不间断。
4. 手机先看到授权说明；拒绝权限后可重试语音，取消授权或在授权期间离开不会残留采集。
5. 覆盖 iOS Safari / Android Chrome 的声音播放提示、前后摄像头和后台恢复；移动系统可能暂停后台通话，本功能不承诺锁屏持续通话。
6. 刷新、断网、关闭标签页、撤销房间权限后设备停止，其他成员状态更新。
7. 使用手机蜂窝网络与另一 Wi-Fi 网络进行双向媒体验证，再强制 relay 验证实际 TURN 部署。
8. 设置美颜、2D 贴纸、面部化身与背景，观察头部转动、眨眼、张嘴和遮挡下的跟随效果；远端收到相同合成画面。首次加载有进度；相机关闭时选择效果不启动采集。低性能设备、网络失败或 WebGL 不可用时可恢复原画重试。

性能与兼容性探针：`pnpm test:video-effects` 验证单帧背压、按需模型、旧结果丢弃、资源释放及 Mesh 跟踪边界；`WEBRTC_EFFECTS_TEST_IMAGE=/本地/人像.jpg pnpm test:video-effects:browser` 用合成摄像头运行真实模型，输出截图和测量值到 `.cache/video-effects-qa/`。支持 `EFFECTS_BROWSERS=chromium,webkit`，以及已有浏览器的 `PLAYWRIGHT_EXECUTABLE_PATH`。Windows WebKit 不提供 `canvas.captureStream`，此环境仅测试模型与 GPU 合成，不冒充 Safari 通话验收。

Mac Safari 和 iPhone/iPad Safari 的最终性能验收需在真机上进行：分别测试单开背景、单开贴纸、Mesh + 背景，稳定运行至少 30 秒，记录设置面板的帧率及分割延迟、远端实际接收帧率；覆盖横竖屏、快转头、人物进出、前后摄像头切换和回到前台。目标是常见设备接近 30 fps、分割延迟低于 100ms；自动化结果不是所有机型的性能保证。

云传、星球聊天和心迹使用同一个剪贴板图片解析入口，支持截图/原生图片文件和 HTML 中的内嵌 PNG/JPEG/GIF/WebP 图片。普通文本保持原生粘贴。图片先进入本地预览，点击发送/发布才上传；聊天失败保留草稿，切换房间后旧上传不能发送到新房间。云传保留图文一起发送，心迹沿用最多 9 项限制，输入框聚焦仅改变边框。浏览器回归中的上传接口使用模拟响应验证请求与重试，不向线上发布测试内容。
