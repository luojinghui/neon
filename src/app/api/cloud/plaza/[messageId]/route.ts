import { plazaRepository } from '@/server/cloud/plazaRepository';
import { noStore, plazaRequest } from '../_shared';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ messageId: string }> };

export async function GET(_request: Request, { params }: Context) {
  return plazaRequest(async () => {
    const { messageId } = await params;
    return Response.json({ item: await plazaRepository.get(messageId), serverNow: new Date().toISOString() }, { headers: noStore });
  });
}

export async function DELETE(_request: Request, { params }: Context) {
  return plazaRequest(async () => {
    const { messageId } = await params;
    await plazaRepository.remove(messageId);
    return new Response(null, { status: 204, headers: noStore });
  });
}
