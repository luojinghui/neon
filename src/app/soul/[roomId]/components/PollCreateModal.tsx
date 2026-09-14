'use client';

import { BarChartOutlined, CloseOutlined, LoadingOutlined, PlusOutlined } from '@ant-design/icons';
import { Modal } from 'antd';
import { useId, useRef, useState } from 'react';
import { soulChat } from '../../core';
import type { PollCreateInput } from '../../core/types';
import { useSoulStore } from '../../store';

const inputClass = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-50';

function localDateTime(timestamp: number) {
  const date = new Date(timestamp);
  return new Date(timestamp - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function PollCreateModal({ onClose }: { onClose: () => void }) {
  const formId = useId();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState([{ id: 0, text: '' }, { id: 1, text: '' }]);
  const nextOptionId = useRef(2);
  const [hasDeadline, setHasDeadline] = useState(false);
  const [deadline, setDeadline] = useState(() => localDateTime(Date.now() + 3600000));
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState('');
  const connected = useSoulStore((state) => state.connectionState === 'connected');
  const canAccess = useSoulStore((state) => state.accessState === 'granted');
  const isSending = useSoulStore((state) => state.isSending);
  const disabled = pending || !connected || !canAccess || isSending;

  const submit = async () => {
    if (disabled || pendingRef.current) return;
    const trimmedQuestion = question.trim();
    const trimmedOptions = options.map((option) => option.text.trim());
    if (!trimmedQuestion) { setError('请填写投票问题。'); return; }
    if (trimmedOptions.some((option) => !option)) { setError('请填写每一个选项，或移除多余的空选项。'); return; }
    if (new Set(trimmedOptions).size !== trimmedOptions.length) { setError('选项不能重复，请修改后再发起。'); return; }
    const deadlineAt = hasDeadline ? new Date(deadline).getTime() : undefined;
    if (hasDeadline && (!deadlineAt || !Number.isFinite(deadlineAt) || deadlineAt <= Date.now())) {
      setError('请选择晚于当前时间的截止时间。');
      return;
    }
    const input: PollCreateInput = { question: trimmedQuestion, options: trimmedOptions, ...(deadlineAt ? { deadlineAt } : {}) };
    pendingRef.current = true;
    setPending(true);
    setError('');
    try {
      await soulChat.createPoll(input);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '投票发起失败，请稍后重试。');
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <Modal title={<span className="inline-flex items-center gap-2"><BarChartOutlined className="text-primary" />发起投票</span>} open onCancel={onClose} footer={null} centered destroyOnHidden width={480} closable={!pending} mask={{ closable: !pending }} keyboard={!pending}>
      <form className="space-y-4 pt-1 text-sm text-foreground" onSubmit={(event) => { event.preventDefault(); void submit(); }} onKeyDown={(event) => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault(); }}>
        <p className="text-xs leading-relaxed text-foreground-muted">每人选择一项，你也可以参与。结束前可以更改答案，结束后结果会自动发送到群里。</p>
        <div className="max-h-[60dvh] space-y-4 overflow-y-auto pr-1">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={`${formId}-question`} className="font-medium">投票问题</label>
              <span className="text-xs text-foreground-muted">{Array.from(question).length}/200</span>
            </div>
            <textarea id={`${formId}-question`} value={question} onChange={(event) => setQuestion(Array.from(event.target.value).slice(0, 200).join(''))} rows={2} disabled={disabled} autoFocus placeholder="想听听大家对什么的看法？" className={`${inputClass} resize-none`} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2"><span className="font-medium">选项</span><span className="text-xs text-foreground-muted">2–10 项 · 每项最多 100 字</span></div>
            {options.map((option, index) => (
              <div key={option.id} className="flex items-center gap-2">
                <span aria-hidden="true" className="w-4 shrink-0 text-center text-xs text-foreground-muted">{index + 1}</span>
                <input aria-label={`选项 ${index + 1}`} value={option.text} onChange={(event) => setOptions((current) => current.map((item) => item.id === option.id ? { ...item, text: Array.from(event.target.value).slice(0, 100).join('') } : item))} disabled={disabled} placeholder={`填写选项 ${index + 1}`} className={`${inputClass} min-w-0 flex-1`} />
                <button type="button" aria-label={`移除选项 ${index + 1}`} disabled={disabled || options.length <= 2} onClick={() => setOptions((current) => current.filter((item) => item.id !== option.id))} className="flex h-9 w-8 shrink-0 items-center justify-center rounded-lg text-foreground-muted transition-colors hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-30"><CloseOutlined /></button>
              </div>
            ))}
            <button type="button" disabled={disabled || options.length >= 10} onClick={() => { const id = nextOptionId.current++; setOptions((current) => [...current, { id, text: '' }]); }} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-primary transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-40"><PlusOutlined />添加选项（{options.length}/10）</button>
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-2 font-medium">结束方式</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
              <label className="inline-flex cursor-pointer items-center gap-1.5"><input type="radio" name={`${formId}-deadline`} checked={!hasDeadline} onChange={() => setHasDeadline(false)} disabled={disabled} className="accent-primary" />不限时间，手动结束</label>
              <label className="inline-flex cursor-pointer items-center gap-1.5"><input type="radio" name={`${formId}-deadline`} checked={hasDeadline} onChange={() => setHasDeadline(true)} disabled={disabled} className="accent-primary" />设置截止时间</label>
            </div>
            {hasDeadline && <input type="datetime-local" aria-label="投票截止时间" value={deadline} onChange={(event) => setDeadline(event.target.value)} min={localDateTime(Date.now() + 60000)} disabled={disabled} className={inputClass} />}
            <p className="text-xs text-foreground-muted">发起后，你随时可以提前结束投票。</p>
          </fieldset>
        </div>

        {error && <p role="alert" className="break-words text-xs text-danger">{error}</p>}
        {(!connected || !canAccess) && <p role="status" className="text-xs text-danger">{!canAccess ? '当前无法访问聊天室，请重新加入后发起投票。' : '连接已断开，恢复连接后可以发起投票。'}</p>}
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <button type="button" disabled={pending} onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-foreground-muted transition-colors hover:bg-surface-active disabled:opacity-50">取消</button>
          <button type="submit" disabled={disabled} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50">{pending ? <LoadingOutlined /> : <BarChartOutlined />}{pending ? '正在发起…' : '发起投票'}</button>
        </div>
      </form>
    </Modal>
  );
}
