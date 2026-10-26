import { plazaRepository, PlazaError } from '@/server/cloud/plazaRepository';
import { noStore, plazaRequest } from './_shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  return plazaRequest(async () => {
    const params = new URL(request.url).searchParams;
    const result = await plazaRepository.list(params.get('cursor') || undefined, Number(params.get('limit') || 20));
    return Response.json(result, { headers: noStore });
  });
}

export async function POST(request: Request) {
  return plazaRequest(async () => {
    let text: string;
    let files: File[] = [];
    let relativePaths: string[] = [];
    if (request.headers.get('content-type')?.includes('multipart/form-data')) {
      const form = await request.formData();
      const input = form.get('text') ?? '';
      const attachments = form.getAll('files');
      const paths = form.getAll('relativePaths');
      if (typeof input !== 'string' || attachments.some(file => typeof file === 'string') || paths.some(value => typeof value !== 'string')) throw new PlazaError('上传内容格式无效');
      text = input;
      files = attachments as File[];
      relativePaths = paths as string[];
    } else {
      const body = await request.json();
      if (!body || typeof body.text !== 'string') throw new PlazaError('请输入内容或选择文件');
      text = body.text;
    }
    const item = await plazaRepository.create(text, files, relativePaths);
    return Response.json({ item, serverNow: new Date().toISOString() }, { status: 201, headers: noStore });
  });
}
