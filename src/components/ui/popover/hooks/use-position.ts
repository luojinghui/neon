'use client';

/**
 * 管理共享浮层的容器坐标、可选视口适配和打开期间的位置更新
 * 支持轴向缩放与平移；不处理旋转、倾斜或三维变换
 *
 * Created at     : 2026-10-20 17:07:51
 * Last modified  : 2026-10-21 15:52:11
 */

import { useCallback, useLayoutEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import type { CSSProperties } from 'react';
import type {
  ElementScale,
  PopoverBoundary,
  PopoverPosition,
  PopoverPositionState,
  PopoverWindow,
  UsePopoverPositionOptions
} from '../index.type';
import { computePopoverPosition, getPopoverSide } from '../utils/position';

const FALLBACK_INTERVAL = 120;
const CLIPPING_OVERFLOW = /^(auto|scroll|hidden|clip)$/;

function readPixel(value: string): number {
  const number = Number.parseFloat(value);

  return Number.isFinite(number) ? number : 0;
}

function finiteNumber(value: number | undefined): number {
  const number = value ?? 0;

  return Number.isFinite(number) ? number : 0;
}

function readScale(element: HTMLElement, rect: DOMRect): ElementScale {
  const x = element.offsetWidth > 0 ? rect.width / element.offsetWidth : 1;
  const y = element.offsetHeight > 0 ? rect.height / element.offsetHeight : 1;

  return { x: x > 0 && Number.isFinite(x) ? x : 1, y: y > 0 && Number.isFinite(y) ? y : 1 };
}

/** offset 尺寸会取整；视口适配必须使用小数 CSS 尺寸，避免约束高度反向改变测得缩放比例。 */
function readFittedScale(element: HTMLElement, rect: DOMRect, win: PopoverWindow): ElementScale {
  const fallback = readScale(element, rect);
  const css = win.getComputedStyle(element);
  let width = readPixel(css.width);
  let height = readPixel(css.height);

  if (css.boxSizing !== 'border-box') {
    width += readPixel(css.paddingLeft) + readPixel(css.paddingRight)
      + readPixel(css.borderLeftWidth) + readPixel(css.borderRightWidth);
    height += readPixel(css.paddingTop) + readPixel(css.paddingBottom)
      + readPixel(css.borderTopWidth) + readPixel(css.borderBottomWidth);
  }

  // CSSOM 序列化通常仅保留三位小数，低于布局精度的差异不应识别为真实缩放。
  const x = width > 0 ? Math.abs(rect.width - width) < 0.01 ? 1 : rect.width / width : fallback.x;
  const y = height > 0 ? Math.abs(rect.height - height) < 0.01 ? 1 : rect.height / height : fallback.y;

  return { x: x > 0 && Number.isFinite(x) ? x : 1, y: y > 0 && Number.isFinite(y) ? y : 1 };
}

function getViewportBoundary(doc: Document, win: PopoverWindow): PopoverBoundary {
  const viewport = win.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  const width = viewport?.width || doc.documentElement.clientWidth || win.innerWidth;
  const height = viewport?.height || doc.documentElement.clientHeight || win.innerHeight;

  return { left, top, right: left + width, bottom: top + height };
}

/** 只考虑浮层实际祖先；挂载到 body 时不受触发器滚动祖先裁切。 */
function getClippingBoundary(popup: HTMLElement, win: PopoverWindow): PopoverBoundary {
  const doc = popup.ownerDocument;
  const boundary = getViewportBoundary(doc, win);

  for (let ancestor = popup.parentElement; ancestor && ancestor !== doc.body; ancestor = ancestor.parentElement) {
    const css = win.getComputedStyle(ancestor);
    const clipX = CLIPPING_OVERFLOW.test(css.overflowX || css.overflow);
    const clipY = CLIPPING_OVERFLOW.test(css.overflowY || css.overflow);

    if (!clipX && !clipY) continue;

    const rect = ancestor.getBoundingClientRect();
    const scale = readScale(ancestor, rect);
    const leftBorder = ancestor.clientLeft || readPixel(css.borderLeftWidth);
    const topBorder = ancestor.clientTop || readPixel(css.borderTopWidth);
    const left = rect.left + leftBorder * scale.x;
    const top = rect.top + topBorder * scale.y;
    const width = ancestor.clientWidth > 0
      ? ancestor.clientWidth * scale.x
      : Math.max(0, rect.width - (leftBorder + readPixel(css.borderRightWidth)) * scale.x);
    const height = ancestor.clientHeight > 0
      ? ancestor.clientHeight * scale.y
      : Math.max(0, rect.height - (topBorder + readPixel(css.borderBottomWidth)) * scale.y);

    if (clipX) {
      boundary.left = Math.max(boundary.left, left);
      boundary.right = Math.max(boundary.left, Math.min(boundary.right, left + width));
    }

    if (clipY) {
      boundary.top = Math.max(boundary.top, top);
      boundary.bottom = Math.max(boundary.top, Math.min(boundary.bottom, top + height));
    }
  }

  return boundary;
}

function insetBoundary(boundary: PopoverBoundary, padding: number): PopoverBoundary {
  const horizontal = Math.min(padding, (boundary.right - boundary.left) / 2);
  const vertical = Math.min(padding, (boundary.bottom - boundary.top) / 2);

  return {
    left: boundary.left + horizontal,
    top: boundary.top + vertical,
    right: boundary.right - horizontal,
    bottom: boundary.bottom - vertical
  };
}

/** 先测量安全区域内的自然尺寸，再限制所选方向可用空间；临时样式不覆盖调用方。 */
function measureFittedPopup(
  popup: HTMLElement,
  anchor: DOMRect,
  boundary: PopoverBoundary,
  offset: [number, number],
  win: PopoverWindow,
  options: Pick<UsePopoverPositionOptions, 'placement' | 'autoAdjustOverflow' | 'maxWidth'>
) {
  const scale = readFittedScale(popup, popup.getBoundingClientRect(), win);
  const previousWidth = popup.style.maxWidth;
  const previousHeight = popup.style.maxHeight;
  const widthLimit = options.maxWidth === undefined || !Number.isFinite(options.maxWidth)
    ? Infinity
    : Math.max(0, options.maxWidth);
  let maxWidth = Math.min(widthLimit, (boundary.right - boundary.left) / scale.x);
  let maxHeight = (boundary.bottom - boundary.top) / scale.y;
  popup.style.maxWidth = `${maxWidth}px`;
  popup.style.maxHeight = `${maxHeight}px`;
  const measured = popup.getBoundingClientRect();
  const preferred = computePopoverPosition({
    anchor, popup: measured, boundary, offset,
    placement: options.placement,
    autoAdjustOverflow: options.autoAdjustOverflow
  });
  const side = getPopoverSide(preferred.placement);
  const vertical = side === 'top' || side === 'bottom';
  const adjustedOffset: [number, number] = [...offset];

  if (preferred.placement !== options.placement) {
    if (vertical) adjustedOffset[1] *= -1;
    else adjustedOffset[0] *= -1;
  }

  if (vertical) {
    const available = side === 'top'
      ? anchor.top + adjustedOffset[1] - boundary.top
      : boundary.bottom - anchor.bottom - adjustedOffset[1];
    maxHeight = Math.min(maxHeight, Math.max(0, available) / scale.y);
  } else {
    const available = side === 'left'
      ? anchor.left + adjustedOffset[0] - boundary.left
      : boundary.right - anchor.right - adjustedOffset[0];
    maxWidth = Math.min(maxWidth, Math.max(0, available) / scale.x);
  }

  popup.style.maxWidth = `${maxWidth}px`;
  popup.style.maxHeight = `${maxHeight}px`;
  const rect = popup.getBoundingClientRect();
  const position = computePopoverPosition({
    anchor, popup: rect, boundary, offset: adjustedOffset,
    placement: preferred.placement,
    autoAdjustOverflow: options.autoAdjustOverflow
  });

  if (options.autoAdjustOverflow) {
    position.left = Math.max(boundary.left, Math.min(position.left, boundary.right - rect.width));
    position.top = Math.max(boundary.top, Math.min(position.top, boundary.bottom - rect.height));
  }

  popup.style.maxWidth = previousWidth;
  popup.style.maxHeight = previousHeight;

  return { rect, position, scale, style: { maxWidth, maxHeight } };
}

function getContainingBlock(popup: HTMLElement, win: PopoverWindow): HTMLElement | null {
  const doc = popup.ownerDocument;
  const offsetParent = popup.offsetParent;

  if (offsetParent && offsetParent instanceof win.HTMLElement) {
    const parent = offsetParent as HTMLElement;
    const css = win.getComputedStyle(parent);

    const documentRoot = parent === doc.body || parent === doc.documentElement;

    if (!documentRoot || (css.position && css.position !== 'static') || (css.transform && css.transform !== 'none')) {
      return parent;
    }
  }

  // jsdom 没有 offsetParent；仍按真实的定位/变换祖先规则回落。
  for (let ancestor = popup.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const css = win.getComputedStyle(ancestor);

    if ((css.position && css.position !== 'static') || (css.transform && css.transform !== 'none')) return ancestor;
  }

  return null;
}

function toContainerStyle(popup: HTMLElement, position: PopoverPosition, win: PopoverWindow): CSSProperties {
  const css = win.getComputedStyle(popup);
  const marginLeft = readPixel(css.marginLeft);
  const marginTop = readPixel(css.marginTop);
  const parent = getContainingBlock(popup, win);

  if (!parent) {
    return {
      position: 'absolute',
      left: position.left + win.scrollX - marginLeft,
      top: position.top + win.scrollY - marginTop
    };
  }

  const rect = parent.getBoundingClientRect();
  const scale = readScale(parent, rect);
  const parentStyle = win.getComputedStyle(parent);
  const borderLeft = parent.clientLeft || readPixel(parentStyle.borderLeftWidth);
  const borderTop = parent.clientTop || readPixel(parentStyle.borderTopWidth);

  return {
    position: 'absolute',
    left: (position.left - rect.left) / scale.x + parent.scrollLeft - borderLeft - marginLeft,
    top: (position.top - rect.top) / scale.y + parent.scrollTop - borderTop - marginTop
  };
}

/** 读取皮肤使用的角落锚点，按实际字号换算相对单位；未知表达式沿用 Popover 默认值。 */
function readArrowCorner(popup: HTMLElement, win: PopoverWindow, vertical: boolean): number {
  const css = win.getComputedStyle(popup);
  const value = css.getPropertyValue(vertical ? '--xy-floating-corner-x' : '--xy-floating-corner-y').trim();
  const match = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(px|rem|em)$/.exec(value);

  if (!match) return value === '0' ? 0 : vertical ? 16 : 12;

  const unit = match[2];
  const ratio = unit === 'rem'
    ? readPixel(win.getComputedStyle(popup.ownerDocument.documentElement).fontSize)
    : unit === 'em' ? readPixel(css.fontSize) : 1;

  return Number(match[1]) * ratio;
}

/** 旧模式仅在贴边时校正角落锚点；提示模式始终返回指向触发器的箭头中心坐标。 */
function getArrowStyle(
  position: PopoverPosition,
  rect: DOMRect,
  scale: ElementScale,
  anchor: DOMRect,
  arrow: HTMLElement | null,
  pointAtTrigger: boolean,
  popup: HTMLElement,
  win: PopoverWindow
): CSSProperties {
  const vertical = getPopoverSide(position.placement) === 'top' || getPopoverSide(position.placement) === 'bottom';
  const shift = vertical ? position.shiftX / scale.x : position.shiftY / scale.y;
  const length = vertical ? rect.width / scale.x : rect.height / scale.y;
  // 提示箭头在左右方位旋转九十度，取最长边为占位，避免旋转后触及卡片圆角。
  const arrowLength = (pointAtTrigger
    ? Math.max(arrow?.offsetWidth ?? 0, arrow?.offsetHeight ?? 0)
    : vertical ? arrow?.offsetWidth : arrow?.offsetHeight) || 22;

  if (pointAtTrigger) {
    const center = vertical
      ? (anchor.left + anchor.width / 2 - position.left) / scale.x
      : (anchor.top + anchor.height / 2 - position.top) / scale.y;
    const min = Math.min(length / 2, arrowLength / 2 + 4);
    const max = Math.max(min, length - arrowLength / 2 - 4);
    const coordinate = Math.max(min, Math.min(center, max));

    return vertical ? { left: coordinate, right: 'auto' } : { top: coordinate, bottom: 'auto' };
  }

  if (shift === 0) return {};

  const start = position.placement.endsWith(vertical ? 'Left' : 'Top');
  const end = position.placement.endsWith(vertical ? 'Right' : 'Bottom');
  const centered = !start && !end;
  const cornerOffset = readArrowCorner(popup, win, vertical);
  const base = start ? cornerOffset : end ? length - cornerOffset - arrowLength : length / 2;
  const min = centered ? arrowLength / 2 + 4 : 4;
  const max = centered ? length - arrowLength / 2 - 4 : length - arrowLength - 4;
  const coordinate = Math.max(min, Math.min(base - shift, max));

  return vertical ? { left: coordinate, right: 'auto' } : { top: coordinate, bottom: 'auto' };
}

function getTransformOrigin(
  position: PopoverPosition,
  arrowStyle: CSSProperties,
  arrow: HTMLElement | null,
  pointAtTrigger: boolean
): string {
  const side = getPopoverSide(position.placement);
  const verticalSide = side === 'top' || side === 'bottom';
  const shiftedCoordinate = verticalSide ? arrowStyle.left : arrowStyle.top;

  if (typeof shiftedCoordinate === 'number') {
    const arrowLength = (verticalSide ? arrow?.offsetWidth : arrow?.offsetHeight) || 22;
    const centered = pointAtTrigger || position.placement === side;
    const coordinate = shiftedCoordinate + (centered ? 0 : arrowLength / 2);

    if (verticalSide) return `${coordinate}px ${side === 'top' ? '100%' : '0%'}`;

    return `${side === 'left' ? '100%' : '0%'} ${coordinate}px`;
  }

  const horizontal = position.placement.endsWith('Left') ? '0%' : position.placement.endsWith('Right') ? '100%' : '50%';
  const vertical = position.placement.endsWith('Top') ? '0%' : position.placement.endsWith('Bottom') ? '100%' : '50%';

  if (side === 'top') return `${horizontal} 100%`;
  if (side === 'bottom') return `${horizontal} 0%`;

  return `${side === 'left' ? '100%' : '0%'} ${vertical}`;
}

function sameStyle(first: CSSProperties, second: CSSProperties): boolean {
  const keys = Object.keys(first) as Array<keyof CSSProperties>;

  return keys.length === Object.keys(second).length && keys.every((key) => first[key] === second[key]);
}

/**
 * 在打开期间按帧合并位置更新；缺少 ResizeObserver 时仅在打开期间轮询尺寸
 */
export function usePopoverPosition(options: UsePopoverPositionOptions): PopoverPositionState {
  const {
    trigger, popup, enabled, placement, autoAdjustOverflow, fitViewport = false,
    maxWidth, arrowElement, arrowPointAtTrigger = false
  } = options;
  const boundaryPadding = Math.max(0, finiteNumber(options.boundaryPadding));
  const gap = Math.max(0, finiteNumber(options.gap));
  const cornerOffset = finiteNumber(options.cornerOffset);
  const side = getPopoverSide(placement);
  const offsetX = finiteNumber(options.offset?.[0])
    + (side === 'left' ? -gap : side === 'right' ? gap : 0)
    + (placement.endsWith('Left') ? -cornerOffset : placement.endsWith('Right') ? cornerOffset : 0);
  const offsetY = finiteNumber(options.offset?.[1])
    + (side === 'top' ? -gap : side === 'bottom' ? gap : 0)
    + (placement.endsWith('Top') ? -cornerOffset : placement.endsWith('Bottom') ? cornerOffset : 0);
  const [state, setState] = useState<PopoverPositionState>({
    ready: false,
    placement,
    style: { position: 'absolute', left: 0, top: 0 },
    arrowStyle: {},
    transformOrigin: '50% 100%'
  });
  const updatePosition = useCallback(() => {
    if (!enabled || !trigger || !popup) return;

    const win = popup.ownerDocument.defaultView;

    if (!win || trigger.ownerDocument !== popup.ownerDocument) return;

    const anchor = trigger.getBoundingClientRect();
    const boundary = insetBoundary(getClippingBoundary(popup, win), boundaryPadding);
    const fitted = fitViewport
      ? measureFittedPopup(popup, anchor, boundary, [offsetX, offsetY], win, {
        placement, autoAdjustOverflow, maxWidth
      })
      : undefined;
    const rect = fitted?.rect ?? popup.getBoundingClientRect();
    const position = fitted?.position ?? computePopoverPosition({
      anchor,
      popup: rect,
      placement,
      offset: [offsetX, offsetY],
      boundary,
      autoAdjustOverflow
    });
    const arrow = arrowElement ?? popup.querySelector<HTMLElement>('.xy-popover-arrow, .xy-ant-popover-arrow');
    const arrowStyle = getArrowStyle(
      position, rect, fitted?.scale ?? readScale(popup, rect), anchor, arrow, arrowPointAtTrigger, popup, win
    );
    const next: PopoverPositionState = {
      ready: true,
      placement: position.placement,
      style: { ...toContainerStyle(popup, position, win), ...fitted?.style },
      arrowStyle,
      transformOrigin: getTransformOrigin(position, arrowStyle, arrow, arrowPointAtTrigger)
    };

    setState((previous) => previous.ready
      && previous.placement === next.placement
      && previous.transformOrigin === next.transformOrigin
      && sameStyle(previous.style, next.style)
      && sameStyle(previous.arrowStyle, next.arrowStyle) ? previous : next);
  }, [
    enabled, trigger, popup, placement, offsetX, offsetY, autoAdjustOverflow,
    boundaryPadding, fitViewport, maxWidth, arrowElement, arrowPointAtTrigger
  ]);

  // 内容或样式由父级重渲染时也需同步尺寸；相同坐标不会再次触发渲染。
  useLayoutEffect(() => updatePosition());

  useLayoutEffect(() => {
    if (!enabled || !trigger || !popup) return;

    const doc = popup.ownerDocument;
    const win = doc.defaultView;

    if (!win || trigger.ownerDocument !== doc) return;

    let frame: number | undefined;
    let active = true;
    const schedulePosition = () => {
      if (frame !== undefined || !active) return;

      frame = win.requestAnimationFrame(() => {
        frame = undefined;

        // resize 后页面已重排；必须在本帧绘制前提交坐标，避免 React 批处理保留上一帧位置。
        if (active) flushSync(updatePosition);
      });
    };
    const Observer = win.ResizeObserver;
    const observer = Observer ? new Observer(schedulePosition) : undefined;
    observer?.observe(trigger);
    observer?.observe(popup);

    if (popup.parentElement) observer?.observe(popup.parentElement);

    const containingBlock = getContainingBlock(popup, win);

    if (containingBlock && containingBlock !== popup.parentElement) observer?.observe(containingBlock);

    const fallback = observer ? undefined : win.setInterval(schedulePosition, FALLBACK_INTERVAL);
    doc.addEventListener('scroll', schedulePosition, true);
    win.addEventListener('resize', schedulePosition);
    win.visualViewport?.addEventListener('resize', schedulePosition);
    win.visualViewport?.addEventListener('scroll', schedulePosition);

    return () => {
      active = false;

      if (frame !== undefined) win.cancelAnimationFrame(frame);
      if (fallback !== undefined) win.clearInterval(fallback);

      observer?.disconnect();
      doc.removeEventListener('scroll', schedulePosition, true);
      win.removeEventListener('resize', schedulePosition);
      win.visualViewport?.removeEventListener('resize', schedulePosition);
      win.visualViewport?.removeEventListener('scroll', schedulePosition);
    };
  }, [enabled, trigger, popup, updatePosition]);

  return state;
}
