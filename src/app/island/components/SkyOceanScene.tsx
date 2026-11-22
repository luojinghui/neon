'use client';

import { useEffect, useRef } from 'react';
import styles from '../island-sky.module.css';

export interface RouteTarget {
  /** 百分比横坐标（0 - 100），对应桌面端 ORBIT_POSITIONS.left */
  x: number;
  /** 百分比纵坐标（0 - 100），对应桌面端 ORBIT_POSITIONS.top */
  y: number;
  /** 该好友岛是否有人在线 */
  active?: boolean;
}

interface SkyOceanSceneProps {
  /** 桌面端好友岛相对坐标，用于绘制群岛之间的虚线航路 */
  routes?: RouteTarget[];
}

interface ContourSpec {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** 多频谐波扰动参数：[振幅, 频率, 相位] */
  harmonics: Array<[number, number, number]>;
}

/**
 * 用多频极坐标谐波 + Catmull-Rom 样条生成真正自然蜿蜒的闭合等高线路径。
 * 保证无尖角、嵌套不交叉，且具备真实地形图“一侧紧凑、一侧舒展”的疏密节奏。
 */
function buildOrganicContour(spec: ContourSpec, samples = 64): string {
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < samples; i++) {
    const theta = (i / samples) * Math.PI * 2;
    let mod = 1;
    for (const [amp, freq, phase] of spec.harmonics) {
      mod += amp * Math.sin(freq * theta + phase);
    }
    pts.push({
      x: spec.cx + Math.cos(theta) * spec.rx * mod,
      y: spec.cy + Math.sin(theta) * spec.ry * mod
    });
  }

  const n = pts.length;
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)} ${cp2x.toFixed(1)} ${cp2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return `${d} Z`;
}

// 主岛海域 7 圈嵌套有机等高线（西北侧略紧、东南侧舒展）
const CENTER_HARMONICS: Array<[number, number, number]> = [
  [0.075, 2, 0.55],
  [0.048, 3, -0.85],
  [0.022, 5, 1.35]
];

const CENTER_CONTOURS = Array.from({ length: 7 }, (_, idx) => {
  const rx = 148 + idx * 78;
  const ry = 104 + idx * 54;
  return {
    d: buildOrganicContour({
      cx: 720 + idx * 14,
      cy: 424 + idx * 6,
      rx,
      ry,
      harmonics: CENTER_HARMONICS
    }),
    isIndex: idx === 1 || idx === 4,
    isShallowFill: idx === 0 || idx === 1
  };
});

// 左上角远海隆起等高线（4 圈）
const TOP_LEFT_HARMONICS: Array<[number, number, number]> = [
  [0.085, 2, 1.2],
  [0.052, 3, 0.4],
  [0.024, 4, -0.6]
];

const TOP_LEFT_CONTOURS = Array.from({ length: 4 }, (_, idx) => ({
  d: buildOrganicContour({
    cx: 48 - idx * 8,
    cy: 76 - idx * 6,
    rx: 120 + idx * 68,
    ry: 84 + idx * 50,
    harmonics: TOP_LEFT_HARMONICS
  }),
  isIndex: idx === 1
}));

// 右下角远海隆起等高线（5 圈）
const BOTTOM_RIGHT_HARMONICS: Array<[number, number, number]> = [
  [0.08, 2, -0.4],
  [0.05, 3, 1.1],
  [0.02, 5, 0.2]
];

const BOTTOM_RIGHT_CONTOURS = Array.from({ length: 5 }, (_, idx) => ({
  d: buildOrganicContour({
    cx: 1396 + idx * 10,
    cy: 836 + idx * 6,
    rx: 112 + idx * 72,
    ry: 82 + idx * 52,
    harmonics: BOTTOM_RIGHT_HARMONICS
  }),
  isIndex: idx === 2
}));

/**
 * 极简等高线海图背景（Topo / Apple Maps 质感）：
 * - 呼应岛内无限画布的细腻点阵底纹，做减法去掉直线网格与硬边框；
 * - 使用数学样条生成的有机疏密等高线（主/副两级线宽与透明度）+ 边缘径向羽化遮罩；
 * - 主岛至好友岛采用两端渐隐的柔和曲线航路，在线岛屿呈现轻缓流动虚线；
 * - 全部颜色基于全站语义变量，自动联动深浅模式、5 套皮肤与 prefers-reduced-motion。
 */
