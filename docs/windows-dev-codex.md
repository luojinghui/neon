**Windows 本地开发：交给 Codex 执行的初始化任务**

适用场景：Git 仓库已克隆、已有 Node.js，本机没有 MongoDB；历史数据库、聊天、资料和附件都不迁移。本文件与 `scripts/setup-windows-dev.ps1`、`scripts/windows-dev.cjs` 一起放到目标 Windows 仓库。

给 Windows 上 Codex 的指令可以直接复制下面这段：

> 请读取并执行 docs/windows-dev-codex.md 的初始化流程。在当前 Windows 仓库安装本地 MongoDB、生成本地配置和管理员账号、初始化示例数据，然后启动开发服务并完成验收。允许下载官方 MongoDB 和必要的 Microsoft VC++ 运行库、安装项目依赖、创建独立本地数据库及本地文件。不迁移旧数据，不连接远程数据库。重复执行时保留已有本地密码和数据。最后告诉我访问地址、管理员账号/密码、日志位置和验收结果；不要把密码写进 Git 跟踪文件。

**默认结果**

| 项目 | 内容 |
| --- | --- |
| MongoDB | 固定官方 Windows x64 ZIP `7.0.43`，校验 SHA-256 后解压 |
| 数据库监听 | `127.0.0.1:27018`，仅本机，无数据库认证 |
| 数据库名 | `neon_windows_dev` |
| 网页地址 | `http://127.0.0.1:3000` |
| 管理后台 | `http://127.0.0.1:3000/admin` |
| 网页管理员 | `localadmin` |
| 网页管理员密码 | 首次随机生成，保存在 `.data/windows-dev/credentials.json` |
| 示例数据 | 一条有效期 7 天的云传文本，提取码 `wd`；若该码已有其他内容则跳过 |
| 应用配置 | `.env.windows.local`，由启动辅助程序在加载服务端代码之前读入 |
| MongoDB 文件 | `.data/windows-dev/mongo-data/` |
| MongoDB 安装目录 | `.data/windows-dev/mongodb-7.0.43/` |
| 日志 | `.data/windows-dev/logs/` |

网页管理员和数据库认证账号是两回事。本方案的独立开发数据库仅监听本机，因此不另设数据库密码；`localadmin` 是进入网站 `/admin` 的账号。MongoDB、网页都作为后台进程运行；未注册开机服务，电脑重启后重新执行脚本即可。

普通用户、房间、个人资料等由应用首次使用时生成。配置、安装包、数据库和生成密码都落在现有 `.gitignore` 覆盖的位置。脚本不改动原有 `.env.local`。

**Codex 执行步骤**

1. 确认终端是原生 Windows 的 64 位 PowerShell，工作目录为仓库根目录，三个文件均存在。不要在 WSL/Linux 中运行 Windows 安装脚本。检查 `node --version`：需要 x64 Node.js `>=20.9`，项目优先使用 `24.x`；版本不足时先报告缺少的运行条件。

2. 在仓库根目录执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-windows-dev.ps1
```

此处的执行策略参数仅针对本次 PowerShell 进程，不修改机器的全局策略。脚本通过 `npm.cmd exec` 使用固定的 pnpm `10.30.2` 安装锁定依赖，无需预装全局 pnpm。

脚本会自动检查 Microsoft Visual C++ x64 运行库，缺失时下载微软官方安装程序，验证 Microsoft 数字签名后启动安装。此步骤可能弹出 Windows UAC；若发生，提示用户完成系统确认。若安装要求重启，完成重启后重跑同一命令。不要尝试绕过操作系统确认。

3. 等待脚本报告 `Ready`。脚本会依次完成：配置生成、依赖安装、MongoDB 安装、数据库 ping、集合/唯一索引/TTL 索引初始化、管理员创建或校验、示例文本创建，以及开发服务健康检查。若执行失败，依据命令错误和日志定位后修复；不要因端口占用终止不属于本项目的进程。

4. 检查命令输出及日志，并执行下面的验收。每次 native 命令都需检查退出码；仅看到网页或 `/healthz` 成功不能代替数据库与账号验收。

```powershell
node .\scripts\windows-dev.cjs info
node .\scripts\windows-dev.cjs ping
node .\scripts\windows-dev.cjs seed
Invoke-RestMethod http://127.0.0.1:3000/healthz
```

第二次 seed 正常应显示 `admin: verified`、`sample: present`，不会更改密码或会话。还可以执行 `node --test scripts/windows-dev.test.cjs` 校验初始化逻辑。

5. 用浏览器打开管理页，从 `.data/windows-dev/credentials.json` 读取本地账号和密码，完成一次登录。然后打开 `/cloud`，用提取码 `wd` 读取欢迎文本；若 seed 返回 `skipped-code-in-use`，保留既有内容并记录这一结果。再打开 `/soul` 创建测试房间，确认连接正常。若无法操作浏览器，明确说明这几项尚未验收，不要把健康检查写成全部功能通过。

6. 最后给用户当前网站地址、管理页地址、账号、随机密码、云传示例提取码以及日志路径。密码只提供给本次用户或保留在忽略的本地文件，不输出到仓库文档、提交或公共日志。普通聊天和资料无需额外 seed。

**重复运行和日常调试**

同一条 PowerShell 命令可以在首次安装、安装中断后、电脑重启后再次执行。已校验的 MongoDB 安装会复用；运行中的项目 MongoDB 和网页进程会按 PID、可执行文件、命令行及监听端口确认归属后复用，不会启动重复实例。

如果初次配置前已经有端口占用，可选择其他端口，例如：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-windows-dev.ps1 -MongoPort 27019 -AppPort 3001
```

