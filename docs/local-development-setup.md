# Neon 本地开发配置清单

适用于新电脑准备开发环境，以及按需迁移已有开发数据。本文按仓库代码与配置维护；安装后需在目标电脑完成第 9 节验收。

完整本地开发需要：**Git、Node.js 24.x、pnpm 10.30.2、MongoDB、项目目录写权限，以及支持所测功能的浏览器**。Next、Express、Socket.IO 由同一个 Node 进程启动；业务 API 和网页同源。

如果是 **Windows、已安装 Node、已克隆仓库且不迁移历史数据**，可直接使用 [Windows 自动初始化任务](windows-dev-codex.md)，由脚本安装本地 MongoDB、生成账号及配置并启动开发服务。

下面以 `127.0.0.1:27017/neon_test` 为独立本地开发数据库示例，不需要复用其他电脑或远程服务。

**1. 必装软件与服务**

| 勾选 | 项目 | 配置要求 |
| --- | --- | --- |
| [ ] | Git | 能克隆仓库；使用 SSH 克隆时给新电脑配置自己的 Git SSH key，HTTPS 克隆则使用相应访问方式。 |
| [ ] | Node.js | 选 `24.x`，与 CI 一致。安装适合新电脑系统及 CPU 架构的版本。 |
| [ ] | pnpm | 使用项目指定的 `10.30.2`。 |
| [ ] | npm 包 | 在新电脑执行 `pnpm install --frozen-lockfile`，包括开发依赖。 |
| [ ] | MongoDB | 完整调试云传和管理后台必需。本文示例使用 `7.0`；应用没有统一锁定数据库版本，Windows 初始化脚本另有固定版本。 |
| [ ] | 浏览器 | 使用支持 WebSocket、Canvas、WebAssembly、媒体采集等能力的浏览器，例如当前版本 Chrome/Edge；相机和录音还需要对应硬件。 |
| [ ] | 本地目录权限 | 能创建、写入、重命名项目下的 `.next/`、`.data/`、`upload/` 和 `public/uploads/` 文件。 |

Node 24 来自 CI 配置；锁文件中的 PDF.js 要求 Node `>=22.13.0 || >=24`，不能只按 Next 自身的最低 Node 版本安装。Next、React、TypeScript、Express、Mongoose、Socket.IO、MediaPipe 等均由 pnpm 安装，无需分别全局安装。

安装依赖，在项目根目录执行：

```sh
node --version
corepack enable
corepack prepare pnpm@10.30.2 --activate
pnpm --version
pnpm install --frozen-lockfile
```

若 Node 安装中没有 `corepack`，可改用 `npm install -g pnpm@10.30.2`，再执行依赖安装。项目没有私有包源配置或必须填写的 npm token。网络需能访问所用 npm registry；不要复制旧电脑的 `node_modules/` 或 `.next/`，其中包含与系统和 CPU 架构有关的 SWC、Sharp 文件。

项目没有 Dockerfile、Compose、devcontainer、`.nvmrc` 或 `.node-version` 来自动准备环境。上述版本依据见 [package.json](../package.json)、[pnpm-lock.yaml](../pnpm-lock.yaml)、[CI 配置](../.github/workflows/nextjs.yml)。

**2. 准备 MongoDB，任选一种方式**