export function SkyOceanScene({ routes = [] }: SkyOceanSceneProps) {
  const gridLayerRef = useRef<HTMLDivElement | null>(null);
  const topoLayerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const gridEl = gridLayerRef.current;
    const topoEl = topoLayerRef.current;
    if (!gridEl || !topoEl) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches) return;

    let rafId = 0;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;

    const animate = () => {
      currentX += (targetX - currentX) * 0.08;
      currentY += (targetY - currentY) * 0.08;

      gridEl.style.transform = `translate3d(${(currentX * 0.35).toFixed(2)}px, ${(currentY * 0.35).toFixed(2)}px, 0)`;
      topoEl.style.transform = `translate3d(${currentX.toFixed(2)}px, ${currentY.toFixed(2)}px, 0)`;

      if (Math.abs(targetX - currentX) > 0.04 || Math.abs(targetY - currentY) > 0.04) {
        rafId = window.requestAnimationFrame(animate);
      } else {
        rafId = 0;
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || reducedMotion.matches) return;
      targetX = (0.5 - event.clientX / Math.max(window.innerWidth, 1)) * 10;
      targetY = (0.5 - event.clientY / Math.max(window.innerHeight, 1)) * 6;
      if (!rafId) rafId = window.requestAnimationFrame(animate);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  const cx = 720;
  const cy = 422;

  return (
    <div className={styles.scene} aria-hidden="true">
      {/* 1. 柔和纸面氛围底色 */}
      <div className={styles.mapPaper} />

      {/* 2. 与岛内无限画布呼应的轻盈点阵（边缘微羽化） */}
      <div ref={gridLayerRef} className={styles.mapDotGrid} />

      {/* 3. 有机地形等高线 + 两端渐隐航路 */}
      <div ref={topoLayerRef} className={styles.topoLayer}>
        <svg
          className={styles.topoSvg}
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
        >
          <defs>
            {/* 边缘径向羽化遮罩：让等高线在视口四周与顶栏下方柔和消隐 */}
            <radialGradient id="topoEdgeFade" cx="50%" cy="49%" r="60%">
              <stop offset="0%" stopColor="white" stopOpacity="0.92" />
              <stop offset="66%" stopColor="white" stopOpacity="0.88" />
              <stop offset="92%" stopColor="white" stopOpacity="0.32" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </radialGradient>
            {/* 顶栏区域轻衰减，保持顶部清爽 */}
            <linearGradient id="topoTopFade" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="black" stopOpacity="0.72" />
              <stop offset="14%" stopColor="black" stopOpacity="0" />
              <stop offset="100%" stopColor="black" stopOpacity="0" />
            </linearGradient>
            <mask id="topoMask">
              <rect x="0" y="0" width="1440" height="900" fill="url(#topoEdgeFade)" />
              <rect x="0" y="0" width="1440" height="900" fill="url(#topoTopFade)" />
            </mask>

            {/* 每条航路独立的两端渐隐渐变，避免线条生硬戳入浮岛图 */}
            {routes.map((target, idx) => {
              const tx = (target.x / 100) * 1440;
              const ty = (target.y / 100) * 900;
              return (
                <linearGradient
                  key={idx}
                  id={`islandRouteFade-${idx}`}
                  gradientUnits="userSpaceOnUse"
                  x1={cx}
                  y1={cy}
                  x2={tx}
                  y2={ty}
                >
                  <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
                  <stop offset="18%" stopColor="currentColor" stopOpacity="0" />
                  <stop offset="34%" stopColor="currentColor" stopOpacity="1" />
                  <stop offset="76%" stopColor="currentColor" stopOpacity="1" />
                  <stop offset="90%" stopColor="currentColor" stopOpacity="0" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                </linearGradient>
              );
            })}
          </defs>

          {/* 等高线主体（受羽化遮罩控制） */}
          <g mask="url(#topoMask)">
            {/* 左上远海等高线 */}
            <g>
              {TOP_LEFT_CONTOURS.map((item, idx) => (
                <path
                  key={`tl-${idx}`}
                  d={item.d}
                  className={item.isIndex ? styles.contourIndexMuted : styles.contourMinor}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>

            {/* 右下远海等高线 */}
            <g>
              {BOTTOM_RIGHT_CONTOURS.map((item, idx) => (
                <path
                  key={`br-${idx}`}
                  d={item.d}
                  className={item.isIndex ? styles.contourIndexMuted : styles.contourMinor}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>

            {/* 主岛海域 7 圈嵌套有机等高线（从外到内绘制） */}
            <g>
              {[...CENTER_CONTOURS].reverse().map((item, revIdx) => {
                const idx = CENTER_CONTOURS.length - 1 - revIdx;
                const cls = item.isShallowFill
                  ? item.isIndex
                    ? styles.contourIndexFill
                    : styles.contourInnerFill
                  : item.isIndex
                    ? styles.contourIndex
                    : styles.contourMinor;
                return (
                  <path
                    key={`c-${idx}`}
                    d={item.d}
                    className={cls}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </g>
          </g>

          {/* 主岛到好友岛的渐隐曲线航路（仅桌面端显示） */}
          {routes.length > 0 && (
            <g className={styles.routeLayer}>
              {routes.map((target, idx) => {
                const tx = (target.x / 100) * 1440;
                const ty = (target.y / 100) * 900;
                const midX = (cx + tx) / 2;
                const midY = (cy + ty) / 2 - (idx % 2 === 0 ? 44 : -32);
                const d = `M ${cx} ${cy} Q ${midX.toFixed(1)} ${midY.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`;
                return (
                  <g
                    key={idx}
                    className={target.active ? styles.routeGroupActive : styles.routeGroup}
                  >
                    <path
                      d={d}
                      stroke={`url(#islandRouteFade-${idx})`}
                      className={target.active ? styles.seaRouteActive : styles.seaRoute}
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                );
              })}
            </g>
          )}
        </svg>
      </div>

      {/* 4. 极轻顶/底氛围收束 */}
      <div className={styles.sceneVignette} />
    </div>
  );
}
