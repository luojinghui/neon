# luojh.com MCP 集成指南

使用 MCP，可以让 AI 帮你发布云传、查询云传、发布广场和发布心迹。

服务地址固定为 **`https://luojh.com/mcp`**。你只需填写自己的 **UUID**，无需安装 MongoDB，也无需配置数据库地址、服务器目录或额外的共享令牌。支持远程 HTTP 的客户端不需要在本机运行网站或安装 Node.js。

## 1. 获取自己的 UUID

1. 打开 [luojh.com](https://luojh.com)，进入自己的个人中心。
2. 在「资料」页找到 UUID，点击「复制」。
3. 将下方配置中的「替换为自己的UUID」换成复制的值。

必须使用 luojh.com 上的个人资料 UUID，本地测试网站或其他设备的身份可能不同。UUID 是你的身份凭据，请只保存在自己的客户端配置中，不要公开。

## 2. 配置 MCP 客户端

### Cursor 等使用 mcpServers 的客户端

在客户端的 MCP 配置中加入：

```json
{
  "mcpServers": {
    "luojh": {
      "url": "https://luojh.com/mcp",
      "headers": {
        "Authorization": "Bearer 替换为自己的UUID"
      }
    }
  }
}
```

`Bearer` 后保留一个空格，只替换 UUID。保存后重新连接或启用 `luojh`，应出现下方四个工具。此格式支持自定义 HTTP 请求头，参见 [Cursor 官方 MCP 配置](https://cursor.com/docs/mcp)。

### VS Code 使用 servers 的配置

在 `.vscode/mcp.json` 或对应的用户 MCP 配置中加入：

```json
{
  "servers": {
    "luojh": {
      "type": "http",
      "url": "https://luojh.com/mcp",
      "headers": {
        "Authorization": "Bearer 替换为自己的UUID"
      }
    }
  }
}
```

不要混用 `servers` 与 `mcpServers` 两种顶层格式。具体入口以客户端当前版本为准，参见 [VS Code MCP 文档](https://code.visualstudio.com/docs/agent-customization/mcp-servers)。

## 3. 配置后可用的全部功能

| 工具 | 功能 | 返回结果 |
| --- | --- | --- |
| `publish_cloud` | 发布文字、图片和附件到云传 | 查看密码、查看链接、附件信息，7 天有效 |
| `read_cloud` | 输入某条云传的查看密码，读取正文和附件 | 正文、附件链接，可按需读取图片及完整文件内容 |
| `publish_plaza` | 发布文字、图片和附件到公开广场 | 分享链接和消息 ID，48 小时有效 |
| `publish_moment` | 发布文字、图片、视频和普通附件到自己的心迹 | 帖子链接、公开作者和附件信息 |

所有请求都用配置中的 UUID 确认身份；无需每次再向 AI 提供 UUID。心迹自动使用这个 UUID 对应的作者。云传的「查看密码」用于读取某条内容，与个人 UUID 是两回事。

可以直接对 AI 说：

- 「使用 luojh MCP，把这段文字发布到云传，告诉我查看密码和链接。」
- 「使用 luojh MCP，读取查看密码为 abcd 的云传，并查看其中的图片。」
- 「把这段文字和附件发布到 luojh 广场。」
- 「使用 luojh MCP，在我的心迹发布这段文字和图片。」

发布会创建真实内容，重复发布会产生多条记录。广场和心迹公开可见。

## 4. 工具参数示例

### 发布云传、广场或心迹

三个发布工具使用相同的输入格式，文字和文件至少提供一项：

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

只发布文字时可以省略 `files`。`data` 是完整文件字节的标准 Base64，不能带 `data:` 前缀、空格或换行。图片使用 `image/png`、`image/jpeg` 等 MIME 类型。附件需要由客户端或 AI 的文件处理能力读取并编码；只提供本机路径或外部图片链接不会自动上传文件。

返回的 `viewUrl` 是可在浏览器打开的查看链接。云传还返回 `password`，广场返回 `messageId`，心迹返回帖子 `id`。

### 凭密码读取云传

调用 `read_cloud`：

```json
{
  "password": "abcd",
  "includeFileContent": true
}
```

查看密码支持 2–4 位字母或数字，不区分大小写。`includeFileContent` 默认 false，返回正文与附件链接；设为 true 时，同时返回图片或文件的完整内容。PNG/JPEG/GIF/WebP 以 MCP 图片内容返回，其余附件以内嵌资源返回，展示能力取决于客户端。

## 5. 仅支持 stdio 的客户端

可使用项目提供的远程桥接脚本。先获取 Neon 项目并安装其依赖，准备 Node.js 20 或更新版本，然后配置：

```json
{
  "mcpServers": {
    "luojh": {
      "command": "node",
      "args": ["C:/path/to/neon/scripts/neon-mcp.cjs"],
      "env": {
        "NEON_UUID": "替换为自己的UUID"
      }
    }
  }
}
```

脚本路径按实际存放位置填写。脚本默认连接 `https://luojh.com/mcp`，不会连接本机数据库，也不需要 `MONGODB_URI` 或服务器存储路径。支持 HTTP 的客户端优先使用第 2 节配置，更省事。

当前使用 UUID 请求头认证，没有 OAuth 登录页面。只接受 OAuth、且不支持自定义请求头或 stdio 的客户端暂时不能直接接入。

## 6. 上传限制

- 每次最多 9 个文件，单个最多 16 MiB，全部文件解码后合计最多 32 MiB。
- 云传和广场正文最多 100000 字符，心迹正文最多 2000 字符。
- 心迹 JPEG/PNG/WebP 单个最多 12 MiB；GIF、视频及其他附件还受 MCP 16 MiB 限制。
- 文件名不能包含目录、连续 `..` 或控制字符；心迹媒体名称沿用网站的 120 字符限制。
- 读取完整附件也受上述单文件及总大小限制；大文件可关闭 `includeFileContent`，通过下载链接查看。
- 客户端可能有更小的消息限制，使用附件链接通常更适合大文件。

## 7. 常见问题

| 现象 | 处理方式 |
| --- | --- |
| 401，身份无效 | 重新到 luojh.com 自己的个人中心复制 UUID；检查 `Bearer` 后的空格和配置值 |
| 404，MCP 服务未启用 | 网站版本尚未更新或服务被关闭，联系网站维护者 |
| 403，来源或 Host 不允许 | 检查地址是否为 `https://luojh.com/mcp`；仍失败时联系网站维护者 |
| 云传内容未找到 | 检查该条云传的查看密码，内容可能已过期 |
| 工具没有收到文件 | 确认客户端已把文件真实字节编码放入 `files[].data` |
| 网络中断或发布响应丢失 | 先到网站确认是否已经发布成功，再决定是否重新发布 |

用户配置中不需要填写 `MCP_AUTH_TOKEN`、`MCP_OWNER_UUID`、`MONGODB_URI` 或任何服务器目录。
