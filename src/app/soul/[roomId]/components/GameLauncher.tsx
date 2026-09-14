'use client';

import { AppstoreOutlined, ArrowRightOutlined, LoadingOutlined } from '@ant-design/icons';
import { Modal, Popover } from 'antd';
import { useId, useRef, useState } from 'react';
import { soulChat } from '../../core';
import type { DrawingStroke, GameChoice, GameCreateInput } from '../../core/types';
import { useSoulStore } from '../../store';
import { DrawingCanvas } from './DrawingCanvas';

export const GAME_CHOICES: { value: GameChoice; emoji: string; label: string }[] = [
  { value: 'rock', emoji: '✊', label: '石头' },
  { value: 'scissors', emoji: '✌️', label: '剪刀' },
  { value: 'paper', emoji: '✋', label: '布' }
];

const WORDS = ['小猫', '火箭', '向日葵', '热气球', '冰淇淋', '自行车', '宇航员', '彩虹'];
const primaryButtonClass = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50';

export function GameChoicePicker({ value, onChange, disabled = false }: { value: GameChoice | null; onChange: (choice: GameChoice) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="选择猜拳手势">
      {GAME_CHOICES.map((choice) => (
        <button key={choice.value} type="button" aria-pressed={value === choice.value} onClick={() => onChange(choice.value)} disabled={disabled} className={`flex min-w-0 flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 ${value === choice.value ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-foreground-secondary hover:border-border-hover hover:bg-surface-hover'}`}>
          <span className="text-2xl leading-none" aria-hidden="true">{choice.emoji}</span>
          <span>{choice.label}</span>
        </button>
      ))}
    </div>
  );
}

