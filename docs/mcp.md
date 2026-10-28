# Neon MCP 接入

Neon 提供四个 MCP 工具，复用网站现有数据库、内容仓库和上传目录。实现使用官方 SDK v2，支持 MCP 2026-07-28，并兼容 2025 系列客户端。传输支持 Streamable HTTP 和 stdio。

| 工具 | 输入 | 返回 |
| --- | --- | --- |
| `publish_cloud` | `text`、`files` 至少一项 | 查看密码 `password`、7 天到期时间、正文、附件及查看链接 |
| `read_cloud` | `password`，可选 `includeFileContent` | 正文、附件、到期时间；按需返回图片和附件完整内容 |
| `publish_plaza` | `text`、`files` 至少一项 | 广场消息 ID、48 小时到期时间、附件及分享链接 |
| `publish_moment` | `text`、`files` 至少一项 | 心迹 ID、公开作者、图片/视频、普通附件及帖子链接 |

三个发布工具会创建真实内容，重复调用会重复发布。广场与心迹公开可见。云传密码是访问凭据，不同于 MCP 访问令牌。错误通过 MCP `isError: true` 返回，成功同时返回文本 JSON 和 `structuredContent`。

## 运行条件

- Node.js 20 或更新版本；生产工作流使用 Node.js 24。本机若 `node --version` 显示 18，需要先切换到更新版本。
- `pnpm install --frozen-lockfile`。
- 云传与广场需要网站使用的 `MONGODB_URI`；心迹使用现有个人资料、心迹索引与上传目录。
- `MCP_PUBLIC_BASE_URL` 必须是实际可访问的网站根地址，例如 `http://127.0.0.1:3000` 或 `https://neon.example.com`，不能包含子路径或凭据。
- 发布心迹需要 `MCP_OWNER_UUID`，对应已经创建的个人资料。在网站打开自己的个人中心，在「资料」页查看 UUID 并点击「复制」。

  UUID 是浏览器身份凭据，请只写入私有配置。未配置时心迹发布返回明确错误，其余工具可以正常使用。服务端不接受调用参数指定其他作者，也不会自动创建用户。

## Streamable HTTP

在网站的私有环境文件中配置以下变量，沿用网站现有启动方式重启服务：

```dotenv
MCP_AUTH_TOKEN=替换为随机令牌
MCP_PUBLIC_BASE_URL=http://127.0.0.1:3000
MCP_OWNER_UUID=替换为已有个人资料UUID
```

访问令牌要求 32–256 位字母、数字或 `._~-` 字符。可生成 32 字节十六进制随机令牌：

```bash
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
```

未配置 `MCP_AUTH_TOKEN` 时，`/mcp` 返回 404。启用后所有请求均需 `Authorization: Bearer <令牌>`。请求 `Host` 必须匹配 `MCP_PUBLIC_BASE_URL`；存在 `Origin` 时必须与该地址的 origin 完全一致。

支持 HTTP MCP 的客户端通常可配置为以下形式，具体字段以客户端配置格式为准：

```json
{
  "mcpServers": {
    "neon": {
      "url": "http://127.0.0.1:3000/mcp",
      "headers": {
        "Authorization": "Bearer 替换为私有令牌"
      }
    }
  }
}
```

这是预配置 Bearer 令牌的接入方式，尚未实现 OAuth 授权页面或自动发现。只支持 OAuth 的托管客户端需要增加 OAuth 授权服务，或使用支持自定义 Authorization 请求头的客户端。

生产反向代理使用 HTTPS，保留原始 `Host`，允许 `/mcp` 的 POST/GET/DELETE，请求体大小至少 48 MiB。Nginx 可在现有站点的 MCP location 配置：

```nginx
location = /mcp {
    client_max_body_size 48m;
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_buffering off;
    proxy_read_timeout 120s;
}
```

不启用跨站浏览器调用；没有 `Origin` 的普通 MCP 客户端可凭令牌调用。当前一个端点对应一个固定心迹作者，拥有令牌的调用者共享该发布身份。

## stdio

stdio 入口为 `scripts/neon-mcp.cjs`。客户端直接启动 Node，不通过会打印启动横幅的包管理器。该进程直接访问网站存储，必须运行在网站所在机器，并使用同一套数据库与数据目录。查看链接和附件下载仍由网站 HTTP 服务提供。

```json
{
  "mcpServers": {
    "neon": {
      "command": "node",
      "args": ["C:/path/to/neon/scripts/neon-mcp.cjs"],
      "env": {
        "MONGODB_URI": "替换为网站已有的私有数据库连接串",
        "MCP_PUBLIC_BASE_URL": "http://127.0.0.1:3000",
        "MCP_OWNER_UUID": "替换为已有个人资料UUID"
      }
    }
  }
}
```

若系统 Node 版本较旧，将 `command` 改为新版 Node 可执行文件的绝对路径。入口会切换到项目根目录，不会自动加载 Next.js 环境文件；需显式传入变量，或使用支持 `--env-file` 的 Node 版本在 `args` 中指定私有文件的绝对路径。

