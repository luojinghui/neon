'use client';

import { Icon } from '@/components/ui/icon';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { setMomentLiked } from '../client';
import type { Moment } from '../types';
import { MomentCommentSheet } from './MomentCommentSheet';
import './moment-actions.css';

export type MomentReactionPatch = { liked?: boolean; likeCount?: number; commentCount?: number };

export function MomentActions({ moment, appearance, onChange, onComment, share, extra }: {
  moment: Moment;
  appearance?: 'journal';
  onChange?: (patch: MomentReactionPatch) => void;
  /** 详情页已展示评论时，点击评论定位到输入框，不再打开抽屉。 */
  onComment?: () => void;
  share?: { copied: boolean; onShare: () => void };
  extra?: ReactNode;
}) {
  const [reaction, setReaction] = useState({ liked: moment.liked ?? false, likeCount: moment.likeCount ?? 0 });
  const [commentCount, setCommentCount] = useState(moment.commentCount);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [liking, setLiking] = useState(false);
  const [error, setError] = useState('');
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!pendingRef.current) setReaction({ liked: moment.liked ?? false, likeCount: moment.likeCount ?? 0 });
  }, [moment.liked, moment.likeCount]);

  useEffect(() => setCommentCount(moment.commentCount), [moment.commentCount]);

  const toggleLike = async () => {
    if (pendingRef.current) return;
    const previous = reaction;
    const liked = !previous.liked;
    const optimistic = { liked, likeCount: Math.max(0, previous.likeCount + (liked ? 1 : -1)) };
    pendingRef.current = true;
    setLiking(true);
    setError('');
    setReaction(optimistic);
    onChange?.(optimistic);
    try {
      const result = await setMomentLiked(moment.id, liked);
      if (mountedRef.current) {
        setReaction(result);
        onChange?.(result);
      }
    } catch (likeError) {
      if (mountedRef.current) {
        setReaction(previous);
        onChange?.(previous);
        setError(likeError instanceof Error ? likeError.message : '点赞失败，请重试');
      }
    } finally {
      pendingRef.current = false;
      if (mountedRef.current) setLiking(false);
    }
  };

  return (
    <>
      <footer className="moment-actions" aria-label="星语互动">
        <button type="button" className="moment-action" onClick={() => void toggleLike()} disabled={liking} aria-busy={liking || undefined} aria-label={reaction.liked ? '取消点赞' : '点赞'} aria-pressed={reaction.liked}>
          <Icon name="heart" active={reaction.liked} />
          <span className="moment-action-count">{reaction.likeCount > 0 ? reaction.likeCount : ''}</span>
        </button>
        <button
          type="button"
          className="moment-action"
          onClick={() => onComment ? onComment() : setCommentsOpen(true)}
          aria-label="查看评论"
          aria-haspopup={onComment ? undefined : 'dialog'}
          aria-expanded={onComment ? undefined : commentsOpen}
          aria-controls={onComment ? 'moment-detail-comments' : undefined}
        >
          <Icon name="comment" />
          <span className="moment-action-count">{commentCount > 0 ? commentCount : ''}</span>
        </button>
        {share && (
          <button type="button" className="moment-action is-share" data-copied={share.copied || undefined} onClick={share.onShare} aria-label={share.copied ? '分享链接已复制' : '复制分享链接'}>
            <Icon name={share.copied ? 'check' : 'link'} tone={share.copied ? 'primary' : 'inherit'} />
            <span className="moment-action-label">{share.copied ? '已复制' : '复制链接'}</span>
          </button>
        )}
        {extra ? <div className="moment-actions-extra">{extra}</div> : null}
      </footer>
      {error && <p className="moment-action-error" role="alert">{error}，点击爱心重试。</p>}
      {!onComment && <MomentCommentSheet appearance={appearance} open={commentsOpen} moment={moment} onClose={() => setCommentsOpen(false)} onCountChange={(nextCount) => { setCommentCount(nextCount); onChange?.({ commentCount: nextCount }); }} />}
    </>
  );
}
