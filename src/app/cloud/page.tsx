'use client';

import '@/styles/index.css';
import { LeftOutlined, CopyOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { Button, Input, message } from 'antd';
import { useEffect, useRef, useState } from 'react';

const { TextArea } = Input;

export default function Home() {
  const [text, setText] = useState('');
  const [password, setPassword] = useState('');
  const [queryPassword, setQueryPassword] = useState('');

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

    // Send password as query parameter
    const res = await fetch(`/api/cloud?password=${encodeURIComponent(queryPasswordRef.current)}`, {
      method: 'GET'
    });

    const data = await res.json();
    console.log('chat handleQuery', data);

    if (data.state === 200) {
      setText(data.data.text);
    }
  };

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQueryPassword(e.target.value);
    queryPasswordRef.current = e.target.value;
  };

  const handleCopy = () => {
    console.log('chat handleCopy', password);
    message.success('复制成功');
    navigator.clipboard.writeText(password);
  };

  return (
    <div className="h-screen w-screen">
      <div className="header fixed top-4 left-4 h-10 w-full flex items-center justify-between">
        <Link href={'/'} className="center w-10 h-10 rounded-full transform transition-all duration-300 bg-gray-100 hover:bg-gray-200">
          <LeftOutlined className="text-2xl text-gray-800" />
        </Link>
        <span>云传</span>
        <span></span>
      </div>

      <div className="content w-full h-full">
        <div className="mt-[150px] flex flex-col center">
          <TextArea rows={10} className="w-[80%] mx-auto" onChange={handleChange} value={text} />
          <Button type="primary" className="mt-4" onClick={handleSend}>
            发送
          </Button>

          {password && (
            <div className="mt-6">
              <div className="text-center text-gray-500">
                <span>接收密码：</span>
                <span className="text-gray-800 px-4 py-2 bg-gray-100 rounded-[6px] select-text">{password}</span>
                <span className="ml-2 cursor-pointer px-4 py-2 bg-gray-100 rounded-[6px]" onClick={handleCopy}>
                  <CopyOutlined />
                </span>
              </div>
            </div>
          )}

          <div className="mt-10">
            <div className="flex items-center">
              <Input placeholder="请输入密码" onChange={handleQueryChange} value={queryPassword} />
              <Button type="default" className="ml-2" onClick={handleQuery}>
                查询
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
