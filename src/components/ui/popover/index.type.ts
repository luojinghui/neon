/**
 * 集中定义 Popover 的公开契约及内部交互、定位和动画类型
 *
 * Created at     : 2026-10-20 17:06:54
 * Last modified  : 2026-10-21 15:50:00
 */

import type {
  AriaRole,
  CSSProperties,
  Dispatch,
  HTMLAttributes,
  MouseEvent as ReactMouseEvent,
  ReactElement,
  ReactNode,
  Ref,
  SetStateAction,
  TouchEvent as ReactTouchEvent,
  TransitionEvent
} from 'react';

/**
 * 浮层首选方位；空间不足时可翻转到相反方向
 *
 * @param top - 上方居中
 * @param topLeft - 上方左对齐
 * @param topRight - 上方右对齐
 * @param bottom - 下方居中
 * @param bottomLeft - 下方左对齐
 * @param bottomRight - 下方右对齐
 * @param left - 左侧居中
 * @param leftTop - 左侧顶部对齐
 * @param leftBottom - 左侧底部对齐
 * @param right - 右侧居中
 * @param rightTop - 右侧顶部对齐
 * @param rightBottom - 右侧底部对齐
 */
export type XYPopoverPlacement =
  | 'top' | 'topLeft' | 'topRight'
  | 'bottom' | 'bottomLeft' | 'bottomRight'
  | 'left' | 'leftTop' | 'leftBottom'
  | 'right' | 'rightTop' | 'rightBottom';

/**
 * 自动激活方式，空数组表示仅由调用方控制
 *
 * @param hover - 鼠标移入显示，移出触发节点及内容区后关闭
 * @param click - 点击切换显隐
 * @param focus - 获得焦点显示，失去焦点后关闭
 * @param contextMenu - 右键显示并阻止原生菜单
 */
export type XYPopoverTrigger = 'hover' | 'click' | 'focus' | 'contextMenu';

/** Explicit token/zero wins; auto follows rounded children and otherwise keeps the component default. */
export type OverlayRadius = 'sm' | 'md' | 'lg' | 'xl' | 'auto' | 'inherit' | 0;

/**
 * 内容气泡属性，保留项目使用的 Antd 4 用法及 UIKit 扩展
 */
