import { NextResponse } from 'next/server';
import { momentRepository } from '@/server/moment/momentRepository';
import { profileRepository } from '@/server/user/profileRepository';
import { getViewer, momentErrorResponse, publicMoment, requireCurrentProfile } from './_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_REQUEST_BYTES = 240 * 1024 * 1024;

function parseLocation(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    throw Object.assign(new Error('位置信息无效'), { code: 'MOMENT_LOCATION_INVALID' });
  }
}

function parseBlocks(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error('invalid');
    return parsed;
  } catch {
    throw Object.assign(new Error('正文排版数据无效'), { code: 'MOMENT_BLOCKS_INVALID' });
  }
}

function getFiles(form: FormData, key: string): File[] {
  return form.getAll(key).filter((value): value is File => typeof value !== 'string' && value.size > 0);
}

async function readFile(file: File) {
  return { buffer: Buffer.from(await file.arrayBuffer()), mimeType: file.type, name: file.name };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const ownerUserId = url.searchParams.get('ownerUserId')?.trim() || '';
    const owner = ownerUserId ? profileRepository.getByUserId(ownerUserId) : null;
    if (ownerUserId && !owner) return NextResponse.json({ error: '没有找到这个人', code: 'PROFILE_NOT_FOUND' }, { status: 404 });
    const viewer = await getViewer(request);
    const result = momentRepository.listMoments({
      ownerUuid: owner?.uuid || '',
      page: url.searchParams.get('page') || '1',
      pageSize: url.searchParams.get('pageSize') || '20'
    });
    return NextResponse.json({ ...result, items: result.items.map((moment: unknown) => publicMoment(moment, viewer, 2)), isAdmin: viewer.isAdmin });
  } catch (error) {
    return momentErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const declaredSize = Number(request.headers.get('content-length') || 0);
    if (declaredSize > MAX_REQUEST_BYTES) throw Object.assign(new Error('本次上传内容过大'), { code: 'REQUEST_TOO_LARGE' });
    const profile = requireCurrentProfile(request);
    const form = await request.formData();
    const mediaFiles = getFiles(form, 'media');
    const inlineImageFiles = getFiles(form, 'inlineImages');
    const attachmentFiles = getFiles(form, 'attachments');
    const voiceFiles = getFiles(form, 'voice');
    const totalBytes = [...mediaFiles, ...inlineImageFiles, ...attachmentFiles, ...voiceFiles].reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_REQUEST_BYTES) throw Object.assign(new Error('本次上传内容过大'), { code: 'REQUEST_TOO_LARGE' });
    if (voiceFiles.length > 1) throw Object.assign(new Error('每条星语只能包含一段语音'), { code: 'MOMENT_MEDIA_INVALID' });

    const [media, inlineImages, files, voice] = await Promise.all([
      Promise.all(mediaFiles.map(readFile)),
      Promise.all(inlineImageFiles.map(readFile)),
      Promise.all(attachmentFiles.map(readFile)),
      voiceFiles[0] ? readFile(voiceFiles[0]) : Promise.resolve(null)
    ]);
    const moment = await momentRepository.createMoment(
      {
        ownerUuid: profile.uuid,
        text: form.get('text'),
        blocks: parseBlocks(form.get('blocks')),
        location: parseLocation(form.get('location')),
        voiceDurationMs: form.get('voiceDurationMs')
      },
      { media, inlineImages, files, voice }
    );
    const viewer = await getViewer(request);
    return NextResponse.json({ item: publicMoment(moment, viewer, 2) }, { status: 201 });
  } catch (error) {
    return momentErrorResponse(error);
  }
}
