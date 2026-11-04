'use client';

/**
 * 协调 Popover 的触发事件、延迟任务及触发节点 ref
 *
 * Created at     : 2026-10-20 17:06:54
 * Last modified  : 2026-10-21 15:27:00
 */

import {
  cloneElement,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import type {
  CSSProperties,
  HTMLAttributes,
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  ReactElement,
  Ref
} from 'react';
import type {
  PopoverNativeMouseEvent,
  PopoverTriggerOptions,
  PopoverTrigger,
  TriggerElementProps,
  XYPopoverProps
} from '../index.type';
import { useTriggerWrapperRadius } from './use-radius';

/**
 * 合并原始 ref，禁止因定位需要覆盖调用方的引用
 */
function assignRef(ref: Ref<HTMLElement> | undefined, node: HTMLElement | null): (() => void) | undefined {
  if (typeof ref === 'function') {
    const cleanup = ref(node);
    return typeof cleanup === 'function' ? cleanup : undefined;
  } else if (ref) {
    (ref as MutableRefObject<HTMLElement | null>).current = node;
  }
}

/**
 * 嵌套 Tooltip / Popover 的透明包装没有布局盒，定位和 aria 都应落到实际元素。
 */
function findTriggerElement(wrapper: HTMLElement | null): HTMLElement | null {
  if (!wrapper) return null;

  const win = wrapper.ownerDocument.defaultView;
  for (const child of Array.from(wrapper.children)) {
    if (!(child instanceof (win?.HTMLElement ?? HTMLElement))) continue;

    if (win?.getComputedStyle(child).display === 'contents') {
      const descendant = findTriggerElement(child);
      if (descendant) return descendant;
    } else {
      return child;
    }
  }

  return null;
}

/**
 * 构建触发节点及浮层 hover 协调器
 */
export function usePopoverTrigger(
  props: XYPopoverProps,
  open: boolean,
  onOpenChange: (open: boolean) => void,
  options: PopoverTriggerOptions = {}
): PopoverTrigger {
  const {
    children,
    trigger = 'hover',
    mouseEnterDelay = 0.1,
    mouseLeaveDelay = 0.1,
    prefixCls = 'xy-ant-popover',
    className,
    openClassName
  } = props;
  const actions = Array.isArray(trigger) ? trigger : [trigger];
  const hover = actions.includes('hover');
  const click = actions.includes('click');
  const focus = actions.includes('focus');
  const contextMenu = actions.includes('contextMenu');
  const [node, setNode] = useState<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestRequest = useRef(onOpenChange);
  const pressed = useRef(false);
  const focusedByPress = useRef(false);
  const touchedAt = useRef(-Infinity);
  const wrapperRef = useRef<HTMLElement | null>(null);
  const hovering = useRef(false);
  const focused = useRef(false);
  const handledClicks = useRef(new WeakSet<Event>());
  const pendingClicks = useRef(new Map<Event, ReturnType<typeof setTimeout>>());
  const {
    onNodeChange, describedBy, ariaLabel, expanded, coordinateFocus, isolateClick,
    preventClickDefault = true, dismissOnTriggerClick = false, allowDisabledTrigger = false
  } = options;

  useLayoutEffect(() => {
    onNodeChange?.(node);

    return () => onNodeChange?.(null);
  }, [node, onNodeChange]);

  useLayoutEffect(() => {
    latestRequest.current = onOpenChange;
  }, [onOpenChange]);

  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);

  const schedule = (next: boolean, seconds: number) => {
    cancel();

    if (seconds <= 0) {
      latestRequest.current(next);
    } else {
      timer.current = setTimeout(() => {
        timer.current = undefined;
        latestRequest.current(next);
      }, seconds * 1000);
    }
  };

  useEffect(() => cancel, [cancel]);
  useEffect(() => {
    const pending = pendingClicks.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);
  useEffect(() => {
    cancel();
  }, [open, hover, click, focus, contextMenu, cancel]);

  useEffect(() => {
    if (!open || !contextMenu || !node) return;

    const doc = node.ownerDocument;
    const handleClose = () => latestRequest.current(false);

    doc.addEventListener('scroll', handleClose, true);
    doc.defaultView?.addEventListener('blur', handleClose);

    return () => {
      doc.removeEventListener('scroll', handleClose, true);
      doc.defaultView?.removeEventListener('blur', handleClose);
    };
  }, [open, contextMenu, node]);

  const original = isValidElement<TriggerElementProps>(children) && children.type !== Fragment
    ? children
    : <span>{children}</span>;
  const disabled = Boolean(original.props.disabled);
  const triggerDisabled = disabled && !allowDisabledTrigger;
  const needsWrapper = disabled || typeof original.type !== 'string';
  const originalRef = original.props.ref;
  useTriggerWrapperRadius(node, wrapperRef.current);
  const handleRef = useCallback((element: HTMLElement | null) => {
    wrapperRef.current = needsWrapper ? element : null;

    if (needsWrapper && !disabled) {
      setNode(findTriggerElement(element));
    } else {
      setNode(element);
    }

    if (!needsWrapper) {
      const cleanup = assignRef(originalRef, element);
      // React 19 的 callback ref 可返回清理函数，合并引用时必须保留它。
      if (cleanup) return () => {
        cleanup();
        setNode(null);
      };
    }
  }, [needsWrapper, disabled, originalRef]);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;

    if (!needsWrapper || disabled || !wrapper) return;

    const updateNode = () => setNode(findTriggerElement(wrapper));
    const observer = new MutationObserver(updateNode);

    updateNode();
    // 只监听会改变实际根节点或 display 的变化，避免自身 aria 同步触发观察循环。
    observer.observe(wrapper, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });

    return () => observer.disconnect();
  }, [needsWrapper, disabled]);

  const originalDescription = original.props['aria-describedby'];
  const originalLabel = original.props['aria-label'];
  const originalExpanded = original.props['aria-expanded'];

  useLayoutEffect(() => {
    const target = disabled && !allowDisabledTrigger ? findTriggerElement(node) : node;

    if (!target) return;

    const previousDescription = target.getAttribute('aria-describedby');
    const previousLabel = target.getAttribute('aria-label');
    const previousExpanded = target.getAttribute('aria-expanded');
    const description = describedBy
      ? [...new Set(`${previousDescription || ''} ${describedBy}`.trim().split(/\s+/))].join(' ')
      : undefined;

    if (description) target.setAttribute('aria-describedby', description);

    if (ariaLabel !== undefined) target.setAttribute('aria-label', ariaLabel);
    if (expanded !== undefined) target.setAttribute('aria-expanded', String(expanded));

    return () => {
      if (description && target.getAttribute('aria-describedby') === description) {
        if (previousDescription === null) target.removeAttribute('aria-describedby');
        else target.setAttribute('aria-describedby', previousDescription);
      }

      if (ariaLabel !== undefined && target.getAttribute('aria-label') === ariaLabel) {
        if (previousLabel === null) target.removeAttribute('aria-label');
        else target.setAttribute('aria-label', previousLabel);
      }

      if (expanded !== undefined && target.getAttribute('aria-expanded') === String(expanded)) {
        if (previousExpanded === null) target.removeAttribute('aria-expanded');
        else target.setAttribute('aria-expanded', previousExpanded);
      }
    };
  }, [node, disabled, allowDisabledTrigger, describedBy, ariaLabel, expanded, originalDescription, originalLabel, originalExpanded]);

  const handleMouseEnter = (event: ReactMouseEvent<HTMLElement>) => {
    const capabilities = (event.nativeEvent as PopoverNativeMouseEvent).sourceCapabilities;
    const syntheticTouch = capabilities?.firesTouchEvents
      ?? Date.now() - touchedAt.current <= 800;

    if (hover && !syntheticTouch) {
      hovering.current = true;
      schedule(true, mouseEnterDelay);
    }
  };
  const handleMouseLeave = () => {
    hovering.current = false;

    if (coordinateFocus && focus && focused.current) return;
    if (hover) schedule(false, mouseLeaveDelay);
  };
  const handleClick = (event: ReactMouseEvent<HTMLElement>) => {
    const pending = pendingClicks.current.get(event.nativeEvent);
    if (pending !== undefined) {
      clearTimeout(pending);
      pendingClicks.current.delete(event.nativeEvent);
    }
    if (handledClicks.current.has(event.nativeEvent)) return;

    handledClicks.current.add(event.nativeEvent);
    if (!needsWrapper) original.props.onClick?.(event);
    if (isolateClick) event.stopPropagation();
    if (triggerDisabled) return;
    if (!click) {
      if (dismissOnTriggerClick) {
        cancel();
        onOpenChange(false);
      }
      return;
    }

    cancel();

    // 同一次鼠标操作可能先 focus 再 click，避免刚打开就关闭。
    const skipToggle = focus && focusedByPress.current;
    pressed.current = false;
    focusedByPress.current = false;

    if (skipToggle) return;

    if (preventClickDefault) event.preventDefault();
    onOpenChange(!open);
  };
  const handlers: HTMLAttributes<HTMLElement> = {
    onContextMenuCapture: needsWrapper && contextMenu && !triggerDisabled
      ? (event) => event.preventDefault()
      : needsWrapper ? undefined : original.props.onContextMenuCapture,
    onMouseEnter: (event) => {
      if (!needsWrapper) original.props.onMouseEnter?.(event);

      handleMouseEnter(event);
    },
    onMouseLeave: (event) => {
      if (!needsWrapper) original.props.onMouseLeave?.(event);

      handleMouseLeave();
    },
    onClickCapture: needsWrapper && (click || dismissOnTriggerClick) && !triggerDisabled ? (event) => {
      // 子组件可能为防止卡片点击而停止冒泡；等待原处理器后补发一次，不覆盖子组件事件。
      // Portal 内容不是触发器，不能通过 React 的逻辑冒泡再次切换父浮层。
      if (!event.currentTarget.contains(event.target as Node)) return;

      // 浏览器可在 capture 与 bubble 监听器之间执行微任务，必须等整次原生事件派发结束。
      const pending = setTimeout(() => {
        pendingClicks.current.delete(event.nativeEvent);
        if (!handledClicks.current.has(event.nativeEvent)) handleClick(event);
      }, 0);
      pendingClicks.current.set(event.nativeEvent, pending);
    } : needsWrapper ? undefined : original.props.onClickCapture,
    onClick: (event) => {
      if (needsWrapper && !event.currentTarget.contains(event.target as Node)) return;

      handleClick(event);
    },
    onKeyDown: disabled && allowDisabledTrigger ? (event) => {
      if (!click || (event.key !== 'Enter' && event.key !== ' ')) return;

      event.preventDefault();
      if (!event.repeat) event.currentTarget.click();
    } : needsWrapper ? undefined : original.props.onKeyDown,
    onMouseDown: (event) => {
      if (!needsWrapper) original.props.onMouseDown?.(event);

      pressed.current = true;
    },
    onPointerEnter: (event) => {
      if (!needsWrapper) original.props.onPointerEnter?.(event);
      if (event.pointerType === 'mouse') touchedAt.current = -Infinity;
    },
    onFocus: (event) => {
      if (!needsWrapper) original.props.onFocus?.(event);
      if (!focus || triggerDisabled) return;

      focused.current = true;
      focusedByPress.current = pressed.current;
      schedule(true, 0);
    },
    onBlur: (event) => {
      if (!needsWrapper) original.props.onBlur?.(event);

      pressed.current = false;
      focusedByPress.current = false;
      focused.current = false;

      if (coordinateFocus && hover && hovering.current) return;
      if (focus) schedule(false, 0.15);
    },
    onContextMenu: (event) => {
      if (contextMenu && !triggerDisabled) event.preventDefault();
      if (!needsWrapper) original.props.onContextMenu?.(event);
      if (!contextMenu || triggerDisabled) return;

      schedule(true, 0);
    },
    onTouchStart: (event) => {
      if (!needsWrapper) original.props.onTouchStart?.(event);

      touchedAt.current = Date.now();
      pressed.current = true;
      cancel();
    }
  };
  const mergedClassName = [
    original.props.className,
    className,
    open && (openClassName || `${prefixCls}-open`)
  ].filter(Boolean).join(' ');
  let element: ReactElement;

  if (needsWrapper) {
    const wrapperStyle: CSSProperties = {};
    const childStyle = { ...original.props.style };

    if (disabled) {
      for (const key of ['position', 'left', 'right', 'top', 'bottom', 'float', 'display', 'zIndex'] as const) {
        if (childStyle[key] !== undefined) {
          Object.assign(wrapperStyle, { [key]: childStyle[key] });
          delete childStyle[key];
        }
      }

      delete childStyle.pointerEvents;
    }

    element = (
      <span
        {...handlers}
        data-ui-trigger-wrapper=""
        ref={handleRef}
        tabIndex={disabled && allowDisabledTrigger ? original.props.tabIndex ?? 0 : undefined}
        role={disabled && allowDisabledTrigger ? original.props.role ?? 'button' : undefined}
        aria-disabled={disabled && allowDisabledTrigger ? true : undefined}
        aria-label={disabled && allowDisabledTrigger ? originalLabel : undefined}
        aria-labelledby={disabled && allowDisabledTrigger ? original.props['aria-labelledby'] : undefined}
        aria-describedby={disabled && allowDisabledTrigger ? originalDescription : undefined}
        style={wrapperStyle}
        className={[
          options.wrapperClassName,
          disabled ? options.disabledClassName : options.customClassName,
          disabled && mergedClassName,
          disabled && `${prefixCls}-disabled-compatible-wrapper`
        ]
          .filter(Boolean).join(' ')}
      >
        {disabled
          ? cloneElement(original, { style: childStyle, className: options.disabledChildClassName })
          : cloneElement(original, { className: mergedClassName || undefined })}
      </span>
    );
  } else {
    element = cloneElement(original, { ...handlers, className: mergedClassName || undefined, ref: handleRef });
  }

  return {
    node,
    element,
    cancel,
    closeOnMouse: click || contextMenu,
    hoverHandlers: {
      onMouseEnter: () => {
        hovering.current = true;

        if (hover) cancel();
      },
      onMouseLeave: handleMouseLeave
    }
  };
}
