'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { BoardItem, Presentation } from '@/modules/webrtc/sharing';
import type { CallSession } from '@/modules/webrtc/session';

function Item({ item }: { item: BoardItem }) {
  if (item.kind === 'text') {
    const characters = Array.from(item.text), lines: string[] = [];
    for (let index = 0; index < characters.length; index += 24) lines.push(characters.slice(index, index + 24).join(''));
    const x = Math.min(item.x, 1000 - Math.min(24, characters.length) * 24 - 12);
    const y = Math.min(Math.max(28, item.y), 594 - (lines.length - 1) * 28);
    return <text data-board-item={item.id} x={x} y={y} fill={item.color} fontSize="24" fontFamily="sans-serif">{lines.map((line, index) => <tspan key={index} x={x} dy={index ? 28 : 0}>{line}</tspan>)}</text>;
  }
  return item.points.length === 1 ? <circle data-board-item={item.id} cx={item.points[0][0]} cy={item.points[0][1]} r={item.width / 2} fill={item.color} /> : <polyline data-board-item={item.id} points={item.points.map(point => point.join(',')).join(' ')} fill="none" stroke={item.color} strokeWidth={item.width} strokeLinecap="round" strokeLinejoin="round" />;
}

export function SharedWhiteboard({ presentation, session, selfId }: { presentation: Presentation; session: CallSession; selfId: string }) {
  const [tool, setTool] = useState<'pen' | 'text'>('pen');
  const [color, setColor] = useState('#334155');
  const [width, setWidth] = useState(4);
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<BoardItem | null>(null);
  const active = useRef<{ pointerId: number; item: Extract<BoardItem, { kind: 'stroke' }>; epoch: number; lastSent: number } | null>(null);
  useEffect(() => { active.current = null; setDraft(null); }, [presentation.id, presentation.epoch]);
  const point = (event: PointerEvent<SVGSVGElement>): [number, number] => {
    const svg = event.currentTarget, matrix = svg.getScreenCTM();
    const position = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix?.inverse());
    return [Math.round(Math.max(0, Math.min(1000, position.x))), Math.round(Math.max(0, Math.min(600, position.y)))];
  };
  const finish = (event: PointerEvent<SVGSVGElement>) => {
    const value = active.current;
    if (!value || value.pointerId !== event.pointerId) return;
    active.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    void session.board('put', value.epoch, value.item, presentation.id).finally(() => setDraft(current => current?.id === value.item.id ? null : current));
  };
  return <div className="call-whiteboard">
    <div className="call-share-tools" aria-label="白板工具">
      <button type="button" aria-pressed={tool === 'pen'} onClick={() => setTool('pen')}>画笔</button>
      <button type="button" aria-pressed={tool === 'text'} onClick={() => setTool('text')}>文字</button>
      <input type="color" value={color} aria-label="白板颜色" onChange={event => setColor(event.target.value)} />
      <select aria-label="白板画笔粗细" value={width} onChange={event => setWidth(Number(event.target.value))}><option value={2}>细</option><option value={4}>中</option><option value={8}>粗</option></select>
      <button type="button" disabled={!presentation.items.some(item => item.authorId === selfId)} onClick={() => void session.board('undo', presentation.epoch, undefined, presentation.id)}>撤销我的一笔</button>
      <button type="button" disabled={!presentation.items.length} onClick={() => void session.board('clear', presentation.epoch, undefined, presentation.id)}>清空画板</button>
    </div>
    {tool === 'text' && <div className="call-whiteboard-text"><input aria-label="白板文字" placeholder="输入文字，再点击画板放置" maxLength={200} value={text} onChange={event => setText(event.target.value)} /></div>}
    <svg className="call-whiteboard-canvas" viewBox="0 0 1000 600" aria-label="共享白板，所有参会者均可绘画" role="img" onPointerDown={event => {
      if (!event.isPrimary || event.button !== 0 || active.current) return;
      event.preventDefault();
      const [x, y] = point(event);
      if (tool === 'text') {
        if (text.trim()) void session.board('put', presentation.epoch, { id: crypto.randomUUID(), kind: 'text', authorId: selfId, color, text: text.trim(), x, y }, presentation.id).then(ok => { if (ok) setText(''); });
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      const item: Extract<BoardItem, { kind: 'stroke' }> = { id: crypto.randomUUID(), kind: 'stroke', authorId: selfId, color, width, points: [[x, y]] };
      active.current = { pointerId: event.pointerId, item, epoch: presentation.epoch, lastSent: 0 };
      setDraft(item);
    }} onPointerMove={event => {
      const value = active.current;
      if (!value || value.pointerId !== event.pointerId) return;
      const next = point(event), last = value.item.points[value.item.points.length - 1];
      if (Math.hypot(next[0] - last[0], next[1] - last[1]) < 2) return;
      let points = value.item.points;
      if (points.length >= 512) points = points.filter((_, index) => index % 2 === 0);
      value.item = { ...value.item, points: [...points, next] };
      setDraft(value.item);
      if (performance.now() - value.lastSent >= 80) {
        value.lastSent = performance.now();
        void session.board('put', value.epoch, value.item, presentation.id);
      }
    }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>
      <rect width="1000" height="600" fill="white" />
      {presentation.items.filter(item => item.id !== draft?.id).map(item => <Item key={item.id} item={item} />)}
      {draft && <Item item={draft} />}
    </svg>
  </div>;
}