方式 A：在新电脑安装 MongoDB Community 并启动服务，监听 `127.0.0.1:27017`。macOS 可按 [MongoDB 7.0 官方安装说明](https://www.mongodb.com/docs/v7.0/tutorial/install-mongodb-on-os-x/) 执行：

```sh
brew tap mongodb/brew
brew install mongodb-community@7.0
brew services start mongodb-community@7.0
```

Windows/Linux 可按 [MongoDB 官方安装入口](https://www.mongodb.com/docs/manual/administration/install-community/) 选择对应系统，或使用下面的 Docker 方式。

方式 B：如果已安装并启动 Docker，在本机创建独立开发数据库。以下单行命令适用于常见 shell；Windows Docker Desktop 使用 Linux containers：

```sh
docker run -d --name neon-mongo --restart unless-stopped -p 127.0.0.1:27017:27017 -v neon-mongo-data:/data/db mongo:7.0
docker exec neon-mongo mongosh --quiet --eval 'db.adminCommand({ ping: 1 })'
```

预期看到 `ok: 1`。容器已有但被停止时执行 `docker start neon-mongo`，不必重复 `docker run`。如果宿主机 27017 已被占用，可将映射改为 `127.0.0.1:27018:27017`，并同步修改应用连接端口。

该示例是只映射本机回环地址的无密码开发库，数据保存在 Docker volume 中；不要把无认证端口改为对外开放。镜像参数、存储路径和支持架构见 [Docker 官方 Mongo 镜像说明](https://hub.docker.com/_/mongo)。

应用主要使用以下集合：

| 集合 | 内容 |
| --- | --- |
| `cloudmessages` | 云传文本、文件元数据、提取码和过期时间 |
| `admin_users` | 管理员、密码摘要和会话 |
| `admin_audit_logs` | 管理操作审计 |

没有 SQL 初始化脚本，也没有必须手动建表的步骤；模型初始化/首次写入负责创建集合及索引。云传记录使用过期索引，已有过期内容不能当作迁移后必须可用的测试数据。

如果使用带认证的数据库：URI 写成 `mongodb://APP_USER:URL_ENCODED_PASSWORD@HOST:27017/neon_test?authSource=admin`；用户应在 `admin` 认证库创建，并具有目标业务库的读写和建集合/索引权限。当前公共连接函数显式传入 `authSource: 'admin'`，因此不要直接套用认证库不同的账号。密码含 URI 特殊字符时需 URL 编码。数据库用户名与网页管理员用户名是两套账号。

依据：[数据库连接](../src/server/models/index.js)、[云传模型](../src/server/models/cloud.js)、[管理员模型](../src/server/models/admin.js)。

**3. 新建本地配置，并在进程启动前加载**

`.env.local` 被 Git 忽略，新克隆不会有。在项目根目录手工创建，使用下面的最小配置即可：

```dotenv
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/neon_test
APP_HOST=127.0.0.1
APP_PORT=3000
```

数据库名也可以改成 `neon_dev` 等独立名称。若从 `.env.example` 复制，必须替换示例 URI，并删掉无用的 `ALLOWED_ORIGINS='https://example.com'` 占位配置。旧的 `config.js` 已被 Git 忽略，当前运行源码不再引用它；无需迁移其 `db` / `wxToken`，复制它也不能代替 `MONGODB_URI`。

**推荐统一使用以下启动命令，macOS、Linux、Windows 均可：**

```sh
node --env-file=.env.local src/server.js
```

原因：`src/server.js` 会先加载文件仓库、读取端口/CORS，之后才调用 Next 的 `.prepare()` 加载 `.env.local`。直接 `pnpm dev` 时，延迟读取的变量（如 `MONGODB_URI`）可能生效，但端口、监听地址和仓库路径会在加载前取默认值。提前通过 Node 加载可以避免配置遗漏及服务端/API 使用不同存储位置。

普通管理员脚本也不自动加载 `.env.local`，同样使用 `--env-file`。Node 的这个参数在入口 JS 执行前加载变量；已有 shell 环境变量优先于文件，因此若配置不生效，也需检查终端是否已设置同名变量。见 [Node 24 CLI 文档](https://nodejs.org/download/release/v24.13.1/docs/api/cli.html#--env-filefile)。

所有运行命令都从项目根目录执行。源码大量使用 `process.cwd()` 定位文件；不要进入 `src/` 后再启动。

**4. 应用环境变量**

普通本机开发除数据库连接外可保留默认值；通话、代理诊断及 PPT 共享按对应功能补充配置。统一在 `.env.local` 中配置并用上述命令加载。

| 变量 | 默认值/用途 | 是否需要手配 |
| --- | --- | --- |
| `NODE_ENV` | 非 `production` 时为开发模式 | 本地明确填 `development` |
| `MONGODB_URI` | 无默认；MongoDB 连接 | 完整功能必填 |
| `APP_HOST` | `127.0.0.1` | 手机/局域网访问时改 `0.0.0.0` |
| `APP_PORT` | `3000` | 端口冲突时改；不是 `PORT` |
| `ALLOWED_ORIGINS` | 空；Socket.IO 跨域来源，多个用逗号分隔 | 同源开发不填；不是通用 API 跨域开关 |
| `CLOUD_TRUSTED_PROXIES` | 空；云传网络诊断仅使用 TCP 对端地址 | 经可信反向代理测试来源 IP 时配置代理 IP/CIDR；同机代理可用 `loopback` |
| `WEBRTC_STUN_URLS` | `stun:8.137.55.241:3478`；与云传共用默认 STUN 地址，多个用逗号分隔 | 可覆盖为其他可达服务 |
| `WEBRTC_TURN_URLS` | 空；通话 TURN 地址，多个用逗号分隔 | 跨网络通话需配置可达中继 |
| `WEBRTC_TURN_SECRET` | 空；coturn 的共享认证密钥 | 配置 TURN 时必填，仅存服务端本地环境文件 |
| `WEBRTC_RELAY_ONLY` | `false`；仅值为 `true` 时强制中继 | 验收 TURN 时设 `true`，需同时配置 TURN |
| `CALL_SHARE_OFFICE_PATH` | 空；自动检测常见 LibreOffice 安装路径 | 通话 PPT/PPTX 共享需安装 LibreOffice，非标准位置填绝对路径 |
| `NEON_RELEASE_ID` | `development`；健康检查返回的发布标识 | 本地不用填 |
| `SOUL_CHAT_DATA_FILE` | `.data/soul-chat.json` | 星球、私信、好友收藏和已读游标，通常不用改 |
| `USER_PROFILE_DATA_FILE` | `.data/user-profiles.json` | 用户资料，通常不用改 |
| `DOODLE_SHARE_DATA_FILE` | `.data/doodle-shares.json` | 涂鸦分享索引，通常不用改 |
| `DOODLE_UPLOAD_DIRECTORY` | `public/uploads/doodle` | 涂鸦分享图片，建议保持默认 |
| `DOODLE_REVIEW_DATA_FILE` | `.data/doodle-reviews.json` | 涂鸦审核索引，通常不用改 |
| `DOODLE_REVIEW_UPLOAD_DIRECTORY` | `.data/doodle-review-images` | 审核原图/处理图，通常不用改 |
| `MOMENT_DATA_FILE` | `.data/moments.json` | 心迹/动态索引，通常不用改 |
| `MOMENT_UPLOAD_DIRECTORY` | `public/uploads/moments` | 心迹图片/视频/语音，通常不用改 |
| `ADMIN_SEED_USERNAME` | 无默认；管理员初始化/检查脚本使用 | 初始化可交互输入；检查需传 `--username` 或此变量 |
| `ADMIN_SEED_PASSWORD` | 无默认；仅管理员初始化脚本使用 | 推荐交互输入，无需持久保存 |

云传 `upload/`、聊天 `public/uploads/soul/`、个人资料 `public/uploads/profile/` 的路径由代码固定，没有相应环境变量。默认路径相对于项目根目录；若沿用旧电脑的绝对路径，必须改成新电脑的实际路径。

`DOODLE_UPLOAD_DIRECTORY` 改到 `public/` 之外后，分享 URL 仍为 `/uploads/doodle/...`，当前服务没有为任意自定义涂鸦目录增加静态映射；本地保持默认最直接。心迹自定义目录则已有 Express 映射。

`CLOUD_TRUSTED_PROXIES` 只影响云传网络诊断，按实际代理拓扑配置。云传 ICE 探测与星球通话共用 STUN 默认值，`WEBRTC_STUN_URLS` 只覆盖通话的配置，不影响云传；见 [云传网络探测](cloud-network-diagnostics.md)、[通话配置](planet-calls.md) 与 [通话共享](call-sharing.md)。STUN 只提供地址发现，不能保证任意跨网络通话成功。

**5. 初始化网页管理员**

仅调试普通用户功能时可先跳过；要使用 `/admin` 则在 MongoDB 启动后执行：

```sh
node --env-file=.env.local scripts/seed-admin.js --username=localadmin
node --env-file=.env.local scripts/verify-admin-db.js --username=localadmin
```

第一个命令会提示输入密码；账号至少 3 个字符，密码 8–128 个字符。没有内置默认管理员密码。第二个命令确认账号、角色、密码摘要格式，并创建/核实用户名唯一索引。之后到 `http://localhost:3000/admin` 登录。

如果已经恢复了旧数据库并知道原管理员密码，不需要重复 seed：seed 按用户名更新或创建账号，会重设该账号密码并清除原会话。`pnpm seed:admin` / `pnpm verify:admin-db` 也可用，但前提是已在 shell 注入所需变量。

依据：[初始化脚本](../scripts/seed-admin.js)、[检查脚本](../scripts/verify-admin-db.js)、[密码及会话](../src/server/admin/auth.js)。

**6. 本地文件、旧数据和浏览器身份**

全新开发不必拷贝历史数据。程序在首次保存/上传时按需建立目录；不要预建空白 JSON 文件。

| 要保留的功能数据 | 应迁移的内容 |
| --- | --- |
| 云传及管理员 | MongoDB 中的业务数据库；云传附件还要配套复制 `upload/` |
| 星球、私信、好友收藏和已读游标 | `.data/soul-chat.json` + `public/uploads/soul/`；配套保留个人资料库以延续用户映射 |
| 个人资料、头像、背景 | `.data/user-profiles.json` + `public/uploads/profile/` |
| 涂鸦审核 | `.data/doodle-reviews.json` + `.data/doodle-review-images/` |
| 涂鸦分享 | `.data/doodle-shares.json` + `public/uploads/doodle/` |
| 心迹/动态 | `.data/moments.json` + `public/uploads/moments/` |
| 自行补充的静态内容 | 若原电脑实际使用 `static/`，也需另行复制；空白开发不需要它 |
| 本机配置 | 重建 `.env.local`，并校正数据库地址及自定义绝对路径 |

上述配置和运行数据被 `.gitignore` 排除，不会随 clone 到新电脑。如果设置过存储路径覆盖变量，复制其实际指向的位置。迁移前停止旧应用写入，索引与图片/附件成套复制；不要迁移运行中的 `.lock` 或临时文件。仅恢复数据库无法恢复聊天/动态，仅复制 JSON 无法恢复附件。通话状态及通话共享文件仅在进程内存中保存，不属于可迁移的历史数据。

迁移 MongoDB 需要额外安装 MongoDB Database Tools（`mongodump`、`mongorestore`）；这不是空白开发必需工具。对于上面无认证、同名的开发库，可在旧电脑导出，并在新电脑的空开发库恢复：

```sh
# 旧电脑执行，再将生成的归档文件带到新电脑
mongodump --uri="mongodb://127.0.0.1:27017/neon_test" --archive=neon-test.archive.gz --gzip

# 新电脑执行；目标应为准备用于迁移的空开发库
mongorestore --uri="mongodb://127.0.0.1:27017/neon_test" --archive=neon-test.archive.gz --gzip --nsInclude="neon_test.*"
```

若数据库名称、认证或端口不同，需要调整命令。项目的部署文件备份脚本不包含 MongoDB 和环境配置，不能代替以上迁移。

**用户身份还保存在浏览器里。** `localStorage` 的 `neon:browser-identity:v1` 保存普通用户 UUID，旧版键为 `soul:guest-user`；云传历史和聊天缓存也保存在浏览器。新电脑、新浏览器、新端口，甚至从 `localhost` 换成 `127.0.0.1` 都可能成为新身份。只迁移后端数据不会自动成为旧内容的作者；若确实要延续测试身份，需要同时迁移本人原站点对应的浏览器数据。管理员则重新登录即可。

建议固定一种开发访问地址，例如始终使用 `http://localhost:3000`，并用无痕窗口/另一个浏览器模拟第二个普通用户。多个应用进程不要共用同一套聊天和资料 JSON；如需并行启动，分别配置数据路径。

依据：[Git 忽略规则](../.gitignore)、[浏览器身份](../src/app/profile/client.ts)、[部署备份说明](secure-deployment.md)。

**7. 外网资源与浏览器权限**

| 勾选 | 条件 | 影响的功能 |
| --- | --- | --- |
| [ ] | 同源 `/mediapipe/0.10.35/` 资源可访问 | 微笑识别、相机编辑和通话画面效果的模型及 WASM |
| [ ] | 浏览器可访问 `api.dicebear.com` | 默认头像 |
| [ ] | 浏览器可访问 `fonts.gstatic.com` | 聊天动态 GIF 表情 |
| [ ] | STUN/TURN 地址可达 | 云传 ICE 探测及跨网络音视频通话 |
| [ ] | 允许摄像头 | 漫游相机拍照、微笑快门、视频通话 |
| [ ] | 允许麦克风，录音支持 `MediaRecorder` | 心迹语音录制及语音/视频通话 |
| [ ] | 浏览器支持并允许 `getDisplayMedia` | 发起屏幕共享；手机浏览器可能只能接收 |
| [ ] | 允许定位 | 心迹获取经纬度 |
| [ ] | 允许对应剪贴板操作 | 复制文本、分享链接等 |

MediaPipe 在浏览器本地执行；微笑识别先尝试 GPU，失败回退 CPU。模型、WASM 和 loader 已随仓库保存在 `public/mediapipe/0.10.35/`，运行时无需访问外部模型站点，也不需要 AI API key、CUDA 或推理服务器。`vision-sw.js` 与浏览器 Cache API 按需缓存同源人像资源；首次使用仍需从本地应用加载，缓存不可用时回退网络。资源缺失或需重新生成时运行 `pnpm prepare:vision`，该准备步骤需要下载官方模型；详见 [相机资源说明](experience-camera.md)。

上述摄像头等能力要求安全上下文：本机可以用 `http://localhost:3000` 或回环 IP；手机打开普通 `http://电脑局域网IP:3000` 时，页面能打开也不代表摄像头、录音、定位和剪贴板可用。跨设备测试这些功能应准备浏览器信任的 HTTPS。参见 [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) 与 [安全上下文](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts)。

业务 API 使用同源 `/api/...`，没有必须填写的 `NEXT_PUBLIC_*` 或前端 API base URL。定位不需要地图 key。聊天附件的 DOCX 预览用 `mammoth`，PDF 用浏览器，旧 `.doc`、Excel、PowerPoint 附件不支持在线预览。通话共享是另一条流程：PDF 使用同源 PDF.js 资源；PPT/PPTX 需安装 LibreOffice Impress 与所需字体，或先导出 PDF 再共享，详见 [通话共享](call-sharing.md)。

依据：[模型地址](../src/app/doodle/smileDetector.ts)、[媒体采集](../src/app/moments/components/MomentComposer.tsx)、[聊天传输](../src/app/soul/core/socketTransport.ts)、[文档预览](../src/app/soul/[roomId]/components/FilePreviewModal.tsx)。

**8. 手机、局域网、断点和生产模式调试**

手机/第二台电脑访问时，在 `.env.local` 中改 `APP_HOST=0.0.0.0`，重启应用，并允许本机防火墙上的应用端口；访问 `http://电脑局域网IP:3000`。同源访问仍不需要填写 `ALLOWED_ORIGINS`。需要 HTTPS 功能时，可增加带受信任证书的本地反向代理，仓库没有现成开发证书配置。

HTTP、API 和 Socket.IO 共用 3000 端口，Socket.IO 路径为 `/im`。反向代理需转发整个站点及 WebSocket Upgrade，保留正确的 Host/Origin；仅给 Socket.IO 加 CORS 不能完成管理 API 的跨域联调。若测试大文件，代理的请求体上限与超时也要相应调整，心迹接口允许的单次上传总量可到 140 MiB。

分享链接由当前页面地址生成。用 `localhost` 打开的页面生成的分享链接只能在相应本机使用；跨设备分享需从双方可达的地址打开页面再生成。

后端断点启动：

```sh
node --inspect=127.0.0.1:9229 --env-file=.env.local src/server.js
```

用编辑器 Node 调试器附加 9229 端口；前端用浏览器开发者工具。项目没有现成 `launch.json`，也没有 nodemon / `node --watch`。Next 前端支持开发编译和热更新，但修改 `src/server.js` 及其直接加载的后端 CommonJS 模块后要手动重启。

需要模拟生产时先 `pnpm build`，然后明确设置 `NODE_ENV=production`。macOS/Linux：

```sh
NODE_ENV=production node --env-file=.env.local src/server.js
```

Windows PowerShell：

```powershell
$env:NODE_ENV = 'production'
node --env-file=.env.local src/server.js
# 结束生产调试后，在继续本地开发前清除覆盖值
Remove-Item Env:NODE_ENV
```

生产模式管理员 Cookie 有 `Secure` 标记；普通 HTTP 开发请保留开发模式。不要同时让 dev/build/production 进程争用同一个 `.next/`，需要切换时先停止当前服务。

**9. 安装后验收清单**

启动 MongoDB 和应用后逐项检查：

- [ ] 打开 `http://localhost:3000/healthz`，返回 `status: "ok"`。这只证明 Web 进程已启动，**不证明 MongoDB 已连接**。
- [ ] 打开 `/cloud`，保存并取回一段文本，再上传并下载一个文件，验证 MongoDB 与 `upload/`。
- [ ] 打开 `/admin`，使用初始化的管理员登录，验证账号、会话及管理 API。
- [ ] 打开 `/profile`，修改资料并上传头像，刷新后确认保留。
- [ ] 两个浏览器身份进入同一 `/soul` 房间，双向发消息和附件，检查 `/im` 连接。
- [ ] 从个人主页发私信、收藏好友，检查未读提醒及刷新后的历史。
- [ ] 打开 `/moments`，发布图文、录音、评论，再重启应用确认持久化。
- [ ] 打开 `/doodle`，测试摄像头、手动/微笑快门、分享；审核功能用管理员验证。
- [ ] 若涉及通话，两个浏览器身份验证双向音视频、屏幕/文档共享和挂断释放设备；跨网络另验收 TURN。
- [ ] 若涉及手机，单独验收 HTTPS、相机/麦克风权限、附件和分享链接。

现有质量检查命令如下，可按改动范围执行；自动化测试使用临时目录或模拟依赖，不代替目标环境的真实数据库与浏览器验收，Socket 测试需允许本机随机端口监听：

```sh
pnpm lint
pnpm test:admin
pnpm test:soul
pnpm test:profile
pnpm test:social
pnpm test:moments
pnpm test:doodle
pnpm test:webrtc
pnpm test:sharing
pnpm test:video-effects
pnpm test:experience
node --test scripts/cloud-network.test.cjs
node --test scripts/deployment-data-backup.test.cjs
pnpm build
```

浏览器回归可按 [通话文档](planet-calls.md) 配置 Playwright 后运行 `pnpm test:webrtc:browser` 或 `pnpm test:video-effects:browser`。Windows 初始化逻辑另有 `node --test scripts/windows-dev.test.cjs`。这些命令是验收步骤；本文不代表它们已在目标电脑执行通过。

**10. 按需工具与已发现的文档差异**

| 项目 | 什么时候才需要 |
| --- | --- |
| Docker | 选择容器方式运行 MongoDB 时 |
| MongoDB Compass / mongosh | 希望图形化或命令行查看开发库时 |
| MongoDB Database Tools | 搬迁已有数据库时 |
| LibreOffice Impress 与文档字体 | 通话中共享原生 PPT/PPTX 时 |
| STUN/TURN 服务 | 云传网络诊断及跨网络通话；TURN 需单独部署和配置 |
| HTTPS 证书、Nginx/Caddy 等代理 | 跨设备安全上下文测试或模拟生产入口时 |
| OpenSpec CLI | 使用仓库 `/opsx:*` 工作流时；它不在项目依赖中，也没有锁定版本 |
| Prettier/编辑器格式化扩展 | 希望按 `prettier.config.js` 格式化时；项目有配置但没有 Prettier 依赖 |
| PM2、SSH、GitHub production Secrets | 运行生产自动部署时，见 [安全部署说明](secure-deployment.md) |

基础聊天、云传和动态功能没有 Redis、MySQL、对象存储、消息队列、独立 WebSocket 或 AI 服务依赖。编辑器里残留的 `cmake.configureOnOpen` 不代表需要 CMake。PWA 图标已经在仓库中；修改图标时才运行 `node scripts/generate-pwa-icons.cjs`，它使用 Next 的 Sharp 依赖。人像资源已有专用 Service Worker 缓存，但没有全站离线能力，聊天和 API 仍需要应用服务可达；不需另起 PWA 服务。

现有 `CLAUDE.md` 部分内容已落后于源码：

| 旧说明 | 当前代码 |
| --- | --- |
| Next 15.2.6 | `package.json` 是 15.5.24 |
| 用 `PORT` 改端口 | 读取 `APP_PORT` |
| Socket.IO 固定 `cors: true` | 仅在 `ALLOWED_ORIGINS` 非空时配置 |
| `pnpm dev` 自动启用 polling watcher | 当前脚本及配置没有这项设置 |
| `pnpm start` 是生产模式 | 它和 `pnpm dev` 都是 `node ./src/server.js`，模式取决于启动前的 `NODE_ENV` |

`pnpm start:prd` 使用 POSIX 环境变量前缀，原生 Windows 应使用前面给出的 PowerShell 命令。不要用 `next dev` / `next start` 替换自定义入口，否则会缺少 Socket.IO、Express 管理接口和健康检查。生产 CI 依赖 Linux shell、`/proc` 等，不能当作新电脑开发启动脚本使用。
