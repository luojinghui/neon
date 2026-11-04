# UI 组件

组件预览入口：`/uikit`，按操作按钮、表单输入、导航切换、内容展示、状态反馈、浮层与弹窗、图标、文字分类。顶部可切换暖橘、晴蓝、鸢紫三种主题色，深浅模式由顶栏切换；文字区仅展示六级字号示例，末尾“主题色”以色卡与名称展示所有语义颜色，随当前皮肤和模式更新。预览沿用 `src/styles/index.css` 的主题变量，不维护第二套色值。

全站操作按钮使用 `Button`，只提供三种外观：

| variant | 用途 |
| --- | --- |
| `outline`（默认） | 有边框的常规操作，如查询、文件、取消 |
| `ghost` | 无边框的辅助操作，如关闭、刷新、卡片工具栏 |
| `primary` | 主题色背景的主要操作，如发送、保存、发布、确认 |

```tsx
import { Button } from '@/components/ui/button';

<Button onClick={query}>查询</Button>
<Button variant="ghost" icon={<CloseOutlined />} aria-label="关闭" onClick={close} />
<Button variant="primary" type="submit" loading={saving}>保存</Button>
```

尺寸统一为 `sm`（32px）、`md`（36px，默认）、`lg`（40px）。只有 `icon` 且没有文字时自动使用方形按钮；图标放在 children 中时显式传 `iconOnly`。纯图标按钮必须提供 `aria-label`，可用 `title` 补充悬停提示。默认 `type="button"`，提交表单时显式设置 `type="submit"`。`loading` 自动禁用按钮并设置 `aria-busy`。列表操作可用 `align="start"` 左对齐，布局仍由 Button 统一维护。

颜色全部来自 `src/styles/index.css` 的主题变量，状态和圆角统一由 `button.module.css` 管理。页面的 `className` 只负责布局，不再定义按钮颜色、圆角、边框、阴影、悬停和按压效果。选中状态使用 `aria-pressed` / `aria-selected` / `aria-current`。点赞、评论等仅显示图标与数字的操作使用 `variant="ghost" feedback="none"`（默认 `feedback="default"`）：保留原尺寸、padding、焦点环及 disabled/loading，只关闭按钮容器的选中、悬停、按压底色、阴影与位移。点赞颜色和动画由 `Icon active` 管理，计数保持中性文字色；数字为 0 时不渲染。不要使用会清除 padding 和最小高度的 `data-ui-surface` 代替。媒体的整片透明点击热区使用 `variant="ghost" data-ui-surface`，保留共同的键盘焦点环。

按钮式导航链接使用服务端安全的 `buttonClassName`，保留原生链接语义：

```tsx
import { buttonClassName } from '@/components/ui/button-styles';

<Link href="/cloud" className={buttonClassName({ variant: 'primary' })}>前往云传</Link>
```

## 图标与状态

所有现用图标收录于 `icon.tsx` 的 `iconRegistry`，在 `/uikit` 的“图标”目录可搜索、预览并复制用法。页面统一从 UIKit 引用图标，不重复维护尺寸、点赞颜色和加载动画。名称使用 kebab-case，例如 `heart`、`comment`、`cloud`、`globe`、`copy`、`trash`、`loading`；完整清单以目录为准。

```tsx
import { Icon } from '@/components/ui/icon';

<Button variant="ghost" feedback="none" aria-label={liked ? '取消点赞' : '点赞'}
  aria-pressed={liked} icon={<Icon name="heart" active={liked} />}>{count > 0 ? count : null}</Button>
<Icon name="loading" label="正在加载" />
```

Icon 默认 16px；`size="sm" | "md" | "lg"` 对应 14 / 16 / 20px，也支持数字尺寸。默认继承文字颜色；`tone="primary" | "danger" | "success"` 使用现有语义 token，不引入额外色值。`heart active` 使用 danger 红色实心和短暂轻弹反馈；`loading` 自动旋转，可用 spin 显式控制。Button、Select、Switch 的 loading 共享同一实现，尊重减少动态效果偏好。图标默认不进入无障碍树，纯图标按钮的名称放在 Button；独立有意义的图标使用 `label`。

