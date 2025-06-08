'use client';

import '@/styles/index.css';
import { LeftOutlined, PlusOutlined, MessageOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { Button, Card, List, Modal, Form, Input, App } from 'antd';
import { useEffect, useState } from 'react';

interface Room {
  id: string;
  name: string;
  lastMessage?: string;
  participants: number;
  createdAt: string;
}

function SoulPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [form] = Form.useForm();
  const { message } = App.useApp();

  // 模拟加载房间数据
  useEffect(() => {
    // TODO: 替换为实际的API调用
    const mockRooms: Room[] = [
      {
        id: '1',
        name: '聊天室 1',
        lastMessage: '大家好！',
        participants: 5,
        createdAt: new Date().toISOString()
      },
      {
        id: '2',
        name: '技术交流',
        lastMessage: '有人在线吗？',
        participants: 3,
        createdAt: new Date().toISOString()
      }
    ];
    setRooms(mockRooms);
  }, []);

  const handleCreateRoom = async (values: { name: string }) => {
    // TODO: 替换为实际的API调用
    const newRoom: Room = {
      id: String(Date.now()),
      name: values.name,
      participants: 1,
      createdAt: new Date().toISOString()
    };

    setRooms([newRoom, ...rooms]);
    setIsCreateModalOpen(false);
    form.resetFields();
    message.success('房间创建成功');
  };

  return (
    <div className="h-screen w-full bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex flex-col pb-10 select-none">
      <div className="header fixed top-0 left-0 w-full z-10">
        <div className="max-w-screen-xl mx-auto px-4 h-14 m-3">
          <div className="flex items-center justify-between space-x-2 bg-white/90 p-2 rounded-[6px]">
            <Link href={'/'} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 transition-all duration-300 shadow-sm hover:shadow-md hover:bg-gray-200">
              <LeftOutlined className="text-xl text-gray-800" />
            </Link>
            <span className="text-lg font-medium">星球</span>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsCreateModalOpen(true)} className="flex items-center">
              创建星球
            </Button>
          </div>
        </div>
      </div>

      <div className="content w-full pt-20 pb-8 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-screen-xl mx-auto px-4">
          <List
            grid={{ gutter: 16, xs: 1, sm: 2, md: 2, lg: 3, xl: 3, xxl: 4 }}
            dataSource={rooms}
            renderItem={(room) => (
              <List.Item>
                <Card
                  hoverable
                  className="w-full cursor-pointer transition-all duration-300 hover:shadow-lg"
                  onClick={() => {
                    // TODO: 跳转到房间详情页
                    console.log('进入房间:', room.id);
                  }}
                >
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-medium truncate flex-1">{room.name}</span>
                      <MessageOutlined className="text-blue-500" />
                    </div>
                    {room.lastMessage && <p className="text-gray-500 text-sm truncate">{room.lastMessage}</p>}
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>{room.participants} 人在线</span>
                      <span>{new Date(room.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                </Card>
              </List.Item>
            )}
          />
        </div>
      </div>

      <Modal
        title="创建新房间"
        open={isCreateModalOpen}
        onCancel={() => {
          setIsCreateModalOpen(false);
          form.resetFields();
        }}
        footer={null}
        centered
      >
        <Form form={form} layout="vertical" onFinish={handleCreateRoom} className="pt-4">
          <Form.Item name="name" label="房间名称" rules={[{ required: true, message: '请输入房间名称' }]}>
            <Input placeholder="请输入房间名称" maxLength={20} showCount />
          </Form.Item>
          <Form.Item className="mb-0 flex justify-end">
            <Button type="primary" htmlType="submit">
              创建
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default function Home() {
  return (
    <App>
      <SoulPage />
    </App>
  );
}
