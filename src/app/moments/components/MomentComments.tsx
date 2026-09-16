'use client';

import { CloseOutlined, DeleteOutlined, EditOutlined, LoadingOutlined, MessageOutlined, RollbackOutlined, SendOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createComment, deleteComment, getComments, updateComment } from '../client';
import { formatMomentTime } from '../format';
import type { MomentComment } from '../types';
import { MomentAvatar } from './MomentAvatar';

type Props = {
  momentId: string;
  initialComments: MomentComment[];
  initialCount: number;
  onCountChange?: (count: number) => void;
  variant?: 'inline' | 'sheet';
  active?: boolean;
};

export function MomentComments(props: Props) {
  return <MomentCommentThread key={props.momentId} {...props} />;
}

function MomentCommentThread({ momentId, initialComments, initialCount, onCountChange, variant = 'inline', active = true }: Props) {
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
  const [notice, setNotice] = useState('');
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const countRef = useRef(initialCount);
  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;
  const previewRef = useRef(JSON.stringify([initialComments, initialCount]));
  const mountedRef = useRef(true);
  const requestRef = useRef(0);
  const busyRef = useRef(false);
  const refreshOnOpenRef = useRef(false);
  const [lastCreatedId, setLastCreatedId] = useState('');
  const listId = useId();
  const isSheet = variant === 'sheet';
  const busy = loadingMore || sending || Boolean(actingId);
  const visibleComments = isSheet || expanded ? comments : comments.slice(0, 2);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const snapshot = JSON.stringify([initialComments, initialCount]);
    const changed = snapshot !== previewRef.current || (!isSheet && initialCount !== countRef.current);
    previewRef.current = snapshot;
    // A feed refresh can finish while a comment mutation is still pending.
    // Consume that snapshot without replaying it over the mutation's result.
    if (!changed || busyRef.current || (isSheet && active)) return;
    const preview = initialComments.slice(0, 2);
    setComments(initialComments);
    countRef.current = initialCount;
    setCount(initialCount);
    setExpanded(false);
    setSelectedId((current) => preview.some((comment) => comment.id === current) ? current : '');
    setEditingId((current) => preview.some((comment) => comment.id === current) ? current : '');
    setReplyTo((current) => {
      if (!current) return null;
      return initialComments.find((comment) => comment.id === current.id)
        || (initialCount > initialComments.length ? current : null);
    });
    setNeedsRefresh(false);
    setError('');
    setNotice('');
  }, [active, initialComments, initialCount, isSheet]);

  // Keep requests in order so a slow expansion cannot overwrite a newer mutation.
  const beginRequest = useCallback(() => {
    if (busyRef.current) return null;
    busyRef.current = true;
    setError('');
    setNotice('');
    return ++requestRef.current;
  }, []);
  const isCurrentRequest = useCallback((request: number) => mountedRef.current && requestRef.current === request, []);
  const finishRequest = useCallback((request: number) => {
    if (!isCurrentRequest(request)) return;
    busyRef.current = false;
    setLoadingMore(false);
    setSending(false);
    setActingId('');
  }, [isCurrentRequest]);
  const setCommentCount = useCallback((next: number) => {
    countRef.current = next;
    setCount(next);
    onCountChangeRef.current?.(next);
  }, []);

  const loadComments = useCallback(async (expandOnSuccess: boolean) => {
    const request = beginRequest();
    if (request === null) return;
    setLoadingMore(true);
    try {
      const all = await getComments(momentId);
      if (!isCurrentRequest(request)) return;
      setComments(all);
      setCommentCount(all.length);
      setSelectedId((current) => all.some((comment) => comment.id === current) ? current : '');
      setEditingId((current) => all.some((comment) => comment.id === current) ? current : '');
      setReplyTo((current) => current ? all.find((comment) => comment.id === current.id) || null : null);
      setNeedsRefresh(false);
      if (expandOnSuccess) setExpanded(true);
    } catch (loadError) {
      if (isCurrentRequest(request)) {
        setError(loadError instanceof Error ? loadError.message : '评论加载失败');
        setNeedsRefresh(true);
      }
    } finally {
      finishRequest(request);
    }
  }, [beginRequest, finishRequest, isCurrentRequest, momentId, setCommentCount]);

  useEffect(() => {
    refreshOnOpenRef.current = isSheet && active;
  }, [active, isSheet]);

  useEffect(() => {
    // Closing keeps the thread mounted. If it is reopened during a mutation,
    // wait for that request to finish before refreshing the complete list.
    if (!isSheet || !active || busy || !refreshOnOpenRef.current) return;
    refreshOnOpenRef.current = false;
    void loadComments(true);
  }, [active, busy, isSheet, loadComments]);

  useEffect(() => {
    if (!isSheet || !active || !lastCreatedId) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    setLastCreatedId('');
  }, [active, isSheet, lastCreatedId]);

  const toggleExpanded = () => {
    if (busyRef.current) return;
    if (expanded) {
      setExpanded(false);
      setSelectedId('');
      setEditingId('');
      setEditDraft('');
      return;
    }
    void loadComments(true);
  };

  const startReply = (comment: MomentComment) => {
    if (busyRef.current) return;
    setReplyTo(comment);
    setSelectedId('');
    inputRef.current?.focus();
  };

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    const request = beginRequest();
    if (request === null) return;
    setSending(true);
    try {
      const created = await createComment(momentId, text, replyTo?.id || '');
      if (!isCurrentRequest(request)) return;
      const previousCount = countRef.current;
      // An incomplete preview must not put a new comment ahead of hidden ones.
      setComments((current) => !isSheet && current.length < previousCount ? current : [...current, created]);
      setCommentCount(previousCount + 1);
      setDraft('');
      setReplyTo(null);
      setSelectedId(isSheet || expanded || previousCount < 2 ? created.id : '');
      if (isSheet) {
        setLastCreatedId(created.id);
        if (comments.length < previousCount) {
          try {
            const all = await getComments(momentId);
            if (!isCurrentRequest(request)) return;
            setComments(all);
            setCommentCount(all.length);
            setNeedsRefresh(false);
            setLastCreatedId(created.id);
          } catch {
            if (isCurrentRequest(request)) {
              setError('评论已发布，其余评论刷新失败，请重试。');
              setNeedsRefresh(true);
            }
          }
        }
      } else if (!expanded && previousCount >= 2) setNotice('评论已发布，展开评论可查看。');
    } catch (sendError) {
      if (isCurrentRequest(request)) setError(sendError instanceof Error ? sendError.message : '评论发送失败');
    } finally {
      finishRequest(request);
    }
  };

  const saveEdit = async (comment: MomentComment) => {
    const text = editDraft.trim();
    if (!text) return;
    const request = beginRequest();
    if (request === null) return;
    setActingId(comment.id);
    try {
      const updated = await updateComment(momentId, comment.id, text);
      if (!isCurrentRequest(request)) return;
      setComments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setEditingId('');
      setEditDraft('');
      setSelectedId(updated.id);
    } catch (editError) {
      if (isCurrentRequest(request)) setError(editError instanceof Error ? editError.message : '评论编辑失败');
    } finally {
      finishRequest(request);
    }
  };

  const remove = async (comment: MomentComment) => {
    if (busyRef.current || !window.confirm('删除这条评论？此操作无法撤销。')) return;
    const request = beginRequest();
    if (request === null) return;
    setActingId(comment.id);
    try {
      await deleteComment(momentId, comment);
      if (!isCurrentRequest(request)) return;
      setComments((current) => current.filter((item) => item.id !== comment.id));
      setCommentCount(Math.max(0, countRef.current - 1));
      if (replyTo?.id === comment.id) setReplyTo(null);
      setSelectedId('');
      setEditingId('');
      setEditDraft('');
      // Deletion is already complete. A failed refill must not report it as failed.
      try {
        const all = await getComments(momentId);
        if (!isCurrentRequest(request)) return;
        setComments(all);
        setCommentCount(all.length);
        setNeedsRefresh(false);
      } catch {
        if (isCurrentRequest(request)) {
          setError('评论已删除，其余评论刷新失败，请重试。');
          setNeedsRefresh(true);
        }
      }
    } catch (deleteError) {
      if (isCurrentRequest(request)) setError(deleteError instanceof Error ? deleteError.message : '评论删除失败');
    } finally {
      finishRequest(request);
    }
  };

  return (
    <section className={`moment-comments${isSheet ? ' moment-comments-in-sheet' : ''}`} aria-label={`${count} 条评论`}>
      <div className="moment-comments-heading">
        <span><MessageOutlined /> {count} 条评论</span>
        {!isSheet && count > 2 && (
          <button type="button" onClick={toggleExpanded} disabled={busy} aria-expanded={expanded} aria-controls={listId}>
            {loadingMore ? <LoadingOutlined /> : null}
            {expanded ? '收起评论' : `展开其余 ${Math.max(0, count - visibleComments.length)} 条`}
          </button>
        )}
      </div>

      <div id={listId} ref={listRef} className="moment-comment-list" aria-busy={loadingMore}>
        {isSheet && loadingMore && <div className="moment-sheet-status" role="status"><LoadingOutlined />正在加载评论…</div>}
        {isSheet && !loadingMore && !error && comments.length === 0 && <div className="moment-sheet-empty"><MessageOutlined /><span>还没有评论</span><p>写下第一条评论吧。</p></div>}
        {visibleComments.map((comment) => {
          const selected = selectedId === comment.id;
          const editing = editingId === comment.id;
          return (
            <article key={comment.id} className={`moment-comment ${selected ? 'is-selected' : ''}`}>
              <button
                type="button"
                className="moment-comment-main"
                onClick={() => setSelectedId((current) => (current === comment.id ? '' : comment.id))}
                aria-expanded={selected}
                disabled={busy}
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
                  <textarea aria-label="编辑评论" disabled={busy} value={editDraft} maxLength={500} rows={2} onChange={(event) => setEditDraft(event.target.value)} autoFocus />
                  <div>
                    <button type="button" disabled={busy} onClick={() => { setEditingId(''); setEditDraft(''); }}>取消</button>
                    <button type="button" disabled={!editDraft.trim() || busy} onClick={() => void saveEdit(comment)}>{actingId === comment.id && <LoadingOutlined />}保存</button>
                  </div>
                </div>
              )}

              {selected && !editing && (
                <div className="moment-comment-actions">
                  <button type="button" disabled={busy} onClick={() => startReply(comment)}><RollbackOutlined />回复</button>
                  {comment.canEdit && <button type="button" disabled={busy} onClick={() => { setEditingId(comment.id); setEditDraft(comment.text); }}><EditOutlined />编辑</button>}
                  {comment.canDelete && <button type="button" className="text-danger" disabled={busy} onClick={() => void remove(comment)}>{actingId === comment.id ? <LoadingOutlined /> : <DeleteOutlined />}删除</button>}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div className="moment-comment-footer">
      {replyTo && (
        <div className="moment-reply-target">
          <span>回复 @{replyTo.author.userId}</span>
          <button type="button" disabled={sending} onClick={() => setReplyTo(null)} aria-label="取消回复"><CloseOutlined /></button>
        </div>
      )}
      <div className="moment-comment-composer">
        <textarea
          ref={inputRef}
          aria-label={replyTo ? `回复 @${replyTo.author.userId}` : '写下评论'}
          disabled={sending}
          value={draft}
          maxLength={500}
          rows={1}
          placeholder={replyTo ? `回复 @${replyTo.author.userId}…` : '写下评论…'}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <button type="button" onClick={() => void send()} disabled={!draft.trim() || busy} aria-label="发送评论">
          {sending ? <LoadingOutlined /> : <SendOutlined />}
        </button>
      </div>
      {notice && <p className="mt-2 text-xs text-foreground-muted" role="status">{notice}</p>}
      {error && <p className="moment-inline-error" role="alert">{error}</p>}
      {needsRefresh && <button type="button" className="mt-2 text-xs text-primary" disabled={busy} onClick={() => void loadComments(false)}>重新加载评论</button>}
      </div>
    </section>
  );
}
