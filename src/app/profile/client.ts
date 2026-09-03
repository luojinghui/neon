'use client';

import type { CurrentProfile, ProfileUpdateInput, PublicProfile } from './types';

const IDENTITY_STORAGE_KEY = 'neon:browser-identity:v1';
const LEGACY_USER_STORAGE_KEY = 'soul:guest-user';
export const PROFILE_CHANGED_EVENT = 'neon:profile-changed';

type LocalIdentity = {
  uuid: string;
  userId: string;
};

type ProfileResponse = {
  profile?: PublicProfile;
  isOwner?: boolean;
  error?: string;
  code?: string;
};

let currentProfilePromise: Promise<CurrentProfile> | null = null;

function createUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const value = Math.floor(Math.random() * 16);
    return (token === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

function defaultUserId(uuid: string): string {
  return `Soul${uuid.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function readLegacyUuid(): string {
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_USER_STORAGE_KEY) || '{}') as { id?: string };
    const match = /^guest-([0-9a-f-]{36})$/i.exec(legacy.id || '');
    return match?.[1] || '';
  } catch {
    return '';
  }
}

export function getOrCreateIdentity(): LocalIdentity {
  try {
    const stored = JSON.parse(localStorage.getItem(IDENTITY_STORAGE_KEY) || '{}') as Partial<LocalIdentity>;
    if (stored.uuid && stored.userId) return { uuid: stored.uuid, userId: stored.userId };
  } catch {
    localStorage.removeItem(IDENTITY_STORAGE_KEY);
  }

  const uuid = readLegacyUuid() || createUuid();
  const identity = { uuid, userId: defaultUserId(uuid) };
  try {
    localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // The page remains usable for the current lifecycle if storage is unavailable.
  }
  return identity;
}

function saveIdentity(identity: LocalIdentity): void {
  try {
    localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // Keep using the in-memory profile when browser storage is unavailable.
  }
}

async function parseResponse(response: Response): Promise<ProfileResponse> {
  const result = (await response.json()) as ProfileResponse;
  if (!response.ok) throw Object.assign(new Error(result.error || '请求失败，请重试'), { code: result.code || '' });
  return result;
}

export async function ensureCurrentProfile(force = false): Promise<CurrentProfile> {
  if (currentProfilePromise && !force) return currentProfilePromise;
  currentProfilePromise = (async () => {
    const identity = getOrCreateIdentity();
    const response = await fetch('/api/user', { headers: { 'x-neon-user-uuid': identity.uuid }, cache: 'no-store' });
    let result: ProfileResponse;
    if (response.status === 404) {
      result = await parseResponse(
        await fetch('/api/user', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ uuid: identity.uuid, userId: identity.userId })
        })
      );
    } else {
      result = await parseResponse(response);
    }
    if (!result.profile) throw new Error('个人资料加载失败');
    saveIdentity({ uuid: identity.uuid, userId: result.profile.userId });
    return { ...result.profile, uuid: identity.uuid };
  })().catch((error) => {
    currentProfilePromise = null;
    throw error;
  });
  return currentProfilePromise;
}

export async function getPublicProfile(userId: string, publicKey = ''): Promise<{ profile: PublicProfile; isOwner: boolean }> {
  const current = await ensureCurrentProfile();
  const query = new URLSearchParams({ userId });
  if (publicKey) query.set('key', publicKey);
  const result = await parseResponse(
    await fetch(`/api/user?${query.toString()}`, {
      headers: { 'x-neon-user-uuid': current.uuid },
      cache: 'no-store'
    })
  );
  if (!result.profile) throw new Error('个人资料加载失败');
  return { profile: result.profile, isOwner: result.isOwner === true };
}

export async function updateCurrentProfile(input: ProfileUpdateInput): Promise<CurrentProfile> {
  const current = await ensureCurrentProfile();
  const result = await parseResponse(
    await fetch('/api/user', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-neon-user-uuid': current.uuid },
      body: JSON.stringify(input)
    })
  );
  if (!result.profile) throw new Error('个人资料保存失败');
  const updated = { ...result.profile, uuid: current.uuid };
  saveIdentity({ uuid: current.uuid, userId: updated.userId });
  currentProfilePromise = Promise.resolve(updated);
  window.dispatchEvent(new CustomEvent(PROFILE_CHANGED_EVENT, { detail: updated }));
  return updated;
}

export async function uploadProfileMedia(file: File, kind: 'avatar' | 'banner'): Promise<string> {
  const current = await ensureCurrentProfile();
  const response = await fetch('/api/user/media', {
    method: 'POST',
    headers: {
      'content-type': file.type || 'application/octet-stream',
      'x-file-name': encodeURIComponent(file.name),
      'x-neon-user-uuid': current.uuid,
      'x-profile-media-kind': kind
    },
    body: file
  });
  const result = (await response.json()) as { url?: string; error?: string };
  if (!response.ok || !result.url) throw new Error(result.error || '上传失败，请重试');
  return result.url;
}
