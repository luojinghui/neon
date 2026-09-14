import { NextResponse } from 'next/server';
import { authenticateCookieHeader } from '@/server/admin/auth';
import { presentComment, presentMoment } from '@/server/moment/presenter';
import { profileRepository } from '@/server/user/profileRepository';

export type MomentViewer = {
  uuid: string;
  isAdmin: boolean;
};

export function getUuid(request: Request): string {
  return request.headers.get('x-neon-user-uuid')?.trim().toLowerCase() || '';
}

export async function getViewer(request: Request): Promise<MomentViewer> {
  const uuid = getUuid(request);
  let isAdmin = false;
  try {
    const admin = await authenticateCookieHeader(request.headers.get('cookie') || '');
    isAdmin = admin?.role === 'super_admin';
  } catch (error) {
    console.error('Moment admin session could not be verified:', error);
  }
  return { uuid, isAdmin };
}

export function requireCurrentProfile(request: Request) {
  const uuid = getUuid(request);
  const profile = uuid ? profileRepository.getByUuid(uuid) : null;
  if (!profile) throw Object.assign(new Error('个人资料不存在，请刷新页面重试'), { code: 'PROFILE_NOT_FOUND' });
  return profile;
}

export function publicMoment(moment: unknown, viewer: MomentViewer, commentLimit = 2) {
  return presentMoment(moment, viewer, { commentLimit });
}

export function publicComment(comment: unknown, viewer: MomentViewer) {
  return presentComment(comment, viewer);
}

export function assertAdminMutationRequest(request: Request, viewer: MomentViewer, isOwner: boolean) {
  if (!viewer.isAdmin || isOwner) return;
  if (request.headers.get('x-admin-request') !== '1') {
    throw Object.assign(new Error('管理请求校验失败'), { code: 'ADMIN_REQUEST_INVALID' });
  }
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    throw Object.assign(new Error('管理请求来源无效'), { code: 'ADMIN_ORIGIN_INVALID' });
  }
}

export function momentErrorResponse(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  const message = error instanceof Error ? error.message : '请求失败，请重试';
  const status =
    code === 'PROFILE_NOT_FOUND' || code === 'MOMENT_NOT_FOUND' || code === 'COMMENT_NOT_FOUND'
      ? 404
      : code === 'MOMENT_FORBIDDEN' || code === 'COMMENT_FORBIDDEN' || code.startsWith('ADMIN_')
        ? 403
        : code === 'MOMENT_MEDIA_TOO_LARGE' || code === 'REQUEST_TOO_LARGE'
          ? 413
          : code === 'MOMENT_STORAGE_UNAVAILABLE'
            ? 503
            : code
              ? 400
              : 500;
  if (status === 500) console.error('Moment request failed:', error);
  return NextResponse.json({ error: message, code }, { status });
}
