'use client';

import { Modal } from 'antd';
import { useEffect, useState } from 'react';
import { soulChat, type CreateRoomInput } from '../core';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (roomId: string) => void;
};

export function CreateRoomModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName('');
    setTags('');
    setDescription('');
    setError('');
  }, [open]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isCreating) return;
    setError('');
    setIsCreating(true);
    const input: CreateRoomInput = {
      name,
      description,
      tags: tags
        .split(/[,，、\s]+/)
        .map((tag) => tag.trim())
        .filter(Boolean)
    };
    try {
      const room = await soulChat.createRoom(input);
      onClose();
      onCreated(room.id);
    } catch (error) {
      setError(error instanceof Error ? error.message : '创建失败，请重试');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal title="创建星球聊天室" open={open} onCancel={onClose} footer={null} centered destroyOnHidden width={460}>
      <form className="space-y-3 pt-1" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="room-name" className="mb-1 block text-sm font-medium text-foreground">
            房间名
          </label>
          <input
            id="room-name"
            value={name}
            maxLength={32}
            onChange={(event) => setName(event.target.value)}
            placeholder="给这个房间起个名字"
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

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-active">
            取消
          </button>
          <button
            type="submit"
            disabled={isCreating || !name.trim()}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreating ? '创建中...' : '创建并进入'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
