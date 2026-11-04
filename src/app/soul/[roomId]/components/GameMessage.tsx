'use client';

import { Input } from '@/components/ui/input';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LoadingOutlined } from '@ant-design/icons';
import { Modal } from '@/components/ui/modal';
import { useRef, useState } from 'react';
import { soulChat } from '../../core';
import type { ChatMessage, GameActionInput, GameChoice } from '../../core/types';
import { useSoulStore } from '../../store';
import { DrawingCanvas } from './DrawingCanvas';
import { GAME_CHOICES, GameChoicePicker } from './GameLauncher';

const primaryClass = 'inline-flex min-h-9 items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium';
const cardClass = 'min-w-0 max-w-full p-3 text-left';

function DiceFace({ value }: { value: number }) {
  const positions: Record<number, [number, number][]> = {
    1: [[32, 32]], 2: [[20, 20], [44, 44]], 3: [[20, 20], [32, 32], [44, 44]],
    4: [[20, 20], [44, 20], [20, 44], [44, 44]],
    5: [[20, 20], [44, 20], [32, 32], [20, 44], [44, 44]],
    6: [[20, 18], [44, 18], [20, 32], [44, 32], [20, 46], [44, 46]]
  };
  return <svg width="56" height="56" viewBox="0 0 64 64" role="img" aria-label={`${value} 点骰子`} className="shrink-0 -rotate-6 text-primary">
    <rect x="3" y="3" width="58" height="58" rx="15" className="fill-surface stroke-border" strokeWidth="1.5" />
    {(positions[value] || []).map(([x, y], index) => <circle key={index} cx={x} cy={y} r="4.3" fill="currentColor" />)}
  </svg>;
}

function Hand({ choice, name }: { choice?: GameChoice; name: string }) {
  const hand = GAME_CHOICES.find((item) => item.value === choice);
  return <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
    <span role="img" aria-label={hand?.label || '待揭晓'} className="text-3xl leading-none">{hand?.emoji || '✊'}</span>
    <span className="max-w-full truncate text-xs text-foreground-muted" title={name}>{name}</span>
  </div>;
}

function RpsResult({ message }: { message: ChatMessage }) {
  const game = message.game;
  if (game?.kind !== 'rps') return null;
  return <div className="space-y-3">
    <div className="flex items-center gap-3"><Hand choice={game.hostChoice} name={message.senderName} /><span className="text-xs text-foreground-muted">VS</span><Hand choice={game.guest?.choice} name={game.guest?.name || '星球伙伴'} /></div>
    <p className="break-words text-center text-sm font-medium text-primary" role="status">{game.winner === 'draw' ? '平局' : `${game.winner === 'host' ? message.senderName : game.guest?.name || '星球伙伴'} 获胜`}</p>
  </div>;
}

