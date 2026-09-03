'use client';

import { GlobalOutlined, LockOutlined } from '@ant-design/icons';
import { Modal, Switch } from 'antd';
import { useEffect, useState } from 'react';
import { soulChat, type ChatRoom, type CreateRoomInput } from '../core';

type Props = {
  open: boolean;
  room?: ChatRoom | null;
  onClose: () => void;
  onSaved: (room: ChatRoom) => void;
};

export function CreateRoomModal({ open, room, onClose, onSaved }: Props) {
  const isEditing = Boolean(room);
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [password, setPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(room?.name || '');
    setTags(room?.tags.join('、') || '');
    setDescription(room?.description || '');
    setIsPrivate(room?.isPrivate || false);
    setPasswordEnabled(room?.hasPassword || false);
    setPassword('');
    setError('');
  }, [open, room]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) return;
    setError('');
    setIsSaving(true);
    const input: CreateRoomInput = {
      name,
      description,
      tags: tags
        .split(/[,，、\s]+/)
        .map((tag) => tag.trim())
        .filter(Boolean),
      isPrivate,
      passwordEnabled,
      password
    };
    try {
      const savedRoom = room ? await soulChat.updateRoom({ ...input, roomId: room.id }) : await soulChat.createRoom(input);
      onClose();
      onSaved(savedRoom);
    } catch (error) {
      setError(error instanceof Error ? error.message : `${isEditing ? '保存' : '创建'}失败，请重试`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal title={isEditing ? '编辑星球' : '创建星球'} open={open} onCancel={onClose} footer={null} centered destroyOnHidden width={480}>
      <form className="space-y-4 pt-2" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="room-name" className="mb-1.5 block text-sm font-medium text-foreground">
            星球名
          </label>
          <input
            id="room-name"
            value={name}
            maxLength={32}
            onChange={(event) => setName(event.target.value)}
            placeholder="给这个星球起个名字"
            className="w-full rounded-xl border border-border bg-input px-3.5 py-2.5 text-sm text-input-foreground outline-none transition-colors placeholder:text-input-placeholder focus:border-border-focus focus:bg-input-focus"
          />
        </div>

        <div>
          <label htmlFor="room-tags" className="mb-1.5 block text-sm font-medium text-foreground">
            标签 <span className="font-normal text-foreground-muted">· 可选</span>
          </label>
          <input
            id="room-tags"
            value={tags}
            maxLength={80}
            onChange={(event) => setTags(event.target.value)}
            placeholder="日常、音乐、治愈，最多 5 个"
            className="w-full rounded-xl border border-border bg-input px-3.5 py-2.5 text-sm text-input-foreground outline-none transition-colors placeholder:text-input-placeholder focus:border-border-focus focus:bg-input-focus"
          />
        </div>

        <div>
          <label htmlFor="room-description" className="mb-1.5 block text-sm font-medium text-foreground">
            描述 <span className="font-normal text-foreground-muted">· 可选</span>
          </label>
          <textarea
            id="room-description"
            value={description}
            maxLength={200}
            rows={3}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="介绍一下想在这里聊些什么"
            className="w-full resize-none rounded-xl border border-border bg-input px-3.5 py-2.5 text-sm leading-6 text-input-foreground outline-none transition-colors placeholder:text-input-placeholder focus:border-border-focus focus:bg-input-focus"
          />
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-foreground">可见范围</legend>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={!isPrivate}
              onClick={() => setIsPrivate(false)}
              className={`flex items-start gap-2.5 rounded-xl border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 ${
                !isPrivate ? 'border-primary/50 bg-primary-soft text-foreground' : 'border-border bg-surface text-foreground-secondary hover:border-border-hover hover:bg-surface-hover'
              }`}
            >
              <GlobalOutlined className={`mt-0.5 text-sm ${!isPrivate ? 'text-primary' : 'text-foreground-muted'}`} />
              <span>
                <span className="block text-sm font-medium">公开</span>
                <span className="mt-0.5 block text-xs text-foreground-muted">出现在公共列表</span>
              </span>
            </button>
            <button
              type="button"
              aria-pressed={isPrivate}
              onClick={() => {
                setIsPrivate(true);
                setPasswordEnabled(false);
                setPassword('');
              }}
              className={`flex items-start gap-2.5 rounded-xl border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 ${
                isPrivate ? 'border-primary/50 bg-primary-soft text-foreground' : 'border-border bg-surface text-foreground-secondary hover:border-border-hover hover:bg-surface-hover'
              }`}
            >
              <LockOutlined className={`mt-0.5 text-sm ${isPrivate ? 'text-primary' : 'text-foreground-muted'}`} />
              <span>
                <span className="block text-sm font-medium">私密</span>
                <span className="mt-0.5 block text-xs text-foreground-muted">授权后可加入</span>
              </span>
            </button>
          </div>
        </fieldset>

        {!isPrivate ? (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="room-password" className="text-sm font-medium text-foreground">
                进入密码 <span className="font-normal text-foreground-muted">· 可选</span>
              </label>
              <Switch
                checked={passwordEnabled}
                aria-label="开启进入密码"
                onChange={setPasswordEnabled}
                className="shrink-0"
                style={{ backgroundColor: passwordEnabled ? 'hsl(var(--primary))' : 'hsl(var(--background-tertiary))' }}
              />
            </div>

            <input
              id="room-password"
              aria-label="星球密码"
              type="password"
              value={password}
              minLength={2}
              maxLength={4}
              autoComplete="new-password"
              disabled={!passwordEnabled}
              onChange={(event) => setPassword(event.target.value.replace(/[^A-Za-z0-9]/g, ''))}
              placeholder={!passwordEnabled ? '任何人都可以直接进入' : isEditing && room?.hasPassword ? '留空表示保留原密码' : '输入 2-4 位数字或字母'}
              className="w-full max-w-xs rounded-xl border border-border bg-input px-3.5 py-2.5 text-sm text-input-foreground outline-none transition-colors placeholder:text-input-placeholder focus:border-border-focus focus:bg-input-focus disabled:cursor-not-allowed"
            />
          </div>
        ) : (
          <p className="rounded-lg bg-primary-soft px-3 py-2 text-xs text-primary">私密星球仅你、已授权成员和超管可进入，无需密码。</p>
        )}

        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-active">
            取消
          </button>
          <button
            type="submit"
            disabled={isSaving || !name.trim() || (!isPrivate && passwordEnabled && (password ? !/^[A-Za-z0-9]{2,4}$/.test(password) : !room?.hasPassword))}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? '保存中...' : isEditing ? '保存修改' : '创建星球'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
