# 星球通话 TURN 部署与运维

记录日期：**2026-10-26（Asia/Shanghai）**。本次将现有 coturn 从 STUN-only 改为带临时凭据鉴权的 TURN UDP/TCP 服务，保留原来的匿名 STUN Binding 能力。**星球应用已接入 TURN，安全组已补齐，本次 UDP/TCP 部署的公网验收完成：鉴权、独立 peer 双向中继传包，以及 Chrome 分别强制 UDP/TCP relay 的音视频和数据通道均通过。验证范围为同机双 Peer 经公网 coturn，加独立公网 UDP peer；不替代 Wi-Fi／蜂窝两台真机验收。用户选择暂不启用 TLS，不纳入本次验收，也不开放 TCP 5349。**

此前的 STUN-only 安装与验收历史保留在 [STUN 服务配置与运维](stun-server.md)。通话模块、凭据生成和设备验收步骤见 [星球音视频通话](planet-calls.md)。

## 当前状态

| 项目 | 2026-10-26 检查结果 |
| --- | --- |
| coturn | 沿用 4.18.0，已移除 `stun-only`，启用 `use-auth-secret` |
| systemd | 原 `stun.service` 为 `active`、`enabled`，服务名没有变更 |
| 原 STUN 能力 | 公网 Binding 复测通过，约 17.25 ms，FINGERPRINT 校验有效 |
| TURN UDP | 公网 Allocate、HMAC 临时凭据鉴权、负向鉴权，以及 Chrome 强制 relay 音视频测试通过 |
| TURN TCP | 安全组放行后，公网 Allocate、HMAC 鉴权、负向鉴权及独立 peer 双向中继传包通过；Chrome 强制 TCP relay 音视频复测通过 |
| 服务器本机中继 | 官方 `turnutils_uclient -y` 经 UDP、TCP 各完成 20 发／20 收、3200 bytes 接收、lost 0；不能替代公网验收 |
| 独立公网 peer ↔ relay 区间 | 安全组放行后，UDP/TCP 两种客户端入口均通过外部 peer 双向传包；公网 relay 来源校验通过 |
| 云安全组 | 已在 `cn-chengdu` 为实例所属安全组补齐 TCP 3478 与 UDP `49160–49259` 入站允许规则 |
| TURN TLS | 用户选择暂不启用，不纳入本次验收；保留 `no-tls`，不开放 TCP 5349 |
| 星球应用 | `shared/app.env` 已激活，已执行 `pm2 restart neon --update-env` 与 `pm2 save`；运行进程密钥与 coturn 一致，策略为 `all` |
| Chrome 双 Peer | 分别仅配置 UDP、TCP 3478，均强制 `relay`；选中 `relay ↔ relay`，双向音视频及 DataChannel 均通过 |
| 不同网络真机 | 未完成 Wi-Fi／蜂窝网络两台设备验收 |
| 应用健康检查 | 应用重启后及本次公网验收完成后，`https://luojh.com/healthz` 均返回 `ok`，release 为 `f96b6c5…` |

