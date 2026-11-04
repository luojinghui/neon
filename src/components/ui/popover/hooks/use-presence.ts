'use client';

/**
 * 管理 Popover 的挂载、可取消过渡和完成通知
 * 过渡等待 CSS 结束事件，兜底仅防止环境缺少事件时滞留节点
 *
 * Created at     : 2026-10-20 17:08:35
 * Last modified  : 2026-10-20 19:42:53
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TransitionEvent } from 'react';
import type { PopoverPendingTransition, PopoverPresence, PopoverPresencePhase } from '../index.type';

/** 过渡完成事件缺失时的最大等待时间，单位为毫秒。 */
const TRANSITION_DEADLINE = 232;

/** 按系统偏好跳过动画，并兼容旧 WebView 的媒体查询订阅接口。 */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  ));

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;

    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setReduced(query.matches);

    handleChange();

    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', handleChange);

      return () => query.removeEventListener('change', handleChange);
    }

    query.addListener(handleChange);

    return () => query.removeListener(handleChange);
  }, []);

  return reduced;
}

/**
 * 在定位就绪后入场，离场完成后解除挂载；反向切换会取消上一轮任务
 *
 * @param { boolean } open - 调用方决定的最终显隐值
 * @param { boolean } ready - 浮层是否已完成首轮定位
 * @param { boolean } disabled - 是否显式禁用过渡
 * @param { Function } onAfterChange - 当前过渡完成后通知最终显隐值
 */
export function usePopoverPresence(
  open: boolean,
  ready: boolean,
  disabled: boolean,
  onAfterChange: (open: boolean) => void,
  transitionDeadline = TRANSITION_DEADLINE
): PopoverPresence {
  const [phase, setPhase] = useState<PopoverPresencePhase>(open ? 'prepare' : 'closed');
  const phaseRef = useRef(phase);
  const callbackRef = useRef(onAfterChange);
  const generationRef = useRef(0);
  const pendingRef = useRef<PopoverPendingTransition | undefined>(undefined);
  const cancelTasksRef = useRef<() => void>(() => {});
  const reducedMotion = useReducedMotion();

  useLayoutEffect(() => {
    callbackRef.current = onAfterChange;
  }, [onAfterChange]);

  const updatePhase = useCallback((next: PopoverPresencePhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const complete = useCallback((generation: number) => {
    const pending = pendingRef.current;

    if (!pending || pending.generation !== generation) return;

    cancelTasksRef.current();
    updatePhase(pending.open ? 'open' : 'closed');
    callbackRef.current(pending.open);
  }, [updatePhase]);

  useLayoutEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    let frame: number | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;

    const cancel = () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      if (deadline !== undefined) clearTimeout(deadline);

      if (pendingRef.current?.generation === generation) pendingRef.current = undefined;
    };

    cancelTasksRef.current = cancel;

    if ((open && phaseRef.current === 'open') || (!open && phaseRef.current === 'closed')) return cancel;

    pendingRef.current = { generation, open };

    if (open && !ready) {
      updatePhase('prepare');

      return cancel;
    }

    if (disabled || reducedMotion || (!open && phaseRef.current === 'prepare')) {
      complete(generation);

      return cancel;
    }

    if (open) {
      updatePhase('prepare');
      frame = window.requestAnimationFrame(() => {
        updatePhase('entering');
        deadline = setTimeout(() => complete(generation), transitionDeadline);
      });
    } else {
      updatePhase('exiting');
      deadline = setTimeout(() => complete(generation), transitionDeadline);
    }

    return cancel;
  }, [open, ready, disabled, reducedMotion, updatePhase, complete, transitionDeadline]);

  const handleTransitionEnd = useCallback((event: TransitionEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.propertyName !== 'opacity' && event.propertyName !== 'transform') return;
    if (phaseRef.current !== 'entering' && phaseRef.current !== 'exiting') return;

    const pending = pendingRef.current;

    if (pending) complete(pending.generation);
  }, [complete]);

  return { present: open || phase !== 'closed', phase, onTransitionEnd: handleTransitionEnd };
}
