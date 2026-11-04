# Popover

Neon 原生气泡卡片，迁自 `xy-pc-client/packages/uikit/src/components/popover`。保留原组件的触发、定位、Portal 层级、主题继承和动画机制，适配 React 19、Next.js、CSS Modules 与 Neon 主题，并修复嵌套触发器的定位与点击兼容。组件规范见 [UI README](../README.md)，示例见 `/uikit`。

```tsx
import { Button } from '@/components/ui/button';
import { Popover } from '@/components/ui/popover';

<Popover trigger="click" title="操作" content={<Button>完成</Button>}>
  <Button>打开</Button>
</Popover>
```

公共入口导出 `Popover`、`PopoverProps`、`PopoverPlacement`、`PopoverTrigger`。内部保留源组件的 `XYPopover*` 类型名，供 Tooltip 复用。

| 属性 | 默认值 | 说明 |
| --- | --- | --- |
| `children` | — | 触发节点；保留原事件及 object / callback ref |
| `title` / `content` | — | ReactNode 或返回 ReactNode 的函数 |
| `trigger` | `hover` | `hover`、`click`、`focus`、`contextMenu` 或其数组；空数组用于手动控制 |
| `open` / `defaultOpen` | 未受控 / `false` | 受控显隐或一次性初值 |
| `onOpenChange` | — | 请求切换显隐；受控模式等待父级更新 |
| `afterOpenChange` | — | 进入或退出动画完成后的回调；被中断的过渡不通知 |
| `placement` | `top` | 四边与八个角落，共十二方位 |
| `align` | — | `{ offset: [x, y] }`；主轴翻转时对应偏移反向 |
| `autoAdjustOverflow` | `true` | 空间不足时翻转并沿交叉轴贴边 |
| `mouseEnterDelay` / `mouseLeaveDelay` | `0.1` | hover 延迟，单位秒 |
| `getPopupContainer` | 触发器文档的 body | 可显式指定局部容器 |
| `arrow` | `true` | 箭头显隐 |
| `width` | — | 数字或 CSS 宽度；显式设置后取消默认 280px 最大宽度 |
| `overlayClassName` / `overlayStyle` | — | 定位根样式；坐标由组件计算 |
| `overlayInnerStyle` | — | 内部卡片样式 |
| `bodyStyle` | — | 正文样式，可调整菜单留白 |
| `className` / `openClassName` | — | 触发器及打开态类名 |
| `zIndex` | `1030` | 浮层层级 |
| `role` / `id` | `dialog` / — | 内部卡片语义及 id；Popover 不包含模态焦点陷阱 |
| `destroyTooltipOnHide` | `true` | 退出后销毁；false 保留内容内部状态 |
| `transitionName` | — | 显式空字符串禁用动画 |
| `closeOnClickOutside` | `false` | 为显式 `open=true` 的手动场景启用额外外部 mousedown 关闭 |
| `clickOutsideIgnore` | — | 上述规则忽略的 CSS 选择器或选择器数组 |

兼容 `visible`、`defaultVisible`、`onVisibleChange`、`afterVisibleChange`，优先使用 open 系列。默认支持 Escape 关闭；click / contextMenu 支持外部点击关闭。点击触发器会同步 `aria-expanded`，原生 Button 自带 Enter / Space 键盘点击。

自定义组件通过 `display: contents` 包装接收事件，递归跳过透明包装后测量实际元素，并追踪根节点替换。禁用元素保留专用包装；不会覆盖原始 ref。嵌套 Portal 通过共享层级上下文识别内部操作，滚动、缩放、视口和元素尺寸变化会更新位置。动画退出约 200ms 后才销毁节点。

外观只使用 [现有主题](../../../styles/index.css) 的 `surface-raised`、`foreground`、`foreground-secondary`、`border`、`shadow-color`、`shadow-lg` 和 `radius`。Portal 在独立的透明容器中同步触发器继承的现有主题变量，响应祖先 class / style 变化；不复制控件布局变量，也不重新定义主题色值。

`hooks/use-popup.ts` 编排触发、定位、动画、主题和层级，供 Tooltip 共用；纯定位计算在 `utils/position.ts`。`style/floating.module.css` 维护共同几何与动画，`index.module.css` 维护卡片外观。原有 `xy-popover-*` DOM 类名和内部 `--xy-floating-*` 几何变量保留以减少迁移差异，与旧色卡无依赖。

此组件不读取 Antd Context，不支持 Antd `styles`、复杂 align / motion 配置或模态焦点管理。需要确认操作请使用 Popconfirm，需要模态交互请使用 Modal。