export interface XYPopoverProps {
  /** auto (default): follow nonzero child corners, otherwise lg/sm. inherit also copies square corners. */
  radius?: OverlayRadius;
  /** 触发节点；原有事件及 ref 会保留，自定义组件需输出可测量的元素 */
  children?: ReactNode;
  /** 可选标题；undefined、null、false 和空字符串视为空，数值 0 保留；函数在渲染时求值 */
  title?: ReactNode | (() => ReactNode);
  /**
   * 气泡正文，支持交互内容及渲染函数；undefined、null、false 和空字符串视为空，数值 0 保留
   * title 和 content 均为空时不请求打开；受控 open/visible 仍可强制显示，渲染函数不按返回值判空
   */
  content?: ReactNode | (() => ReactNode);
  /** 受控显隐，优先于 visible；仅 undefined 表示未指定，true/false 均为受控，交互只通知回调 */
  open?: boolean;
  /** 非受控初始显隐，默认 false，更新此属性不会重置状态 */
  defaultOpen?: boolean;
  /** 旧受控属性，仅 open 为 undefined 时生效；两者均为 undefined 时使用内部状态 */
  visible?: boolean;
  /** 旧初始属性，仅 defaultOpen 为 undefined 时生效，默认 false，更新不会重置状态 */
  defaultVisible?: boolean;
  /**
   * 用户交互请求改变显隐时调用；受控模式由父组件决定是否更新，父级更新 Props 不触发此回调
   *
   * @param { boolean } open - 请求的显隐值，true 表示显示，false 表示隐藏
   */
  onOpenChange?: (open: boolean) => void;
  /**
   * 旧请求回调，在 onOpenChange 后调用；closeOnClickOutside 的自定义关闭不触发此回调
   *
   * @param { boolean } visible - 请求的显隐值，true 表示显示，false 表示隐藏
   */
  onVisibleChange?: (visible: boolean) => void;
  /**
   * 进入或退出动画完成后调用；中断的过渡不通知，禁用动画时在显隐切换完成后调用
   *
   * @param { boolean } open - 已完成的显隐值，true 表示进入完成，false 表示退出完成
   */
  afterOpenChange?: (open: boolean) => void;
  /**
   * 旧完成回调，在 afterOpenChange 后调用；遵循相同的动画完成和中断规则
   *
   * @param { boolean } visible - 已完成的显隐值，true 表示进入完成，false 表示退出完成
   */
  afterVisibleChange?: (visible: boolean) => void;
  /** 自动激活方式，默认 hover；支持组合，空数组禁用激活 */
  trigger?: XYPopoverTrigger | XYPopoverTrigger[];
  /** 鼠标进入后的显示延迟，单位秒，默认 0.1；小于或等于 0 时立即请求显示 */
  mouseEnterDelay?: number;
  /** 鼠标离开后的关闭延迟，单位秒，默认 0.1；小于或等于 0 时立即请求关闭 */
  mouseLeaveDelay?: number;
  /** 首选位置，默认 top */
  placement?: XYPopoverPlacement;
  /** x/y 数值偏移，单位 px，默认 [0, 0]；非有限数按 0 处理，主轴翻转时同步反向 */
  align?: PopoverAlign;
  /** 是否翻转并贴边调整，默认 true */
  autoAdjustOverflow?: boolean;
  /** 按可视视口限制尺寸并在空间不足时滚动内容，适合手机交互菜单。 */
  fitViewport?: boolean;
  /** 浮层与可视视口/裁切边界之间的安全留白，单位 px，默认 0。 */
  boundaryPadding?: number;
  /**
   * 指定浮层的实际挂载容器；未传入时使用触发节点所属文档的 body
   *
   * @param { HTMLElement } trigger - 用于定位的实际触发元素
   * @returns { HTMLElement } - 挂载 Portal 的容器，必须与触发元素属于同一文档
   */
  getPopupContainer?: (trigger: HTMLElement) => HTMLElement;
  /** 是否显示箭头，默认 true；隐藏箭头仍保留原方向间距 */
  arrow?: boolean;
  /** 浮层定位根宽度；数字单位 px，字符串遵循 CSS 宽度；覆盖 overlayStyle.width，并取消默认 280px 最大宽度 */
  width?: number | string;
  /** 合并到触发节点的类名，保留节点原有类名；禁用节点的类名放在兼容包装器上 */
  className?: string;
  /** 触发节点打开状态类名，默认 `${prefixCls}-open` */
  openClassName?: string;
  /** 兼容样式槽位前缀，默认 xy-ant-popover */
  prefixCls?: string;
  /** 合并到浮层定位根的类名 */
  overlayClassName?: string;
  /** 浮层定位根样式；显式 width/zIndex 属性优先，position/left/top 最终由内部定位结果覆盖 */
  overlayStyle?: CSSProperties;
  /** 卡片 inner 节点样式 */
  overlayInnerStyle?: CSSProperties;
  /** 正文节点样式；菜单可用 padding 调整内容留白 */
  bodyStyle?: CSSProperties;
  /** 浮层层级，默认 1030，优先于 overlayStyle.zIndex */
  zIndex?: number;
  /** inner 节点的 id */
  id?: string;
  /** 内容区域的无障碍语义，默认 dialog。Tooltip 单独使用 tooltip。 */
  role?: AriaRole;
  /** 退出后销毁内容，默认 true；false 时保留子组件状态 */
  destroyTooltipOnHide?: boolean;
  /** 兼容空字符串关闭动画；暂不支持自定义动画名称 */
  transitionName?: '';
  /** 是否启用自定义外部 mousedown 关闭，默认 false；仅显式 open=true 时生效，只通知 onOpenChange(false) */
  closeOnClickOutside?: boolean;
  /** 自定义关闭的忽略区域，默认无；须为合法 CSS 选择器，匹配节点及其后代均忽略，空项跳过 */
  clickOutsideIgnore?: string | string[];
}

/**
 * 数值偏移配置，不扩展为任意对齐点或百分比定位
 */
export interface PopoverAlign {
  /** x/y 偏移，单位 px，未传入时为零 */
  offset?: [number, number];
}

