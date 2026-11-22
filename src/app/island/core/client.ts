'use client';

import { ensureCurrentProfile, getOrCreateIdentity } from '@/app/profile/client';
import type {
  IslandDetail,
  IslandInvitePreview,
  IslandPaperKey,
  IslandSkinKey,
  IslandSkyResponse,
  IslandSummary,
  ProfileIslandStatus
} from './types';

export class IslandApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code = '', status = 0) {
    super(message);
    this.name = 'IslandApiError';
    this.code = code;
    this.status = status;
  }
}

export function getIslandCacheUuid(): string {
  return getOrCreateIdentity().uuid;
}

async function identityHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  try {
    const profile = await ensureCurrentProfile();
    return { 'x-neon-user-uuid': profile.uuid, ...extra };
  } catch {
    const fallback = getOrCreateIdentity();
    return { 'x-neon-user-uuid': fallback.uuid, ...extra };
  }
}

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = await identityHeaders(
    init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }
  );
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    headers: {
      ...headers,
      ...(init.headers as Record<string, string> | undefined)
    }
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!response.ok) {
    throw new IslandApiError(payload.error || '请求失败，请重试', payload.code || '', response.status);
  }
  return payload;
}

export async function getIslandSky(): Promise<IslandSkyResponse> {
  return requestJson<IslandSkyResponse>('/api/island', { method: 'GET' });
}

export async function previewIslandInvite(token: string): Promise<IslandInvitePreview> {
  return requestJson<IslandInvitePreview>(`/api/island/invite?token=${encodeURIComponent(token.trim())}`, {
    method: 'GET'
  });
}

export async function joinIslandByInvite(inviteToken: string): Promise<{ island: IslandSummary }> {
  return requestJson<{ island: IslandSummary }>('/api/island/invite', {
    method: 'POST',
    body: JSON.stringify({ inviteToken: inviteToken.trim() })
  });
}

export async function getIslandDetail(islandId: string): Promise<{ island: IslandDetail }> {
  return requestJson<{ island: IslandDetail }>(`/api/island/${encodeURIComponent(islandId)}`, {
    method: 'GET'
  });
}

export interface IslandSettingsPatch {
  name?: string;
  skin?: IslandSkinKey;
  paper?: IslandPaperKey;
  regenerateInvite?: boolean;
  removeMemberPublicKey?: string;
}

export async function updateIslandSettings(
  islandId: string,
  patch: IslandSettingsPatch
): Promise<{ island: IslandSummary }> {
  return requestJson<{ island: IslandSummary }>(`/api/island/${encodeURIComponent(islandId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
}

export async function leaveIsland(islandId: string): Promise<{ ok: boolean }> {
  return requestJson<{ ok: boolean }>(`/api/island/${encodeURIComponent(islandId)}`, {
    method: 'DELETE'
  });
}

export async function uploadIslandMedia(islandId: string, file: File): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append('file', file);
  return requestJson<{ url: string }>(`/api/island/${encodeURIComponent(islandId)}/media`, {
    method: 'POST',
    body: formData
  });
}

export async function getProfileIslandStatus(userId: string): Promise<ProfileIslandStatus> {
  return requestJson<ProfileIslandStatus>(`/api/island/by-user/${encodeURIComponent(userId)}`, {
    method: 'GET'
  });
}

export function buildInviteLink(inviteToken: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/island?invite=${encodeURIComponent(inviteToken)}`;
}

export function formatInviteRemaining(inviteExpiresAt?: string): string {
  if (!inviteExpiresAt) return '';
  const diffMs = Date.parse(inviteExpiresAt) - Date.now();
  if (Number.isNaN(diffMs) || diffMs <= 0) return '已过期';
  const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  return `剩余 ${days} 天`;
}

export function parseInviteLink(raw: string): string {
  const text = String(raw || '').trim();
  if (!text) return '';
  const urlMatch = text.match(/[?&]invite=([A-Za-z0-9_-]{8,64})/i);
  if (urlMatch?.[1]) return urlMatch[1];
  if (/^[A-Za-z0-9_-]{12,64}$/.test(text)) return text;
  return '';
}
