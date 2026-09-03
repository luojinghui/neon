'use client';

import { ClockCircleOutlined, LockOutlined, SendOutlined } from '@ant-design/icons';
import { Modal } from 'antd';
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

  useEffect(() => {
    if (accessState === 'password-required') setPassword('');
  }, [accessState]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setLocalError('');
    setSubmitting(true);
    try {
      await soulChat.submitRoomPassword(password);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '验证失败，请重试');
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
          <button type="button" onClick={onBack} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover">
            返回星球列表
          </button>
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
        <div className="rounded-xl bg-background-secondary p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"><LockOutlined /></div>
            <div className="min-w-0">
              <div className="truncate text-base font-semibold text-foreground">{room?.name || '私密星球'}</div>
              <div className="mt-0.5 font-mono text-xs tracking-wider text-primary">ID · {room?.code || roomId}</div>
            </div>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground-secondary">{room?.description || '暂无简介'}</p>
          {room?.owner && <p className="mt-2 text-xs text-foreground-muted">创建人：{room.owner.name}{room.owner.userId ? ` @${room.owner.userId}` : ''}</p>}
        </div>

        <div className="mt-4 rounded-lg border border-border px-3 py-3 text-sm text-foreground-secondary">
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
          <button type="button" onClick={onBack} className="rounded-lg px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-active">返回列表</button>
          {canApply && (
            <button type="button" disabled={submitting} onClick={() => void handleApplication()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50">
              <SendOutlined />{submitting ? '提交中...' : '申请访问'}
            </button>
          )}
        </div>
      </Modal>
    );
  }

  if (accessState !== 'password-required') return null;

  return (
    <Modal title="验证星球密码" open footer={null} closable={false} keyboard={false} maskClosable={false} centered width={400}>
      <form onSubmit={handleSubmit}>
        <div className="mb-4 flex items-center gap-3 rounded-lg bg-primary-soft p-3 text-primary">
          <LockOutlined className="text-lg" />
          <div>
            <div className="text-sm font-medium">该星球需要密码</div>
            <div className="mt-0.5 font-mono text-xs tracking-wider opacity-80">ID · {roomId}</div>
          </div>
        </div>
        <label htmlFor="room-access-password" className="mb-1 block text-sm font-medium text-foreground">
          密码
        </label>
        <input
          id="room-access-password"
          autoFocus
          type="password"
          inputMode="text"
          autoComplete="off"
          value={password}
          minLength={2}
          maxLength={4}
          onChange={(event) => setPassword(event.target.value.replace(/[^A-Za-z0-9]/g, ''))}
          placeholder="输入 2-4 位数字或字母"
          className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-input-foreground outline-none transition-colors placeholder:text-input-placeholder focus:border-border-focus focus:bg-input-focus"
        />
        {(localError || accessError) && <p className="mt-2 text-xs text-danger">{localError || accessError}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onBack} className="rounded-lg px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-active">
            返回列表
          </button>
          <button
            type="submit"
            disabled={submitting || !/^[A-Za-z0-9]{2,4}$/.test(password)}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? '验证中...' : '验证并进入'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
