'use client';

import '@/styles/index.css';
import { LeftOutlined, CopyOutlined, LinkOutlined, QrcodeOutlined, DeleteOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { Button, Input, message, Card, QRCode, Modal } from 'antd';
import { useEffect, useRef, useState } from 'react';

const { TextArea } = Input;

const HISTORY_KEY = 'cloud_query_history';
const MAX_HISTORY = 10;

export default function Home() {
  const [text, setText] = useState('');
  const [password, setPassword] = useState('');
  const [queryPassword, setQueryPassword] = useState('');
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [historyPasswords, setHistoryPasswords] = useState<string[]>([]);

  const queryPasswordRef = useRef('');

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  };

  // 解析url参数，如果携带pwd参数，则直接注入到查询密码中，并查询内容
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const pwd = urlParams.get('pwd');
    queryPasswordRef.current = pwd || '';

    console.log('chat useEffect', pwd);

    if (pwd) {
      setQueryPassword(pwd);
      handleQuery();
    }
  }, []);

  const handleSend = async () => {
    console.log('chat handleSend', text);

    const res = await fetch('/api/cloud', {
      method: 'POST',
      body: JSON.stringify({ text })
    });

    const data = await res.json();
    console.log('chat handleSend', data);

    if (data.state === 200) {
      setText('');
      setPassword(data.data.password);
    }
  };

  const handleQuery = async () => {
    console.log('chat handleQuery', queryPassword);

    const res = await fetch(`/api/cloud?password=${encodeURIComponent(queryPasswordRef.current)}`, {
      method: 'GET'
    });

    const data = await res.json();
    console.log('chat handleQuery', data);

    if (data.state === 200) {
      setText(data.data.text);
      // Add to history
      addToHistory(queryPasswordRef.current);
    }
  };

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQueryPassword(e.target.value);
    queryPasswordRef.current = e.target.value;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(password);
    message.success('密码已复制');
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}/cloud?pwd=${password}`;

    navigator.clipboard.writeText(link);
    message.success('链接已复制');
  };

  const handleShowQR = () => {
    const link = `${window.location.origin}/cloud?pwd=${password}`;

    setShareLink(link);
    setIsQRModalOpen(true);
  };

  const addToHistory = (pwd: string) => {
    if (!pwd) return;

    const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    const newHistory = [pwd, ...history.filter((item: string) => item !== pwd)].slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
    setHistoryPasswords(newHistory);
  };

  const deleteFromHistory = (pwdToDelete: string) => {
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    const newHistory = history.filter((pwd: string) => pwd !== pwdToDelete);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
    setHistoryPasswords(newHistory);
  };

  const loadHistory = () => {
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    setHistoryPasswords(history);
  };

  useEffect(() => {
    loadHistory();
  }, []);

  return (
    <div className="h-screen w-full bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex flex-col">
      <div className="header fixed top-0 left-0 w-full z-10">
        <div className="max-w-screen-xl mx-auto px-4 h-14 m-3">
          <div className="flex items-center justify-between space-x-2 bg-white/90 p-2 rounded-[8px]">
            <Link href={'/'} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/80 transition-all duration-300 shadow-sm hover:shadow-md">
              <LeftOutlined className="text-xl text-gray-800" />
            </Link>
            <span className="text-lg font-medium">云传</span>
            <span></span>
          </div>
        </div>
      </div>

      <div className="content w-full pt-20 pb-8 flex-1 overflow-y-auto">
        <div className="max-w-screen-xl mx-auto px-4 space-y-6">
          <Card title="发送内容" className="w-full" styles={{ body: { padding: '16px' } }}>
            <TextArea rows={10} className="w-full" onChange={handleChange} value={text} />
            <Button type="primary" className="mt-4" onClick={handleSend}>
              发送
            </Button>
          </Card>

          {password && (
            <Card title="接收密码" className="w-full" styles={{ body: { padding: '16px' } }}>
              <div className="space-y-2">
                <div className="flex items-center bg-gray-100 p-4 rounded-lg">
                  <div className="flex-1 flex items-center space-x-2">
                    <span className="text-gray-500">密码：</span>
                    <span className="text-lg font-medium text-gray-800">{password}</span>
                    <Button type="text" icon={<CopyOutlined />} onClick={handleCopy} className="hover:bg-gray-100">
                      复制密码
                    </Button>
                  </div>
                </div>

                <div className="flex items-center bg-gray-100 p-4 rounded-lg">
                  <div className="flex-1 flex items-center space-x-2">
                    <span className="text-gray-500">分享链接：</span>
                    <span className="text-sm text-gray-600 truncate max-w-[300px]">{`${window.location.origin}/cloud?pwd=${password}`}</span>
                    <div className="flex items-center space-x-1">
                      <Button type="text" icon={<LinkOutlined />} onClick={handleCopyLink} className="hover:bg-gray-100">
                        复制链接
                      </Button>
                      <Button type="text" icon={<QrcodeOutlined />} onClick={handleShowQR} className="hover:bg-gray-100">
                        二维码
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}

          <Card title="查询内容" className="w-full" styles={{ body: { padding: '16px' } }}>
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Input placeholder="请输入密码" onChange={handleQueryChange} value={queryPassword} className="h-10 w-[200px]" />
                <Button type="primary" onClick={handleQuery}>
                  查询
                </Button>
              </div>

              {historyPasswords.length > 0 && (
                <div className="mt-4">
                  <div className="text-sm text-gray-500 mb-2">历史查询密码：</div>
                  <div className="flex flex-wrap gap-2">
                    {historyPasswords.map((pwd, index) => (
                      <div
                        key={index}
                        className="group relative flex items-center bg-white rounded-md overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 border border-gray-100"
                      >
                        <Button
                          size="small"
                          onClick={() => {
                            setQueryPassword(pwd);
                            queryPasswordRef.current = pwd;
                          }}
                          className="border-0 hover:bg-gray-50 px-2 py-1"
                        >
                          {pwd}
                        </Button>
                        <Button
                          type="text"
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={() => deleteFromHistory(pwd)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-50 hover:text-red-500 px-2"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Modal title="分享二维码" open={isQRModalOpen} onCancel={() => setIsQRModalOpen(false)} footer={null} centered>
        <div className="flex flex-col items-center space-y-4 py-4">
          <QRCode value={shareLink} size={200} />
          <p className="text-gray-500 text-sm">扫描二维码访问内容</p>
        </div>
      </Modal>
    </div>
  );
}