使用自定义端口后，之后重跑也要带上相同参数；访问地址相应改变。已有配置的端口不一致时脚本会停止，避免把初始化写入错误实例。不要通过删除数据库或重置密码来处理端口错误。

只安装、启动数据库并初始化，但不后台启动网页：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-windows-dev.ps1 -NoStart
node .\scripts\windows-dev.cjs serve
```

这种方式在前台查看开发日志，结束网页进程可按 `Ctrl+C`。需要后端断点时，将最后一行改为：

```powershell
node --inspect=127.0.0.1:9229 .\scripts\windows-dev.cjs serve
```

如果已存在后台网页进程，应先确认 `.data/windows-dev/app-process.json` 中的 PID 对应本项目 Node 进程再停止它，避免与前台进程抢占端口；不要使用 `taskkill /IM node.exe`。修改后端 CommonJS 文件后需要重启网页进程，前端仍有 Next 开发热更新。

`.env.windows.local` 是工具管理的配置，包含全部与本地存储相关的覆盖值。启动时会覆盖 shell 中遗留的生产 `NODE_ENV`、数据库和存储变量。此方案不要直接使用 `pnpm dev`，因为它不会自动加载专用的 `.env.windows.local`；使用 `node scripts/windows-dev.cjs serve`。

**失败时查看的位置**

| 情况 | 检查位置或处理 |
| --- | --- |
| 安装包下载失败 | npm registry、`fastdl.mongodb.org`、微软运行库下载网络；修复网络后重跑 |
| ZIP 校验失败 | 脚本会拒绝执行；检查下载是否完整，不跳过 SHA-256 校验 |
| VC++ 安装失败/UAC 被取消 | 完成系统安装确认后重跑；不要从不明来源复制 DLL |
| MongoDB 启动失败 | `.data/windows-dev/logs/mongo.log`、`mongo.stderr.log` |
| 应用启动失败 | `.data/windows-dev/logs/app.stderr.log`、`app.stdout.log` |
| 端口被其他程序占用 | 保留对方进程；首次配置前使用其他端口 |
| 管理员已有但密码不匹配 | 脚本会停止并保留账号；检查原 `credentials.json` 是否丢失/被修改，以及是否手动改过账号 |
| 重新移动了项目目录 | 配置和进程归属绑定原路径；不要继续用旧的运行状态文件，应由 Codex检查并重新配置，保留原数据 |
| 微笑识别/默认头像/动态表情失败 | 分别检查 `cdn.jsdelivr.net`、`storage.googleapis.com`、`api.dicebear.com`、`fonts.gstatic.com` 的浏览器访问 |

脚本面向 Windows x64。MongoDB 7.0 当前官方支持列表包括 Windows 11、Server 2019/2022；Windows ARM64/32 位不适用，Windows 10 不在该官方支持列表中。依赖下载、首次安装运行库、旧 CPU 的 MongoDB 指令集支持仍取决于目标电脑，不能只凭 Node 已安装判断完整环境可运行。见 [MongoDB Windows 安装要求](https://www.mongodb.com/docs/v7.0/tutorial/install-mongodb-on-windows-zip/)。

MongoDB 版本与校验值来自 [官方发布元数据](https://downloads.mongodb.org/current.json) 和 [对应 ZIP 校验文件](https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-7.0.43.zip.sha256)；VC++ 运行库来源为 [Microsoft 官方下载说明](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist?view=msvc-170)。

这份自动化脚本在当前 macOS 工作区编写。已通过 13 项 Node 自动化测试，以及独立 MongoDB 7.0.11、临时项目和随机端口的真实集成测试：初始化与重复执行、索引、密码/会话保留、错误连接拒绝、生产环境变量覆盖、健康检查、管理员登录、云传示例读取均通过。测试创建的进程及临时数据已清理。Windows ZIP 7.0.43、运行库/UAC 和 PowerShell 后台启动尚未在 Windows 主机实测，仍需在目标电脑完成上述验收。
