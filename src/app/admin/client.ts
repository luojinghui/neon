'use client';

export class AdminApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code = '') {
    super(message);
    this.name = 'AdminApiError';
  }
}

export async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (init.method && init.method !== 'GET') headers.set('x-admin-request', '1');
  const response = await fetch(`/api/admin${path}`, { ...init, headers, cache: 'no-store' });
  if (!response.ok) {
    let result: { error?: string; code?: string } = {};
    try {
      result = (await response.json()) as { error?: string; code?: string };
    } catch {
      // Keep the generic fallback for non-JSON proxy errors.
    }
    throw new AdminApiError(result.error || '管理请求失败，请稍后重试', response.status, result.code || '');
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
