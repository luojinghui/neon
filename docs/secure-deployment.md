# Neon 安全部署配置

当前工作流会在 GitHub 托管 Runner 中构建，再把不可变制品传到服务器。服务器不再执行 `git pull`、依赖安装或项目构建，也不再把密码交给第三方 Action。

## 1. 先处理疑似入侵

如果服务器上已经发现陌生进程、计划任务、用户、SSH key 或高 CPU 挖矿行为，不要把“杀进程”视为清理完成。优先隔离旧主机并保留日志/快照，然后从可信镜像重建服务器；只迁移业务数据和人工核验过的配置，不复制旧机的二进制、`node_modules`、PM2 数据目录或用户家目录。

同时轮换以下凭据：

- GitHub 密码、PAT、SSH key、Deploy key，并在 GitHub 中注销其他会话、检查安全日志和 Actions 运行记录、启用 2FA/Passkey。
- 开发机和 CI 中的 npm/私有 npm registry token；本机 pnpm 全局配置也可能以明文保存这些 token。
- 旧服务器 root/普通用户密码及云厂商控制台凭据。
- MongoDB 用户密码和其他应用密钥。
- 删除仓库原有的 `SSH_HOST`、`SSH_USERNAME`、`SSH_PWD` Secrets。

## 2. 创建最小权限发布用户

以下示例用户名和路径可以替换，但 GitHub Secrets 中必须使用完全相同的值：

```bash
sudo adduser --disabled-password --gecos '' neon-deploy
sudo install -d -m 700 -o neon-deploy -g neon-deploy /home/neon-deploy/.ssh
sudo install -d -m 755 -o neon-deploy -g neon-deploy /home/neon-deploy/apps/neon
```

在可信的管理电脑生成一把只用于这个仓库的 Ed25519 key。私钥不要设置到服务器，也不要提交到 Git：

```bash
ssh-keygen -t ed25519 -a 100 -f ~/.ssh/neon-github-actions -C github-actions-neon
```

把公钥内容写入服务器的 `/home/neon-deploy/.ssh/authorized_keys`，并在公钥前加 `restrict`：

```text
restrict ssh-ed25519 AAAA... github-actions-neon
```

然后设置权限：

```bash
sudo chown neon-deploy:neon-deploy /home/neon-deploy/.ssh/authorized_keys
sudo chmod 600 /home/neon-deploy/.ssh/authorized_keys
```

发布用户不应加入 `sudo`/`docker` 组，也不应持有 GitHub PAT、仓库 Deploy key 或数据库管理权限。服务器需要为该用户提供 Node.js 24、PM2 和 `curl`；现有 NVM 安装也可被工作流自动加载。

## 3. 配置运行环境

用服务器上的编辑器创建 `/home/neon-deploy/apps/neon/shared/app.env`，不要把真实值粘进命令历史。格式参考仓库的 `.env.example`：

所有文件存储配置（`*_DATA_FILE`、`*_UPLOAD_DIRECTORY`）必须使用绝对路径。部署会在停止当前进程前校验，发现相对路径立即中止，避免按 SSH 工作目录解析而漏备份。

```dotenv
MONGODB_URI='mongodb://APP_USER:URL_ENCODED_PASSWORD@127.0.0.1:27017/APP_DB?authSource=admin'
APP_HOST=127.0.0.1
APP_PORT=3000
SOUL_CHAT_DATA_FILE=/home/neon-deploy/apps/neon/shared/soul-data/soul-chat.json
USER_PROFILE_DATA_FILE=/home/neon-deploy/apps/neon/shared/user-data/user-profiles.json
DOODLE_REVIEW_DATA_FILE=/home/neon-deploy/apps/neon/shared/doodle-data/doodle-reviews.json
DOODLE_REVIEW_UPLOAD_DIRECTORY=/home/neon-deploy/apps/neon/shared/doodle-review-images
DOODLE_SHARE_DATA_FILE=/home/neon-deploy/apps/neon/shared/doodle-data/doodle-shares.json
DOODLE_UPLOAD_DIRECTORY=/home/neon-deploy/apps/neon/shared/soul-uploads/doodle
MOMENT_DATA_FILE=/home/neon-deploy/apps/neon/shared/moment-data/moments.json
MOMENT_UPLOAD_DIRECTORY=/home/neon-deploy/apps/neon/shared/soul-uploads/moments
ALLOWED_ORIGINS='https://your-domain.example'
```

```bash
sudo chown neon-deploy:neon-deploy /home/neon-deploy/apps/neon/shared/app.env
sudo chmod 600 /home/neon-deploy/apps/neon/shared/app.env
```

应用默认只监听 `127.0.0.1:3000`，应由 Nginx/Caddy 反向代理；安全组和主机防火墙不要向公网开放 3000。公网通常只保留 80/443 和新的 SSH 端口。

## 4. 修改 SSH 端口并关闭密码登录

