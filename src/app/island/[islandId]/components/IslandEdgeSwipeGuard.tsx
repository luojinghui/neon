'use client';

import { useEffect, useRef } from 'react';
import { attachEdgeSwipeBlock, holdHorizontalOverscrollLock } from '../edgeSwipeGuard';
import styles from '../island-canvas.module.css';

/** 移动端左右边缘占位，认领触摸以阻止浏览器把横滑当成历史返回。 */
export function IslandEdgeSwipeGuard() {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const releaseOverscroll = holdHorizontalOverscrollLock(document.documentElement);
    const cleanups = [leftRef.current, rightRef.current]
      .filter((node): node is HTMLDivElement => node !== null)
      .map((node) => attachEdgeSwipeBlock(node));
    return () => {
      releaseOverscroll();
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  return (
    <>
      <div ref={leftRef} className={styles.edgeGuard} data-side="left" aria-hidden="true" />
      <div ref={rightRef} className={styles.edgeGuard} data-side="right" aria-hidden="true" />
    </>
  );
}