STUN、TURN 的控制入口与 relay 数据端口是不同通路。公网 UDP Allocate 成功，只能证明客户端能访问 TURN 入口并完成鉴权；仍需验证 relay 地址的实际双向传包。参考 [WebRTC TURN 说明](https://webrtc.org/getting-started/turn-server)。

服务器本机的两组 `turnutils_uclient` 结果均报告收发 20 条消息、lost 0，同时工具还报告 24 次尝试中的 4 次 initial send dropped；此处保留该信息，不将它描述为所有发送尝试零丢弃。后续安全组放行后的独立公网探针也已通过，结果如下。

公网探针分别使用 UDP、TCP 访问 3478，两项均为 `ok: true`：未鉴权 Allocate 收到 401，错误凭据被拒绝；正确临时凭据完成 Allocate 并验证响应 HMAC。分配的公网 relay 端口分别为 **49236**、**49189**，均位于配置区间。CreatePermission 成功后，独立公网 peer 向 relay 传入 **50 bytes**、relay 回传 **51 bytes**，数据及公网 relay 来源校验均通过。原始记录为本地 `.cache/turn-deployment/public-probe-final.jsonl`；该结果覆盖实际转发，不只是候选收集。

Chrome 测试约 **4.1 秒**通过：两个 Peer 的音频接收 bytes 持续增长，视频解码达到 **42 帧**且三个采样点持续增长，DataChannel 双向收到 **4 条消息**。两 Peer 在同一台设备，全部媒体经过公网 coturn，选中路径为 `relay ↔ relay`。这证明已配置的 UDP 中继路径可以承载真实 WebRTC 数据，**不等同于 Wi-Fi／蜂窝两台设备已验收**。原始记录为本地 `.cache/turn-deployment/browser-udp.json` 和 `.cache/turn-deployment/browser-udp.png`，该缓存目录不随仓库分发。

同一 coturn 的两个 relay 可以在服务端内部互传，因此此前 Chrome UDP 成功不能单独证明 relay 区间公网入站可达。本次在补齐安全组后额外完成独立公网 peer 双向传包，覆盖了这项通路；仍需在不同网络的真实设备上验收星球通话。

安全组放行前，Chrome TCP 强制中继测试在 60 秒内未建立连接，两端报告 ICE 错误 **701**、`Failed to establish connection`，未收集到 relay 候选。历史记录保存在 `.cache/turn-deployment/browser-tcp-initial.json`，仅作为修复前后对照。

放行后，Chrome 仅配置 TCP 3478 URL、双方强制 `relay` 的复测约 **4.1 秒**通过。两端选中候选均为 `relay ↔ relay`，本地候选的 `relayProtocol` 均为 **`tcp`**；A/B 收到音频分别为 **10999／10998 bytes**，视频解码分别为 **42／41 帧**，三个采样点持续增长；DataChannel 每方向收到 **4 条消息**，无 ICE 错误。原始记录为 `.cache/turn-deployment/browser-tcp-final.json`，截图为 `.cache/turn-deployment/browser-tcp-final.png`。这确认浏览器实际经 TCP 入口传送音视频，并非由 UDP 成功结果代替 TCP 验证。

## 地址、文件和服务

| 项目 | 值 |
| --- | --- |
| SSH | `ssh neon-server`，`jinghui@8.137.55.241:2222` |
| STUN | `stun:8.137.55.241:3478` |
| TURN UDP | `turn:8.137.55.241:3478?transport=udp` |
| TURN TCP | `turn:8.137.55.241:3478?transport=tcp`，公网协议、传包及浏览器音视频通过 |
| 监听及 relay 内网地址 | `172.24.16.127` |
| 公网映射 | `external-ip=8.137.55.241/172.24.16.127` |
| Realm | `luojh.com` |
| UDP relay 端口 | `49160–49259` |
| 分配配额 | `user-quota=32`、`total-quota=80` |
| 实例公网带宽 | 控制台显示固定带宽 **3 Mbps**；本次未变配 |
| 服务配置 | `/home/jinghui/services/stun/turnserver.conf` |
| 程序目录 | `/home/jinghui/services/stun/coturn-4.18.0/bin/` |
| 动态库目录 | `/home/jinghui/services/stun/deps/lib` |
| 用户服务 | `/home/jinghui/.config/systemd/user/stun.service` |
| 应用环境文件 | `/home/jinghui/apps/neon/shared/app.env` |
| 应用配置状态 | 暂存文件已通过 `os.replace` 原子替换为 `shared/app.env`，`app.env.turn-staged` 不再存在 |
| TLS 安装脚本（保留，暂不执行） | `/home/jinghui/services/stun/install-turn-tls.py` |
| 修改前备份 | `/home/jinghui/services/stun/backups/before-turn-20261026T111608Z/` |

备份目录保存修改前的 coturn 配置、systemd unit 和应用 `app.env`。备份与当前配置可能包含密钥，只在服务器受限目录保存，不提交到 Git，不将内容贴入日志或命令历史。共享密钥已在服务器生成并写入权限为 `600` 的文件；本文所有密钥值均为占位符。

## coturn 关键配置

下列为本次关键参数示意，**不替代线上完整配置文件**：

```ini
listening-ip=172.24.16.127
listening-port=3478
relay-ip=172.24.16.127
external-ip=8.137.55.241/172.24.16.127
min-port=49160
max-port=49259

realm=luojh.com
use-auth-secret
static-auth-secret=<仅在服务器保存的随机共享密钥>
fingerprint
user-quota=32
total-quota=80

no-tcp-relay
no-tls
dtls=false
cli=false
```

- `stun-only`、`no-tcp` 已移除，原 UDP STUN 入口继续使用。不要启用 `secure-stun`，否则现有匿名 STUN 探测会受影响。
- `use-auth-secret` 内部启用长期凭据鉴权机制，无需同时设置 `lt-cred-mech`。应用按 `到期时间:随机标识` 生成用户名，以共享密钥计算 HMAC-SHA1 并 Base64 编码得到临时密码；浏览器不接收共享密钥。当前应用凭据有效期为 24 小时。
- `no-tcp-relay` 禁止 RFC 6062 TCP peer endpoint，**不禁止客户端通过 TCP 访问 TURN**。浏览器的 `transport=tcp` 仍可通过 TURN 服务使用 UDP relay，因此无需开放 relay 区间的 TCP 入站。
- `max-bps`、`bps-capacity` 的单位是 bytes/s；未来限流前先核对实例公网带宽与多人通话流量，不能把 bits/s 数值直接填入。
- 保持固定版本配置语义。该版本默认禁止环回 peer，旧 `no-loopback-peers` 已被 `allow-loopback-peers` 替代；生产不启用后者。

参数依据：[coturn 固定版本官方配置](https://github.com/coturn/coturn/blob/23c6c1d32a3d2b21a56cee65d3203bcc4ea82d2b/examples/etc/turnserver.conf)。

### 本机地址白名单例外

该版本的 `external-ip=公网/内网` 在建立地址映射时，会**自动把其中的内网地址加入 peer 白名单**。白名单优先于 `denied-peer-ip`，因此不能声称拒绝 `172.16.0.0–172.31.255.255` 已同时禁止中继访问本机 `172.24.16.127`。其他私网、CGNAT／云元数据地址仍应通过拒绝规则限制。

这一例外与同一 coturn 上的双 relay 通信有关：服务端解析 `XOR-PEER-ADDRESS` 时，会把本机公网地址映射回内网地址，再检查 peer ACL。仅改为 `external-ip=8.137.55.241` 虽然不自动添加白名单，仍会建立地址映射；若同时全面拒绝 `172.16/12`，两端使用本机 relay 时的 CreatePermission 会被拒绝为 `403 Forbidden IP`。

coturn 的该项 ACL 只按 IP 匹配，不能按目的端口豁免。若需要进一步限制访问本机其他 UDP 服务，应使用针对 coturn 进程／cgroup 的主机防火墙规则，只允许访问本机 relay 区间；不要误限制同一 `jinghui` 用户运行的其他应用。本次记录不宣称已经实施这项端口级隔离。TCP peer 转发由 `no-tcp-relay` 禁用。

源码依据：[地址映射及自动白名单](https://github.com/coturn/coturn/blob/23c6c1d32a3d2b21a56cee65d3203bcc4ea82d2b/src/apps/relay/mainrelay.c#L2367)、[peer ACL 顺序](https://github.com/coturn/coturn/blob/23c6c1d32a3d2b21a56cee65d3203bcc4ea82d2b/src/server/ns_turn_server.c#L308)、[接收地址映射](https://github.com/coturn/coturn/blob/23c6c1d32a3d2b21a56cee65d3203bcc4ea82d2b/src/client/ns_turn_msg.c#L1748)。

## 安全组与主机防火墙

不同网络的客户端需能访问以下入站端口；云安全组与主机防火墙都要核对。

本次已在阿里云 **`cn-chengdu`** 的实例 **`i-2vc8x02t6fdb0o4y889a`** 所属安全组 **`sg-2vccqj3wb3g8lutrytvn`** 新增两条入方向允许规则，优先级均为 **1**、来源均为 **`0.0.0.0/0`**：

| 协议及端口范围 | 规则描述 |
| --- | --- |
| TCP `3478/3478` | `Neon WebRTC TURN TCP 3478` |
| UDP `49160/49259` | `Neon WebRTC TURN UDP relay 49160-49259` |

原有 UDP 3478 规则保持不变，未重复添加；未开放 TCP 5349。控制台最终截图为本地 `.cache/turn-deployment/security-group-final.png`，新增规则阶段截图保存在 `.cache/turn-deployment/security-group-udp-tcp.png`。

| 协议 | 端口 | 用途 | 当前要求 |
| --- | --- | --- | --- |
| UDP | 3478 | STUN／TURN 控制入口 | 保留公网访问；公网 Allocate 已通过 |
| TCP | 3478 | TURN TCP 控制入口 | 已放行；公网鉴权、双向传包及浏览器音视频通过 |
| UDP | 49160–49259 | TURN relay 数据 | 已放行；独立公网 peer 双向传包通过 |
| TCP | 5349 | TURN TLS 控制入口 | 用户选择暂不启用，本次不开放、不验收 |

上述客户端入口需要覆盖实际用户来源；面向任意公网用户时使用 `0.0.0.0/0`。不要把 TCP 5349 已放行当成 TLS 已配置，也不要把 TCP 3478 连通当成 UDP relay 数据已放行。NAT 必须保持 relay 内外端口一一对应。

容量备注：控制台显示该实例公网固定带宽为 **3 Mbps**，本次仅完成 TURN 接入与端口配置，未修改带宽套餐。多人视频中继与网站访问共享这项带宽，实际并发容量需按通话码率测量；上述短时连通性验证不代表已完成带宽压力验收。

### TLS 后续可选方案（本次暂不启用）

用户已选择先完成 UDP/TCP，暂不启用 TLS。本次保留 `no-tls`，不执行证书安装脚本、不下发 `turns:` 地址、不开放 TCP 5349；TLS 不作为本次验收阻塞项。

现有 Nginx 私钥为 root 所有、权限 `600`，coturn 用户服务不能读取。已准备的 `/home/jinghui/services/stun/install-turn-tls.py` 仅保留供以后明确启用 TLS 时使用，当前不执行。脚本设计为复制现有 Nginx 证书至：

- `/var/lib/neon-turn-tls/fullchain.pem`
- `/var/lib/neon-turn-tls/privkey.pem`

目标目录权限为 `0750`，证书副本为 `root:jinghui`、`0640`；同时安装 root 所有的证书同步辅助程序和每日执行的 systemd timer。原 Nginx 私钥权限不变。以上仅为未执行脚本的预期行为，不能视为证书副本、同步定时器或 TLS listener 已就绪。

以后决定启用 TLS 时，需先执行脚本并核对证书链、域名、有效期与自动同步结果，再配置 `tls-listening-port`、`cert`、`pkey` 并移除 `no-tls`，放行 TCP 5349 并完成公网测试。`turns:` 地址必须使用证书覆盖的域名。当前没有可提供给应用的已验收 `turns:` 地址。

## 已生效的应用配置

已生效的 `shared/app.env` 包含以下配置，真实密钥仅在服务器保存：

```dotenv
WEBRTC_STUN_URLS='stun:8.137.55.241:3478'
WEBRTC_TURN_URLS='turn:8.137.55.241:3478?transport=udp,turn:8.137.55.241:3478?transport=tcp'
WEBRTC_TURN_SECRET='<与 coturn static-auth-secret 相同的共享密钥>'
WEBRTC_RELAY_ONLY=false
```

本次已保留应用其余环境变量与文件权限，将暂存文件原子替换为 `app.env`，加载环境后执行 `pm2 restart neon --update-env` 与 `pm2 save`。已核对运行进程包含 UDP／TCP 3478 两个 TURN URL，密钥与 coturn 一致，ICE 策略为 `all`。重启后公网 [健康检查](https://luojh.com/healthz) 返回 `ok`，release 为 `f96b6c5…`。未来修改时同样需更新进程环境；仅写磁盘文件不代表配置生效。核对时只输出 TURN URL、策略与密钥是否已配置，不能输出密钥内容。

正常运行使用 `WEBRTC_RELAY_ONLY=false`，允许直连并在需要时使用中继。强制 relay 用于隔离验证；可在独立测试连接中使用 `iceTransportPolicy: 'relay'`，避免影响其他在线通话。凭据在加入通话时生成，下发配置更新后已有通话需重新加入才能使用新配置。

## 验收步骤

1. 检查 `stun.service` 为 active、enabled，服务没有配置解析错误；STUN Binding 继续成功。
2. 通过公网 UDP、TCP 分别执行 Allocate。无凭据请求应收到鉴权挑战，正确临时凭据应分配成功，错误／过期凭据不能成功分配。确认 `XOR-RELAYED-ADDRESS` 是公网 `8.137.55.241` 且端口处于 `49160–49259`。
3. 在外部网络验证 relay 实际双向传包，包括同一 coturn 上两个 relay 互通。官方 `turnutils_uclient -y` 可以做 relay-to-relay 测试；`-t` 表示客户端通过 TCP 连接 TURN，未来 `-t -S` 表示 TLS。不要用 `-T`，它请求的是已禁用的 RFC 6062 TCP relay。工具说明见[固定版本 README.turnutils](https://github.com/coturn/coturn/blob/23c6c1d32a3d2b21a56cee65d3203bcc4ea82d2b/README.turnutils)。
4. 确认应用进程已读取新配置，新加入响应包含 TURN URL 与临时用户名／密码，但不包含共享密钥。
5. 两个独立浏览器身份强制 relay，验证 ICE selected candidate pair 实际使用 relay，双向音频接收字节及视频解码帧持续增长。再使用不同 Wi-Fi／蜂窝网络验证正常模式下双向音视频。
6. 结束测试后关闭 PeerConnection／退出通话，确认分配与设备释放。记录实际结果；只有 Allocate 或候选收集成功，不标记音视频验收通过。

项目现有 `test:webrtc:browser` 使用本机 `127.0.0.1` 并清空 STUN／TURN，不能替代以上公网与跨网络测试。本次单独执行的 Chrome UDP relay 测试已走公网 coturn，证据与限制见“当前状态”。

## 日常检查与回退

```sh
ssh neon-server 'systemctl --user status stun.service --no-pager'
ssh neon-server 'systemctl --user is-enabled stun.service'
ssh neon-server 'journalctl --user -u stun.service -n 100 --no-pager'
ssh neon-server 'ss -lntup'
```

查看日志时避免开启或传播包含凭据的调试内容。变更服务配置后重启 `stun.service`；变更 unit 后先 `systemctl --user daemon-reload`。服务重启会中断经过本服务的现有 relay 分配，应在可接受的窗口执行。

回退材料位于 `/home/jinghui/services/stun/backups/before-turn-20261026T111608Z/`：核对备份文件与原路径后，恢复 coturn 配置、unit 和应用 `app.env`，保留密钥文件的受限权限；重新加载 unit、重启服务，并按现有 PM2 环境加载方式恢复应用环境。验证 STUN Binding、应用健康与聊天可用。回退为 STUN-only 后不再提供 TURN 中继，不能继续对外宣称跨网络视频通话已修复。保留备份供追溯，不删除其他业务的安全组或防火墙规则。

注意：`pm2 restart --update-env` 不会自动删除旧进程里已存在但恢复文件中缺失的变量。若回退备份没有 TURN 配置，重启时须显式设置 `WEBRTC_TURN_URLS=`、`WEBRTC_TURN_SECRET=`、`WEBRTC_RELAY_ONLY=false`，并核对进程实际环境；不要只恢复文件后重启就认定中继已停用。