/**
 * 允许增强的触发元素属性；内部使用，不透传 Popover 自定义属性
 */
export interface TriggerElementProps extends HTMLAttributes<HTMLElement> {
  /** 禁用节点需要外层接收 hover */
  disabled?: boolean;
  /** 原节点引用，合并后仍指向实际触发节点 */
  ref?: Ref<HTMLElement>;
}

/**
 * 读取 React 19 元素 props 中的原始 ref，不改变调用方的节点引用
 */
export type PopoverTriggerElement = ReactElement<TriggerElementProps>;

/**
 * 浏览器提供的输入来源能力，旧环境可能没有此对象
 */
export interface PopoverInputCapabilities {
  /** 当前鼠标事件是否由触摸操作合成 */
  firesTouchEvents: boolean;
}

/**
 * 可选携带输入来源能力的原生鼠标事件
 */
export interface PopoverNativeMouseEvent extends MouseEvent {
  /** 缺失时按最近触摸时间识别合成鼠标事件 */
  sourceCapabilities?: PopoverInputCapabilities;
}

/**
 * 浮层内容与触发器之间协调 hover 的事件入口
 */
export interface PopoverHoverHandlers {
  /** 从触发器进入内容区时取消延迟关闭 */
  onMouseEnter: () => void;
  /** 离开内容区时按配置延迟关闭 */
  onMouseLeave: () => void;
}

/**
 * 触发节点、待处理任务及浮层 hover 协调入口
 */
export interface PopoverTrigger {
  /** 实际参与定位的 DOM 节点 */
  node: HTMLElement | null;
  /** 保留原事件与 ref 的触发元素 */
  element: ReactElement;
  /** 清理尚未完成的 hover 显隐任务 */
  cancel: () => void;
  /** click 或 contextMenu 模式是否需要监听外部鼠标操作 */
  closeOnMouse: boolean;
  /** 从触发节点进入浮层时协调延迟关闭 */
  hoverHandlers: PopoverHoverHandlers;
}

/**
 * 同一 React 子树中的浮层归属标记，包含祖先浮层
 */
export interface PopoverLayerValue {
  /** 将当前原生事件登记为本层及祖先层的内部操作 */
  markInside: (event: Event) => void;
  /** 登记后代 Portal 节点，使捕获阶段也能识别嵌套浮层 */
  registerInside: (node: HTMLElement) => () => void;
}

/**
 * 浮层内容根节点的原生事件捕获入口
 */
export interface PopoverLayerCaptureProps {
  /** 将内容区鼠标按下登记为内部操作 */
  onMouseDownCapture: (event: ReactMouseEvent<HTMLElement>) => void;
  /** 将内容区触摸登记为内部操作 */
  onTouchStartCapture: (event: ReactTouchEvent<HTMLElement>) => void;
}

/**
 * 提供给浮层根组件的 Context 和原生事件捕获入口
 */
export interface PopoverLayer {
  /** 包裹触发器与 Portal 子树的层级上下文 */
  contextValue: PopoverLayerValue;
  /** 仅绑定到浮层内容根节点，保持触发器原有外部关闭语义 */
  captureProps: PopoverLayerCaptureProps;
}

/**
 * Popover 从布局准备到离场完成的展示阶段
 *
 * @param closed - 离场完成，可销毁节点或保留隐藏内容
 * @param prepare - 等待定位完成和下一帧进入
 * @param entering - 正在播放进入动画
 * @param open - 进入完成，稳定展示
 * @param exiting - 正在播放退出动画
 */
export type PopoverPresencePhase = 'closed' | 'prepare' | 'entering' | 'open' | 'exiting';

/**
 * Popover 的挂载状态和动画结束入口
 */
export interface PopoverPresence {
  /** 是否需要保留当前浮层节点 */
  present: boolean;
  /** 当前定位准备或过渡阶段 */
  phase: PopoverPresencePhase;
  /** 仅接收动画节点自身的有效过渡结束事件 */
  onTransitionEnd: (event: TransitionEvent<HTMLElement>) => void;
}

/**
 * 尚未完成的动画轮次，用于丢弃被显隐切换中断的旧通知
 */
