/**
 * 定义原生文字提示的公开属性，不依赖第三方浮层或控件类型
 *
 * Created at     : 2026-10-21 15:27:00
 * Last modified  : 2026-10-21 16:10:52
 */

import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { XYPopoverProps, XYPopoverPlacement, XYPopoverTrigger } from '../popover/index.type';

/**
 * 提示首选方位，支持四边及八个角落对齐
 */
export type XYTooltipPlacement = XYPopoverPlacement;

/**
 * 提示触发方式，空数组表示手动控制
 */
export type XYTooltipTrigger = XYPopoverTrigger;

/**
 * PC 与 App 共用的原生文字提示；继承项与 Popover 同义
 */
export interface XYTooltipProps extends Omit<XYPopoverProps, 'content' | 'title' | 'bodyStyle' | 'closeOnClickOutside' | 'clickOutsideIgnore'> {
  /** 提示内容；空字符串、null、undefined、false 不显示，数值 0 正常显示 */
  title?: ReactNode | (() => ReactNode);
  /** 是否使用触屏外观与交互；公开入口默认按 hover/pointer 能力选择，显式值优先 */
  isMobile?: boolean;
  /** 是否仅在触发内容溢出时显示，默认 false */
  ellipsis?: boolean;
  /** 是否禁用提示，默认 false；与子按钮的 disabled 分别控制 */
  disabled?: boolean;
  /** 可选触发节点无障碍名称，默认保留 children 上的名称 */
  ariaLabel?: string;
  /**
   * 指定省略检测节点，默认测量真实触发节点或禁用包装内的控件；返回 null 时视为未溢出
   *
   * @param { HTMLElement } trigger - 用于定位的触发节点；禁用控件为兼容包装节点
   * @returns { HTMLElement | null } - 实际应用省略样式的内容节点
   */
  getOverflowElement?: (trigger: HTMLElement) => HTMLElement | null;
}

/**
 * 省略测量结果及触发节点绑定入口，供内部显隐策略使用
 */
export interface EllipsisState {
  /** 绑定实际触发节点，不覆盖调用方 ref */
  setNode: Dispatch<SetStateAction<HTMLElement | null>>;
  /** 按真实布局检查，未启用省略检测时始终返回 true */
  check: () => boolean;
  /** 当前是否满足显示条件 */
  enabled: boolean;
  /** 已确定未溢出时清空非受控打开请求 */
  resetOpen: boolean;
}
