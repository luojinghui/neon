import { readFile } from 'node:fs/promises';
import { momentRepository } from '@/server/moment/momentRepository';
import { momentErrorResponse } from '../../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ momentId: string; attachmentId: string }> }) {
  try {
    const { momentId, attachmentId } = await context.params;
    const { file, filePath } = momentRepository.getFileAttachment(momentId, attachmentId);
    const bytes = await readFile(filePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') throw Object.assign(new Error('附件不存在或已被删除'), { code: 'MOMENT_NOT_FOUND' });
      throw error;
    });
    // 普通附件始终按二进制下载，避免 HTML/SVG 在本站来源下执行。
    const encodedName = encodeURIComponent(file.name).replace(/['()*]/g, (value) => `%${value.charCodeAt(0).toString(16).toUpperCase()}`);
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="attachment"; filename*=UTF-8''${encodedName}`,
        'Content-Length': String(bytes.length),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    return momentErrorResponse(error);
  }
}