## 浮层

`Popover`、`Tooltip` 迁自 `xy-pc-client/packages/uikit` 的原生实现，只依赖 React、ReactDOM 和浏览器能力。定位、触发、嵌套 Portal、显隐动画及省略检测沿用源组件，颜色改用本站主题变量，无 Ant Design 浮层或旧色卡依赖。

```tsx
import { Popover } from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';

<Popover trigger="click" placement="bottomRight" content={<div>交互内容</div>}>
  <Button>打开</Button>
</Popover>
<Tooltip title="提示内容"><Button>悬停或聚焦</Button></Tooltip>
```

- 支持 12 个 `placement`，默认自动翻转、贴边；`open` / `onOpenChange` 控制显隐，`defaultOpen` 用于非受控初始值。
- Popover 默认悬停触发；可选 `click`、`focus`、`contextMenu` 或组合，`trigger={[]}` 用于手动控制。支持外部点击、Escape、滚动及尺寸变化重定位。
- Tooltip 默认悬停或聚焦显示，无悬停能力的触屏设备默认点击显示；可用 `isMobile` 显式指定。禁用控件支持聚焦查看提示；`ellipsis` 仅在内容被截断时显示。
- 小屏交互浮层可设置 `fitViewport` 和 `boundaryPadding={12}`，结合 `width="min(288px, calc(100vw - 24px))"`，按实际可视视口收束并保留两侧留白。
- 宽度使用 `width`；Popover 正文留白使用 `bodyStyle`，卡片与 Tooltip 内容使用 `overlayInnerStyle`；浮层根样式使用 `overlayStyle`。页面不另写浮层配色和状态效果。

`Popover`、`Tooltip` 支持 `radius="sm" | "md" | "lg" | "xl" | "auto" | "inherit" | 0`。默认 auto 优先使用 children 的非零实际圆角，否则 Popover 回退 lg、Tooltip 回退 sm。inherit 原样复制四个角（含胶囊、非对称和椭圆），显式档位优先；触发包装层始终匹配 children 轮廓。Tooltip 背景跟随当前深浅主题，不使用反色底。

`Popconfirm` 使用原生 Popover 和统一 Button 实现，包含异步等待、错误提示及取消操作。

## 表单与选择

以下组件均为 React / HTML 原生实现，无 Ant Design 基础控件依赖：

| 组件 | 主要 API |
| --- | --- |
| Input | 原生 input 属性/ref、prefix/suffix、allowClear、showCount、status、onPressEnter、focusDecoration |
| Textarea / Input.TextArea | 原生 textarea 属性/ref、rows、autoSize（minRows/maxRows）、allowClear、showCount、status、focusDecoration |
| Input.Password / Input.Search | 密码可见切换；onSearch 支持 Enter 和清空同步搜索 |
| Switch | checked/defaultChecked、onChange(checked, event)、disabled/loading、checkedChildren/unCheckedChildren |
| Checkbox / Checkbox.Group | checked/defaultChecked、indeterminate、原生 onChange；Group value/options/onChange(values) |
| Radio / Radio.Group | 原生 onChange；Group value/options/name/onChange(event)、appearance="card"，原生方向键互斥选择 |
| Select | options、value/defaultValue、onChange(value, option)、mode="multiple"、showSearch、allowClear、disabled/loading、required、name |

尺寸 sm / md / lg（兼容 small / middle / large）；触屏输入保留 44px 热区，文字与 placeholder 均采用 body（14px），不因指针类型自动放大。Input/Textarea 的 ref 直接指向原生可编辑元素；className/style 负责容器布局。Input、Textarea、Select 直接使用 surface-inset 作为填充底：浅色是轻柔暖白，不再额外混入文字色加深；深色由模式色阶区分页面、Card 与输入区域。悬停只轻微混色，聚焦保留填充并显示 1px 焦点线；深色焦点线由 border-focus 与 foreground 派生提亮，使橘、蓝、紫皮肤均保持可辨。默认无可见描边，使用处不叠加 border/ring；不支持混色的浏览器保持 surface-inset 与原焦点色。

