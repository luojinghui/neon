'use client';

/**
 * 提供独立的内容气泡、显隐控制及旧业务样式槽位
 *
 * Created at     : 2026-01-06 18:30:12
 * Last modified  : 2026-10-21 15:27:00
 */

import { useContext, useEffect, type JSX } from 'react';
import { createPortal } from 'react-dom';
import type { XYPopoverProps } from './index.type';
import { usePopup } from './hooks/use-popup';
import { useOverlayRadius } from './hooks/use-radius';
import { PopoverLayerContext, PopoverTriggerContext } from './hooks/use-layer';
import floating from './style/floating.module.css';
import styles from './index.module.css';

const OVERLAY_ROOT_CLASS = 'xy-popover-overlay-root';

/**
 * 展示交互内容；只依赖 React、ReactDOM 和浏览器能力
 */
const XYPopover = (props: XYPopoverProps): JSX.Element => {
  const ancestorTriggerOpen = useContext(PopoverTriggerContext);
  const {
    title,
    content,
    open,
    onOpenChange,
    prefixCls = 'xy-ant-popover',
    arrow = true,
    width,
    overlayClassName,
    overlayStyle,
    overlayInnerStyle,
    bodyStyle,
    zIndex,
    id,
    role = 'dialog',
    transitionName,
    closeOnClickOutside = false,
    clickOutsideIgnore
  } = props;
  const {
    trigger, position, presence, layer, container, setPopup, setThemeBoundary, renderPopup, effectiveOpen, overlayLevel
  } = usePopup(props, {
    wrapperClassName: floating.triggerWrapper,
    customClassName: floating.customTrigger,
    disabledClassName: floating.disabledTrigger,
    closeOnEscape: true,
    trackExpanded: true,
    positionOptions: { fitViewport: props.fitViewport, boundaryPadding: props.boundaryPadding }
  });
  const radiusStyle = useOverlayRadius(trigger.node, props.radius, 'lg');

  useEffect(() => {
    if (!closeOnClickOutside || !open) return;

    const selectors = Array.isArray(clickOutsideIgnore) ? clickOutsideIgnore : [clickOutsideIgnore];
    const doc = trigger.node?.ownerDocument || document;
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target;

      if (!(target instanceof Element)) return;
      if (target.closest(`.${OVERLAY_ROOT_CLASS}`)) return;
      if (selectors.some((selector) => selector && target.closest(selector))) return;

      // 保留自定义手动关闭的旧契约，不联动旧 onVisibleChange。
      onOpenChange?.(false);
    };

    doc.addEventListener('mousedown', handleMouseDown);

    return () => doc.removeEventListener('mousedown', handleMouseDown);
  }, [closeOnClickOutside, open, clickOutsideIgnore, onOpenChange, trigger.node]);

  const rootClassName = [
    floating.root,
    styles.root,
    'xy-popover-container',
    OVERLAY_ROOT_CLASS,
    prefixCls,
    `${prefixCls}-placement-${position.placement}`,
    arrow && 'xy-popover-container-arrow',
    width !== undefined && 'xy-popover-container-custom-width',
    presence.phase === 'closed' && `${prefixCls}-hidden`,
    overlayClassName
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <PopoverLayerContext.Provider value={layer.contextValue}>
      <PopoverTriggerContext.Provider value={ancestorTriggerOpen || effectiveOpen}>
        {trigger.element}
      </PopoverTriggerContext.Provider>
      {renderPopup &&
        container &&
        createPortal(
          <div ref={setThemeBoundary} className={floating.themeBoundary} data-ui-popover-theme="">
            <div
              {...layer.captureProps}
              {...trigger.hoverHandlers}
              ref={setPopup}
              className={rootClassName}
              data-state={presence.phase}
              data-placement={position.placement}
              data-arrow={String(arrow)}
              data-custom-width={String(width !== undefined)}
              data-fit-viewport={String(!!props.fitViewport)}
              data-no-motion={String(transitionName === '')}
              style={{
                ...overlayStyle,
                zIndex: overlayLevel,
                ...(width !== undefined ? { width } : {}),
                ...(zIndex !== undefined ? { zIndex } : {}),
                ...position.style
              }}
            >
              <div
                className={`${floating.motion} xy-popover-content ${prefixCls}-content`}
                style={{ transformOrigin: position.transformOrigin }}
                onTransitionEnd={presence.onTransitionEnd}
              >
                <div className={`${floating.arrow} xy-popover-arrow ${prefixCls}-arrow`} style={position.arrowStyle}>
                  <span className={`${floating.arrowContent} xy-popover-arrow-content ${prefixCls}-arrow-content`} />
                </div>
                <div
                  className={`${styles.inner} xy-popover-inner ${prefixCls}-inner`}
                  role={role}
                  id={id}
                  style={{ ...overlayInnerStyle, ...radiusStyle }}
                >
                  {title !== undefined && title !== null && title !== false && title !== '' && (
                    <div className={`${styles.title} xy-popover-title ${prefixCls}-title`}>
                      {typeof title === 'function' ? title() : title}
                    </div>
                  )}
                  <div className={`${styles.body} xy-popover-body ${prefixCls}-inner-content`} style={bodyStyle}>
                    {typeof content === 'function' ? content() : content}
                  </div>
                </div>
              </div>
            </div>
          </div>,
          container
        )}
    </PopoverLayerContext.Provider>
  );
};

export { XYPopover };
export type { XYPopoverProps, XYPopoverPlacement, XYPopoverTrigger, OverlayRadius } from './index.type';
