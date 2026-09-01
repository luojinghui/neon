'use client';

import { Checkbox, Modal } from 'antd';
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
    <Modal title={isEditing ? '编辑星球' : '创建星球'} open={open} onCancel={onClose} footer={null} centered destroyOnHidden width={460}>
      <form className="space-y-3 pt-1" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="room-name" className="mb-1 block text-sm font-medium text-foreground">
            星球名
          </label>
          <input
            id="room-name"
            value={name}
            maxLength={32}
            onChange={(event) => setName(event.target.value)}
            placeholder="给这个星球起个名字"
            className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-input-foreground outline-none transition-colors placeholder:text-input-placeholder focus:border-border-focus focus:bg-input-focus"
          />
        </div>

        <div>
          <label htmlFor="room-tags" className="mb-1 block text-sm font-medium text-foreground">
            Tag
          </label>
          <input
            id="room-tags"
            value={tags}
            maxLength={80}
            onChange={(event) => setTags(event.target.value)}
            placeholder="例如：日常、音乐、治愈（最多 5 个）"
            className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-input-foreground outline-none transition-colors placeholder:text-input-placeholder focus:border-border-focus focus:bg-input-focus"
          />
        </div>

        <div>
          <label htmlFor="room-description" className="mb-1 block text-sm font-medium text-foreground">
            描述
          </label>
          <textarea
            id="room-description"
            value={description}
            maxLength={200}
            rows={3}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="介绍一下想在这里聊些什么"
            className="w-full resize-none rounded-lg border border-border bg-input px-3 py-2 text-sm text-input-foreground outline-none transition-colors placeholder:text-input-placeholder focus:border-border-focus focus:bg-input-focus"
          />
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-surface-hover p-3">
          <Checkbox checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} className="w-full items-start">
              <span className="pl-1">
                <span className="block text-sm font-medium text-foreground">私密星球</span>
                <span className="mt-0.5 block text-xs text-foreground-muted">仅展示在私密列表，也可通过星球 ID 精确搜索。</span>
              </span>
          </Checkbox>

          <Checkbox checked={passwordEnabled} onChange={(event) => setPasswordEnabled(event.target.checked)} className="w-full items-start border-t border-border pt-2">
            <span className="pl-1">
              <span className="block text-sm font-medium text-foreground">进入需要密码</span>
              <span className="mt-0.5 block text-xs text-foreground-muted">支持 2-4 位数字或字母。</span>
            </span>
          </Checkbox>

          {passwordEnabled && (
            <input
              aria-label="星球密码"
              type="password"
              value={password}
              minLength={2}
              maxLength={4}
              autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value.replace(/[^A-Za-z0-9]/g, ''))}
              placeholder={isEditing && room?.hasPassword ? '留空表示保留原密码' : '输入 2-4 位密码'}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-input-foreground outline-none transition-colors placeholder:text-input-placeholder focus:border-border-focus focus:bg-input-focus"
            />
          )}
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-active">
            取消
          </button>
          <button
            type="submit"
            disabled={isSaving || !name.trim() || (passwordEnabled && (password ? !/^[A-Za-z0-9]{2,4}$/.test(password) : !room?.hasPassword))}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? '保存中...' : isEditing ? '保存修改' : '创建星球'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
