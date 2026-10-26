'use client';

import { AimOutlined, ArrowRightOutlined, BorderOutlined, CheckOutlined, CloseOutlined, DeleteOutlined, DragOutlined, EditOutlined, FontSizeOutlined, MinusOutlined, PlusOutlined, SelectOutlined, UndoOutlined } from '@ant-design/icons';
import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { BoardItem, Presentation } from '@/modules/webrtc/sharing';
import { boardItemBounds, boardTextBox, boardToScreen, clampBoardCoordinate, fitBoardItems, hitTestBoardItem, moveBoardItem, resizeBoardShape, screenToBoard, zoomBoardAt, type BoardCamera, type BoardPoint } from '@/modules/webrtc/whiteboard';
import type { CallSession } from '@/modules/webrtc/session';
import './whiteboard.css';

type TextItem = Extract<BoardItem, { kind: 'text' }>;
type StrokeItem = Extract<BoardItem, { kind: 'stroke' }>;
type ShapeItem = Extract<BoardItem, { kind: 'shape' }>;
type Shape = ShapeItem['shape'];
type Tool = 'pen' | 'select' | 'pan' | 'text' | Shape;
type Gesture =
  | { kind: 'pan'; pointerId: number; start: BoardPoint; camera: BoardCamera }
  | { kind: 'draw'; pointerId: number; item: StrokeItem | ShapeItem; start: BoardPoint; epoch: number; lastSent: number }
  | { kind: 'edit'; pointerId: number; item: BoardItem; original: BoardItem; start: BoardPoint; resize: boolean; epoch: number; lastSent: number };
type TextEditing = { item: TextItem; text: string; epoch: number };
const PALETTE = ['#334155', '#ef4444', '#f59e0b', '#16a34a', '#2563eb', '#9333ea'];
const SHAPES: Array<{ id: Shape; label: string }> = [{ id: 'rectangle', label: '矩形' }, { id: 'ellipse', label: '椭圆' }, { id: 'line', label: '直线' }, { id: 'arrow', label: '箭头' }];

function ShapeIcon({ shape }: { shape: Shape }) {
  if (shape === 'rectangle') return <BorderOutlined />;
  if (shape === 'line') return <MinusOutlined />;
  if (shape === 'arrow') return <ArrowRightOutlined />;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="9" ry="7" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>;
}

function BoardItemView({ item, selected, zoom }: { item: BoardItem; selected: boolean; zoom: number }) {
  let drawing;
  if (item.kind === 'text') {
    drawing = <text x={item.x + 6} y={item.y + item.fontSize} fill={item.color} fontSize={item.fontSize} fontFamily="inherit">
      {boardTextBox(item).lines.map((line, index) => <tspan key={index} x={item.x + 6} dy={index ? item.fontSize * 1.4 : 0}>{line}</tspan>)}
    </text>;
  } else if (item.kind === 'stroke') {
    drawing = item.points.length === 1 ? <circle cx={item.points[0][0]} cy={item.points[0][1]} r={item.width / (2 * zoom)} fill={item.color} /> : <polyline points={item.points.map(point => point.join(',')).join(' ')} fill="none" stroke={item.color} strokeWidth={item.width} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
  } else {
    const box = boardItemBounds(item);
    const style = { fill: item.fill ? item.color : 'none', fillOpacity: .12, stroke: item.color, strokeWidth: item.width, vectorEffect: 'non-scaling-stroke' as const };
    if (item.shape === 'rectangle') drawing = <rect {...box} {...style} rx={2 / zoom} />;
    else if (item.shape === 'ellipse') drawing = <ellipse cx={box.x + box.width / 2} cy={box.y + box.height / 2} rx={box.width / 2} ry={box.height / 2} {...style} />;
    else {
      const angle = Math.atan2(item.endY - item.y, item.endX - item.x), head = (12 + item.width) / zoom;
      drawing = <><line x1={item.x} y1={item.y} x2={item.endX} y2={item.endY} stroke={item.color} strokeWidth={item.width} strokeLinecap="round" vectorEffect="non-scaling-stroke" />{item.shape === 'arrow' && <polyline points={[
        [item.endX - head * Math.cos(angle - .48), item.endY - head * Math.sin(angle - .48)], [item.endX, item.endY], [item.endX - head * Math.cos(angle + .48), item.endY - head * Math.sin(angle + .48)]
      ].map(point => point.join(',')).join(' ')} fill="none" stroke={item.color} strokeWidth={item.width} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}</>;
    }
  }
  const box = boardItemBounds(item), padding = 6 / zoom;
  const endpointHandle = item.kind === 'shape' && (item.shape === 'line' || item.shape === 'arrow');
  const handleX = endpointHandle ? item.endX : box.x + box.width + padding;
  const handleY = endpointHandle ? item.endY : box.y + box.height + padding;
  return <g data-board-item={item.id} data-board-kind={item.kind} className={`call-board-item ${selected ? 'is-selected' : ''}`}>
    {drawing}
    {selected && <><rect className="call-board-selection" x={box.x - padding} y={box.y - padding} width={Math.max(box.width, 1) + padding * 2} height={Math.max(box.height, 1) + padding * 2} rx={4 / zoom} vectorEffect="non-scaling-stroke" /><circle data-board-resize="true" className="call-board-resize" cx={handleX} cy={handleY} r={6 / zoom} strokeWidth={2 / zoom} /></>}
  </g>;
}

