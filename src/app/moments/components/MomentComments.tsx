'use client';

import { CloseOutlined, DeleteOutlined, EditOutlined, LoadingOutlined, MessageOutlined, RollbackOutlined, SendOutlined } from '@ant-design/icons';
import { useEffect, useRef, useState } from 'react';
import { createComment, deleteComment, getComments, updateComment } from '../client';
import { formatMomentTime } from '../format';
import type { MomentComment } from '../types';
import { MomentAvatar } from './MomentAvatar';

type Props = {
  momentId: string;
  initialComments: MomentComment[];
  initialCount: number;
  onCountChange?: (count: number) => void;
};

export function MomentComments({ momentId, initialComments, initialCount, onCountChange }: Props) {
  const [comments, setComments] = useState(initialComments);
  const [count, setCount] = useState(initialCount);
  const [expanded, setExpanded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [replyTo, setReplyTo] = useState<MomentComment | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [editDraft, setEditDraft] = useState('');
  const [actingId, setActingId] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setComments(initialComments);
    setCount(initialCount);
    setExpanded(false);
    setSelectedId('');
    setReplyTo(null);
    setDraft('');
    setError('');
  }, [initialComments, initialCount, momentId]);

  const setCommentCount = (next: number) => {
    setCount(next);
    onCountChange?.(next);
  };

  const toggleExpanded = async () => {
    if (expanded) {
      setExpanded(false);
      setComments((current) => current.slice(-2));
      setSelectedId('');
      return;
    }
    setLoadingMore(true);
    setError('');
    try {
      setComments(await getComments(momentId));
      setExpanded(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '评论加载失败');
    } finally {
      setLoadingMore(false);
    }
  };

  const startReply = (comment: MomentComment) => {
    setReplyTo(comment);
    setSelectedId('');
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError('');
    try {
      const created = await createComment(momentId, text, replyTo?.id || '');
      setComments((current) => (expanded ? [...current, created] : [...current, created].slice(-2)));
      setCommentCount(count + 1);
      setDraft('');
      setReplyTo(null);
      setSelectedId(created.id);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : '评论发送失败');
    } finally {
      setSending(false);
    }
  };

  const saveEdit = async (comment: MomentComment) => {
    const text = editDraft.trim();
    if (!text || actingId) return;
    setActingId(comment.id);
    setError('');
    try {
      const updated = await updateComment(momentId, comment.id, text);
      setComments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setEditingId('');
      setSelectedId(updated.id);
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : '评论编辑失败');
    } finally {
      setActingId('');
    }
  };

  const remove = async (comment: MomentComment) => {
    if (actingId || !window.confirm('删除这条评论？此操作无法撤销。')) return;
    setActingId(comment.id);
    setError('');
    try {
      await deleteComment(momentId, comment);
      const nextCount = Math.max(0, count - 1);
      if (!expanded && nextCount > comments.length - 1) {
        const all = await getComments(momentId);
        setComments(all.slice(-2));
      } else {
        setComments((current) => current.filter((item) => item.id !== comment.id));
      }
      setCommentCount(nextCount);
      if (replyTo?.id === comment.id) setReplyTo(null);
      setSelectedId('');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '评论删除失败');
    } finally {
      setActingId('');
    }
  };

  return (
    <section className="moment-comments" aria-label={`${count} 条评论`}>
      <div className="moment-comments-heading">
        <span><MessageOutlined /> {count} 条评论</span>
        {count > 2 && (
          <button type="button" onClick={() => void toggleExpanded()} disabled={loadingMore}>
            {loadingMore ? <LoadingOutlined /> : null}
            {expanded ? '收起评论' : `展开其余 ${Math.max(0, count - 2)} 条`}
          </button>
        )}
      </div>

      <div className="moment-comment-list">
        {comments.map((comment) => {
          const selected = selectedId === comment.id;
          const editing = editingId === comment.id;
          return (
            <article key={comment.id} className={`moment-comment ${selected ? 'is-selected' : ''}`}>
              <button
                type="button"
                className="moment-comment-main"
                onClick={() => setSelectedId((current) => (current === comment.id ? '' : comment.id))}
                aria-expanded={selected}
              >
                <MomentAvatar author={comment.author} link={false} size={30} />
                <span className="min-w-0 text-left">
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <strong className="text-sm font-medium text-foreground">{comment.author.name}</strong>
                    <span className="text-[11px] text-foreground-muted">{formatMomentTime(comment.createdAt)}{comment.isEdited ? ' · 已编辑' : ''}</span>
                  </span>
                  {!editing && (
                    <span className="mt-1 block break-words text-sm leading-6 text-foreground-secondary">
                      {comment.replyTo && <span className="mr-1 text-primary">回复 @{comment.replyTo.userId}</span>}
                      {comment.text}
                    </span>
                  )}
                </span>
              </button>

              {editing && (
                <div className="moment-comment-edit">
                  <textarea value={editDraft} maxLength={500} rows={2} onChange={(event) => setEditDraft(event.target.value)} autoFocus />
                  <div>
                    <button type="button" onClick={() => setEditingId('')}>取消</button>
                    <button type="button" disabled={!editDraft.trim() || actingId === comment.id} onClick={() => void saveEdit(comment)}>{actingId === comment.id && <LoadingOutlined />}保存</button>
                  </div>
                </div>
              )}

              {selected && !editing && (
                <div className="moment-comment-actions">
                  <button type="button" onClick={() => startReply(comment)}><RollbackOutlined />回复</button>
                  {comment.canEdit && <button type="button" onClick={() => { setEditingId(comment.id); setEditDraft(comment.text); }}><EditOutlined />编辑</button>}
                  {comment.canDelete && <button type="button" className="text-danger" disabled={actingId === comment.id} onClick={() => void remove(comment)}>{actingId === comment.id ? <LoadingOutlined /> : <DeleteOutlined />}删除</button>}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {replyTo && (
        <div className="moment-reply-target">
          <span>回复 @{replyTo.author.userId}</span>
          <button type="button" onClick={() => setReplyTo(null)} aria-label="取消回复"><CloseOutlined /></button>
        </div>
      )}
      <div className="moment-comment-composer">
        <textarea
          ref={inputRef}
          value={draft}
          maxLength={500}
          rows={1}
          placeholder={replyTo ? `回复 @${replyTo.author.userId}…` : '写下评论…'}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <button type="button" onClick={() => void send()} disabled={!draft.trim() || sending} aria-label="发送评论">
          {sending ? <LoadingOutlined /> : <SendOutlined />}
        </button>
      </div>
      {error && <p className="moment-inline-error" role="alert">{error}</p>}
    </section>
  );
}