```tsx
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PlanetIllustration } from '@/components/ui/planet-illustration';

<Input aria-label="星球昵称" allowClear focusDecoration={<PlanetIllustration size="sm" />} />
<Textarea aria-label="此刻想法" autoSize={{ minRows: 3, maxRows: 6 }} maxLength={160} showCount />
```

`Radio.Group appearance="card"` 用于需要说明的整块选项，例如公开 / 私密。options 支持 label、description、icon、disabled；整块可点击，图标不进入无障碍名称，描述单独关联原生 radio。`indicator={false}` 隐藏重复的圆点，仅保留选中背景与主题色标；原生 radio 仍参与键盘、表单与屏幕阅读器。默认两列，极窄屏自动单列；保持原生分组、方向键、禁用与键盘焦点。选项外观由组件统一维护，页面仅调整布局。使用 fieldset/legend 描述分组，不在 Radio.Group 外包 label。

```tsx
<Radio.Group appearance="card" aria-label="星球可见范围" value={visibility}
  onChange={event => setVisibility(event.target.value)} options={[
    { value: 'public', label: '公开', description: '在公共列表中展示', icon: <GlobalOutlined /> },
    { value: 'private', label: '私密', description: '仅授权成员可加入', icon: <LockOutlined /> }
  ]} />
```

focusDecoration 接收任意 ReactNode（也可传入表情），聚焦时在输入面右上角显示，组件预留文字区域并避免被滚动容器裁剪，不接受指针事件、不进入无障碍树。默认不强制添加插图；PlanetIllustration 的 planet/comet/satellite 使用无表情星球几何。

## Tabs 与 Card

Tabs 使用实底轨道和半透明玻璃选中项。sm / md / lg **总高度**为 32 / 36 / 40px（包含轨道留白），四边 inset 和 item gap 均为 3 / 4 / 5px。移动端保持相同的紧凑比例，item 最小宽度 44px，避免触屏最小高与轨道留白重复叠加。支持横向拖动预览、松手选择、方向键/Home/End、禁用项、受控与非受控状态，各实例独立，垂直手势保持页面滚动。

默认轨道按内容宽度显示，仅 `block` 才填满容器；不要用 `flex-1` 拉长普通导航。宽度不足时只在组件内横向滚动，拖选到可视区边缘会自动滚动到隐藏选项；键盘聚焦也会露出当前项。滚动容器不使用抵消留白的负 margin，保留末端圆角；焦点环画在 item 内部。深色选中表面由 `surface` 与 `foreground` 派生，保持与实底轨道的区分，不改全局主题色。

items 支持 key/label/children/disabled，配合 activeKey/defaultActiveKey/onChange、size/block。children 自动生成关联 tabpanel；业务内容外置时用 panelId 关联，tab id 为 `${id}-tab-${encodeURIComponent(key)}`。导航 item 使用 href/onNavigate，保留真实链接及修饰键行为。

Card 为无外边框的轻阴影容器，默认 lg 圆角、16px 内距，padding="sm" 为12px、"none" 无内距。支持 title/description/extra/cover/footer/bodyClassName（仅布局），支持 ref 透传；bodyWrap={false} 保留既有直接子节点，适合瀑布流测量和编辑器布局。默认 article，as 支持 div/section/a/link。href 明确选择导航语义；含独立操作时保持普通容器，把导航放在内部，避免交互嵌套。首页与星球列表卡片已使用统一 Card。

`interactive` 为含独立操作的 Card 开启轻微抬升和阴影反馈，不改变容器语义或添加点击行为；链接 Card 默认启用相同反馈。键盘聚焦内部操作时同样反馈，减少动态效果偏好下关闭位移。