先开放新端口并保持当前 SSH 会话不要退出。修改 sshd 后先运行 `sudo sshd -t`，再 reload 服务，并从第二个终端确认新端口和 key 登录成功。确认成功之前不要关闭旧会话或旧端口。

建议配置：

```text
Port NEW_SSH_PORT
PermitRootLogin no
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
AllowUsers neon-deploy
```

新用户密码仅可用于最初的人工初始化；GitHub Actions 不使用也不保存服务器密码。确认 key 登录后，应禁用 SSH 密码认证。

## 5. 配置 GitHub production 环境

在仓库 `Settings → Environments → production` 中添加以下 Environment secrets：

| Secret | 内容 |
| --- | --- |
| `DEPLOY_HOST` | 新服务器域名或公网 IP |
| `DEPLOY_PORT` | 新 SSH 端口 |
| `DEPLOY_USER` | `neon-deploy` |
| `DEPLOY_PRIVATE_KEY` | `~/.ssh/neon-github-actions` 的完整私钥 |
| `DEPLOY_KNOWN_HOSTS` | 固定的服务器 Ed25519 host key 行 |
| `DEPLOY_PATH` | `/home/neon-deploy/apps/neon` |

对于自定义端口，`DEPLOY_KNOWN_HOSTS` 格式如下：

```text
[server.example.com]:NEW_SSH_PORT ssh-ed25519 AAAAC3...
```

应通过云厂商控制台或另一条可信通道，从服务器的 `/etc/ssh/ssh_host_ed25519_key.pub` 核对 host key。不要在未核验指纹的网络上直接把 `ssh-keyscan` 结果当作可信值。

建议同时保护 `main` 分支，禁止直接 push，要求 PR 审核和状态检查；仓库 Actions 设置只允许 GitHub 官方 Action。当前工作流仅使用已固定完整 commit SHA 的 `actions/checkout` 与 `actions/setup-node`。

## 6. 首次发布与验证

合并到 `main` 会自动发布，也可以在 Actions 页面手动运行 `Build and deploy Neon`。发布流程会：

1. 在隔离 Runner 上安装锁定依赖并构建。
2. 只传输生产制品，不传输 Git 凭据和应用密钥。
3. 停止 `neon` PM2 进程，把文件索引及其图片一起备份到 `${DEPLOY_PATH}/backups/`，校验成功后启动新 release。备份在停写期间完成，避免索引和原图来自不同时间。
4. 请求 `/healthz`；40 秒内失败会自动切回上一个 release。
5. 发布成功后保留最近 5 个 release；每个旧 release 的独立 `.data`、`public/uploads`、`upload`、`static` 都必须先归档并校验成功，才允许删除该 release。指向 `shared` 的上传软链接不会重复归档或删除其目标。

首次成功后，以发布用户执行 `pm2 save`，并按 `pm2 startup` 输出的一次性管理员命令配置开机恢复。确认站点、Socket.IO、MongoDB 读写、上传下载和反向代理都正常后，再销毁旧主机和旧凭据。

## 7. 部署数据备份与恢复边界

`scripts/deployment-data-backup.cjs` 使用 Node.js 内置模块，无需额外安装工具。备份保存在 `${DEPLOY_PATH}/backups/`，独立于 `shared` 和 `releases`，部署流程不会清理它们：

- `shared-<release-id>-<时间>-<随机值>/`：保存本次部署前的聊天、个人资料、漫游相册审核/分享、动态索引，以及相关原图和上传目录。遵循 `app.env` 中配置的文件和目录路径；不复制 `app.env`。此步骤发生在旧进程停止后、迁移和新进程启动前，失败会走回滚流程恢复旧版本。
- `release-<release-id>-<时间>-<随机值>/`：保存待清理 release 内遗留的独立业务数据，保持原目录结构。备份失败会立即停止后续清理，保留源 release；已经通过健康检查的新版本仍继续运行。
- 每个完成的备份包含 `manifest.json`，记录源路径、文件大小、SHA-256、缺失路径及跳过的共享软链接。复制后对照源文件校验，再同步到磁盘并原子改名；`.partial-*` 表示未完成的备份，不能作为清理源数据的依据。

部署在停服务前还会捕获旧 PM2 进程的文件存储配置。回滚恢复这些配置，并清除旧进程原本未设置的路径变量，使首次迁移失败时旧版仍读取原 release 的 `.data`，不会误读新建或只迁移一部分的 shared 数据。该捕获只保留文件存储路径白名单；若已有 previous release 却无法确认其运行环境，部署会在停服务前中止。

备份不会自动把旧审核记录、已删除照片或旧分享记录合并回线上数据。恢复时先保留当前状态，再根据索引、审核状态和图片哈希确认恢复范围；索引与对应原图应一起恢复。不要直接用整个历史索引覆盖当前索引，以免丢失后续新增数据或重新公开已删除内容。此流程备份应用文件存储，不包含 MongoDB；数据库和异机备份需分别保留。

本地验证命令：

```bash
node --test scripts/deployment-data-backup.test.cjs
```
