'use client';

import { CheckCircleOutlined, LoadingOutlined, LockOutlined, ReloadOutlined } from '@ant-design/icons';
import { useRef, useState } from 'react';
import { soulChat } from '../../core';
import type { ChatMessage, GameActionInput, GameChoice } from '../../core/types';
import { useSoulStore } from '../../store';
import { DrawingCanvas } from './DrawingCanvas';
import { GAME_CHOICES, GameChoicePicker, GameSetupModal } from './GameLauncher';

const actionClass = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground-secondary transition-colors hover:border-border-hover hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50';
const primaryClass = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50';

function DiceFace({ value, rolling }: { value: number; rolling: boolean }) {
  const positions: Record<number, [number, number][]> = {
    1: [[32, 32]],
    2: [[20, 20], [44, 44]],
    3: [[20, 20], [32, 32], [44, 44]],
    4: [[20, 20], [44, 20], [20, 44], [44, 44]],
    5: [[20, 20], [44, 20], [32, 32], [20, 44], [44, 44]],
    6: [[20, 18], [44, 18], [20, 32], [44, 32], [20, 46], [44, 46]]
  };
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label={`${value} 点骰子`} className={`shrink-0 -rotate-6 text-primary ${rolling ? 'motion-safe:animate-bounce' : ''}`}>
      <rect x="3" y="3" width="58" height="58" rx="15" className="fill-surface stroke-border" strokeWidth="1.5" />
      {(positions[value] || []).map(([x, y], index) => <circle key={index} cx={x} cy={y} r="4.3" fill="currentColor" />)}
    </svg>
  );
}

function Hand({ choice, name }: { choice?: GameChoice; name: string }) {
  const hand = GAME_CHOICES.find((item) => item.value === choice);
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-xl bg-surface-hover px-2 py-3">
      <span aria-hidden="true" className="text-3xl leading-none">{hand?.emoji || '🤔'}</span>
      <span className="max-w-full truncate text-xs text-foreground-secondary" title={name}>{name}</span>
      <span className="text-xs text-foreground-muted">{hand?.label || '待揭晓'}</span>
    </div>
  );
}