## 弹窗与提醒

Modal、AlertDialog、useConfirm 均为原生实现。桌面默认可拖动标题，位置受可视区域约束；Modal、AlertDialog 与全局确认在手机统一从底部滑入；桌面提醒保持居中。采用 xl 圆角、无外边框和柔和阴影。

Modal 保留 open/onCancel/onOk/footer、okText/cancelText、width、confirmLoading、closable、keyboard、mask/maskClosable、destroyOnHidden、afterOpenChange 等属性。draggable 可关闭拖动；mobilePresentation="dialog" 可显式保持手机居中但仍沿用滑入动效（只用于需要该布局的专用编辑器）。移动端 420ms 柔和减速入场、280ms 退出，关闭完成后回焦与解除滚动锁，包含底部安全区与键盘可视视口；减少动态效果偏好下立即切换。styles/classNames 支持 root/mask/wrapper/container/header/title/body/footer 槽位。业务弹窗布局使用 ui-modal-root / ui-modal-wrap / ui-modal-container / ui-modal-header / ui-modal-body / ui-modal-footer，不依赖 ant-modal 类。

弹窗处理焦点圈定、关闭回焦、滚动锁、嵌套 Escape 顺序及异步 onOk 的等待与错误。useConfirm().confirm(options) 返回 destroy()/update(options)，默认继承打开操作所在主题；局部声明的 Modal 跟随 React 位置，也可用 themeSource 指定来源。

Alert 为行内提醒，支持 type="info" | "success" | "warning" | "error"、message/description/showIcon/action/closable；AlertDialog 为可拖动提醒弹窗。

## 触屏与文字选择

全局关闭浏览器默认点击灰色高亮和组件文字拖选/长按菜单。文本输入、textarea、contenteditable 保留编辑能力；需要复制的特殊正文显式加 data-selectable。按钮 hover 仅在精细悬停指针生效，触屏按压使用轻微缩放；键盘焦点与 disabled/loading 保持可辨识。动画尊重 prefers-reduced-motion。

## 主题颜色

`src/styles/index.css` 是唯一配色来源，按三层管理。默认暖橘主色、珊瑚强调色及其深浅配色是原有视觉基线；整理变量、扩展换肤或校验时保持这些颜色不变：

| 层 | 配置内容 | 变化范围 |
| --- | --- | --- |
| 皮肤输入 | `--skin-primary-hue/saturation`、`--skin-accent-hue/saturation`，每个皮肤 4 个参数 | 主色、强调色及其派生角色随皮肤变化 |
| 模式语义 | 文字、背景/表面、边框、状态、遮罩和阴影基色；`--tone-*` 保留原有角色的明度、饱和度、色相偏移、实底前景与阴影透明度 | 随深浅模式变化，普通换肤保持不变 |
| 派生角色 | 主色、强调色、焦点、聊天气泡和侧栏选中项等引用上层变量 | 自动联动，保留角色语义 |

每种模式只维护 **20 个独立语义色值**：10 个中性色（3 个文字、页面背景、4 个表面、2 个边框）、8 个状态色（成功/警告/危险/信息各含实色与柔和底色），以及遮罩、阴影基色。公开颜色 API 只保留 **34 个语义角色**（20 个独立值 + 14 个派生角色），另有 **5 个阴影规格**。页面与组件直接消费语义变量，不再维护兼容别名层。