export interface PopoverPendingTransition {
  /** 当前过渡的递增序号 */
  generation: number;
  /** 本轮完成后应通知的显隐状态 */
  open: boolean;
}

/**
 * 定位所需的元素区域，单位为 CSS 像素
 */
export interface PopoverRect {
  /** 左边界 */
  left: number;
  /** 上边界 */
  top: number;
  /** 宽度 */
  width: number;
  /** 高度 */
  height: number;
}

/**
 * 浮层可展示区域，已扣除祖先裁切部分
 */
export interface PopoverBoundary {
  /** 左边界 */
  left: number;
  /** 上边界 */
  top: number;
  /** 右边界 */
  right: number;
  /** 下边界 */
  bottom: number;
}

/**
 * 内部定位输入
 */
export interface PopoverPositionOptions {
  /** 触发节点区域 */
  anchor: PopoverRect;
  /** 浮层区域，仅使用宽高 */
  popup: Pick<PopoverRect, 'width' | 'height'>;
  /** 首选方位 */
  placement: XYPopoverPlacement;
  /** x/y 偏移，未传入时为零；主轴翻转时对应偏移反向 */
  offset?: [number, number];
  /** 可视区域 */
  boundary: PopoverBoundary;
  /** 是否进行翻转和贴边 */
  autoAdjustOverflow: boolean;
}

/**
 * 内部定位结果
 */
export interface PopoverPosition {
  /** 浮层左边界 */
  left: number;
  /** 浮层上边界 */
  top: number;
  /** 调整后的实际方位 */
  placement: XYPopoverPlacement;
  /** 横向贴边位移，用于校正箭头 */
  shiftX: number;
  /** 纵向贴边位移，用于校正箭头 */
  shiftY: number;
}

/**
 * 浮层所在的主方向，不包含角落对齐方式
 *
 * @param top - 触发节点上方
 * @param bottom - 触发节点下方
 * @param left - 触发节点左侧
 * @param right - 触发节点右侧
 */
export type PopoverSide = 'top' | 'bottom' | 'left' | 'right';

/**
 * 定位 Hook 的内部输入
 */
export interface UsePopoverPositionOptions {
  /** 真实触发节点 */
  trigger: HTMLElement | null;
  /** 真实浮层定位根 */
  popup: HTMLElement | null;
  /** 打开时监听更新；关闭保留最后坐标供退出动画使用 */
  enabled: boolean;
  /** 首选位置 */
  placement: XYPopoverPlacement;
  /** 数值偏移，默认 [0, 0] */
  offset?: [number, number];
  /** 是否翻转并贴边 */
  autoAdjustOverflow: boolean;
  /** 可视区域向内保留的边距，单位 px，默认 0 */
  boundaryPadding?: number;
  /** 按可视区域和最终方位约束浮层尺寸，默认 false，不改变旧 Popover 尺寸 */
  fitViewport?: boolean;
  /** fitViewport 模式的最大宽度，单位 px，未指定时使用可视宽度 */
  maxWidth?: number;
  /** 主轴额外间距，单位 px，默认 0；随主轴翻转并保留 offset 的原有语义 */
  gap?: number;
  /** 实际箭头节点，未指定时沿用旧 Popover 箭头查询规则 */
  arrowElement?: HTMLElement | null;
  /** 各方位均按触发节点中心计算箭头中心坐标，默认 false */
  arrowPointAtTrigger?: boolean;
  /** 角落方位向触发节点外侧扩展的偏移，单位 px，默认 0 */
  cornerOffset?: number;
}

/**
 * 定位 Hook 的内部输出
 */
export interface PopoverPositionState {
  /** 当前节点是否已完成测量 */
  ready: boolean;
  /** 实际方位 */
  placement: XYPopoverPlacement;
  /** 定位根的行内样式 */
  style: CSSProperties;
  /** 仅贴边时覆盖箭头坐标，保留业务 transform */
  arrowStyle: CSSProperties;
  /** 内容动画的缩放原点 */
  transformOrigin: string;
}

/**
 * 轴向缩放比例，不处理旋转、倾斜或三维变换
 */
