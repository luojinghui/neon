'use client';

import { HeartFilled, HeartOutlined, MessageOutlined } from '@ant-design/icons';
import { useEffect, useRef, useState } from 'react';
import { setMomentLiked } from '../client';
import type { Moment } from '../types';
import { MomentCommentSheet } from './MomentCommentSheet';
import './moment-actions.css';

export function MomentActions({ moment }: { moment: Moment }) {
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
    pendingRef.current = true;
    setLiking(true);
    setError('');
    setReaction({ liked, likeCount: Math.max(0, previous.likeCount + (liked ? 1 : -1)) });
    try {
      const result = await setMomentLiked(moment.id, liked);
      if (mountedRef.current) setReaction(result);
    } catch (likeError) {
      if (mountedRef.current) {
        setReaction(previous);
        setError(likeError instanceof Error ? likeError.message : '点赞失败，请重试');
      }
    } finally {
      pendingRef.current = false;
      if (mountedRef.current) setLiking(false);
    }
  };

  return (
    <>
      <footer className="moment-actions" aria-label="心迹互动">
        <button type="button" className={`moment-action${reaction.liked ? ' is-liked' : ''}`} onClick={() => void toggleLike()} disabled={liking} aria-label={reaction.liked ? '取消点赞' : '点赞'} aria-pressed={reaction.liked}>
          {reaction.liked ? <HeartFilled /> : <HeartOutlined />}
          <span>{reaction.liked ? '已赞' : '赞'}</span>
          {reaction.likeCount > 0 && <span className="moment-action-count">{reaction.likeCount}</span>}
        </button>
        <button type="button" className="moment-action" onClick={() => setCommentsOpen(true)} aria-label="查看评论" aria-haspopup="dialog" aria-expanded={commentsOpen}>
          <MessageOutlined />
          <span>评论</span>
          {commentCount > 0 && <span className="moment-action-count">{commentCount}</span>}
        </button>
      </footer>
      {error && <p className="moment-action-error" role="alert">{error}，点击爱心重试。</p>}
      <MomentCommentSheet open={commentsOpen} moment={moment} onClose={() => setCommentsOpen(false)} onCountChange={setCommentCount} />
    </>
  );
}