| 使用场景 | 优先使用的变量 | 是否随皮肤变色 |
| --- | --- | --- |
| 正文、辅助说明、弱提示 | `--foreground`、`--foreground-secondary`、`--foreground-muted` | 否 |
| 页面、卡片、输入/内嵌区域、交互背景 | `--background`、`--surface`、`--surface-inset`、`--surface-hover/active` | 否 |
| 主要操作、链接、选中强调 | `--primary`、`--primary-hover`、`--primary-soft`、`--primary-foreground` | 是 |
| 次要视觉强调 | `--accent`、`--accent-soft`、`--accent-foreground` | 是 |
| 默认/悬停边框、键盘焦点 | `--border`、`--border-hover`、`--border-focus`、`--ring` | 仅焦点跟随主色 |
| 成功、警告、危险、信息 | `--success/warning/danger/info` 及各自的 `-soft` | 否 |
| 自己/对方气泡 | `--chat-bubble-self/other` 及各自的 `-foreground` | 自己气泡底色与浅色模式文字跟随主色色相，深色模式文字保持白色；对方气泡保持中性 |
| 侧栏选中项 | `--sidebar-active` | 跟随主色色相，保留原有明度与饱和度差异 |
| 遮罩、浮起层级 | `--overlay`、`--shadow-sm/md/lg/xl/card` | 否 |

颜色仍是 HSL 通道，CSS 使用 `hsl(var(--primary))`；阴影使用 `var(--shadow-md)`。`primary-foreground` / `accent-foreground` 配实色底，柔和底色上的普通正文使用 `foreground`。页面底色使用 `background`；卡片、浮层和分段控件选中背景使用或派生自 `surface`；输入框和分段控件底色使用 `surface-inset`，输入聚焦保留原填充；按压与悬停表面分别使用 `surface-active`、`surface-hover`。控件正文与占位文字使用 `foreground`、`foreground-muted`，边框使用 `border`。`sidebar-active` 保留为跟随主色派生的语义角色。

深色中性色采用低饱和暖灰：页面背景最沉静，卡片抬亮一层，输入与内嵌区域再抬亮一层，保持无外框组件的轮廓清楚。辅助文字与提示同步提亮，保证在输入表面上的可读性；主色、强调色及其派生角色保持原有配色。可在 `/uikit` 切换深浅模式，检查各类组件的实际表现。

### 换肤与局部范围

当前皮肤为 `orange`（默认）、`blue`、`violet`。全局在 `html` 上设置 `data-skin`，深浅模式继续由 `next-themes` 的 `.light` / `.dark` 管理：

```ts
document.documentElement.dataset.skin = 'blue';
```

局部预览可以独立指定皮肤和模式；显式设置背景与文字色，避免继承父容器已计算的颜色：

```tsx
<section data-skin="violet" className="light bg-background text-foreground">
  <Button variant="primary">局部主题</Button>
</section>
```

派生变量在 `:root`、`.light`、`.dark`、`[data-skin]` 每个范围边界重新声明。新增皮肤在主题文件增加 `[data-skin='…']` 的 4 个输入；不要只在普通子元素上覆盖输入、却遗漏范围标记。UIKit Popover、Tooltip、Popconfirm、Select、Modal、AlertDialog 会把来源范围的已解析主题、字体及圆角同步到 Portal，并响应范围变化。AntD 由全局桥接读取 `html` 的计算值，保留的 Table、Drawer 等复杂组件只跟随全局主题。旧页面中的 Tailwind `dark:*` 仍按祖先 `.dark` 匹配，局部模式适用于使用主题变量的组件。

新皮肤必须校验深浅模式下实色按钮、柔和底色、文字与焦点的对比度；固定明度不能保证任意色相都可读。校验与调整限于新皮肤，不自动改动默认皮肤；默认皮肤通过原色回归测试保持原设计，不代表所有颜色组合都达到同一对比度阈值。新增 token 前先确认现有角色不能表达需求；确需增加时补齐模式定义或派生关系、目录说明，以及浮层需要的 Portal 同步项。绘画颜料、海报输出、用户选色属于内容数据，保持自身调色板；周边页面和控件仍使用 UI 主题。

## 圆角规格

圆角在 `src/styles/index.css` 中独立定义，皮肤和深浅模式共用四档：

