'use client';

import { ensureCurrentProfile } from '@/app/profile/client';
import type { DoodleShare, DoodleTemplateId, DoodleThemeId } from './types';

type ShareResponse = {
  share?: DoodleShare;
  shareUrl?: string;
  error?: string;
};

type ReviewResponse = {
  review?: { id: string; status: string; createdAt: string; expiresAt: string };
  error?: string;
  code?: string;
};

function throwReviewError(result: ReviewResponse, fallback: string): never {
  throw Object.assign(new Error(result.error || fallback), { code: result.code || '' });
}

async function parseShareResponse(response: Response): Promise<{ share: DoodleShare; shareUrl: string }> {
  const result = (await response.json()) as ShareResponse;
  if (!response.ok || !result.share) throw new Error(result.error || '分享失败，请稍后重试');
  return { share: result.share, shareUrl: result.shareUrl || `${window.location.origin}/doodle/s/${result.share.id}` };
}

function imageHeaders(uuid: string, blob: Blob, title: string, style: DoodleThemeId, template: DoodleTemplateId) {
  return {
    'content-type': blob.type || 'image/jpeg',
    'x-neon-user-uuid': uuid,
    'x-doodle-title': encodeURIComponent(title),
    'x-doodle-style': style,
    'x-doodle-template': template
  };
}

export async function createDoodleShare(blob: Blob, title: string, style: DoodleThemeId, template: DoodleTemplateId, reviewKey = '') {
  const profile = await ensureCurrentProfile();
  const headers: Record<string, string> = imageHeaders(profile.uuid, blob, title, style, template);
  if (reviewKey) headers['x-doodle-review-key'] = reviewKey;
  return parseShareResponse(
    await fetch('/api/doodle/shares', {
      method: 'POST',
      headers,
      body: blob
    })
  );
}

export async function updateDoodleShare(id: string, blob: Blob, title: string, style: DoodleThemeId, template: DoodleTemplateId) {
  const profile = await ensureCurrentProfile();
  return parseShareResponse(
    await fetch(`/api/doodle/shares/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: imageHeaders(profile.uuid, blob, title, style, template),
      body: blob
    })
  );
}

export async function deleteDoodleShare(id: string): Promise<void> {
  const profile = await ensureCurrentProfile();
  const response = await fetch(`/api/doodle/shares/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'x-neon-user-uuid': profile.uuid }
  });
  const result = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(result.error || '销毁失败，请稍后重试');
}

export async function createDoodleReview(
  original: Blob,
  processed: Blob,
  title: string,
  style: DoodleThemeId,
  template: DoodleTemplateId,
  shareId = '',
  reviewKey = ''
) {
  const profile = await ensureCurrentProfile();
  const body = new FormData();
  body.append('original', original, 'original.jpg');
  body.append('processed', processed, 'processed.jpg');
  body.append('title', title);
  body.append('style', style);
  body.append('template', template);
  if (shareId) body.append('shareId', shareId);
  if (reviewKey) body.append('reviewKey', reviewKey);
  const response = await fetch('/api/doodle/reviews', {
    method: 'POST',
    headers: { 'x-neon-user-uuid': profile.uuid },
    body
  });
  const result = (await response.json()) as ReviewResponse;
  if (!response.ok || !result.review) throwReviewError(result, '作品同步失败，请重试');
  return result.review;
}

export async function updateDoodleReview(
  id: string,
  processed: Blob,
  title: string,
  style: DoodleThemeId,
  template: DoodleTemplateId,
  shareId = ''
) {
  const profile = await ensureCurrentProfile();
  const headers: Record<string, string> = imageHeaders(profile.uuid, processed, title, style, template);
  if (shareId) headers['x-doodle-share-id'] = shareId;
  const response = await fetch(`/api/doodle/reviews/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers,
    body: processed
  });
  const result = (await response.json()) as ReviewResponse;
  if (!response.ok || !result.review) throwReviewError(result, '作品更新失败，请重试');
  return result.review;
}
