# 云传网络探测调试

打开 `/cloud` 后自动并行收集 WebRTC ICE 与 HTTP 请求来源。点击标题旁的信息按钮查看，两项均结束后统一展示；各自最多等待 8 秒，超时保留已获取的 ICE 候选并明确标记不完整。支持重新探测、复制 JSON、展开原始候选。离开页面会取消请求并关闭 PeerConnection/DataChannel。

## 数据来源

- `ice.localIps`：host 候选中的私有地址与链路本地地址，去重后的数组。内网和局域网属于同一分类。回环地址单独保留在 candidates 中。
- `ice.mdnsNames`：浏览器隐藏 IP 后提供的 `.local` 名称，不作为真实 IP 使用。
- `ice.candidates`：保留地址、分类、ICE 类型、协议、端口、关联地址及原始 candidate。探测仅使用 `iceServers: []` 收集本机候选，不使用外部 STUN/TURN、不请求媒体权限，因此不承诺提供 STUN 公网映射、所有网卡地址或实际私有地址。
- `request.data.requestIp`：`GET /api/cloud/network-info` 当次请求的服务端来源地址。
- `request.data.requestIpSource`：`socket` 或 `x-forwarded-for`，明确来源判定依据。
- `request.data.socketAddress` / `socketIp`：TCP 对端原始地址与归一化地址，IPv4-mapped IPv6 的点分形式转换为 IPv4。
- `request.data.headers`：本次请求携带的 X-Forwarded-For、X-Real-IP、Forwarded 原始值，每项最多 2048 字符。仅用于观察，不代表可信身份。

探测数据仅保留在页面内存中，不写入云传内容、数据库、浏览器存储或日志。当前不执行占位符替换；后续可以消费 `collectNetworkDiagnostics` 返回的结构化结果。复制 JSON 是用户主动操作。

## 反向代理

独立的 Express 子应用提供来源接口，不依赖数据库。默认不信任转发头，采用 TCP 对端地址，因此本机调试通常显示 `127.0.0.1`；经过代理时可能显示代理自身地址。

部署需要解析真实来源时，可通过 `CLOUD_TRUSTED_PROXIES` 指定可信代理 IP、CIDR，或 Express 的 `loopback` 名称。例如 Nginx 与应用同机、应用仅接受回环连接且 Nginx 正确覆盖/追加转发头时配置 `CLOUD_TRUSTED_PROXIES=loopback`。按实际代理拓扑配置，不信任任意客户端或使用任意跳数。来源从代理链右侧按可信代理逐步解析，X-Real-IP 与 Forwarded 仅展示原值。

该配置只作用于本调试接口，不更改管理员鉴权的 IP 逻辑。修改 `src/server.js`、控制器或服务端环境变量后需重启自定义 Node 服务。

验证：`pnpm exec node --test scripts/cloud-network.test.cjs`。