export function SharedWhiteboard({ presentation, session, selfId }: { presentation: Presentation; session: CallSession; selfId: string }) {
  const [tool, setTool] = useState<Tool>('pen');
  const [shape, setShape] = useState<Shape>('rectangle');
  const [color, setColor] = useState('#334155');
  const [width, setWidth] = useState(4);
  const [fill, setFill] = useState(false);
  const [popover, setPopover] = useState<'shapes' | 'color' | 'width' | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<BoardItem | null>(null);
  const [editing, setEditing] = useState<TextEditing | null>(null);
  const [camera, setCamera] = useState<BoardCamera>({ x: 0, y: 0, zoom: 1 });
  const [size, setSize] = useState({ width: 800, height: 480 });
  const [panning, setPanning] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<SVGSVGElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const active = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, BoardPoint>());
  const pinch = useRef<{ distance: number; anchor: BoardPoint; camera: BoardCamera } | null>(null);
  const cameraRef = useRef(camera);
  const editingRef = useRef<TextEditing | null>(null);
  const sizeRef = useRef<{ width: number; height: number } | null>(null);
  const space = useRef(false);
  const finishRef = useRef<(dropSinglePoint?: boolean) => void>(() => {});
  const pendingStyle = useRef<{ item: BoardItem; epoch: number; shareId: string } | null>(null);
  const styleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintId = useId();
  const gridId = useId().replace(/:/g, '');
  const items = useMemo(() => {
    const values = presentation.items.map(item => item.id === draft?.id ? draft : item);
    if (draft && !values.some(item => item.id === draft.id)) values.push(draft);
    return values;
  }, [presentation.items, draft]);
  const selected = items.find(item => item.id === selectedId);
  const canEdit = selected?.authorId === selfId;
  const shapeSelected = SHAPES.some(value => value.id === tool);
  const editingId = editing?.item.id;

  const updateCamera = (next: BoardCamera) => { cameraRef.current = next; setCamera(next); };
  const updateEditing = (next: TextEditing | null) => { editingRef.current = next; setEditing(next); };
  const cancelStyle = () => {
    if (styleTimer.current) clearTimeout(styleTimer.current);
    styleTimer.current = null;
    const pending = pendingStyle.current;
    pendingStyle.current = null;
    if (pending) setDraft(current => current === pending.item ? null : current);
  };
  const flushStyle = () => {
    if (styleTimer.current) clearTimeout(styleTimer.current);
    styleTimer.current = null;
    const pending = pendingStyle.current;
    pendingStyle.current = null;
    if (!pending) return;
    void session.board('put', pending.epoch, pending.item, pending.shareId).finally(() => setDraft(current => current === pending.item ? null : current));
  };
  const queueStyle = (item: BoardItem) => {
    if (pendingStyle.current && pendingStyle.current.item.id !== item.id) flushStyle();
    pendingStyle.current = { item, epoch: presentation.epoch, shareId: presentation.id };
    setDraft(item);
    if (!styleTimer.current) styleTimer.current = setTimeout(flushStyle, 80);
  };
  const publish = (item: BoardItem, epoch = presentation.epoch) => {
    setDraft(item);
    void session.board('put', epoch, item, presentation.id).finally(() => setDraft(current => current === item ? null : current));
  };
  const finish = (dropSinglePoint = false) => {
    const gesture = active.current;
    active.current = null; setPanning(false);
    if (!gesture || gesture.kind === 'pan') return;
    if (dropSinglePoint && ((gesture.item.kind === 'stroke' && gesture.item.points.length === 1) || (gesture.item.kind === 'shape' && Math.hypot(gesture.item.endX - gesture.item.x, gesture.item.endY - gesture.item.y) < 1 / cameraRef.current.zoom))) { setDraft(null); return; }
    publish(gesture.item, gesture.epoch);
  };
  finishRef.current = finish;
  const finishEditing = (cancel = false) => {
    const value = editingRef.current;
    if (!value) return;
    updateEditing(null);
    if (!cancel && value.text.trim()) publish({ ...value.item, text: value.text.trim() }, value.epoch);
    else if (!presentation.items.some(item => item.id === value.item.id)) setSelectedId('');
    canvas.current?.focus({ preventScroll: true });
  };
  const beginText = (item: TextItem) => { flushStyle(); finish(); setSelectedId(item.id); setTool('text'); setPopover(null); updateEditing({ item, text: item.text, epoch: presentation.epoch }); };
  const createText = (point: BoardPoint) => beginText({ id: crypto.randomUUID(), authorId: selfId, kind: 'text', color, text: '', x: clampBoardCoordinate(point[0]), y: clampBoardCoordinate(point[1]), fontSize: 28 });
  const localPoint = (clientX: number, clientY: number): BoardPoint => {
    const rect = viewport.current!.getBoundingClientRect();
    return [clientX - rect.left, clientY - rect.top];
  };
  const worldPoint = (screen: BoardPoint): BoardPoint => screenToBoard(screen, cameraRef.current).map(clampBoardCoordinate) as BoardPoint;
  const chooseTool = (next: Tool) => { flushStyle(); finishEditing(); finish(); setTool(next); setSelectedId(''); setPopover(null); };

  useEffect(() => {
    if (styleTimer.current) clearTimeout(styleTimer.current);
    styleTimer.current = null; pendingStyle.current = null;
    active.current = null; pointers.current.clear(); pinch.current = null; editingRef.current = null;
    setDraft(null); setSelectedId(''); setEditing(null); setPopover(null); setPanning(false);
  }, [presentation.id, presentation.epoch]);
  useEffect(() => () => {
    if (styleTimer.current) clearTimeout(styleTimer.current);
    pendingStyle.current = null;
  }, []);
  useEffect(() => {
    const value = editingRef.current;
    if (value) { editor.current?.focus({ preventScroll: true }); if (!value.item.text) editor.current?.select(); }
  }, [editingId]); // Changing the typed text must not steal its selection.
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const resize = () => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const previous = sizeRef.current;
      const next = { width: rect.width, height: rect.height };
      sizeRef.current = next; setSize(next);
      const value = cameraRef.current;
      updateCamera({ ...value, x: value.x + (previous ? (next.width - previous.width) / 2 : next.width / 2), y: value.y + (previous ? (next.height - previous.height) / 2 : next.height / 2) });
    };
    resize();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(element); window.addEventListener('resize', resize);
    const wheel = (event: WheelEvent) => {
      event.preventDefault(); event.stopPropagation(); finishRef.current();
      const rect = element.getBoundingClientRect();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : 1);
      updateCamera(zoomBoardAt(cameraRef.current, cameraRef.current.zoom * Math.exp(-Math.max(-120, Math.min(120, delta)) * .002), [event.clientX - rect.left, event.clientY - rect.top]));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    const releaseSpace = () => { space.current = false; };
    window.addEventListener('keyup', releaseSpace); window.addEventListener('blur', releaseSpace);
    return () => { observer?.disconnect(); window.removeEventListener('resize', resize); element.removeEventListener('wheel', wheel); window.removeEventListener('keyup', releaseSpace); window.removeEventListener('blur', releaseSpace); };
  }, [presentation.id]);

  const startPinch = () => {
    const points = [...pointers.current.values()];
    if (points.length < 2) return;
    finish(true);
    pinch.current = { distance: Math.max(1, Math.hypot(points[0][0] - points[1][0], points[0][1] - points[1][1])), anchor: [(points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2], camera: { ...cameraRef.current } };
    setPanning(true);
  };
  const pointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    event.preventDefault(); event.stopPropagation();
    flushStyle();
    const position = localPoint(event.clientX, event.clientY);
    pointers.current.set(event.pointerId, position);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (pointers.current.size >= 2) { finishEditing(); startPinch(); return; }
    if (editingRef.current) { finishEditing(); return; }
    event.currentTarget.focus({ preventScroll: true }); setPopover(null);
    if (tool === 'pan' || space.current || event.button === 1) {
      active.current = { kind: 'pan', pointerId: event.pointerId, start: position, camera: { ...cameraRef.current } }; setPanning(true); return;
    }
    const point = worldPoint(position), target = event.target as Element;
    const targetId = target.closest<SVGElement>('[data-board-item]')?.dataset.boardItem;
    const hit = items.find(item => item.id === targetId) || [...items].reverse().find(item => hitTestBoardItem(item, point, 8 / cameraRef.current.zoom));
    if (tool === 'select') {
      setSelectedId(hit?.id || '');
      if (hit?.authorId === selfId) {
        active.current = { kind: 'edit', pointerId: event.pointerId, item: hit, original: hit, start: point, resize: Boolean(target.closest('[data-board-resize]')), epoch: presentation.epoch, lastSent: 0 };
      }
      return;
    }
    if (tool === 'text') {
      if (hit?.kind === 'text' && hit.authorId === selfId) beginText(hit); else createText(point);
      return;
    }
    setSelectedId('');
    const item: StrokeItem | ShapeItem = tool === 'pen' ? { id: crypto.randomUUID(), authorId: selfId, kind: 'stroke', color, width, points: [point] } : { id: crypto.randomUUID(), authorId: selfId, kind: 'shape', shape: tool, color, width, fill, x: point[0], y: point[1], endX: point[0], endY: point[1] };
    active.current = { kind: 'draw', pointerId: event.pointerId, item, start: point, epoch: presentation.epoch, lastSent: performance.now() }; setDraft(item);
  };
  const pointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    event.preventDefault();
    const position = localPoint(event.clientX, event.clientY);
    pointers.current.set(event.pointerId, position);
    const zoomGesture = pinch.current;
    if (zoomGesture && pointers.current.size >= 2) {
      const points = [...pointers.current.values()];
      const center: BoardPoint = [(points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2];
      const distance = Math.hypot(points[0][0] - points[1][0], points[0][1] - points[1][1]);
      const zoomed = zoomBoardAt(zoomGesture.camera, zoomGesture.camera.zoom * distance / zoomGesture.distance, zoomGesture.anchor);
      updateCamera({ ...zoomed, x: zoomed.x + center[0] - zoomGesture.anchor[0], y: zoomed.y + center[1] - zoomGesture.anchor[1] }); return;
    }
    const gesture = active.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.kind === 'pan') { updateCamera({ ...gesture.camera, x: gesture.camera.x + position[0] - gesture.start[0], y: gesture.camera.y + position[1] - gesture.start[1] }); return; }
    const point = worldPoint(position);
    if (gesture.kind === 'edit') {
      if (!gesture.resize) gesture.item = moveBoardItem(gesture.original, point[0] - gesture.start[0], point[1] - gesture.start[1]);
      else {
        const box = boardItemBounds(gesture.original), original = gesture.original;
        if (original.kind === 'text') gesture.item = { ...original, fontSize: Math.round(Math.max(12, Math.min(96, original.fontSize * Math.max(24, point[0] - box.x) / Math.max(24, box.width)))) };
        else if (original.kind === 'shape') gesture.item = resizeBoardShape(original, point[0] - gesture.start[0], point[1] - gesture.start[1]);
        else {
          const sx = Math.max(4, point[0] - box.x) / Math.max(4, box.width), sy = Math.max(4, point[1] - box.y) / Math.max(4, box.height);
          gesture.item = { ...original, points: original.points.map(p => [clampBoardCoordinate(box.x + (p[0] - box.x) * sx), clampBoardCoordinate(box.y + (p[1] - box.y) * sy)]) };
        }
      }
    } else if (gesture.item.kind === 'stroke') {
      const last = gesture.item.points[gesture.item.points.length - 1];
      if (Math.hypot(point[0] - last[0], point[1] - last[1]) * cameraRef.current.zoom < 1.5) return;
      let points = gesture.item.points;
      if (points.length >= 512) points = points.filter((_, index) => index % 2 === 0);
      gesture.item = { ...gesture.item, points: [...points, point] };
    } else gesture.item = { ...gesture.item, endX: point[0], endY: point[1] };
    setDraft(gesture.item);
    if (performance.now() - gesture.lastSent >= 80) { gesture.lastSent = performance.now(); void session.board('put', gesture.epoch, gesture.item, presentation.id); }
  };
  const pointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    // A fast drag can end beyond the last delivered pointermove. Capture its
    // final coordinate, but never use the synthetic coordinates of a cancel.
    if (event.type === 'pointerup' && active.current?.pointerId === event.pointerId) pointerMove(event);
    pointers.current.delete(event.pointerId);
    if (active.current?.pointerId === event.pointerId) finish();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (pinch.current) {
      if (pointers.current.size >= 2) startPinch();
      else {
        pinch.current = null;
        const remaining = [...pointers.current.entries()][0];
        if (remaining) active.current = { kind: 'pan', pointerId: remaining[0], start: remaining[1], camera: { ...cameraRef.current } };
        setPanning(Boolean(remaining));
      }
    }
  };
  const changeColor = (next: string) => {
    setColor(next);
    if (canEdit && selected) queueStyle({ ...(pendingStyle.current?.item.id === selected.id ? pendingStyle.current.item : selected), color: next });
  };
  const changeWidth = (next: number) => {
    setWidth(next);
    if (canEdit && selected && selected.kind !== 'text') {
      const current = pendingStyle.current?.item.id === selected.id ? pendingStyle.current.item : selected;
      if (current.kind !== 'text') queueStyle({ ...current, width: next });
    }
  };
  const zoom = (factor: number) => { finish(); updateCamera(zoomBoardAt(cameraRef.current, cameraRef.current.zoom * factor, [size.width / 2, size.height / 2])); };
  const textPosition = editing ? boardToScreen([editing.item.x, editing.item.y], camera) : null;

  return <div className="call-whiteboard" onKeyDown={event => {
    if ((event.target as HTMLElement).closest('textarea,input,select')) return;
    if (event.code === 'Space') { event.preventDefault(); space.current = true; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); void session.board('undo', presentation.epoch, undefined, presentation.id); }
    if (event.key === 'Escape' && (popover || selectedId)) { event.stopPropagation(); setPopover(null); setSelectedId(''); }
  }}>
    <div className="call-board-toolbar" role="toolbar" aria-label="白板工具">
      <div className="call-board-tool-group">
        <button type="button" aria-label="选择白板内容" title="选择" aria-pressed={tool === 'select'} onClick={() => chooseTool('select')}><SelectOutlined /></button>
        <button type="button" aria-label="移动白板画布" title="移动画布" aria-pressed={tool === 'pan'} onClick={() => chooseTool('pan')}><DragOutlined /></button>
        <button type="button" aria-label="白板画笔" title="画笔" aria-pressed={tool === 'pen'} onClick={() => chooseTool('pen')}><EditOutlined /></button>
        <button type="button" aria-label="白板图形" title="图形" aria-expanded={popover === 'shapes'} aria-pressed={shapeSelected} onClick={() => { finishEditing(); setPopover(value => value === 'shapes' ? null : 'shapes'); }}><ShapeIcon shape={shape} /></button>
        <button type="button" aria-label="添加白板文字" title="文字" aria-pressed={tool === 'text'} onClick={() => { chooseTool('text'); createText(screenToBoard([size.width / 2 - 60, size.height / 2 - 20], cameraRef.current)); }}><FontSizeOutlined /></button>
      </div>
      <div className="call-board-tool-group">
        <button type="button" className="call-board-color-button" aria-label="画笔颜色" title="颜色" aria-expanded={popover === 'color'} onClick={() => setPopover(value => value === 'color' ? null : 'color')}><span style={{ backgroundColor: color }} /></button>
        <button type="button" aria-label="调整画笔粗细" title="线条粗细" aria-expanded={popover === 'width'} onClick={() => setPopover(value => value === 'width' ? null : 'width')}><span className="call-board-width-icon" style={{ height: Math.min(8, width) }} /></button>
        {selected?.kind === 'text' && canEdit && <button type="button" aria-label="编辑选中文字" title="编辑文字" onClick={() => beginText(selected)}><FontSizeOutlined /></button>}
      </div>
      <div className="call-board-tool-group">
        <button type="button" aria-label="撤销白板操作" title="撤销我的上一步" disabled={!presentation.items.some(item => item.authorId === selfId)} onClick={() => { cancelStyle(); finishEditing(true); setSelectedId(''); void session.board('undo', presentation.epoch, undefined, presentation.id); }}><UndoOutlined /></button>
        <button type="button" aria-label="清空白板" title="清空白板" disabled={!presentation.items.length} onClick={() => { cancelStyle(); finishEditing(true); setSelectedId(''); void session.board('clear', presentation.epoch, undefined, presentation.id); }}><DeleteOutlined /></button>
      </div>
    </div>
    {popover && <div className={`call-board-popover is-${popover}`} role="group" aria-label={popover === 'shapes' ? '选择白板图形' : popover === 'color' ? '选择白板颜色' : '白板线条样式'}>
      {popover === 'shapes' && SHAPES.map(value => <button type="button" key={value.id} aria-label={value.label} title={value.label} aria-pressed={tool === value.id} onClick={() => { setShape(value.id); chooseTool(value.id); }}><ShapeIcon shape={value.id} /><span>{value.label}</span></button>)}
      {popover === 'color' && <><div className="call-board-palette">{PALETTE.map(value => <button key={value} type="button" style={{ backgroundColor: value }} aria-label={`使用颜色 ${value}`} aria-pressed={color === value} onClick={() => changeColor(value)} />)}<label title="自定义颜色"><PlusOutlined /><input type="color" aria-label="白板颜色" value={color} onChange={event => changeColor(event.target.value)} onPointerUp={flushStyle} onBlur={flushStyle} onKeyUp={flushStyle} /></label></div></>}
      {popover === 'width' && <><label className="call-board-width-slider"><span>线条粗细 <output>{width}</output></span><input type="range" min="1" max="16" step="1" aria-label="白板画笔粗细" value={width} onChange={event => changeWidth(Number(event.target.value))} onPointerUp={flushStyle} onBlur={flushStyle} onKeyUp={flushStyle} /></label>{shapeSelected && (tool === 'rectangle' || tool === 'ellipse') && <label className="call-board-fill"><input type="checkbox" checked={fill} onChange={event => { setFill(event.target.checked); if (canEdit && selected?.kind === 'shape') queueStyle({ ...selected, fill: event.target.checked }); }} />填充图形</label>}</>}
    </div>}
    <div ref={viewport} className={`call-board-viewport ${panning ? 'is-panning' : ''}`}>
      <svg ref={canvas} className={`call-whiteboard-canvas is-${tool}`} viewBox={`0 0 ${size.width} ${size.height}`} aria-label="共享白板" aria-describedby={hintId} role="application" tabIndex={0} data-scale={camera.zoom} data-offset-x={camera.x} data-offset-y={camera.y} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onLostPointerCapture={pointerUp} onDoubleClick={event => {
        const id = (event.target as Element).closest<SVGElement>('[data-board-item]')?.dataset.boardItem;
        const item = items.find(value => value.id === id);
        if (item?.kind === 'text' && item.authorId === selfId) { event.preventDefault(); beginText(item); }
      }}>
        <defs><pattern id={gridId} x={camera.x % (24 * camera.zoom)} y={camera.y % (24 * camera.zoom)} width={24 * camera.zoom} height={24 * camera.zoom} patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#cbd5e1" /></pattern></defs>
        <rect width="100%" height="100%" fill={`url(#${gridId})`} />
        <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
          {items.filter(item => item.id !== editing?.item.id).map(item => <BoardItemView key={item.id} item={item} selected={item.id === selectedId && item.authorId === selfId} zoom={camera.zoom} />)}
        </g>
      </svg>
      {!items.length && !editing && <div className="call-board-empty" aria-hidden="true"><EditOutlined /><span>想法，从这里开始</span><small>画笔、图形、文字，一起自由创作</small></div>}
      {editing && textPosition && <div className="call-board-editor" style={{ left: Math.max(8, Math.min(size.width - Math.min(280, size.width - 16) - 8, textPosition[0])), top: Math.max(8, Math.min(size.height - 136, textPosition[1])), width: Math.min(280, size.width - 16) }}>
        <textarea ref={editor} aria-label="编辑白板文字" placeholder="输入文字…" maxLength={200} value={editing.text} style={{ color: editing.item.color, fontSize: Math.max(16, Math.min(28, editing.item.fontSize * camera.zoom)) }} onPointerDown={event => event.stopPropagation()} onChange={event => updateEditing({ ...editing, text: event.target.value })} onBlur={() => finishEditing()} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); finishEditing(true); } else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); finishEditing(); } }} />
        <div><span>{editing.text.length}/200</span><button type="button" aria-label="取消白板文字" title="取消" onPointerDown={event => event.preventDefault()} onClick={() => finishEditing(true)}><CloseOutlined /></button><button type="button" aria-label="保存白板文字" title="完成" onPointerDown={event => event.preventDefault()} onClick={() => finishEditing()}><CheckOutlined /></button></div>
      </div>}
      <div className="call-board-navigation" role="group" aria-label="白板缩放">
        <button type="button" aria-label="缩小白板" title="缩小" disabled={camera.zoom <= .1} onClick={() => zoom(1 / 1.25)}><MinusOutlined /></button>
        <button type="button" className="call-board-scale" aria-label="重置白板缩放" title="恢复 100%" onClick={() => updateCamera(zoomBoardAt(cameraRef.current, 1, [size.width / 2, size.height / 2]))}>{Math.round(camera.zoom * 100)}%</button>
        <button type="button" aria-label="放大白板" title="放大" disabled={camera.zoom >= 4} onClick={() => zoom(1.25)}><PlusOutlined /></button>
        <span />
        <button type="button" aria-label="适应全部白板内容" title="查看全部" onClick={() => { finishEditing(); finish(); updateCamera(fitBoardItems(items, size.width, size.height)); }}><AimOutlined /></button>
      </div>
      <p id={hintId} className="call-board-hint">{selected && !canEdit ? '只能修改自己创建的内容' : tool === 'pan' ? '拖动以移动画布' : tool === 'text' ? '点按画布添加文字' : <><span className="call-board-desktop-hint">滚轮缩放 · 空格拖动</span><span className="call-board-touch-hint">双指移动与缩放</span></>}</p>
    </div>
  </div>;
}
