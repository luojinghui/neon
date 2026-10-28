# MCP 接入与部署

面向网站用户的完整配置文档见 [luojh.com MCP 集成指南](../public/mcp-integration.md)。该文件随网站发布后，可直接通过 `https://luojh.com/mcp-integration.md` 阅读和分享。

## 用户接入

用户访问 `https://luojh.com/mcp`，只需使用个人中心的 UUID：

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

这一个身份凭据可使用全部四个工具：发布云传、凭查看密码读取云传、发布广场、发布个人心迹。客户端不配置数据库连接、上传路径、服务器共享令牌或固定作者。UUID 不放在 URL 或工具参数里。

## 服务端行为

- `/mcp` 默认启用，站点根地址默认 `https://luojh.com`。
- 每次请求验证 UUID 格式及对应个人资料是否存在，未知或已删除的资料返回 401。
- 心迹作者由当前已验证请求决定；多个客户端同时使用不同 UUID 时分别发布到各自账号。
- 工具参数不接受作者 UUID，不允许覆盖请求身份。
- 为兼容网站请求，也接受 `x-neon-user-uuid`；与 Bearer 同时提供时，两者必须一致。
- 返回值不包含身份 UUID、数据库连接串和磁盘路径。
- 公开广场和心迹所有访客可见；读取云传仍需该条云传的查看密码。

网站继续使用自己现有的 `MONGODB_URI`、个人资料、心迹索引和上传目录。这些是服务器部署配置，不向 MCP 用户提供，也不要求用户填写。

可以覆盖两个服务端选项：

```dotenv
MCP_ENABLED=true
MCP_PUBLIC_BASE_URL=https://luojh.com
```

`MCP_ENABLED=false` 时端点返回 404。本机验证可以把根地址改为 `http://127.0.0.1:3000`。旧的 `MCP_AUTH_TOKEN` 与 `MCP_OWNER_UUID` 已不再用于 HTTP 鉴权或指定作者，应从部署配置中移除。

## 反向代理

HTTPS 反向代理需要保留 `Host` 和 `Authorization`，允许 `/mcp` 的 POST、GET、DELETE，上传上限至少 48 MiB。Nginx 示例：

```nginx
location = /mcp {
    client_max_body_size 48m;
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header Authorization $http_authorization;
    proxy_buffering off;
    proxy_read_timeout 120s;
}
```

默认校验请求的 Host 必须匹配站点根地址；存在 Origin 时必须与站点 origin 相同。普通 MCP 客户端不发送 Origin。该接入方式沿用网站 UUID 身份凭据，并未实现 OAuth 授权页面；客户端需要支持自定义请求头或使用 stdio 桥接。

`public/mcp-integration.md` 由现有静态资源服务提供，不需要增加代理规则。不要把 `/mcp-integration.md` 改写到 MCP 协议端点。

## stdio 远程桥接

`scripts/neon-mcp.cjs` 现在是访问远程网站的客户端，默认连接 `https://luojh.com/mcp`。只需要 `NEON_UUID`，不读取本机数据库、用户索引、心迹文件或上传目录。旧版直接读写服务器数据的 stdio 方式已移除。

该脚本需要 Node.js 20+ 及项目依赖，直接由 MCP 客户端启动 Node。不要通过会向 stdout 打印横幅的包管理器启动。日志写到 stderr，stdout 只输出协议消息。

仅测试或自建站点需要额外设置 `NEON_MCP_URL`；允许 HTTPS，HTTP 只允许本机回环地址。桥接拒绝带凭据、查询参数和片段的地址及 HTTP 重定向，不自动重发失败的发布请求。

## 验证与维护

```bash
pnpm test:mcp
pnpm test:moments
pnpm test:cloud
pnpm lint
pnpm build
```

默认自动化测试覆盖 UUID 鉴权、请求级用户隔离、现代及旧版 MCP 客户端、原始附件传输、远程 stdio 桥接以及错误脱敏。数据库测试通过 `MCP_TEST_MONGO_PORT` 显式连接独立本地 MongoDB 的随机测试库；不读取应用数据库连接串。未指定时跳过数据库集成测试。

云传使用共享上传目录中的短暂文件锁，串行分配查看密码。多机器使用独立上传目录时，仍需由数据库密码唯一约束保证全局唯一，并处理历史重复码。到期和媒体删除沿用既有业务仓库。

规范与配置格式参考：[官方 SDK v2](https://ts.sdk.modelcontextprotocol.io/v2/)、[MCP HTTP 身份认证](https://modelcontextprotocol.io/specification/latest/basic/authorization)、[Cursor MCP 配置](https://cursor.com/docs/mcp)。
