# 浏览器消息推送

打开云传 `/cloud`、心迹 `/moments`、星球 `/soul`（含子页面）时，支持 Web Push 的安全上下文会显示开启通知提示。用户点击“开启通知”后调用浏览器授权，再将订阅与当前浏览器 UUID 关联保存。已授权用户在访问这些页面或页面重新可见时自动同步订阅；已拒绝用户不会再次弹授权申请。关闭提示后 7 天内不再展示。

浏览器要求通知授权由用户手势触发，因此页面打开时展示提示，点击后才弹出系统授权框。iPhone/iPad 需将网站添加到主屏幕，并从主屏幕打开支持 Web Push 的 Web App；不支持的浏览器不展示提示。除 localhost 外需要 HTTPS。

后台 `/admin`：

- “人员数据”展示注册时记录的完整 User-Agent（悬浮查看）；历史资料和后台创建的资料显示“未记录”。后续访问或编辑不会覆盖注册 User-Agent，该字段不会通过公开资料接口返回。
- “消息推送”显示用户订阅及各浏览器 User-Agent、有效状态和订阅时间。
- 可选择指定用户或全部已订阅用户，填写标题、正文和点击后打开的站内路径（支持查询参数和具体星球地址）。预览后发送。
- 最近 100 批发送记录包含发送人、页面、目标人数、提交成功、失败和失效订阅数。成功表示浏览器厂商推送服务已接收，不表示终端已展示或用户已阅读。
- 推送服务返回 404/410 时删除失效订阅；删除用户时同步清理订阅。
- 发送过程中重启服务器可能中断该批通知；超过批次预计耗时后显示“中断，结果未知”，不会自动重发以免重复通知。

服务端使用 `web-push` 和 VAPID。未设置环境密钥时，首次访问自动生成密钥，并与订阅、发送记录一起写入 `web-push.json`；默认位于 `USER_PROFILE_DATA_FILE` 同目录，生产部署会随用户数据保存在 shared 目录并纳入备份。也可用绝对路径 `WEB_PUSH_DATA_FILE` 覆盖。文件按 0600 权限原子写入，密钥不能放入 public 或 Git。

可选环境变量（参见 `.env.example`）：

```dotenv
WEB_PUSH_DATA_FILE=/home/neon-deploy/apps/neon/shared/user-data/web-push.json
WEB_PUSH_SUBJECT=https://luojh.com
WEB_PUSH_VAPID_PUBLIC_KEY=
WEB_PUSH_VAPID_PRIVATE_KEY=
```

`WEB_PUSH_SUBJECT` 设为运营方可访问的 HTTPS 联系地址或 `mailto:` 地址。若手工配置密钥，必须成对提供并长期保持不变；更换密钥需要浏览器重新订阅，页面访问时会尝试完成更新。务必保留生成的存储文件，避免部署或重启后密钥丢失。

服务器需能出站访问浏览器厂商的推送服务（Google FCM、Mozilla、Apple、Windows WNS）。订阅接口仅接受这些服务的 HTTPS 地址，不允许客户端传入任意网络目标。发送端点位于现有后台会话和同源校验之后。

本地验证：`pnpm test:profile`、`pnpm test:push`、`pnpm lint`、`pnpm build`。构建后可运行 `pnpm test:push:browser`（需 Playwright；可用 `PLAYWRIGHT_MODULE_PATH` 和 `PUSH_BROWSER_EXECUTABLE` 指定本地依赖及浏览器）。自动化验证使用隔离数据和模拟推送传输，不会给真实用户发消息；真实送达需用 HTTPS 站点、支持 Web Push 的浏览器授权订阅后，在后台选择自己的用户发送。

参考：[MDN 通知授权](https://developer.mozilla.org/en-US/docs/Web/API/Notification/requestPermission_static)、[MDN 推送订阅](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe)、[Web Push Node.js 库](https://github.com/web-push-libs/web-push)、[WebKit iOS Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)。
