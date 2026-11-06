'use client';

import { Input } from '@/components/ui/input';

import { Button } from '@/components/ui/button';
import { ClockCircleOutlined, LockOutlined, SendOutlined } from '@ant-design/icons';
import { Modal } from '@/components/ui/modal';
import { useEffect, useState } from 'react';
import { soulChat } from '../../core';
import { useSoulStore } from '../../store';

type Props = {
  onBack: () => void;
};

export function RoomAccessModal({ onBack }: Props) {
  const accessState = useSoulStore((state) => state.accessState);
  const accessError = useSoulStore((state) => state.accessError);
  const roomId = useSoulStore((state) => state.roomId);
  const room = useSoulStore((state) => state.room);
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (accessState === 'password-required') { setPassword(''); setVerified(false); }
  }, [accessState]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setLocalError('');
    setSubmitting(true);
    try {
      // A wrong password resolves false (the store returns to 'password-required' with accessError); it does not throw.
      const ok = await soulChat.submitRoomPassword(password);
      // On success keep the loading state until the store flips to 'granted' and this dialog unmounts.
      setVerified(ok);
      if (!ok) setPassword('');
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '验证失败，请重试');
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApplication = async () => {
    if (submitting) return;
    setLocalError('');
    setSubmitting(true);
    try {
      const submitted = await soulChat.requestRoomAccess();
      if (!submitted) setLocalError('申请提交失败，请稍后重试');
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '申请提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  if (accessState === 'granted' || accessState === 'deleted') return null;

  if (accessState === 'error') {
    return (
      <Modal title="无法进入星球" open footer={null} closable={false} keyboard={false} maskClosable={false} centered width={400}>
        <p className="text-sm leading-relaxed text-foreground-secondary">{accessError || '星球不存在或暂时无法访问。'}</p>
        <div className="mt-5 flex justify-end">
          <Button variant="primary" type="button" onClick={onBack} className="px-4 py-2 text-sm font-medium">
            返回星球列表
          </Button>
        </div>
      </Modal>
    );
  }

  const applicationStates = ['application-required', 'application-pending', 'application-rejected', 'application-exhausted'];
  if (applicationStates.includes(accessState)) {
    const access = room?.access;
    const canApply = ['application-required', 'application-rejected'].includes(accessState) && (access?.remainingAttempts ?? 5) > 0;
    return (
      <Modal title="申请访问私密星球" open footer={null} closable={false} keyboard={false} maskClosable={false} centered width={440}>
        <div className="rounded-lg bg-surface-inset p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"><LockOutlined /></div>
            <div className="min-w-0">
              <div className="truncate text-base font-semibold text-foreground">{room?.name || '私密星球'}</div>
              <div className="mt-0.5 font-mono text-xs tracking-wider text-primary">ID · {room?.code || roomId}</div>
            </div>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground-secondary">{room?.description || '暂无简介'}</p>
          {room?.owner && <p className="mt-2 text-xs text-foreground-muted">创建人：{room.owner.name}{room.owner.userId ? ` @${room.owner.userId}` : ''}</p>}
        </div>

        <div className="mt-4 py-2 text-sm text-foreground-secondary">
          {accessState === 'application-pending' ? (
            <span className="inline-flex items-center gap-2"><ClockCircleOutlined className="text-warning" />申请已提交，正在等待创建人或超管处理。</span>
          ) : accessState === 'application-rejected' ? (
            <span>上次申请未通过，还可申请 <strong className="text-foreground">{access?.remainingAttempts ?? 0}</strong> 次。</span>
          ) : accessState === 'application-exhausted' ? (
            <span className="text-danger">已达到 5 次申请上限，暂时无法继续申请。</span>
          ) : (
            <span>你还没有访问权限，可以向创建人或超管提交申请。</span>
          )}
        </div>

        {(localError || accessError) && <p className="mt-2 text-xs text-danger">{localError || accessError}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onBack} className="px-4 py-2 text-sm font-medium">返回列表</Button>
          {canApply && (
            <Button variant="primary" type="button" disabled={submitting} onClick={() => void handleApplication()} className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium">
              <SendOutlined />{submitting ? '提交中...' : '申请访问'}
            </Button>
          )}
        </div>
      </Modal>
    );
  }

  // submitRoomPassword moves the store through 'joining'; keep the same dialog mounted meanwhile so it neither closes nor re-slides in.
  const passwordFlow = accessState === 'password-required' || (accessState === 'joining' && (submitting || verified));
  if (!passwordFlow) return null;

  const valid = /^[A-Za-z0-9]{2,4}$/.test(password);
  const busy = submitting || verified;
  return (
    <Modal title="验证星球密码" open footer={null} closable={false} keyboard={false} maskClosable={false} centered width={400}>
      <form onSubmit={handleSubmit} aria-busy={busy || undefined}>
        <div className="mb-4 flex items-center gap-3 rounded-lg bg-primary-soft p-3 text-primary">
          <LockOutlined className="text-lg" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{room?.name || '该星球需要密码'}</div>
            <div className="mt-0.5 font-mono text-xs tracking-wider opacity-80">ID · {room?.code || roomId}</div>
          </div>
        </div>
        <label htmlFor="room-access-password" className="mb-1.5 block text-sm font-medium text-foreground">密码</label>
        <Input
          id="room-access-password"
          type="password"
          inputMode="text"
          autoComplete="off"
          value={password}
          minLength={2}
          maxLength={4}
          disabled={busy}
          status={localError || accessError ? 'error' : undefined}
          onChange={(event) => { setPassword(event.target.value.replace(/[^A-Za-z0-9]/g, '')); if (localError) setLocalError(''); }}
          placeholder="输入 2-4 位数字或字母"
          className="w-full"
        />
        <p className="mt-2 min-h-[1.25rem] text-xs" role={localError || accessError ? 'alert' : 'status'}
          style={{ color: localError || accessError ? 'hsl(var(--danger))' : 'hsl(var(--foreground-muted))' }}>
          {verified ? '验证通过，正在进入星球…' : submitting ? '正在验证…' : localError || accessError || ''}
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onBack} disabled={busy} className="px-4 py-2 text-sm font-medium">返回列表</Button>
          <Button variant="primary" type="submit" loading={busy} disabled={busy || !valid} className="px-5 py-2 text-sm font-medium">
            {verified ? '进入中' : submitting ? '验证中' : '验证并进入'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
