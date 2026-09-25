# 心迹、星球与漫游相机体验改版

## 交互方案

- 心迹删除入口统一显示“删除”，实际删除前保留确认；个人主页使用两列手机卡片、三列桌面卡片，提供全部 / 影像 / 随记筛选、记录与点赞统计，详情支持点赞和评论。
- 网站 CSS（含 Tailwind）中的 hover 统一经过 PostCSS，限制为 `(hover: hover) and (pointer: fine)`。Ant Design 的动态 CSS 使用同一策略。混合选择器保留 focus、active 和选中样式，手机点击不再留下 hover 外观。
- 星球列表使用内存 + localStorage 缓存，以浏览器身份 UUID 隔离，磁盘有效期 6 小时、最多 200 条。进入页面立即恢复缓存，连接后静默更新；错误时保留旧数据并提供重试。空列表也是有效缓存，旧会话和旧请求不能覆盖新结果。
- 漫游相机按“拍摄 / 选图 → 人像分析一次 → 实时调整角色 → 导出 / 分享”组织。设置分为脸部变身、立体配件、人像氛围、卡片文案，修改立即重绘，不再需要“应用到卡片”；随机变身同时组合脸部角色、配件、颜色、模板、心情和称号。

## 人像与 GPU 管线

`portrait/analyze.ts` 使用 MediaPipe Face Landmarker（最多 3 张脸）和 Selfie Multiclass 分割模型。五官关键点确定头部方向、贴纸位置，并保护眼睛和嘴唇；身体皮肤与面部皮肤的置信度控制提亮和柔化，人物置信度控制换背景和描边。

`portrait/renderer.ts` 与 ImageSegmenter 共用 WebGL2 canvas。在分割回调有效期内，直接读取借用的 `MPMask.getAsWebGLTexture()`，用一次 GPU 绘制把皮肤与人物遮罩合入自有 RGBA 纹理。之后关闭模型实例，保留自有遮罩与照片纹理；调整设置只更新 uniforms / 配件 buffer 并绘制，不重复推理，不把分割结果读回 CPU，也不逐像素处理照片。

- 第一遍绘制：受皮肤遮罩约束的 gamma 提亮、轻度双边柔化、漫画色阶、人物描边、三个背景主题。
- 脸部变身：使用 Face Landmarker 官方三角拓扑和当前照片的真实三维关键点构建网格，平滑顶点法线，并建立面部局部 UV。猫脸、狐狸、熊猫和漫画主角由 GPU 着色，五官开口平滑透明以保留眼睛、嘴巴与表情；浓度可调，也可与头饰组合。
- 配件绘制：原创猫耳、小熊、兔耳、触角、王冠、土星三角网格，使用关键点构建三维坐标基，配合法线光照和深度测试。支持颜色、大小、上下位置、旋转及多人目标选择。
- 根据配件投影范围自动保留头顶空间，卡片模板保留完整照片，空隙使用纯色 / 渐变填充。照片只绘制一次，GPU 也不再在边缘拉伸照片采样，避免重复人像；无需依赖部分 iOS WebView 不支持的 Canvas 模糊滤镜。
- 海报统一输出 1080 × 1440 JPEG；八套模板和八套配色保留，增加心情、宣言、签名和装饰，统一底栏避免与二维码、日期重叠。

GPU 不可用时仍可使用原图完成卡片排版与导出；找不到脸时禁用佩戴，分割失败时禁用美白与背景，但保留其他功能。模型实例在分析后关闭，结果替换或组件卸载时释放 GPU 资源。

分析发生在拍照后，不在预览视频的每一帧重复执行。微笑快门沿用已有检测节流，并复用同版本的本地模型资源。同步推理期间界面可能短暂忙碌，尚未将推理迁移至独立 Web Worker。

`portrait/livePreview.ts` 将输入合并到下一动画帧，直接更新预览 canvas；停止调节 250ms 后才编码 JPEG 并同步审核副本。新输入使旧编码失效，旧结果不能覆盖最新画面；保存 / 分享会先完成最新待处理设置。已有分享在修改时标记为待同步，避免复制旧版本链接。实测连续 31 次滑杆输入合并为 1 次 JPEG 编码，没有重复模型请求。

## 本地资源与 Service Worker

SDK 固定为 `@mediapipe/tasks-vision@0.10.35`，本地资源位于 `public/mediapipe/0.10.35/`。包含官方 revision 1 模型、SIMD / 非 SIMD WASM 与对应 loader，附 SHA-256 清单、来源及 Apache-2.0 许可证。

```sh
pnpm prepare:vision
pnpm test:experience
```

`vision-sw.js` 只拦截同源、版本化目录下的 GET 模型 / WASM / loader，使用 cache-first；在需要时加载资源，普通页面不会预下载全部模型。首次使用仍需下载当前设备所需的文件，后续访问优先使用持久缓存。`visionRuntime.ts` 额外缓存模型字节和加载 Promise，处理首屏尚未受 Service Worker 控制的情况。

Service Worker 需要 HTTPS 或 localhost；内置浏览器禁止 Service Worker / Cache API 或存储空间不足时继续使用网络加载。升级时同时调整 SDK、资源目录、runtime 和 Service Worker 版本，新版本激活仅清理旧的 `neon-vision-*` 缓存。

Service Worker 不缓存网页、接口、用户照片。人像推理在浏览器执行，原有卡片审核同步及显式分享接口仍沿用项目既有流程。localStorage 仅额外保存调节参数，不保存照片或人脸关键点。

Next.js 的构建缓存显式跟踪自定义 PostCSS 转换器，并更新缓存版本，避免本地或 CI 复用未添加 hover 限制的旧 CSS。`.gitattributes` 保持模型及 loader 字节不变，Windows 检出不会改变清单校验值。

## 验证

自动测试覆盖缓存身份隔离、过期与损坏恢复、网络失败保留列表、乱序请求、离开页面后的响应、两种 hover 转换、焦点和动画保留、网格与画面范围、设置约束、资源校验、Service Worker 缓存范围。运行 `pnpm test:experience`。

新增回归覆盖八种模板在不支持 Canvas filter 时只绘制一次原照片、实时预览合帧与过期编码丢弃、立即保存获取最新状态、人脸网格拓扑与五官开口。浏览器还验证四款面具、连续调节、保存 / 分享和无 GPU 降级。

浏览器回归使用本地页面和接口桩数据，覆盖个人心迹筛选 / 详情 / 删除入口、手机 CSS 审计、缓存星球离线展示；真实人像完成模型推理、GPU 分割、美白、六种贴纸、圆形模板和 JPEG 导出。新页面在阻断模型网络请求后仍可从缓存完成分析。Chromium 与 WebKit 手机视口验证无 WebGL2 时的卡片降级路径。

生产版本通过 Chromium 桌面 / 触摸及 WebKit 触摸页面回归，包含全部已加载 CSS 的 hover 媒体条件审计；模拟摄像头验证授权、视频流、拍照、无脸提示和导出。已有视频播放器在桌面及手机视口下回归了封面、原始比例、播放 / 暂停 / 拖动、互斥播放、全屏和失败重试。

另运行 TypeScript 检查、ESLint、生产构建以及 `test:soul`、`test:doodle`、`test:moments`。浏览器自动化使用模拟触摸与软件 GPU，不等同于 iOS / Android 真机或微信等 App 内置浏览器的实测；发布后仍需抽查真机相机授权、保存图片、GPU 效果和首次模型下载。

参考：[MediaPipe 人像分割类别](https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter)、[MPMask API](https://ai.google.dev/edge/api/mediapipe/js/tasks-vision.mpmask)。