export function GameMessage({ message }: { message: ChatMessage }) {
  const game = message.game;
  const [choice, setChoice] = useState<GameChoice | null>(null);
  const [guess, setGuess] = useState('');
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState('');
  const [setup, setSetup] = useState<'rps' | 'draw' | null>(null);
  const connected = useSoulStore((state) => state.connectionState === 'connected');
  const isSending = useSoulStore((state) => state.isSending);
  const disabled = pending || !connected || isSending;

  const run = async (action: () => Promise<boolean>, onSuccess?: () => void) => {
    if (disabled || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError('');
    try {
      if (await action()) onSuccess?.();
      else setError(useSoulStore.getState().chatError || '操作没有成功，请重试。');
    } catch {
      setError('连接有点慢，请稍后再试。');
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  const act = (input: Omit<GameActionInput, 'messageId'>, onSuccess?: () => void) => run(() => soulChat.actOnGame({ messageId: message.id, ...input }), onSuccess);

  if (!game) return null;

  const title = game.kind === 'dice' ? '掷骰子' : game.kind === 'rps' ? '猜拳对决' : '你画我猜';
  const emoji = game.kind === 'dice' ? '🎲' : game.kind === 'rps' ? '✊' : '🎨';
  const waiting = (game.kind === 'rps' && game.status === 'waiting') || (game.kind === 'draw' && game.status === 'playing');

  return (
    <>
      <section className={`w-[300px] min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-surface text-left text-sm text-foreground shadow-sm ${game.kind === 'draw' ? 'sm:w-[340px]' : ''}`} aria-label={`${title}游戏`}>
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <span className="flex items-center gap-1.5 font-medium"><span aria-hidden="true">{emoji}</span>{title}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs ${waiting ? 'bg-primary-soft text-primary' : 'bg-surface-hover text-foreground-muted'}`}>{game.kind === 'dice' ? '好运时刻' : waiting ? game.kind === 'rps' ? '等待应战' : '正在猜谜' : game.kind === 'rps' && game.status === 'cancelled' ? '已收起' : '已揭晓'}</span>
        </div>

        <div className="space-y-3 p-3">
          {game.kind === 'dice' && (
            <>
              <div className="flex items-center gap-4 rounded-xl bg-primary-soft/60 px-4 py-3">
                <DiceFace value={game.value} rolling={pending} />
                <div><p className="font-medium">掷出了 <span className="text-primary">{game.value}</span> 点</p><p className="mt-1 text-xs text-foreground-muted">{game.value === 6 ? '手气满格，好运属于你！' : game.value === 1 ? '一点点运气，也很可爱。' : '宇宙随机送来一点好运。'}</p></div>
              </div>
              <button type="button" className={`${actionClass} w-full`} disabled={disabled} onClick={() => void run(() => soulChat.createGame({ kind: 'dice' }))}>{pending ? <LoadingOutlined /> : <ReloadOutlined />}再掷一次</button>
            </>
          )}

          {game.kind === 'rps' && (
            <>
              {game.status === 'waiting' ? message.isLocal ? (
                <>
                  <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-hover px-3 py-4 text-center">
                    <span aria-hidden="true" className="text-3xl">🤜 ✨ 🤛</span>
                    <p className="font-medium">谁来接招？</p>
                    <p className="flex items-center gap-1.5 text-xs text-foreground-muted"><LockOutlined />你的手势已收好，等伙伴出拳</p>
                  </div>
                  <button type="button" className={`${actionClass} w-full`} disabled={disabled} onClick={() => void act({ action: 'finish' })}>{pending && <LoadingOutlined />}收起这次邀请</button>
                </>
              ) : (
                <>
                  <p className="text-xs text-foreground-muted">对方已悄悄出拳。选好你的手势，一起揭晓！</p>
                  <GameChoicePicker value={choice} onChange={setChoice} disabled={disabled} />
                  <button type="button" className={`${primaryClass} w-full`} disabled={disabled || !choice} onClick={() => { if (choice) void act({ action: 'join', choice }); }}>{pending && <LoadingOutlined />}{pending ? '正在出拳…' : '出拳应战'}</button>
                </>
              ) : game.status === 'completed' ? (
                <>
                  <div className="flex items-center gap-2">
                    <Hand choice={game.hostChoice} name={message.isLocal ? '我' : message.senderName} />
                    <span className="text-xs font-medium text-foreground-muted">VS</span>
                    <Hand choice={game.guest?.choice} name={game.guest?.name || '星球伙伴'} />
                  </div>
                  <p className="break-words rounded-lg bg-primary-soft px-3 py-2 text-center text-xs font-medium text-primary" role="status">{game.winner === 'draw' ? '🤝 默契平局，再来一次？' : `🎉 ${game.winner === 'host' ? message.senderName : game.guest?.name || '星球伙伴'} 获胜！`}</p>
                  <button type="button" className={`${actionClass} w-full`} disabled={disabled} onClick={() => setSetup('rps')}><ReloadOutlined />再来一局</button>
                </>
              ) : (
                <>
                  <p className="py-2 text-center text-xs text-foreground-muted">邀请已收起，下次再过招吧。</p>
                  <button type="button" className={`${actionClass} w-full`} disabled={disabled} onClick={() => setSetup('rps')}><ReloadOutlined />发起新对决</button>
                </>
              )}
            </>
          )}

          {game.kind === 'draw' && (
            <>
              <DrawingCanvas strokes={game.strokes} readOnly />
              {game.status === 'playing' ? (
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-xs font-medium text-foreground-secondary">谜底有 {game.wordLength} 个字</span>
                  <span className="text-xs text-foreground-muted">{message.isLocal ? '看看谁最懂你的画' : '开动脑洞，大胆猜！'}</span>
                </div>
              ) : (
                <div className="space-y-1 rounded-lg bg-primary-soft px-3 py-2.5 text-center">
                  <p className="break-words text-sm font-medium text-primary">谜底：{game.answer || '已揭晓'}</p>
                  <p className="break-words text-xs text-foreground-muted">{game.winnerName ? `🎉 ${game.winnerName} 猜中了！` : '画家揭晓了答案，下次继续挑战！'}</p>
                </div>
              )}

              {game.guesses.length > 0 && (
                <div className="space-y-1.5 rounded-lg bg-surface-hover px-2.5 py-2" aria-label="最近的猜测">
                  <p className="text-xs text-foreground-muted">最近的猜测</p>
                  {game.guesses.slice(-3).map((item, index) => (
                    <div key={`${item.timestamp}-${item.publicKey}-${index}`} className="flex items-start gap-1.5 text-xs">
                      <span className="max-w-[40%] shrink-0 truncate text-foreground-muted" title={item.name}>{item.name}：</span>
                      <span className={`min-w-0 break-words ${item.correct ? 'font-medium text-success' : 'text-foreground-secondary'}`}>{item.text}{item.correct && <CheckCircleOutlined className="ml-1" aria-label="猜对了" />}</span>
                    </div>
                  ))}
                </div>
              )}

              {game.status === 'playing' ? message.isLocal ? (
                <button type="button" className={`${actionClass} w-full`} disabled={disabled} onClick={() => void act({ action: 'finish' })}>{pending && <LoadingOutlined />}揭晓答案</button>
              ) : (
                <form className="flex min-w-0 items-center gap-2" onSubmit={(event) => { event.preventDefault(); if (guess.trim()) void act({ action: 'guess', guess: guess.trim() }, () => setGuess('')); }}>
                  <input type="text" value={guess} onChange={(event) => setGuess(Array.from(event.target.value).slice(0, 40).join(''))} onKeyDown={(event) => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault(); }} disabled={disabled} placeholder="我猜是…" aria-label="你的猜测" autoComplete="off" className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 text-sm text-foreground outline-none placeholder:text-foreground-muted focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-50" />
                  <button type="submit" disabled={disabled || !guess.trim()} className={`${primaryClass} shrink-0`}>{pending ? <LoadingOutlined /> : '猜一下'}</button>
                </form>
              ) : (
                <button type="button" className={`${actionClass} w-full`} disabled={disabled} onClick={() => setSetup('draw')}><ReloadOutlined />我也来画</button>
              )}
            </>
          )}

          {error && <p role="alert" className="break-words text-xs text-danger">{error}</p>}
          {!connected && <p className="text-xs text-foreground-muted">重新连接后就能继续玩啦。</p>}
        </div>
      </section>
      {setup && <GameSetupModal key={setup} kind={setup} onClose={() => setSetup(null)} />}
    </>
  );
}
