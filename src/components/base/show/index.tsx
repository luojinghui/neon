/**
 * Show 组件 - 条件渲染组件
 * 根据 is 参数的真假值决定是否渲染 children
 *
 * Created at     : 2025-12-07 23:30:00
 * Last modified  : 2025-12-07 23:30:00
 */

import { ReactNode } from 'react';

interface ShowProps {
  /**
   * 控制是否显示的条件
   * 支持 boolean、string、number、null、undefined 等类型
   * 会自动转换为布尔值判断
   */
  is: boolean | string | number | null | undefined | unknown;

  /**
   * 要渲染的子元素
   */
  children: ReactNode;

  /**
   * 当 is 为 false 时显示的备用内容（可选）
   */
  fallback?: ReactNode;
}

/**
 * Show 组件
 */
export const Show = ({ is, children, fallback = null }: ShowProps) => {
  // 将 is 转换为布尔值
  const shouldShow = Boolean(is);

  // 根据条件返回 children 或 fallback
  return shouldShow ? <>{children}</> : <>{fallback}</>;
};