stdio 不要求 `MCP_AUTH_TOKEN`，其权限由启动进程及环境变量控制。若网站设置了 `USER_PROFILE_DATA_FILE`、`MOMENT_DATA_FILE`、`MOMENT_UPLOAD_DIRECTORY`、`CLOUD_PLAZA_UPLOAD_DIRECTORY`，请将完全相同的路径传给 stdio 进程。默认相对路径以项目根目录为准。日志输出到 stderr，stdout 只输出 MCP 消息。

## 调用示例与附件格式

发布文字和附件，例如调用 `publish_cloud`：

```json
{
  "text": "项目说明和附件",
  "files": [
    {
      "name": "说明.txt",
      "mimeType": "text/plain",
      "data": "aGVsbG8="
    }
  ]
}
```

发布到广场或心迹时替换工具名即可。图片传入其真实文件字节的 Base64，并设置 `mimeType: "image/png"` 等类型。`data` 不能含 `data:` 前缀、空格或换行。服务器不会下载外部 URL，也不会根据调用参数读取本机路径。

Node 中可在可信客户端侧编码附件：

```js
const fs = require('node:fs');
const image = {
  name: 'photo.png',
  mimeType: 'image/png',
  data: fs.readFileSync('photo.png').toString('base64')
};
```

使用返回的查看密码读取云传：

```json
{ "password": "abcd", "includeFileContent": true }
```

密码支持 2–4 位字母或数字，不区分大小写，新发布默认生成 4 位随机码。`includeFileContent` 默认 false，只返回附件信息和下载链接；为 true 时，PNG/JPEG/GIF/WebP 通过 MCP `image` 内容返回，其他文件通过带 Base64 `blob` 的内嵌资源返回。正文及附件元数据仍在 `structuredContent` 中，二进制不重复放入该字段。

## 限额与现有数据

- 每次最多 9 个文件，单文件最多 16 MiB，全部附件解码后合计最多 32 MiB；HTTP 和 stdio 请求上限为 48 MiB。
- 云传和广场正文上限 100000 字符；心迹正文上限 2000 字符。
- 心迹 JPEG/PNG/WebP 沿用网站 12 MiB 限额，GIF/视频还受 MCP 16 MiB 限额限制。其余 MIME 类型作为普通附件下载。心迹普通附件使用随机 `.bin` 存储，下载强制 `attachment` 和 `nosniff`。
- 文件名最长 255 字符，不能包含路径、连续 `..` 或控制字符；心迹沿用网站的 120 字符展示名称限制。
- `read_cloud` 开启原始内容读取时应用同样的单文件和合计大小限制；旧网站上传的超大附件可关闭此选项，仅取链接。
- 客户端可能有更小的消息限制。大附件优先使用下载链接；向模型返回完整二进制受客户端能力及上下文限制影响。
- 云传按到期时间过滤查询，广场复用原有到期清理。MCP 使用共享上传目录中的短暂文件锁，串行执行密码查重与保存，覆盖同一存储上的 HTTP/stdio 多进程；既有云传数据库没有密码唯一索引。多台机器使用独立存储部署时，应先清理历史重复码并建立大小写不敏感的密码唯一索引，再让所有发布入口处理索引冲突。
- 心迹附件兼容旧记录，删除帖子会回收媒体和附件。帖子链接 `/moments?moment=ID` 可独立打开历史记录。

## 验证

```bash
pnpm test:mcp
pnpm test:moments
pnpm test:cloud
pnpm lint
pnpm build
```

默认测试使用临时目录和可注入数据库替身，覆盖业务存储、跨进程密码碰撞、回滚、过期、附件真实读取、下载与删除、MCP HTTP 新旧协议握手、工具调用、鉴权、输入校验和 stdio 子进程。

真实数据库测试需要先独立启动只绑定本机的临时 MongoDB，再显式设置 `MCP_TEST_MONGO_PORT` 运行 `pnpm test:mcp`，设置 `PLAZA_TEST_MONGO_PORT` 运行 `pnpm test:cloud`。未设置时这些测试跳过；测试只连接指定本地端口的随机测试库，不读取应用数据库连接串。测试完成后删除随机测试库，临时 MongoDB 进程由启动者停止。本次已使用独立 MongoDB 7.0.43 完成全部 8 项数据库集成测试，包括连接数据库后的 stdio 正常退出，临时资源均已清理。

测试不会向正在运行的网站发布内容。部署后还需要使用私有配置在目标站点完成一次实际发布与查询验收。

规范与 SDK 参考：[MCP 规范](https://modelcontextprotocol.io/specification/latest)、[官方 SDK v2](https://ts.sdk.modelcontextprotocol.io/v2/)、[Express 接入](https://ts.sdk.modelcontextprotocol.io/v2/serving/express.html)。
