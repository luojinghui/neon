import { connectDB } from '@/server/models/index';
import { CloudMessage } from '@/server/models/cloud';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs/promises';

connectDB();

const UPLOAD_DIR = path.join(process.cwd(), 'upload');

async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

async function getPassword() {
  const password = Math.random().toString(36).substring(2, 4);
  const isExist = await CloudMessage.findOne({ password });
  if (isExist) return getPassword();
  return password;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const password = searchParams.get('password');

  const cloudMessage = await CloudMessage.findOne({ password });

  if (!cloudMessage) {
    return Response.json({ message: '未找到内容', state: 404, data: null });
  }

  return Response.json({
    message: 'ok',
    state: 200,
    data: {
      text: cloudMessage.content || '',
      files: (cloudMessage.files || []).map((f: any) => ({
        fileId: f.fileId,
        fileName: f.fileName,
        fileSize: f.fileSize,
        mimeType: f.mimeType,
        relativePath: f.relativePath
      }))
    }
  });
}

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') || '';

  let text = '';
  const fileRecords: Array<{
    fileId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    relativePath: string;
    storagePath: string;
  }> = [];

  if (contentType.includes('multipart/form-data')) {
    await ensureUploadDir();
    const formData = await request.formData();

    text = (formData.get('text') as string) || '';

    const relativePaths = formData.getAll('relativePaths') as string[];
    const files = formData.getAll('files') as File[];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileId = new mongoose.Types.ObjectId().toString();
      const ext = path.extname(file.name) || '';
      const storageName = `${fileId}${ext}`;
      const storagePath = path.join(UPLOAD_DIR, storageName);

      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(storagePath, buffer);

      fileRecords.push({
        fileId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        relativePath: relativePaths[i] || file.name,
        storagePath: storageName
      });
    }
  } else {
    const body = await request.json();
    text = body.text || '';
  }

  const hasText = !!text.trim();
  const hasFiles = fileRecords.length > 0;

  if (!hasText && !hasFiles) {
    return Response.json({ message: '内容不能为空', state: 400 }, { status: 400 });
  }

  const messageId = new mongoose.Types.ObjectId().toString();
  const expireAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const password = await getPassword();

  let messageType: 'text' | 'file' | 'mixed' = 'text';
  if (hasText && hasFiles) messageType = 'mixed';
  else if (hasFiles) messageType = 'file';

  const cloudMessage = new CloudMessage({
    messageId,
    messageType,
    content: text,
    files: fileRecords,
    userId: null,
    password,
    expireAt
  });

  try {
    await cloudMessage.save();
    return Response.json({
      message: 'ok',
      state: 200,
      data: { messageId, password }
    });
  } catch (error: any) {
    console.error('Save cloud message failed:', error);
    return Response.json({ message: 'Failed to save message', state: 500, error: error.message }, { status: 500 });
  }
}
