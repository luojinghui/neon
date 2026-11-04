'use client';

/**
 * 提供 PC 与 App 共用的原生文字提示，复用 Popover 的浮层生命周期和定位
 *
 * Created at     : 2025-04-25 11:38:48
 * Last modified  : 2026-10-21 16:10:52
 */

import { Fragment, isValidElement, useContext, useId, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import cn from 'clsx';
import { usePopup } from '../popover/hooks/use-popup';
import { useOverlayRadius } from '../popover/hooks/use-radius';
import { PopoverLayerContext, PopoverTriggerContext } from '../popover/hooks/use-layer';
import type { TriggerElementProps } from '../popover/index.type';
import { useEllipsis } from './hooks/use-ellipsis';
import type { XYTooltipProps } from './index.type';
import floating from '../popover/style/floating.module.css';
import styles from './index.module.css';

/**
 * 原生提示组件；公开入口按输入能力选择 isMobile，显式值优先
 */
const XYTooltip = (props: XYTooltipProps): ReactElement => {
  const {
    title, isMobile = false, ellipsis = false, disabled = false, children, ariaLabel, getOverflowElement,
    prefixCls = 'xy-tooltip', trigger = isMobile ? 'click' : ['hover', 'focus'], className, overlayClassName,
    overlayStyle, overlayInnerStyle, width, zIndex, arrow = true, id, transitionName = isMobile ? '' : undefined
  } = props;
  const parentTriggerOpen = useContext(PopoverTriggerContext);
  const generatedId = useId();
  const actions = Array.isArray(trigger) ? trigger : [trigger];
  const [arrowElement, setArrowElement] = useState<HTMLDivElement | null>(null);
  const descriptionId = id ?? generatedId;
  const content = typeof title === 'function' ? title() : title;
  const hasContent = content !== undefined && content !== null && content !== false && content !== '';
  const disabledChild = isValidElement<TriggerElementProps>(children) && Boolean(children.props.disabled);
  const overflow = useEllipsis(ellipsis, getOverflowElement, disabledChild);
  const enabled = hasContent && !disabled && !parentTriggerOpen && overflow.enabled;
  const canOpen = () => hasContent && !disabled && !parentTriggerOpen && overflow.check();
  const renderedChildren = ellipsis && (!isValidElement(children) || children.type === Fragment)
    ? <span className={styles.text}>{children}</span>
    : children;
  const state = usePopup({
    ...props,
    title: undefined,
    content,
    children: renderedChildren,
    prefixCls,
    trigger,
    className: cn(isMobile && styles.mobileTrigger, className),
    transitionName
  }, {
    enabled,
    resetOpen: !hasContent || disabled || parentTriggerOpen || overflow.resetOpen,
    beforeOpen: canOpen,
    descriptionId,
    trackExpanded: isMobile && !parentTriggerOpen,
    ariaLabel,
    onNodeChange: overflow.setNode,
    isolateClick: isMobile,
    preventClickDefault: false,
    coordinateFocus: true,
    allowDisabledTrigger: enabled,
    dismissOnTriggerClick: !isMobile && !actions.includes('click')
      && (actions.includes('hover') || actions.includes('focus')),
    outsideMouse: true,
    captureOutside: isMobile,
    closeOnEscape: true,
    closeOnScroll: isMobile,
    wrapperClassName: floating.triggerWrapper,
    customClassName: floating.customTrigger,
    disabledClassName: floating.disabledTrigger,
    disabledChildClassName: isMobile ? styles.mobileTrigger : undefined,
    positionOptions: {
      arrowElement,
      arrowPointAtTrigger: isMobile,
      boundaryPadding: isMobile ? 16 : 0,
      fitViewport: isMobile,
      maxWidth: isMobile ? 264 : undefined,
      gap: isMobile ? 10 : 0,
      cornerOffset: isMobile ? 8 : 0
    }
  });
  const { layer, trigger: triggerState, position, presence, renderPopup, container, setPopup, setThemeBoundary, overlayLevel } = state;
  const radiusStyle = useOverlayRadius(triggerState.node, props.radius, 'sm');
  const placementClass = `${prefixCls}-placement-${position.placement}`;

  return (
    <PopoverLayerContext.Provider value={layer.contextValue}>
      {triggerState.element}
      {renderPopup && container && createPortal(
        <div ref={setThemeBoundary} className={floating.themeBoundary} data-xy-tooltip-theme="">
          <div
            {...layer.captureProps}
            {...triggerState.hoverHandlers}
            ref={setPopup}
            className={cn(floating.root, styles.root, 'xy-tooltip-container', isMobile && 'xy-tooltip-container--mobile',
              prefixCls, placementClass, overlayClassName)}
            data-placement={position.placement}
            data-state={presence.phase}
            data-mobile={String(isMobile)}
            data-arrow={String(arrow)}
            data-no-motion={String(transitionName === '')}
            data-custom-width={String(width !== undefined)}
            style={{ ...overlayStyle, zIndex: overlayLevel, ...(width !== undefined ? { width } : {}),
              ...(zIndex !== undefined ? { zIndex } : {}), ...position.style }}
            onClick={isMobile ? (event) => event.stopPropagation() : undefined}
          >
            <div className={cn(floating.motion, styles.motion, 'xy-tooltip-motion')}
              style={{ transformOrigin: position.transformOrigin }} onTransitionEnd={presence.onTransitionEnd}>
              <div ref={setArrowElement} className={cn(floating.arrow, styles.arrow, 'xy-tooltip-arrow')}
                style={position.arrowStyle} aria-hidden="true">
                <span className={cn(floating.arrowContent, styles.arrowContent, 'xy-tooltip-arrow-content')} />
              </div>
              <div className={cn(styles.inner, 'xy-tooltip-inner')} id={descriptionId} role="tooltip" style={{ ...overlayInnerStyle, ...radiusStyle }}>
                <div className={cn(styles.content, 'xy-tooltip-content')}>{content}</div>
              </div>
            </div>
          </div>
        </div>, container
      )}
    </PopoverLayerContext.Provider>
  );
};

export { XYTooltip };
export type { XYTooltipProps, XYTooltipPlacement, XYTooltipTrigger } from './index.type';