export function GameMessage({ message }: { message: ChatMessage }) {
  const game = message.game;
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<GameChoice | null>(null);
  const [guess, setGuess] = useState('');
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState('');
  const connected = useSoulStore((state) => state.connectionState === 'connected');
  const canAccess = useSoulStore((state) => state.accessState === 'granted');
  const isSending = useSoulStore((state) => state.isSending);
  const disabled = pending || !connected || !canAccess || isSending;

  const act = async (input: Omit<GameActionInput, 'messageId'>, onSuccess?: () => void) => {
    if (disabled || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError('');
    try {
      if (await soulChat.actOnGame({ messageId: message.id, ...input })) onSuccess?.();
      else setError(useSoulStore.getState().chatError || '操作失败，请重试');
    } catch { setError('操作失败，请重试'); }
    finally { pendingRef.current = false; setPending(false); }
  };

  if (!game) return null;
  if (game.kind === 'dice') return <Card as="section" padding="none" bodyWrap={false} className={`${cardClass} inline-flex flex-row items-center gap-3 pr-5`} aria-label="掷骰子结果"><DiceFace value={game.value} /><span className="font-medium tabular-nums">{game.value} 点</span></Card>;

  const title = game.kind === 'rps' ? '猜拳' : '你画我猜';
  const finished = game.status === 'completed';
  const drawingCaption = game.kind === 'draw' ? finished ? `谜底：${game.answer || '已揭晓'}` : `${game.wordLength} 个字 · 等待猜中` : '';

  return <>
    {game.kind === 'rps' && (finished ? <Card as="section" padding="none" bodyWrap={false} className={`${cardClass} w-[240px]`} aria-label="猜拳结果"><RpsResult message={message} /></Card> : game.status === 'cancelled' ? <div className="rounded-md bg-surface-hover px-3 py-2 text-xs text-foreground-muted">猜拳已取消</div> :
      <Button data-ui-surface variant="ghost" type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={message.isLocal ? '查看猜拳邀请' : '参与猜拳'} className="flex min-w-0 max-w-full items-center gap-3 text-left text-sm"><span className="text-3xl" aria-hidden="true">✊</span><span className="text-xs text-foreground-secondary">猜拳 · 等待应战</span></Button>
    )}
    {game.kind === 'draw' && <Button data-ui-surface variant="ghost" type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={finished ? '查看画作结果' : message.isLocal ? '查看我的画作' : '参与猜画'} className="block min-w-0 max-w-full w-[260px] space-y-2 text-left text-sm">
      <DrawingCanvas strokes={game.strokes} readOnly />
      <span className={`block break-words text-center text-xs ${finished ? 'font-medium text-primary' : 'text-foreground-muted'}`}>{drawingCaption}</span>
      {finished && game.winnerName && <span className="block text-center text-xs text-foreground-muted">{game.winnerName} 猜中了</span>}
    </Button>}

    <Modal className="soul-game-modal" title={title} open={open} onCancel={() => setOpen(false)} footer={null} centered destroyOnHidden width={game.kind === 'draw' ? 480 : 360}>
      <div className="space-y-4 pt-2 text-foreground">
        {game.kind === 'rps' && (finished ? <RpsResult message={message} /> : game.status === 'cancelled' ? <p className="text-sm text-foreground-muted">邀请已取消</p> : message.isLocal ? <p className="py-6 text-center text-sm text-foreground-muted">等待对方出拳</p> : <>
          <GameChoicePicker value={choice} onChange={setChoice} disabled={disabled} />
          <Button variant="primary" type="button" className={`${primaryClass} w-full`} disabled={disabled || !choice} onClick={() => { if (choice) void act({ action: 'join', choice }); }}>{pending && <LoadingOutlined />}出拳</Button>
        </>)}
        {game.kind === 'draw' && <>
          <DrawingCanvas strokes={game.strokes} readOnly />
          <p className="break-words text-center text-sm font-medium">{drawingCaption}</p>
          {game.guesses.length > 0 && <div className="max-h-48 space-y-2 overflow-y-auto text-xs text-foreground-secondary" aria-label={finished ? '猜测结果' : '最近的猜测'}>{(finished ? game.guesses : game.guesses.slice(-3)).map((item, index) => <p key={`${item.timestamp}-${index}`} className="flex items-start justify-between gap-3"><span className="min-w-0 break-words">{item.name}：{item.text}</span>{finished && <span className={`shrink-0 font-medium ${item.correct ? 'text-success' : 'text-foreground-muted'}`}>{item.correct ? '✓ 正确' : '✕ 未猜中'}</span>}</p>)}</div>}
          {!finished && !message.isLocal && <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (guess.trim()) void act({ action: 'guess', guess: guess.trim() }, () => setGuess('')); }}>
            <Input value={guess} onChange={(event) => setGuess(Array.from(event.target.value).slice(0, 40).join(''))} onKeyDown={(event) => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault(); }} disabled={disabled} placeholder="我猜是…" aria-label="你的猜测" autoComplete="off" className="min-w-0 flex-1" />
            <Button variant="primary" type="submit" className={primaryClass} disabled={disabled || !guess.trim()}>{pending ? <LoadingOutlined /> : '猜一下'}</Button>
          </form>}
        </>}
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
        {(!connected || !canAccess) && !finished && <p role="status" className="text-xs text-foreground-muted">{!connected ? '连接已断开' : '请先加入星球'}</p>}
      </div>
    </Modal>
  </>;
}
