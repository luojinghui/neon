'use client';

import { LockOutlined } from '@ant-design/icons';
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

  if (accessState === 'granted' || accessState === 'deleted') return null;

  if (accessState === 'error') {
    return (
      <Modal title="无法进入聊天室" open footer={null} closable={false} keyboard={false} maskClosable={false} centered width={400}>
        <p className="text-sm leading-relaxed text-foreground-secondary">{accessError || '聊天室不存在或暂时无法访问。'}</p>
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onBack} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover">
            返回星球列表
          </button>
        </div>
      </Modal>
    );
  }

  if (accessState !== 'password-required') return null;

  return (
    <Modal title="验证聊天室密码" open footer={null} closable={false} keyboard={false} maskClosable={false} centered width={400}>
      <form onSubmit={handleSubmit}>
        <div className="mb-4 flex items-center gap-3 rounded-lg bg-primary-soft p-3 text-primary">
          <LockOutlined className="text-lg" />
          <div>
            <div className="text-sm font-medium">该聊天室需要密码</div>
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
