import { connectDB } from '@/server/models/index';
import { CloudMessage } from '@/server/models/cloud';
import mongoose from 'mongoose';

connectDB();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const password = searchParams.get('password');
  console.log('cloud server GET', password);

  const cloudMessage = await CloudMessage.findOne({ password });

  return Response.json({
    message: 'ok',
    state: 200,
    data: {
      text: cloudMessage?.content
    }
  });
}

export async function POST(request: Request) {
  const { text } = await request.json();
  console.log('cloud server POST', text);

  // 生成一个随机的消息ID
  const messageId = new mongoose.Types.ObjectId().toString();
  // 设置过期时间为24小时后
  const expireAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  // 生成一个最多2-4位数据的密码，包含数字和字母
  const password = Math.random().toString(36).substring(2, 4);

  // 调用mongoose 保存数据
  const cloudMessage = new CloudMessage({
    messageId,
    messageType: 'text',
    content: text,
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
    return Response.json(
      {
        message: 'Failed to save message',
        state: 500,
        error: error.message
      },
      { status: 500 }
    );
  }
}
