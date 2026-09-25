'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { BoardItem, Presentation } from '@/modules/webrtc/sharing';
import type { CallSession } from '@/modules/webrtc/session';

type TextItem = Extract<BoardItem, { kind: 'text' }>;
type StrokeItem = Extract<BoardItem, { kind: 'stroke' }>;
type ActiveGesture =
  | { kind: 'stroke'; pointerId: number; item: StrokeItem; epoch: number; lastSent: number }
  | { kind: 'text'; pointerId: number; item: TextItem; original: TextItem; start: [number, number]; mode: 'move' | 'resize'; epoch: number };

function textBox(item: TextItem) {
  const fontSize = item.fontSize || 32;
  const characters = Array.from(item.text || '输入文字');
  const perLine = Math.max(6, Math.floor(360 / (fontSize * .62)));
  const lines: string[] = [];
  for (let index = 0; index < characters.length; index += perLine) lines.push(characters.slice(index, index + perLine).join(''));
  if (!lines.length) lines.push('');
  const width = Math.min(380, Math.max(96, Math.max(...lines.map(line => Array.from(line).length)) * fontSize * .62 + 18));
  return { fontSize, lines, width, height: Math.max(48, lines.length * fontSize * 1.25 + 14) };
}

function clampText(item: TextItem): TextItem {
  const box = textBox(item);
  return { ...item, x: Math.round(Math.max(0, Math.min(1000 - box.width, item.x))), y: Math.round(Math.max(0, Math.min(600 - box.height, item.y))) };
}

function BoardItemView({ item, selected }: { item: BoardItem; selected: boolean }) {
  if (item.kind === 'text') {
    const box = textBox(item);
    return <g className={`call-board-text ${selected ? 'is-selected' : ''}`} data-board-item={item.id} data-board-kind="text">
      <text x={item.x + 7} y={item.y + box.fontSize} fill={item.color} fontSize={box.fontSize}>
        {box.lines.map((line, index) => <tspan key={`${index}-${line}`} x={item.x + 7} dy={index ? box.fontSize * 1.25 : 0}>{line}</tspan>)}
      </text>
      {selected && <><rect className="call-board-selection" x={item.x - 5} y={item.y - 5} width={box.width + 10} height={box.height + 10} rx="8" /><circle data-board-resize="true" className="call-board-resize" cx={item.x + box.width + 5} cy={item.y + box.height + 5} r="10" /></>}
    </g>;
  }
  return item.points.length === 1 ? <circle data-board-item={item.id} cx={item.points[0][0]} cy={item.points[0][1]} r={item.width / 2} fill={item.color} /> : <polyline data-board-item={item.id} points={item.points.map(point => point.join(',')).join(' ')} fill="none" stroke={item.color} strokeWidth={item.width} strokeLinecap="round" strokeLinejoin="round" />;
}

