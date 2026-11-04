/**
 * 测量真实触发节点的省略状态，保留调用方 ref 并兼容缺少尺寸观察器的终端
 * 内容、窗口尺寸变化和准备打开时均按实际布局复查
 *
 * Created at     : 2026-10-21 15:27:00
 * Last modified  : 2026-10-21 16:10:52
 */

import { useCallback, useLayoutEffect, useState } from 'react';
import type { EllipsisState, XYTooltipProps } from '../index.type';

/**
 * 跟踪省略节点；null 表示真实触发节点尚未就绪
 */
export function useEllipsis(
  ellipsis: boolean,
  getOverflowElement: XYTooltipProps['getOverflowElement'],
  disabledChild: boolean
): EllipsisState {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [overflowing, setOverflowing] = useState<boolean | null>(null);
  const getTarget = useCallback(() => {
    if (!node) return null;
    if (getOverflowElement) return getOverflowElement(node);

    // 禁用按钮通过包装节点接收 hover 和定位，省略仍由原始控件自身决定。
    return disabledChild ? node.firstElementChild : node;
  }, [node, getOverflowElement, disabledChild]);
  const check = useCallback(() => {
    if (!ellipsis) return true;

    const target = getTarget();
    const next = !!target && (target.scrollWidth > target.clientWidth || target.scrollHeight > target.clientHeight);

    setOverflowing(next);

    return next;
  }, [ellipsis, getTarget]);

  useLayoutEffect(() => {
    if (node && ellipsis) check();
  });

  useLayoutEffect(() => {
    if (!ellipsis || !node) return;

    let target = getTarget();
    const win = node.ownerDocument.defaultView;

    if (!win) return;

    const observer = win.ResizeObserver ? new win.ResizeObserver(check) : undefined;
    const mutation = new win.MutationObserver(() => {
      const nextTarget = getTarget();

      if (target !== nextTarget) {
        if (target) observer?.unobserve(target);

        target = nextTarget;

        if (target) observer?.observe(target);
      }

      check();
    });

    if (target) observer?.observe(target);
    mutation.observe(node, { subtree: true, childList: true, characterData: true, attributes: true });
    win.addEventListener('resize', check);

    return () => {
      observer?.disconnect();
      mutation.disconnect();
      win.removeEventListener('resize', check);
    };
  }, [ellipsis, node, getTarget, check]);

  return { setNode, check, enabled: !ellipsis || overflowing === true, resetOpen: ellipsis && overflowing === false };
}