export function GameSetupModal({ kind, onClose }: { kind: 'rps' | 'draw'; onClose: () => void }) {
  const wordInputId = useId();
  const [choice, setChoice] = useState<GameChoice | null>(null);
  const [word, setWord] = useState(WORDS[0]);
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState('');
  const connected = useSoulStore((state) => state.connectionState === 'connected');
  const isSending = useSoulStore((state) => state.isSending);
  const disabled = pending || !connected || isSending;
  const wordLength = Array.from(word.trim()).length;

  const submit = async () => {
    if (disabled || pendingRef.current) return;
    let input: GameCreateInput;
    if (kind === 'rps') {
      if (!choice) { setError('先选一个手势吧。'); return; }
      input = { kind: 'rps', choice };
    } else {
      if (wordLength < 2 || wordLength > 12) { setError('谜底需要 2–12 个字。'); return; }
      if (!strokes.length) { setError('先画几笔，再邀请大家来猜吧。'); return; }
      input = { kind: 'draw', word: word.trim(), strokes };
    }
    pendingRef.current = true;
    setPending(true);
    setError('');
    try {
      if (await soulChat.createGame(input)) onClose();
      else setError(useSoulStore.getState().chatError || (kind === 'draw' ? '发起失败，请重试。你的画作仍保留在这里。' : '发起失败，请重试。'));
    } catch {
      setError('发起失败，请稍后重试。');
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <Modal title={kind === 'rps' ? '✊ 来一局猜拳' : '🎨 你画我猜'} open onCancel={onClose} footer={null} centered destroyOnHidden width={kind === 'draw' ? 560 : 380} closable={!pending} mask={{ closable: !pending }} keyboard={!pending}>
      <div className="space-y-4 pt-1 text-sm text-foreground">
        {kind === 'rps' ? (
          <>
            <p className="text-foreground-muted">悄悄选好你的手势，邀请星球上的伙伴应战。双方出拳后一起揭晓！</p>
            <GameChoicePicker value={choice} onChange={setChoice} disabled={disabled} />
          </>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={wordInputId} className="font-medium">画什么？</label>
                <span className="text-xs text-foreground-muted">2–12 个字 · 揭晓前保密</span>
              </div>
              <input id={wordInputId} value={word} onChange={(event) => setWord(Array.from(event.target.value).slice(0, 12).join(''))} disabled={disabled} autoComplete="off" placeholder="输入你的谜底" className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-50" />
              <div className="flex flex-wrap gap-1.5">
                {WORDS.map((suggestion) => (
                  <button key={suggestion} type="button" onClick={() => setWord(suggestion)} disabled={disabled} className={`rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50 ${word === suggestion ? 'border-primary/30 bg-primary-soft text-primary' : 'border-border text-foreground-muted hover:border-border-hover hover:bg-surface-hover'}`}>{suggestion}</button>
                ))}
              </div>
            </div>
            <DrawingCanvas strokes={strokes} onChange={setStrokes} disabled={disabled} />
            <p className="text-xs text-foreground-muted">画图表达，别把谜底写出来哦。发出后，大家可以直接在画作下猜答案。</p>
          </>
        )}

        {(!connected || error) && <p role="alert" className="text-xs text-danger">{!connected ? '连接已断开，恢复连接后可以继续发起。' : error}</p>}
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <button type="button" disabled={pending} onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-foreground-muted transition-colors hover:bg-surface-active disabled:opacity-50">取消</button>
          <button type="button" onClick={() => void submit()} disabled={disabled || (kind === 'rps' ? !choice : !strokes.length || wordLength < 2)} className={primaryButtonClass}>
            {pending ? <LoadingOutlined /> : <ArrowRightOutlined />}{pending ? '正在发起…' : kind === 'rps' ? '出拳并邀请' : '发起你画我猜'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function GameLauncher() {
  const [open, setOpen] = useState(false);
  const [setup, setSetup] = useState<'rps' | 'draw' | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState('');
  const connected = useSoulStore((state) => state.connectionState === 'connected');
  const isSending = useSoulStore((state) => state.isSending);
  const disabled = !connected || isSending || pending;

  const rollDice = async () => {
    if (disabled || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError('');
    try {
      if (await soulChat.createGame({ kind: 'dice' })) setOpen(false);
      else setError(useSoulStore.getState().chatError || '骰子没掷出去，再试一次吧。');
    } catch {
      setError('骰子没掷出去，再试一次吧。');
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  const games = [
    { kind: 'dice' as const, emoji: '🎲', name: '掷骰子', description: '交给运气，看看掷出几点' },
    { kind: 'rps' as const, emoji: '✊', name: '猜拳', description: '石头剪刀布，来一局对决' },
    { kind: 'draw' as const, emoji: '🎨', name: '你画我猜', description: '画出脑洞，等伙伴来猜' }
  ];

  return (
    <>
      <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setError(''); }} trigger="click" placement="topLeft" arrow={false} styles={{ container: { padding: 4 } }} content={
        <div className="w-64 max-w-[calc(100vw-32px)] p-1">
          <div className="px-2 py-1.5 text-xs text-foreground-muted">一起玩点什么</div>
          {games.map((game) => (
            <button key={game.kind} type="button" disabled={disabled} onClick={() => { if (game.kind === 'dice') void rollDice(); else { setOpen(false); setSetup(game.kind); } }} className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-surface-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50">
              <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-hover text-xl">{game.kind === 'dice' && pending ? <LoadingOutlined className="text-primary" /> : game.emoji}</span>
              <span className="min-w-0"><span className="block text-sm font-medium text-foreground">{game.name}</span><span className="mt-0.5 block text-xs text-foreground-muted">{game.description}</span></span>
            </button>
          ))}
          {error && <p role="alert" className="px-2 py-1.5 text-xs text-danger">{error}</p>}
        </div>
      }>
        <button type="button" disabled={disabled} aria-label="聊天室小游戏" aria-expanded={open} className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-xs transition-colors hover:bg-surface-active hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 ${open ? 'bg-surface-active text-foreground' : 'text-foreground-muted'}`}>
          <AppstoreOutlined className="text-base" /><span>小游戏</span>
        </button>
      </Popover>
      {setup && <GameSetupModal key={setup} kind={setup} onClose={() => setSetup(null)} />}
    </>
  );
}