export function SharedWhiteboard({ presentation, session, selfId }: { presentation: Presentation; session: CallSession; selfId: string }) {
  const [tool, setTool] = useState<'pen' | 'select'>('pen');
  const [color, setColor] = useState('#334155');
  const [width, setWidth] = useState(4);
  const [selectedId, setSelectedId] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editValue, setEditValue] = useState('');
  const [draft, setDraft] = useState<BoardItem | null>(null);
  const active = useRef<ActiveGesture | null>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const cancelEdit = useRef(false);
  const items = useMemo(() => presentation.items.map(item => item.id === draft?.id ? draft : item), [presentation.items, draft]);
  const selected = items.find(item => item.id === selectedId && item.kind === 'text') as TextItem | undefined;

  useEffect(() => { active.current = null; setDraft(null); setSelectedId(''); setEditingId(''); }, [presentation.id, presentation.epoch]);
  useEffect(() => { if (editingId) window.setTimeout(() => { editor.current?.focus(); editor.current?.select(); }); }, [editingId]);

  const point = (event: PointerEvent<SVGSVGElement>): [number, number] => {
    const position = new DOMPoint(event.clientX, event.clientY).matrixTransform(event.currentTarget.getScreenCTM()?.inverse());
    return [Math.round(Math.max(0, Math.min(1000, position.x))), Math.round(Math.max(0, Math.min(600, position.y)))];
  };
  const beginText = (item: TextItem) => {
    setTool('select'); setSelectedId(item.id); setEditingId(item.id); setEditValue(item.text); setDraft(item); cancelEdit.current = false;
  };
  const createText = () => beginText({ id: crypto.randomUUID(), kind: 'text', authorId: selfId, color, text: '', x: 360, y: 260, fontSize: 32 });
  const finishEdit = () => {
    const item = draft?.kind === 'text' && draft.id === editingId ? draft : selected;
    const cancelled = cancelEdit.current;
    cancelEdit.current = false;
    setEditingId('');
    if (cancelled || !item || !editValue.trim()) { setDraft(null); if (!presentation.items.some(entry => entry.id === editingId)) setSelectedId(''); return; }
    const next = clampText({ ...item, text: editValue.trim(), color });
    setDraft(next);
    void session.board('put', presentation.epoch, next, presentation.id).finally(() => setDraft(current => current?.id === next.id ? null : current));
  };
  const finish = (event: PointerEvent<SVGSVGElement>) => {
    const value = active.current;
    if (!value || value.pointerId !== event.pointerId) return;
    active.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const item = value.item;
    void session.board('put', value.epoch, item, presentation.id).finally(() => setDraft(current => current?.id === item.id ? null : current));
  };

  return <div className="call-whiteboard">
    <div className="call-share-tools" aria-label="白板工具">
      <button type="button" aria-pressed={tool === 'pen'} onClick={() => { setTool('pen'); setSelectedId(''); }}>画笔</button>
      <button type="button" aria-label="添加白板文字" aria-pressed={tool === 'select'} onClick={createText}>文字</button>
      <input type="color" value={color} aria-label="白板颜色" onChange={event => { setColor(event.target.value); if (selected?.authorId === selfId) { const next = { ...selected, color: event.target.value }; setDraft(next); void session.board('put', presentation.epoch, next, presentation.id).finally(() => setDraft(current => current?.id === next.id ? null : current)); } }} />
      <select aria-label="白板画笔粗细" value={width} onChange={event => setWidth(Number(event.target.value))}><option value={2}>细</option><option value={4}>中</option><option value={8}>粗</option></select>
      <button type="button" disabled={!presentation.items.some(item => item.authorId === selfId)} onClick={() => void session.board('undo', presentation.epoch, undefined, presentation.id)}>撤销</button>
      <button type="button" disabled={!presentation.items.length} onClick={() => void session.board('clear', presentation.epoch, undefined, presentation.id)}>清空</button>
    </div>
    <svg className={`call-whiteboard-canvas ${tool === 'select' ? 'is-selecting' : ''}`} viewBox="0 0 1000 600" aria-label="共享白板" role="img" onPointerDown={event => {
      if (!event.isPrimary || event.button !== 0 || active.current || editingId) return;
      event.preventDefault();
      const [x, y] = point(event);
      const target = event.target as SVGElement;
      const element = target.closest<SVGElement>('[data-board-item]');
      const item = presentation.items.find(entry => entry.id === element?.dataset.boardItem);
      if (item?.kind === 'text') {
        if (item.authorId !== selfId) { setSelectedId(''); return; }
        setTool('select'); setSelectedId(item.id);
        if (event.detail > 1) { beginText(item); return; }
        const mode = target.closest('[data-board-resize]') ? 'resize' : 'move';
        event.currentTarget.setPointerCapture(event.pointerId);
        active.current = { kind: 'text', pointerId: event.pointerId, item, original: item, start: [x, y], mode, epoch: presentation.epoch };
        setDraft(item); return;
      }
      setSelectedId('');
      if (tool !== 'pen') return;
      event.currentTarget.setPointerCapture(event.pointerId);
      const stroke: StrokeItem = { id: crypto.randomUUID(), kind: 'stroke', authorId: selfId, color, width, points: [[x, y]] };
      active.current = { kind: 'stroke', pointerId: event.pointerId, item: stroke, epoch: presentation.epoch, lastSent: 0 };
      setDraft(stroke);
    }} onPointerMove={event => {
      const value = active.current;
      if (!value || value.pointerId !== event.pointerId) return;
      const next = point(event);
      if (value.kind === 'text') {
        if (value.mode === 'move') value.item = clampText({ ...value.original, x: value.original.x + next[0] - value.start[0], y: value.original.y + next[1] - value.start[1] });
        else value.item = clampText({ ...value.original, fontSize: Math.round(Math.max(12, Math.min(96, value.original.fontSize + (next[0] - value.start[0]) / 3))) });
        setDraft(value.item); return;
      }
      const last = value.item.points[value.item.points.length - 1];
      if (Math.hypot(next[0] - last[0], next[1] - last[1]) < 2) return;
      let points = value.item.points;
      if (points.length >= 512) points = points.filter((_, index) => index % 2 === 0);
      value.item = { ...value.item, points: [...points, next] };
      setDraft(value.item);
      if (performance.now() - value.lastSent >= 80) { value.lastSent = performance.now(); void session.board('put', value.epoch, value.item, presentation.id); }
    }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>
      <rect width="1000" height="600" fill="white" />
      {items.filter(item => item.id !== editingId).map(item => <BoardItemView key={item.id} item={item} selected={item.id === selectedId} />)}
      {editingId && draft?.kind === 'text' && (() => { const box = textBox({ ...draft, text: editValue }); return <foreignObject className="call-board-text-editor" x={draft.x} y={draft.y} width={Math.max(220, box.width)} height={Math.max(64, box.height)}>
        <textarea ref={editor} aria-label="编辑白板文字" maxLength={200} value={editValue} style={{ fontSize: draft.fontSize }} onPointerDown={event => event.stopPropagation()} onChange={event => setEditValue(event.target.value)} onBlur={finishEdit} onKeyDown={event => { if (event.key === 'Escape') { cancelEdit.current = true; event.currentTarget.blur(); } else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.blur(); } }} />
      </foreignObject>; })()}
    </svg>
  </div>;
}
