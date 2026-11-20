import { momentRepository } from '@/server/moment/momentRepository';
import { assertAdminMutationRequest, getViewer, momentErrorResponse, publicMoment } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_REQUEST_BYTES = 240 * 1024 * 1024;

function parseJsonField<T>(value: FormDataEntryValue | null, errorMessage: string, code: string): T | undefined {
  if (value === null || typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw Object.assign(new Error(errorMessage), { code });
  }
}

function getFiles(form: FormData, key: string): File[] {
  return form.getAll(key).filter((value): value is File => typeof value !== 'string' && value.size > 0);
}

async function readFile(file: File) {
  return { buffer: Buffer.from(await file.arrayBuffer()), mimeType: file.type, name: file.name };
}

export async function GET(request: Request, context: { params: Promise<{ momentId: string }> }) {
  try {
    const { momentId } = await context.params;
    const moment = momentRepository.getMoment(momentId);
    if (!moment) throw Object.assign(new Error('这条星语不存在或已被删除'), { code: 'MOMENT_NOT_FOUND' });
    return Response.json({ item: publicMoment(moment, await getViewer(request), 2) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return momentErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ momentId: string }> }) {
  try {
    const declaredSize = Number(request.headers.get('content-length') || 0);
    if (declaredSize > MAX_REQUEST_BYTES) throw Object.assign(new Error('本次上传内容过大'), { code: 'REQUEST_TOO_LARGE' });
    const { momentId } = await context.params;
    const viewer = await getViewer(request);
    const existing = momentRepository.getMoment(momentId);
    if (!existing) throw Object.assign(new Error('这条星语不存在或已被删除'), { code: 'MOMENT_NOT_FOUND' });
    const isOwner = Boolean(viewer.uuid && viewer.uuid === existing.ownerUuid);
    assertAdminMutationRequest(request, viewer, isOwner);

    const form = await request.formData();
    const mediaFiles = getFiles(form, 'media');
    const inlineImageFiles = getFiles(form, 'inlineImages');
    const voiceFiles = getFiles(form, 'voice');
    const totalBytes = [...mediaFiles, ...inlineImageFiles, ...voiceFiles].reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_REQUEST_BYTES) throw Object.assign(new Error('本次上传内容过大'), { code: 'REQUEST_TOO_LARGE' });
    if (voiceFiles.length > 1) throw Object.assign(new Error('每条星语只能包含一段语音'), { code: 'MOMENT_MEDIA_INVALID' });

    const [media, inlineImages, voice] = await Promise.all([
      Promise.all(mediaFiles.map(readFile)),
      Promise.all(inlineImageFiles.map(readFile)),
      voiceFiles[0] ? readFile(voiceFiles[0]) : Promise.resolve(null)
    ]);

    const blocks = parseJsonField<unknown[]>(form.get('blocks'), '正文排版数据无效', 'MOMENT_BLOCKS_INVALID');
    const keepMediaIds = parseJsonField<string[]>(form.get('keepMediaIds'), '媒体列表无效', 'MOMENT_MEDIA_INVALID');
    const hasLocation = form.has('location');
    const rawLocation = form.get('location');
    const location = hasLocation
      ? rawLocation && typeof rawLocation === 'string' && rawLocation.trim()
        ? parseJsonField(rawLocation, '位置信息无效', 'MOMENT_LOCATION_INVALID')
        : null
      : undefined;

    const updated = await momentRepository.updateMoment(
      momentId,
      viewer.uuid,
      {
        text: form.get('text'),
        blocks,
        keepMediaIds,
        removeVoice: form.get('removeVoice') === '1',
        voiceDurationMs: form.get('voiceDurationMs'),
        location
      },
      { media, inlineImages, voice },
      { isAdmin: viewer.isAdmin }
    );
    return Response.json({ item: publicMoment(updated, viewer, 2) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return momentErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ momentId: string }> }) {
  try {
    const { momentId } = await context.params;
    const viewer = await getViewer(request);
    const moment = momentRepository.getMoment(momentId);
    if (!moment) throw Object.assign(new Error('这条星语不存在或已被删除'), { code: 'MOMENT_NOT_FOUND' });
    const isOwner = Boolean(viewer.uuid && viewer.uuid === moment.ownerUuid);
    assertAdminMutationRequest(request, viewer, isOwner);
    await momentRepository.deleteMoment(momentId, viewer.uuid, { isAdmin: viewer.isAdmin });
    return new Response(null, { status: 204 });
  } catch (error) {
    return momentErrorResponse(error);
  }
}