export interface ElementScale {
  /** 横向比例 */
  x: number;
  /** 纵向比例 */
  y: number;
}

/**
 * 当前文档提供的浏览器全局能力
 */
export type PopoverWindow = Window & typeof globalThis;

/**
 * 原生浮层触发器的内部适配，不进入 Popover 公开属性
 */
export interface PopoverTriggerOptions {
  /** 普通包装器的局部样式 */
  wrapperClassName?: string;
  /** 自定义组件包装器的局部样式 */
  customClassName?: string;
  /** 禁用触发器包装器的局部样式 */
  disabledClassName?: string;
  /** 禁用子节点仍需保留的原生重置样式，默认不添加 */
  disabledChildClassName?: string;
  /** 提示操作是否阻止点击冒泡，默认 false */
  isolateClick?: boolean;
  /** 是否阻止点击默认行为，默认 true，Tooltip 保留业务默认行为 */
  preventClickDefault?: boolean;
  /** 非 click 提示在操作触发器时关闭，避免遮挡点击打开的操作浮层 */
  dismissOnTriggerClick?: boolean;
  /** Tooltip 可通过禁用控件的包装器展示说明；原控件仍保持禁用 */
  allowDisabledTrigger?: boolean;
  /** Tooltip 同时配置 hover/focus 时协调激活来源，默认 false */
  coordinateFocus?: boolean;
  /** 当前显示的说明节点 id，追加到触发节点已有描述 */
  describedBy?: string;
  /** 可选触发节点无障碍名称，未传入时保留原名称 */
  ariaLabel?: string;
  /** 移动提示按钮的展开状态，未传入时保留调用方属性 */
  expanded?: boolean;
  /** 实际触发节点变化时通知测量使用方 */
  onNodeChange?: (node: HTMLElement | null) => void;
}

/**
 * Tooltip 与 Popover 共用的内部显隐、定位及关闭策略
 */
export interface UsePopupOptions extends PopoverTriggerOptions {
  /** 最终显示门控，默认 true；不改变受控请求值 */
  enabled?: boolean;
  /** 清空非受控请求状态，默认 false；不通知用户交互回调 */
  resetOpen?: boolean;
  /** 打开前按真实节点复查，返回 false 时不请求打开 */
  beforeOpen?: () => boolean;
  /** 所有触发模式均监听外部鼠标操作，默认 false */
  outsideMouse?: boolean;
  /** 外部操作是否使用捕获监听，默认 false */
  captureOutside?: boolean;
  /** 是否响应 Escape，默认 false */
  closeOnEscape?: boolean;
  /** 是否在浮层外部滚动时关闭，默认 false */
  closeOnScroll?: boolean;
  /** 描述节点的 id，打开时自动关联到触发节点 */
  descriptionId?: string;
  /** 是否将实际显隐同步为按钮展开状态，默认 false */
  trackExpanded?: boolean;
  /** 与显隐无关的定位策略，未传入时保持 Popover 默认几何 */
  positionOptions?: Omit<UsePopoverPositionOptions, 'trigger' | 'popup' | 'enabled' | 'placement' | 'offset' | 'autoAdjustOverflow'>;
}

/**
 * 共享浮层编排输出，供组件自己的 DOM 和皮肤绑定
 */
export interface PopupState {
  /** Shared stack level for nested dialogs and popups. */
  overlayLevel: number;
  /** 实际触发节点、增强后的元素及延迟任务 */
  trigger: PopoverTrigger;
  /** 定位结果 */
  position: PopoverPositionState;
  /** 挂载与动画状态 */
  presence: PopoverPresence;
  /** 嵌套层级与捕获入口 */
  layer: PopoverLayer;
  /** Portal 实际容器 */
  container: HTMLElement | null;
  /** 浮层定位根 */
  popup: HTMLDivElement | null;
  /** 绑定浮层定位根 */
  setPopup: Dispatch<SetStateAction<HTMLDivElement | null>>;
  /** 绑定主题继承容器 */
  setThemeBoundary: Dispatch<SetStateAction<HTMLDivElement | null>>;
  /** 是否保留浮层节点 */
  renderPopup: boolean;
  /** 应用门控后的实际显隐 */
  effectiveOpen: boolean;
}
