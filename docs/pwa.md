# PWA 外观与安装

安装信息由 `src/app/manifest.ts` 提供，Next.js 自动生成 `/manifest.webmanifest`
并在页面中插入 manifest 链接。应用使用 `standalone` 模式，从 `/` 启动，
`scope: '/'` 覆盖云传、星球和漫游相机等站内页面。

## 主题与窗口栏

- `src/lib/pwa.ts` 保存安装时的默认色与浅色、深色原生栏颜色，应与
  `src/styles/index.css` 中的 `--background` 一起维护。
- 根布局输出带系统浅色/深色媒体查询的 `theme-color`，在 JavaScript 加载前提供默认值。
- `BrowserThemeSync` 根据 `next-themes` 的实际主题更新原生栏颜色，覆盖手动选择与系统主题不一致的情况。
- iOS 使用 `appleWebApp` 的独立窗口与默认状态栏样式，配合 `viewport-fit=cover`
  和安全区留白。桌面窗口按钮、系统状态栏的最终样式仍由操作系统与浏览器控制。

## 图标

`public/icons/soul.svg` 是普通图标源文件；`soul-maskable.svg` 是满版不透明、
主体保留在中心安全圆内的自适应图标源文件。更改后运行：

```bash
node scripts/generate-pwa-icons.cjs
```

脚本使用 Next.js 随附的 Sharp，生成 192/512 PNG、Android maskable 图标、
180px Apple 主屏图标、32px favicon 和包含 16/32/48px 图层的 ICO。
产物随代码发布，浏览器不需要运行时生成图标。

## 验收

1. 运行 `pnpm lint` 和 `pnpm build`；用 HTTPS 站点或 localhost 验证安装。
2. 在浏览器开发者工具的 Application → Manifest 检查名称、启动地址、颜色和全部图标。
3. 安装后分别切换浅色、深色、系统主题，检查窗口栏与页面背景。
   尤其检查“系统深色、手动浅色”和“系统浅色、手动深色”。
4. 在 Android 检查圆形/圆角裁切；在 iOS 从 Safari 添加到主屏幕，检查主屏图标、
   顶部操作区、底部输入框和横屏安全区。
5. 已安装应用可能保留安装时的图标和配置；发布后如果仍显示旧外观，移除旧安装，
   刷新网站后重新安装再验收。仅刷新页面不一定更新主屏图标。

此次配置覆盖安装与外观，没有注册 Service Worker，也没有缓存聊天、文件或 API 响应；
断网时仍需要恢复网络才能使用在线功能。

参考：[Next.js PWA 指南](https://nextjs.org/docs/app/guides/progressive-web-apps)、
[Manifest 与主题色](https://web.dev/learn/pwa/web-app-manifest)、
[Maskable 图标安全区](https://web.dev/articles/maskable-icon)、
[已安装应用的配置更新](https://web.dev/learn/pwa/update)。
