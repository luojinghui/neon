'use client';

import { ensureCurrentProfile } from '@/app/profile/client';
import type { CreateMomentInput, Moment, MomentComment, MomentListResponse } from './types';

type ErrorPayload = { error?: string; code?: string };

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as ErrorPayload & T;
  if (!response.ok) throw Object.assign(new Error(payload.error || '请求失败，请重试'), { code: payload.code || '' });
  return payload;
}

async function identityHeaders(adminRequest = false): Promise<Record<string, string>> {
  const profile = await ensureCurrentProfile();
  return {
    'x-neon-user-uuid': profile.uuid,
    ...(adminRequest ? { 'x-admin-request': '1' } : {})
  };
}

export async function getMoments(options: { page?: number; pageSize?: number; ownerUserId?: string } = {}): Promise<MomentListResponse> {
  const query = new URLSearchParams({ page: String(options.page || 1), pageSize: String(options.pageSize || 20) });
  if (options.ownerUserId) query.set('ownerUserId', options.ownerUserId);
  return parseJson<MomentListResponse>(
    await fetch(`/api/moments?${query.toString()}`, {
      headers: await identityHeaders(),
      cache: 'no-store'
    })
  );
}

export async function getAllMomentsForOwner(ownerUserId: string): Promise<Moment[]> {
  const items: Moment[] = [];
  let page = 1;
  while (true) {
    const result = await getMoments({ ownerUserId, page, pageSize: 100 });
    items.push(...result.items);
    if (!result.hasMore) return items;
    page += 1;
  }
}

export async function createMoment(input: CreateMomentInput): Promise<Moment> {
  const form = new FormData();
  form.set('text', input.text);
  for (const file of input.media) form.append('media', file, file.name);
  if (input.voice) form.set('voice', input.voice, input.voice.name);
  form.set('voiceDurationMs', String(input.voiceDurationMs || 0));
  if (input.location) form.set('location', JSON.stringify(input.location));
  const result = await parseJson<{ item: Moment }>(
    await fetch('/api/moments', {
      method: 'POST',
      headers: await identityHeaders(),
      body: form
    })
  );
  return result.item;
}

export async function deleteMoment(moment: Pick<Moment, 'id' | 'isOwner'>): Promise<void> {
  const response = await fetch(`/api/moments/${encodeURIComponent(moment.id)}`, {
    method: 'DELETE',
    headers: await identityHeaders(!moment.isOwner)
  });
  if (!response.ok) await parseJson(response);
}

export async function getComments(momentId: string): Promise<MomentComment[]> {
  const result = await parseJson<{ items: MomentComment[] }>(
    await fetch(`/api/moments/${encodeURIComponent(momentId)}/comments`, {
      headers: await identityHeaders(),
      cache: 'no-store'
    })
  );
  return result.items;
}

export async function setMomentLiked(momentId: string, liked: boolean): Promise<{ liked: boolean; likeCount: number }> {
  return parseJson<{ liked: boolean; likeCount: number }>(
    await fetch(`/api/moments/${encodeURIComponent(momentId)}/like`, {
      method: 'PUT',
      headers: { ...(await identityHeaders()), 'content-type': 'application/json' },
      body: JSON.stringify({ liked })
    })
  );
}

export async function createComment(momentId: string, text: string, replyToCommentId = ''): Promise<MomentComment> {
  const result = await parseJson<{ item: MomentComment }>(
    await fetch(`/api/moments/${encodeURIComponent(momentId)}/comments`, {
      method: 'POST',
      headers: { ...(await identityHeaders()), 'content-type': 'application/json' },
      body: JSON.stringify({ text, replyToCommentId })
    })
  );
  return result.item;
}

export async function updateComment(momentId: string, commentId: string, text: string): Promise<MomentComment> {
  const result = await parseJson<{ item: MomentComment }>(
    await fetch(`/api/moments/${encodeURIComponent(momentId)}/comments/${encodeURIComponent(commentId)}`, {
      method: 'PATCH',
      headers: { ...(await identityHeaders()), 'content-type': 'application/json' },
      body: JSON.stringify({ text })
    })
  );
  return result.item;
}

export async function deleteComment(momentId: string, comment: Pick<MomentComment, 'id' | 'isOwner'>): Promise<void> {
  const response = await fetch(`/api/moments/${encodeURIComponent(momentId)}/comments/${encodeURIComponent(comment.id)}`, {
    method: 'DELETE',
    headers: await identityHeaders(!comment.isOwner)
  });
  if (!response.ok) await parseJson(response);
}
