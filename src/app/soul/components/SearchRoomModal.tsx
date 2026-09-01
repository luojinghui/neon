'use client';

import { LockOutlined, SearchOutlined } from '@ant-design/icons';
import { Modal } from 'antd';
import { useEffect, useState } from 'react';
import { soulChat } from '../core';
import type { ChatRoom } from './types';

type Props = {
  open: boolean;
  onClose: () => void;
  onJoin: (room: ChatRoom) => void;
};

export function SearchRoomModal({ open, onClose, onJoin }: Props) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<ChatRoom | null>(null);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setResult(null);
    setSearched(false);
    setError('');
  }, [open]);

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim() || searching) return;
    setSearching(true);
    setError('');
    try {
      setResult(await soulChat.searchRoom(query));
      setSearched(true);
    } catch (error) {
      setResult(null);
      setSearched(true);
      setError(error instanceof Error ? error.message : '搜索失败，请重试');
    } finally {
      setSearching(false);
    }
  };

  return (
    <Modal title="搜索星球聊天室" open={open} onCancel={onClose} footer={null} centered destroyOnHidden width={480}>
      <form className="flex gap-2 pt-1" onSubmit={handleSearch}>
        <input
          autoFocus
          aria-label="聊天室 ID"
          value={query}
          maxLength={80}
          onChange={(event) => setQuery(event.target.value.replace(/\s/g, '').toUpperCase())}
          placeholder="输入聊天室 ID，例如 AB3D"
          className="min-w-0 flex-1 rounded-lg border border-border bg-input px-3 py-2 text-sm uppercase text-input-foreground outline-none transition-colors placeholder:normal-case placeholder:text-input-placeholder focus:border-border-focus focus:bg-input-focus"
        />
        <button
          type="submit"
          disabled={!query.trim() || searching}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <SearchOutlined />
          {searching ? '搜索中' : '搜索'}
        </button>
      </form>

      <p className="mt-2 text-xs text-foreground-muted">支持精确查询公开或私密聊天室，私密聊天室不会出现在公共列表。</p>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}

      {searched && !result && !error && (
        <div className="mt-5 rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-foreground-muted">没有找到对应的聊天室，请检查 ID。</div>
      )}

      {result && (
        <div className="mt-5 rounded-lg border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-semibold text-foreground">{result.name}</h3>
                {result.isPrivate && <span className="rounded-lg bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary">私密</span>}
                {result.hasPassword && <LockOutlined className="text-xs text-foreground-muted" aria-label="需要密码" />}
              </div>
              <div className="mt-1 font-mono text-xs font-semibold tracking-wider text-primary">ID · {result.code}</div>
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-foreground-secondary">{result.description || '暂无简介'}</p>
            </div>
            <button
              type="button"
              onClick={() => onJoin(result)}
              className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
            >
              去加入
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