| 规格 | CSS 变量 | Tailwind 类 | 默认值 | 使用场景 |
| --- | --- | --- | --- | --- |
| 小尺寸 | `--radius-sm` | `rounded-sm` | 6px | 标签、Tooltip、小尺寸按钮 |
| 中尺寸 | `--radius-md` | `rounded-md` | 10px | 常规按钮、输入框、选择控件 |
| 大尺寸 | `--radius-lg` | `rounded-lg` | 16px | 卡片、Popover、媒体容器 |
| 超大尺寸 | `--radius-xl` | `rounded-xl` | 24px | Modal、抽屉、大面板 |

```css
.card { border-radius: var(--radius-lg); }
.sheet { border-radius: var(--radius-xl) var(--radius-xl) 0 0; }
```

`Button` 的 `sm` 尺寸使用小圆角，`md` / `lg` 尺寸使用中圆角；Tooltip 无可继承圆角时使用小圆角，Popover 无可继承圆角时使用大圆角；Card 使用大圆角，Modal 使用超大圆角。按钮使用处不传圆角样式，沿用组件统一状态。AntD 通过主题桥接读取同一套值，UIKit Portal 同步四个圆角变量。

页面和组件仅使用这四档，不保留旧单值变量，也不使用无档 `rounded`、`rounded-2xl`、`rounded-3xl` 或临时像素值。Tailwind 的方向圆角使用相同档位，如 `rounded-t-xl`。直角使用 `rounded-none` / `0`，圆形头像和胶囊使用 `rounded-full` / `50%` / `9999px`；它们是形状，不属于尺寸档位。绘图内容、海报输出、人像裁剪轮廓和浮层箭头尖角属于内容或几何，保留专用形状并在代码注明。

## 字体层级

字号使用 `rem`，跟随浏览器基础字号；下表 px 按默认 16px 换算。颜色、深浅模式和皮肤不改变字号。

| 角色 | CSS 变量 / Tailwind 类 | 默认字号 | 行高 | 用途 |
| --- | --- | --- | --- | --- |
| 提示 | `--font-size-caption` / `text-caption` | 12px | 1.5 | 辅助说明、时间、标签、Tooltip |
| 正文 | `--font-size-body` / `text-body` | 14px | 1.5 | 默认正文、表单、按钮 |
| 阅读正文 | `--font-size-body-lg` / `text-body-lg` | 16px | 1.75 | 长文、消息正文 |
| 小标题 | `--font-size-title` / `text-title` | 18px | 1.4 | 卡片标题、弹窗标题 |
| 区块标题 | `--font-size-heading` / `text-heading` | 24px | 1.3 | 页面分区、内容章节 |
| 页面标题 | `--font-size-display` / `text-display` | 32px | 1.2 | 页面主标题、欢迎语 |

Tailwind 语义字号类包含对应行高；CSS Modules 配对使用 `--font-size-<角色>` 与 `--line-height-<角色>`。字重统一使用 `--font-weight-regular`（400）、`--font-weight-medium`（500）、`--font-weight-semibold`（600），标题通常使用 semibold。HTML 标题层级按内容结构选择，不用字号代替语义。

UIKit 与公共组件已接入这些字号角色，新功能沿用同一套定义。旧页面的零散字号和内容专用样式随功能维护逐步迁移；颜色引用已统一使用现有语义变量。


### 移动端字体阶梯

| 角色 | 桌面 | 移动端（≤640px） | 用途 |
| --- | --- | --- | --- |
| caption | 12px | 12px | 时间、说明、标签 |
| body | 14px | 14px | 控件、表单、普通正文 |
| body-lg | 16px | 16px | 阅读正文、长消息 |
| title | 18px | 16px | 卡片和弹窗标题 |
| heading | 24px | 20px | 区块标题 |
| display | 32px | 28px | 页面主标题 |

上述 px 为浏览器默认 16px 根字号下的参考；实际定义仍用 rem，保留用户字体设置。触屏热区独立于字号，输入框不会再通过 coarse pointer 规则升为 16px；html 的 text-size-adjust 保持 100%，避免移动浏览器对独立文本块额外放大。`/uikit` 的文字示例随视口使用对应字号，Portal 继续同步六个已解析字体 token。
