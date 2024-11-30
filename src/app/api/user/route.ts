import { connectDB } from '@/server/models/index';

connectDB();

export async function GET(request: Request) {
  return Response.json({
    message: 'ok',
    state: 200,
    data: {
      user: '111',
      id: 123
    }
  });
}

