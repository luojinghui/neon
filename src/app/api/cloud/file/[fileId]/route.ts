import { connectDB } from '@/server/models/index';
import { CloudMessage } from '@/server/models/cloud';
import path from 'path';
import fs from 'fs/promises';

connectDB();

const UPLOAD_DIR = path.join(process.cwd(), 'upload');

export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;

  const cloudMessage = await CloudMessage.findOne({ 'files.fileId': fileId });
  if (!cloudMessage) {
    return new Response('File not found', { status: 404 });
  }

  const fileInfo = cloudMessage.files.find((f: any) => f.fileId === fileId);
  if (!fileInfo) {
    return new Response('File not found', { status: 404 });
  }

  const filePath = path.join(UPLOAD_DIR, fileInfo.storagePath);

  try {
    const buffer = await fs.readFile(filePath);
    const encodedName = encodeURIComponent(fileInfo.fileName);

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': fileInfo.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`,
        'Content-Length': String(buffer.length)
      }
    });
  } catch {
    return new Response('File not found on disk', { status: 404 });
  }
}
