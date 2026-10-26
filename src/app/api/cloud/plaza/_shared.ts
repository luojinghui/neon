import { connectDB } from '@/server/models';
import { PlazaError } from '@/server/cloud/plazaRepository';

export const noStore = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };

export async function plazaRequest(action: () => Promise<Response>) {
  try {
    await connectDB();
    return await action();
  } catch (error) {
    if (error instanceof PlazaError) return Response.json({ error: error.message }, { status: error.status, headers: noStore });
    if (error instanceof SyntaxError) return Response.json({ error: '请求内容格式无效' }, { status: 400, headers: noStore });
    console.error('Plaza request failed:', error);
    return Response.json({ error: '暂时无法完成操作，请稍后重试' }, { status: 500, headers: noStore });
  }
}
