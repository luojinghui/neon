# STUN 服务配置与运维

部署验收日期：2026-09-28。以下记录当次部署与验收结果：**公网 STUN Binding 和浏览器 srflx 验证通过**，服务已启用开机启动与异常退出自动重启。

本次按《WebRTC世界-STUN_TURN服务介绍和搭建.pdf》涉及的 STUN 场景部署 coturn，只提供 STUN Binding 地址发现。STUN 帮助客户端取得服务器观察到的地址与端口；媒体连接由 ICE 检查选择路径。它不保证所有 NAT 或防火墙环境都能直连，受限网络可能仍需另外部署 TURN 中继。[STUN 标准 RFC 8489](https://datatracker.ietf.org/doc/html/rfc8489)

## 连接信息

| 项目 | 配置 |
| --- | --- |
| 客户端 STUN URL | `stun:8.137.55.241:3478` |
| 协议 | UDP / IPv4 |
| 服务端监听地址 | `172.24.16.127:3478` |
| 用户名、密码、证书 | 均不需要 |
| TURN 中继 | 未启用；不提供 `turn:` 或 `turns:` 地址 |
| SSH | `ssh neon-server`，对应 `jinghui@8.137.55.241`，端口 `2222` |

安全组入方向需允许 **UDP 3478，来源 `0.0.0.0/0`**，供不同网络的客户端访问；主机防火墙也需允许该流量。本配置不需要放行 TCP 3478、5349 或 TURN 中继端口范围。用户已在阿里云安全组放行；从本机到服务器的公网 UDP 往返及 STUN 协议验证均通过。

## WebRTC 接入

```js
const pc = new RTCPeerConnection({
  iceServers: [{ urls: "stun:8.137.55.241:3478" }],
  iceTransportPolicy: "all",
});

pc.onicecandidate = ({ candidate }) => {
  if (candidate) console.log(candidate.type, candidate.candidate);
};

// 仅用于触发候选收集；业务中也可由音视频轨道触发。
pc.createDataChannel("stun-check");
await pc.setLocalDescription(await pc.createOffer());
```

在浏览器支持 WebRTC 的 HTTPS 页面运行。测试时只保留上述 STUN 地址，避免其他服务器的成功结果干扰判断。出现 `srflx` 候选说明取得了 STUN 映射地址；`host` 仅是本地候选，不能证明 STUN 可达；`relay` 来自 TURN，本配置不会产生。测试结束后调用 `pc.close()`。

不要将 `iceTransportPolicy` 设为 `"relay"`：此模式只允许中继候选，与本次 STUN-only 服务不匹配。界面显示 `Done` 仅表示收集结束，还需检查是否存在该服务器产生的 `srflx`。即使收集成功，也应以两端实际 ICE 连接和数据传输验证业务通路。

云传网络探测已在客户端固定使用此地址，操作和结果字段见 [云传网络探测调试](cloud-network-diagnostics.md)。星球通话单独读取服务端的 `WEBRTC_STUN_URLS`；若要使用本服务，可设置 `WEBRTC_STUN_URLS=stun:8.137.55.241:3478` 并重启应用。TURN 配置与跨网络通话验收见 [星球音视频通话](planet-calls.md)。

## 安装与文件位置

使用官方 coturn **4.18.0** 源码，固定提交 `23c6c1d32a3d2b21a56cee65d3203bcc4ea82d2b`。OpenSSL **3.5.8**、libevent **2.1.13** 安装在用户目录，构建脚本验证下载包的 SHA-256。运行用户为 `jinghui`，由 systemd 用户服务管理；该用户已启用 linger，用于退出 SSH 后继续运行和开机启动。

| 服务器路径 | 用途 |
| --- | --- |
| `/home/jinghui/services/stun/turnserver.conf` | 服务配置 |
| `/home/jinghui/services/stun/coturn-4.18.0/bin/` | coturn 程序及测试客户端 |
| `/home/jinghui/services/stun/deps/` | 私有依赖库 |
| `/home/jinghui/services/stun/src/` | 源码包和构建目录 |
| `/home/jinghui/services/stun/logs/` | 构建及检查日志 |
| `/home/jinghui/services/stun/run/turnserver.pid` | 进程 PID 文件 |
| `/home/jinghui/.config/systemd/user/stun.service` | systemd 用户服务 |

部署时的本地材料保存在 `.cache/stun-deployment/`：`turnserver.conf`、`stun.service` 和 `build-stun.sh`。该目录被 Git 忽略，不随仓库克隆；现网配置与服务文件以表中的服务器路径为准。

配置内容如下；布尔选项按本次固定版本使用，升级时应重新核对官方示例。

```ini
listening-ip=172.24.16.127
listening-port=3478
stun-only
no-tcp
no-tls
dtls=false
cli=false
software-attribute=false
stun-backward-compatibility=false
rfc3489-compatibility=false
fingerprint
relay-threads=1
log-file=stdout
pidfile=/home/jinghui/services/stun/run/turnserver.pid
```

RFC 5780 NAT 行为发现保持默认关闭，不添加 `rfc5780=false`。本配置只做地址发现，不用作完整 NAT 类型诊断。`stun-only` 禁止 TURN 请求；匿名 STUN Binding 不需要账户、realm 或 TLS 证书。配置选项以[本次 coturn 提交的官方示例](https://github.com/coturn/coturn/blob/23c6c1d32a3d2b21a56cee65d3203bcc4ea82d2b/examples/etc/turnserver.conf)为准。

## 验收记录

验证日期：2026-09-28（Asia/Shanghai）。

| 检查 | 实际结果 |
| --- | --- |
| 构建与安装 | PASS：coturn 4.18.0；动态加载私有 OpenSSL 3.5.8 与 libevent 2.1.13 |
| 协议测试向量 | PASS：`make check` 的 RFC 5769 指纹、完整性、IPv4/IPv6 编解码、反例及 OAuth 检查全部通过 |
| 服务与监听 | PASS：`stun.service` active、enabled，`Linger=yes`；只监听 `172.24.16.127:3478/udp` |
| 服务器内网 Binding | PASS：响应类型 0x0101，XOR-MAPPED-ADDRESS 与 FINGERPRINT 校验通过 |
| 公网 UDP Binding | PASS：从本机收到 8.137.55.241:3478 的响应；首次约 26 ms，来源、事务 ID 与指纹均正确 |
| TURN 禁用 | PASS：实际配置包含 `stun-only`；有效 Allocate 探测未获成功响应，其后 Binding 继续成功 |
| 浏览器候选收集 | PASS：WebRTC 官方 Trickle ICE 页面仅配置本服务，all 模式；0.076 s 出现 srflx，0.136 s 收集完成 |
| 重启后验证 | PASS：执行 `systemctl --user restart stun.service` 后内外网 Binding 均成功，公网复测约 25 ms |

已核对开机启动配置，没有为验收重启整台服务器。上述验证证明本 STUN 服务可达，不代表任意两端网络的音视频连接都能直连。

本地原始探测结果在 `.cache/stun-deployment/public-probe.json` 和 `public-probe-after-restart.json`；服务器内网结果在 `/home/jinghui/services/stun/logs/local-probe.json`，构建协议检查在 `logs/coturn-check.log`。测试代码为服务器 `/home/jinghui/services/stun/stun_probe.py`。这些结果中的客户端公网映射只反映当次测试，不是需要填入 WebRTC 的服务器地址。

服务器内网自检命令（不能替代公网验收）：

```sh
ssh neon-server 'env LD_LIBRARY_PATH=/home/jinghui/services/stun/deps/lib /home/jinghui/services/stun/coturn-4.18.0/bin/turnutils_stunclient -p 3478 172.24.16.127'
```

公网验收应在另一台机器上使用 STUN 客户端访问 `8.137.55.241:3478`，或运行上面的浏览器示例。若该机器已经安装 coturn 测试工具，可执行 `turnutils_stunclient -p 3478 8.137.55.241`。应核对 Binding 成功响应及映射地址，不能仅凭端口扫描、命令退出或 `Done` 判断成功。[官方测试工具说明](https://github.com/coturn/coturn/blob/23c6c1d32a3d2b21a56cee65d3203bcc4ea82d2b/man/man1/turnutils.1)

## 日常运维

以下命令在本地执行，通过 SSH 操作服务器上的用户服务：

```sh
# 查看状态、开机启动设置与日志
ssh neon-server 'systemctl --user status stun.service --no-pager'
ssh neon-server 'systemctl --user is-enabled stun.service'
ssh neon-server 'journalctl --user -u stun.service -n 100 --no-pager'

# 检查监听
ssh neon-server 'ss -lunp | grep ":3478"'

# 修改 turnserver.conf 后重启
ssh neon-server 'systemctl --user restart stun.service'

# 修改 stun.service 后重新加载并重启
ssh neon-server 'systemctl --user daemon-reload && systemctl --user restart stun.service'
```

停用及回退时只停止本服务，保留程序、配置与日志，方便排查和恢复：

```sh
ssh neon-server 'systemctl --user disable --now stun.service'

# 恢复服务及开机启动
ssh neon-server 'systemctl --user enable --now stun.service'
```

不关闭用户的 linger，以免影响其他用户服务。若需要撤销公网入口，只删除本次新增的 UDP 3478 安全组规则，保留 SSH 及其他业务规则。
