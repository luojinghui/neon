'use client';

import { BarChartOutlined, CheckCircleFilled, ClockCircleOutlined, LoadingOutlined, ReloadOutlined } from '@ant-design/icons';
import { Modal } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { soulChat } from '../../core';
import type { ChatMessage, ChatPoll, ServerChatMessage } from '../../core/types';
import { useSoulStore } from '../../store';

const actionClass = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground-secondary transition-colors hover:border-border-hover hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50';

function pollTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function newestPoll(...messages: Array<ServerChatMessage | null | undefined>) {
  return messages.reduce<ServerChatMessage | undefined>((latest, candidate) => {
    if (!candidate?.poll) return latest;
    if (!latest || (candidate.pollRevision ?? 0) >= (latest.pollRevision ?? 0)) return candidate;
    return latest;
  }, undefined);
}

function PollOptions({ poll, disabled, onVote }: { poll: ChatPoll; disabled: boolean; onVote: (optionId: string) => void }) {
  return (
    <div className="space-y-2" role="group" aria-label="投票选项（单选）">
      {poll.options.map((option) => {
        const selected = poll.selectedOptionId === option.id;
        const percentage = poll.totalVotes ? Math.round(option.count / poll.totalVotes * 100) : 0;
        return (
          <button key={option.id} type="button" aria-pressed={selected} aria-label={`${option.text}，${option.count} 票，${percentage}%${selected ? '，我的选择' : ''}`} disabled={disabled || selected} onClick={() => onVote(option.id)} className={`relative block w-full overflow-hidden rounded-lg border p-2.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-default ${selected ? 'border-primary/60 bg-primary-soft/30' : 'border-border bg-surface enabled:hover:border-primary/40 enabled:hover:bg-surface-hover'}`}>
            <span aria-hidden="true" className={`absolute inset-y-0 left-0 transition-[width] duration-300 motion-reduce:transition-none ${selected ? 'bg-primary/10' : 'bg-surface-active/70'}`} style={{ width: `${percentage}%` }} />
            <span className="relative flex items-start gap-2">
              <span className="min-w-0 flex-1 break-words leading-relaxed text-foreground">{option.text}{selected && <CheckCircleFilled aria-hidden="true" className="ml-1.5 text-primary" />}</span>
              <span className="flex shrink-0 items-center gap-2 whitespace-nowrap pt-0.5 tabular-nums"><span className="font-medium text-foreground">{option.count} 票</span><span className="w-10 text-right text-foreground-muted">{percentage}%</span></span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function PollMessage({ message }: { message: ChatMessage }) {
  const sourceId = message.pollSourceId || message.id;
  const sourceMessage = useSoulStore((state) => state.messages.find((item) => item.id === sourceId));
  const connected = useSoulStore((state) => state.connectionState === 'connected');
  const canAccess = useSoulStore((state) => state.accessState === 'granted');
  const isSending = useSoulStore((state) => state.isSending);
  const [snapshot, setSnapshot] = useState<ServerChatMessage | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshRef = useRef(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const latest = newestPoll(message, snapshot, sourceMessage);
  const poll = latest?.poll;
  const deadlineAt = poll?.deadlineAt;
  const deadlinePassed = Boolean(deadlineAt && deadlineAt <= now);
  const closed = poll?.status === 'closed';
  const finished = closed || deadlinePassed;
  const disabled = pending || !connected || !canAccess || isSending || finished;
  const canClose = message.type === 'poll' && message.isLocal && !finished;

  useEffect(() => {
    if (!deadlineAt || closed || deadlineAt <= now) return;
    const remaining = deadlineAt - Date.now();
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, Math.min(remaining, 2147483647)));
    return () => window.clearTimeout(timer);
  }, [deadlineAt, closed, now]);

  const refresh = async () => {
    if (refreshRef.current || !connected || !canAccess) return;
    refreshRef.current = true;
    setRefreshing(true);
    setError('');
    try {
      const updated = await soulChat.getPoll(message.type === 'poll-result' ? message.id : sourceId);
      setSnapshot((previous) => newestPoll(previous, updated) || updated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '投票数据更新失败，请重试。');
    } finally {
      refreshRef.current = false;
      setRefreshing(false);
    }
  };

  const showDetails = () => {
    setOpen(true);
    setNow(Date.now());
    void refresh();
  };

  const run = async (action: () => Promise<ServerChatMessage>) => {
    if (disabled || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError('');
    try {
      const updated = await action();
      setSnapshot((previous) => newestPoll(previous, updated) || updated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败，请稍后重试。');
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  if (!poll) return null;

  const status = closed ? '已结束' : deadlinePassed ? '已截止' : '进行中';
  const timing = closed
    ? `${poll.closeReason === 'deadline' ? '到期结束' : '发起人已结束'}${poll.closedAt ? ` · ${pollTime(poll.closedAt)}` : ''}`
    : deadlineAt ? `${pollTime(deadlineAt)} 截止` : '不限时间 · 由发起人结束';
  const vote = (optionId: string) => { void run(() => soulChat.votePoll(sourceId, optionId)); };
  const notice = (
    <>
      {pending && <p role="status" className="flex items-center gap-1.5 text-xs text-primary"><LoadingOutlined />正在更新投票…</p>}
      {error && <p role="alert" className="break-words text-xs text-danger">{error}</p>}
      {(!connected || !canAccess) && <p role="status" className="text-xs text-foreground-muted">{!canAccess ? '当前无法访问聊天室，显示最近保存的结果。' : '连接已断开，显示最近保存的结果；恢复后可继续操作。'}</p>}
    </>
  );
  const summary = (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs text-foreground-muted">
      <span role="status" aria-live="polite">{poll.totalVotes} 人参与</span>
      <span>{finished ? closed ? '最终结果' : '正在汇总结果…' : poll.selectedOptionId ? '已参与 · 点击其他选项可改票' : '单选 · 点击选项投票'}</span>
    </div>
  );

  return (
    <>
      <section className="w-[320px] min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-surface text-left text-sm text-foreground shadow-sm" aria-label={message.type === 'poll-result' ? '投票最终结果' : '聊天投票'}>
        <button type="button" onClick={showDetails} className="block w-full border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30" aria-label={`查看投票${finished ? '结果' : '详情'}：${poll.question}`}>
          <span className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5 font-medium"><BarChartOutlined className="text-primary" />{message.type === 'poll-result' ? '投票结果' : '投票'}</span><span className={`rounded-full px-2 py-0.5 text-xs ${finished ? 'bg-surface-hover text-foreground-muted' : 'bg-primary-soft text-primary'}`}>{status}</span></span>
          <span className="mt-2 block break-words font-medium leading-relaxed">{poll.question}</span>
          <span className="mt-1.5 flex items-center gap-1 text-xs text-foreground-muted"><ClockCircleOutlined />{timing}</span>
        </button>
        <div className="space-y-3 p-3">
          <PollOptions poll={poll} disabled={disabled} onVote={vote} />
          {summary}
          {notice}
          <div className="flex items-center gap-2">
            <button type="button" onClick={showDetails} className={`${actionClass} flex-1`}>{finished ? '查看最终结果' : '查看投票详情'}</button>
            {canClose && <button type="button" disabled={disabled} onClick={() => void run(() => soulChat.closePoll(sourceId))} className={actionClass}>结束投票</button>}
          </div>
        </div>
      </section>

      <Modal title={finished ? '投票结果' : '投票详情'} open={open} onCancel={() => setOpen(false)} footer={null} centered destroyOnHidden width={480}>
        <div className="space-y-4 pt-1 text-foreground">
          <div><p className="break-words text-base font-medium leading-relaxed">{poll.question}</p><p className="mt-2 text-xs text-foreground-muted">{status} · {timing}</p></div>
          <div className="max-h-[50dvh] overflow-y-auto pr-1"><PollOptions poll={poll} disabled={disabled} onVote={vote} /></div>
          {summary}
          {notice}
          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <button type="button" disabled={refreshing || pending || !connected || !canAccess} onClick={() => void refresh()} className={actionClass}>{refreshing ? <LoadingOutlined /> : <ReloadOutlined />}{refreshing ? '更新中…' : '刷新结果'}</button>
            {canClose && <button type="button" disabled={disabled} onClick={() => void run(() => soulChat.closePoll(sourceId))} className={actionClass}>结束投票</button>}
          </div>
        </div>
      </Modal>
    </>
  );
}
