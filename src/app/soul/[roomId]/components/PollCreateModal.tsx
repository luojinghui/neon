'use client';

import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';

import { Button } from '@/components/ui/button';
import { BarChartOutlined, CloseOutlined, LoadingOutlined, PlusOutlined } from '@ant-design/icons';
import { Modal } from '@/components/ui/modal';
import { useId, useRef, useState } from 'react';
import { soulChat } from '../../core';
import type { PollCreateInput } from '../../core/types';
import { useSoulStore } from '../../store';


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
    if (!trimmedQuestion) { setError('请输入主题'); return; }
    if (trimmedOptions.some((option) => !option)) { setError('请补全选项'); return; }
    if (new Set(trimmedOptions).size !== trimmedOptions.length) { setError('选项不能重复'); return; }
    const deadlineAt = hasDeadline ? new Date(deadline).getTime() : undefined;
    if (hasDeadline && (!deadlineAt || !Number.isFinite(deadlineAt) || deadlineAt <= Date.now())) {
      setError('截止时间需晚于现在');
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
      <form className="space-y-4 pt-1 text-sm text-foreground" onChange={() => setError('')} onSubmit={(event) => { event.preventDefault(); void submit(); }} onKeyDown={(event) => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault(); }}>
        <div className="max-h-[60dvh] space-y-4 overflow-y-auto pr-1">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={`${formId}-question`} className="font-medium">主题</label>
            </div>
            <Textarea id={`${formId}-question`} value={question} onChange={(event) => setQuestion(Array.from(event.target.value).slice(0, 200).join(''))} rows={2} disabled={disabled} autoFocus placeholder="投票主题" className="w-full" />
          </div>

          <div className="space-y-2">
            <div className="font-medium">选项</div>
            {options.map((option, index) => (
              <div key={option.id} className="flex items-center gap-2">
                <Input aria-label={`选项 ${index + 1}`} value={option.text} onChange={(event) => setOptions((current) => current.map((item) => item.id === option.id ? { ...item, text: Array.from(event.target.value).slice(0, 100).join('') } : item))} disabled={disabled} placeholder={`填写选项 ${index + 1}`} className="w-full" />
                {options.length > 2 && <Button variant="ghost" iconOnly type="button" aria-label={`移除选项 ${index + 1}`} disabled={disabled} onClick={() => setOptions((current) => current.filter((item) => item.id !== option.id))} className="flex h-9 w-8 shrink-0 items-center justify-center"><CloseOutlined /></Button>}
              </div>
            ))}
            {options.length < 10 && <Button size="sm" variant="ghost" type="button" disabled={disabled} onClick={() => { const id = nextOptionId.current++; setOptions((current) => [...current, { id, text: '' }]); }} className="inline-flex min-h-9 items-center gap-1.5 px-2 text-xs font-medium"><PlusOutlined />添加选项</Button>}
          </div>

          <div className="space-y-3 border-t border-border/60 pt-3">
            <div className="flex items-center justify-between gap-3 text-caption text-foreground-secondary"><span>设置截止时间</span><Switch aria-label="设置截止时间" checked={hasDeadline} onChange={setHasDeadline} disabled={disabled} /></div>
            {hasDeadline && <Input type="datetime-local" aria-label="投票截止时间" value={deadline} onChange={(event) => setDeadline(event.target.value)} min={localDateTime(Date.now() + 60000)} disabled={disabled} className="w-full" />}
          </div>
        </div>

        {error && <p role="alert" className="break-words text-xs text-danger">{error}</p>}
        {(!connected || !canAccess) && <p role="status" className="text-xs text-danger">{!canAccess ? '请先加入星球' : '连接已断开'}</p>}
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="ghost" type="button" disabled={pending} onClick={onClose} className="px-4 py-2 text-sm">取消</Button>
          <Button variant="primary" type="submit" disabled={disabled} className="inline-flex min-h-9 items-center justify-center gap-2 px-4 py-2 text-sm font-medium">{pending ? <LoadingOutlined /> : <BarChartOutlined />}{pending ? '正在发起…' : '发起投票'}</Button>
        </div>
      </form>
    </Modal>
  );
}
