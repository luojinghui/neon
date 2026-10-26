import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { plazaRepository, PlazaError } from '@/server/cloud/plazaRepository';
import { noStore, plazaRequest } from '../../_shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  return plazaRequest(async () => {
    const { fileId } = await params;
    const { file, filePath } = await plazaRepository.getFile(fileId);
    let size: number;
    try { size = (await stat(filePath)).size; } catch { throw new PlazaError('附件不存在或已失效', 404); }
    const inline = new URL(request.url).searchParams.get('preview') === '1' && /^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(file.mimeType);
    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>;
    return new Response(stream, { headers: {
      ...noStore,
      'Content-Type': inline ? file.mimeType : 'application/octet-stream',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.fileName).replace(/'/g, '%27')}`,
      'Content-Length': String(size),
      'Content-Security-Policy': "default-src 'none'; sandbox"
    } });
  });
}
