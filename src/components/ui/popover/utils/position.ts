/**
 * 计算 Popover 的十二方位、主轴翻转与横向贴边，不依赖 DOM 或外部浮层库
 * 所有输入输出均使用视口 CSS 像素，保留调用方指定的浮层尺寸
 *
 * Created at     : 2026-10-20 17:07:51
 * Last modified  : 2026-10-20 19:45:03
 */

import type {
  PopoverBoundary,
  PopoverPosition,
  PopoverPositionOptions,
  PopoverRect,
  PopoverSide,
  XYPopoverPlacement
} from '../index.type';

const OPPOSITE_PLACEMENT: Record<XYPopoverPlacement, XYPopoverPlacement> = {
  top: 'bottom', topLeft: 'bottomLeft', topRight: 'bottomRight',
  bottom: 'top', bottomLeft: 'topLeft', bottomRight: 'topRight',
  left: 'right', leftTop: 'rightTop', leftBottom: 'rightBottom',
  right: 'left', rightTop: 'leftTop', rightBottom: 'leftBottom'
};

/**
 * 提取实际主方向
 */
export function getPopoverSide(placement: XYPopoverPlacement): PopoverSide {
  if (placement.startsWith('top')) return 'top';
  if (placement.startsWith('bottom')) return 'bottom';
  if (placement.startsWith('left')) return 'left';

  return 'right';
}

function getPreferredPosition(
  anchor: PopoverRect,
  popup: Pick<PopoverRect, 'width' | 'height'>,
  placement: XYPopoverPlacement,
  offset: [number, number]
): PopoverPosition {
  const side = getPopoverSide(placement);
  let left = anchor.left + (anchor.width - popup.width) / 2;
  let top = anchor.top + (anchor.height - popup.height) / 2;

  if (side === 'top' || side === 'bottom') {
    top = side === 'top' ? anchor.top - popup.height : anchor.top + anchor.height;

    if (placement.endsWith('Left')) left = anchor.left;
    if (placement.endsWith('Right')) left = anchor.left + anchor.width - popup.width;
  } else {
    left = side === 'left' ? anchor.left - popup.width : anchor.left + anchor.width;

    if (placement.endsWith('Top')) top = anchor.top;
    if (placement.endsWith('Bottom')) top = anchor.top + anchor.height - popup.height;
  }

  return { left: left + offset[0], top: top + offset[1], placement, shiftX: 0, shiftY: 0 };
}

function getOverflow(position: PopoverPosition, popup: Pick<PopoverRect, 'width' | 'height'>, boundary: PopoverBoundary): number {
  return Math.max(0, boundary.left - position.left)
    + Math.max(0, position.left + popup.width - boundary.right)
    + Math.max(0, boundary.top - position.top)
    + Math.max(0, position.top + popup.height - boundary.bottom);
}

/**
 * 按首选、相反方向、交叉轴贴边的顺序定位；两侧不足时选择较少溢出的一侧
 * 不缩放或裁切内容，超宽/超高时将交叉轴起点贴近可视边界
 */
export function computePopoverPosition(options: PopoverPositionOptions): PopoverPosition {
  const { anchor, popup, placement, boundary, autoAdjustOverflow } = options;
  const [offsetX, offsetY] = options.offset ?? [0, 0];
  const offset: [number, number] = [
    Number.isFinite(offsetX) ? offsetX : 0,
    Number.isFinite(offsetY) ? offsetY : 0
  ];
  const preferred = getPreferredPosition(anchor, popup, placement, offset);

  if (!autoAdjustOverflow) return preferred;

  const side = getPopoverSide(placement);
  const vertical = side === 'top' || side === 'bottom';
  const oppositeOffset: [number, number] = vertical ? [offset[0], -offset[1]] : [-offset[0], offset[1]];
  const opposite = getPreferredPosition(anchor, popup, OPPOSITE_PLACEMENT[placement], oppositeOffset);
  const result = getOverflow(opposite, popup, boundary) < getOverflow(preferred, popup, boundary) ? opposite : preferred;

  if (vertical) {
    const left = Math.max(boundary.left, Math.min(result.left, boundary.right - popup.width));

    return { ...result, left, shiftX: left - result.left };
  }

  const top = Math.max(boundary.top, Math.min(result.top, boundary.bottom - popup.height));

  return { ...result, top, shiftY: top - result.top };
}
