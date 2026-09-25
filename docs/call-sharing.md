# 通话共享

聊天中加入语音或视频通话后，点击底部共享图标，可共享屏幕、协作白板或文件。沿用当前最多 4 人的 WebRTC mesh 通话；同一通话只允许一个演示，结束后任何参会者都可开始新的共享。

## 传输与同步

- 屏幕：独立的第三条 WebRTC 媒体轨道，与麦克风、摄像头分开。信令携带稳定的屏幕流标识，避免协商生成的新接收器导致画面混入摄像头。停止浏览器共享、结束共享、挂断或离开房间都释放屏幕采集。当前共享画面，不采集系统音频，讲话继续使用麦克风。
- 白板：统一 1000 × 600 坐标，Socket.IO 同步笔迹与文字，每 80ms 最多发送一次正在绘制的笔迹。服务端合并不同人的操作，绑定真实作者；撤销只撤销自己的最后一笔，所有成员均可清空。清空增加 epoch，旧笔迹不能覆盖新画板。后加入的成员收到完整快照，修订号发现缺口时重新获取。共享者退出后，白板交给仍在通话的人。
- 文件：HTTP 上传一次，每个参会者用临时会话凭据读取，Socket.IO 同步共享者的页码和滚动比例。浏览端只能跟随，白板则允许所有人操作。文件读取、上传及指令均验证通话成员和房间权限；凭据不写入 URL、聊天消息或本地存储。
- 资源只保存在当前服务进程内存，结束共享、共享者离开或通话到期即释放。不会作为聊天附件永久保存。单文件 20 MB，文本 2 MB，服务内存资源与上传预约总额上限 100 MB；白板最多 400 项、24,000 点，每笔最多 512 点。

## 文件预览

| 文件 | 预览方式 |
| --- | --- |
| PNG / JPEG / GIF / WebP | 本地 Blob 图片 |
| PDF | 本地 PDF.js worker 渲染；共享者翻页、滚动 |
| PPT / PPTX | 服务端 LibreOffice 转 PDF，再使用同一 PDF 预览 |
| LOG / TXT | UTF-8 纯文本，长行换行 |
| MD / Markdown | Markdown 转换并清理后的静态排版 |
| HTML / HTM | 清理脚本、表单、事件、外部资源后的静态内容 |

HTML 不是完整网站运行环境：脚本交互、远程样式与远程图片不会执行或加载。PDF 不执行脚本，也不支持加密文档。PPT 转 PDF 后没有动画和嵌入视频；需要动画时请直接共享演示窗口。

## 浏览器与部署

屏幕发起依赖浏览器的 `getDisplayMedia`：需 HTTPS（localhost 开发例外）及用户点击授权；多数手机浏览器不提供发起能力，界面会禁用入口并说明，可以接收桌面共享。生产环境仍需已有 TURN 配置保证跨网络连接。参考 [MDN 屏幕采集接口](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)。

应用构建和生产使用 Node.js 24，与现有 GitHub Actions 一致。PDF.js 主库按需加载，worker、字体、CMap 和 WASM 从同源 `/call-preview-assets/` 提供，不依赖外部 CDN。反向代理需要放行 `/api/call-share/`、`/call-preview-assets/`、`/im`，上传限制至少 20 MB，上传/转换响应超时至少 90 秒；Permissions-Policy 不应禁止同源 `display-capture`。

PPT 功能需要服务器安装 LibreOffice Impress 及文档使用的字体，例如 Debian/Ubuntu 的 `libreoffice-impress`、`fonts-noto-cjk`。默认检测 `/usr/bin/libreoffice`、`/usr/bin/soffice` 和 Windows 标准安装目录；也可配置绝对路径：

```dotenv
CALL_SHARE_OFFICE_PATH=/usr/bin/libreoffice
```

可指向隔离转换包装程序（接收并传递相同参数）。转换在独立临时用户配置中运行，禁用不可信宏，超时 60 秒，一次只处理一个任务，完成后清理临时目录；生产转换进程应由无特权用户运行，限制外网访问。没有转换器时界面明确提示导出 PDF，不会假装已经支持原生 PPT。参考 [LibreOffice 命令行转换](https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html)。本次开发环境未安装 LibreOffice，实际 PPT 排版转换需在配置后的服务器验收。

## 验证

`pnpm test:sharing` 验证成员鉴权、多人绘画合并、作者校验、清空竞态、上传白名单与大小、文档命令同步和资源回收。`pnpm test:webrtc` 覆盖摄像头/屏幕分离、取消采集、权限拒绝及挂断竞态。`pnpm test:experience` 包含云传大小写查询验证。

构建后设置 `WEBRTC_SHARING_ONLY=1` 运行 `pnpm test:webrtc:browser`（Playwright 环境见 `planet-calls.md`），会创建临时本地服务，验证三种手机尺寸的小游戏弹窗、三人白板、图片、PDF 两页真实渲染、Markdown、恶意 HTML 清理、日志滚动、真实 WebRTC 屏幕传输与小窗挂断。屏幕和摄像头均为合成测试流，不采集真实桌面。手机模拟不能代替真机 Safari/Android 和生产 TURN 验收。
