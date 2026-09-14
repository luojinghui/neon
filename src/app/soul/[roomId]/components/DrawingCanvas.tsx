'use client';

import { ClearOutlined, UndoOutlined } from '@ant-design/icons';
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { DrawingStroke } from '../../core/types';

const WIDTH = 480;
const HEIGHT = 300;
const MAX_STROKES = 120;
const MAX_POINTS = 12000;
const COLORS = [
  { value: '#334155', label: '石墨黑' },
  { value: '#E11D48', label: '草莓红' },
  { value: '#D97706', label: '橘子黄' },
  { value: '#059669', label: '薄荷绿' },
  { value: '#2563EB', label: '天空蓝' },
  { value: '#9333EA', label: '葡萄紫' }
];

interface DrawingCanvasProps {
  strokes: DrawingStroke[];
  onChange?: (strokes: DrawingStroke[]) => void;
  readOnly?: boolean;
  disabled?: boolean;
}

function drawStroke(context: CanvasRenderingContext2D, stroke: DrawingStroke) {
  const first = stroke.points[0];
  if (!first) return;
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineWidth = stroke.width;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  if (stroke.points.length === 1) {
    context.arc(first.x * WIDTH, first.y * HEIGHT, stroke.width / 2, 0, Math.PI * 2);
    context.fill();
    return;
  }
  context.moveTo(first.x * WIDTH, first.y * HEIGHT);
  for (const point of stroke.points.slice(1)) context.lineTo(point.x * WIDTH, point.y * HEIGHT);
  context.stroke();
}

/** White paper stays white in both themes so the shared drawing has identical colors. */
export function DrawingCanvas({ strokes, onChange, readOnly = false, disabled = false }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef(strokes);
  const activeRef = useRef<{ pointerId: number; stroke: DrawingStroke; pointLimit: number } | null>(null);
  const [color, setColor] = useState(COLORS[0].value);
  const [width, setWidth] = useState(3);
  const [notice, setNotice] = useState('');

  const repaint = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!context) return;
    context.setTransform(2, 0, 0, 2, 0, 0);
    context.clearRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, WIDTH, HEIGHT);
    for (const stroke of strokesRef.current) drawStroke(context, stroke);
    if (activeRef.current) drawStroke(context, activeRef.current.stroke);
  };

  useEffect(() => {
    strokesRef.current = strokes;
    repaint();
  }, [strokes]);

  const position = (event: PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
    };
  };

  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    if (disabled || !onChange || activeRef.current || !event.isPrimary || event.button !== 0) return;
    const remaining = MAX_POINTS - strokesRef.current.reduce((sum, stroke) => sum + stroke.points.length, 0);
    if (strokesRef.current.length >= MAX_STROKES || remaining < 2) {
      setNotice('画纸快满啦，撤销几笔后可以继续，也可以直接发起游戏。');
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activeRef.current = {
      pointerId: event.pointerId,
      stroke: { color, width, points: [position(event)] },
      pointLimit: Math.min(500, remaining)
    };
    setNotice('');
    repaint();
  };

  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    const active = activeRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const point = position(event);
    const previous = active.stroke.points[active.stroke.points.length - 1];
    if (Math.hypot((point.x - previous.x) * WIDTH, (point.y - previous.y) * HEIGHT) < 1.2) return;
    if (active.stroke.points.length >= active.pointLimit) {
      // Thin long paths progressively instead of losing the end of a drawing.
      if (active.pointLimit < 4) return;
      active.stroke.points = active.stroke.points.filter((_, index) => index % 2 === 0);
    }
    active.stroke.points.push(point);
    repaint();
  };

  const finish = (event: PointerEvent<HTMLCanvasElement>) => {
    const active = activeRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    activeRef.current = null;
    const next = [...strokesRef.current, active.stroke];
    strokesRef.current = next;
    onChange?.(next);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    repaint();
  };

  if (readOnly) {
    return (
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="你画我猜的画作" className="block aspect-[8/5] w-full overflow-hidden rounded-lg border border-border bg-white">
        <rect width={WIDTH} height={HEIGHT} fill="#FFFFFF" />
        {strokes.map((stroke, index) => stroke.points.length === 1 ? (
          <circle key={index} cx={stroke.points[0].x * WIDTH} cy={stroke.points[0].y * HEIGHT} r={stroke.width / 2} fill={stroke.color} />
        ) : (
          <polyline key={index} points={stroke.points.map((point) => `${point.x * WIDTH},${point.y * HEIGHT}`).join(' ')} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </svg>
    );
  }

  const toolClass = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-xs text-foreground-muted transition-colors hover:bg-surface-active hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-40';
  const pointCount = strokes.reduce((sum, stroke) => sum + stroke.points.length, 0);
  const capacity = Math.max(strokes.length / MAX_STROKES, pointCount / MAX_POINTS);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1" aria-label="画笔颜色">
          {COLORS.map((option) => (
            <button key={option.value} type="button" aria-label={option.label} aria-pressed={color === option.value} disabled={disabled} onClick={() => setColor(option.value)} className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-40 ${color === option.value ? 'border-primary bg-primary-soft' : 'border-transparent hover:bg-surface-active'}`}>
              <span className="h-5 w-5 rounded-full" style={{ backgroundColor: option.value }} />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1" aria-label="画笔粗细">
          {[3, 6, 10].map((size) => (
            <button key={size} type="button" aria-label={`${size} 像素画笔`} aria-pressed={width === size} disabled={disabled} onClick={() => setWidth(size)} className={`flex h-8 w-8 items-center justify-center rounded-lg border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-40 ${width === size ? 'border-primary/30 bg-primary-soft text-primary' : 'border-transparent text-foreground-muted hover:bg-surface-active'}`}>
              <span className="rounded-full bg-current" style={{ width: size, height: size }} />
            </button>
          ))}
        </div>
      </div>

      <canvas ref={canvasRef} width={WIDTH * 2} height={HEIGHT * 2} aria-label="画板，按住鼠标或用手指绘画" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} className={`block aspect-[8/5] w-full touch-none rounded-xl border border-border bg-white ${disabled ? 'cursor-not-allowed' : 'cursor-crosshair'}`} />

      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs ${capacity >= 0.8 ? 'text-warning' : 'text-foreground-muted'}`}>{capacity >= 0.8 ? `画纸已用 ${Math.round(capacity * 100)}%` : strokes.length ? `${strokes.length} / ${MAX_STROKES} 笔` : '用鼠标或手指画下你的谜底'}</span>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" disabled={disabled || !strokes.length} className={toolClass} onClick={() => { onChange?.(strokes.slice(0, -1)); setNotice(''); }}><UndoOutlined />撤销</button>
          <button type="button" disabled={disabled || !strokes.length} className={toolClass} onClick={() => { onChange?.([]); setNotice(''); }}><ClearOutlined />清空</button>
        </div>
      </div>
      {notice && <p className="text-xs text-foreground-muted" role="status">{notice}</p>}
    </div>
  );
}
