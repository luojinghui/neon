'use client';

import '@/styles/index.css';
import { LeftOutlined, CopyOutlined, LinkOutlined, QrcodeOutlined, DeleteOutlined, ClearOutlined, FileTextOutlined, CloseOutlined, HistoryOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { Button, Input, Card, QRCode, Modal, App, Switch, Space, Divider } from 'antd';
import { useEffect, useRef, useState } from 'react';
import JsonView from '@uiw/react-json-view';

const { TextArea } = Input;

const HISTORY_KEY = 'cloud_query_history';
const MAX_HISTORY = 10;
const TEXT_HISTORY_KEY = 'cloud_text_history';
const MAX_TEXT_HISTORY = 20;

function CloudPage() {
  const [text, setText] = useState('');
  const [password, setPassword] = useState('');
  const [queryPassword, setQueryPassword] = useState('');
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [textHistory, setTextHistory] = useState<Array<{ text: string; timestamp: number }>>([]);
  const [formattedJson, setFormattedJson] = useState('');
  const [jsonObject, setJsonObject] = useState<any>(null);
  const [showEscaped, setShowEscaped] = useState(false);
  const [showContentInfo, setShowContentInfo] = useState(true);

  const queryPasswordRef = useRef('');
  const { message } = App.useApp();

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
      handleQuery(pwd);
    }
  }, []);

  const handleSend = async () => {
    console.log('chat handleSend', text);

    if (!text) {
      message.warning('请输入内容');
      return;
    }

    const res = await fetch('/api/cloud', {
      method: 'POST',
      body: JSON.stringify({ text })
    });

    const data = await res.json();
    console.log('chat handleSend', data);

    if (data.state === 200) {
      setPassword(data.data.password);
      setShowContentInfo(true);
      addToTextHistory(text);
    }

    message.success('发送成功，请及时分享密码');
  };

  const handleQuery = async (pwd?: string) => {
    const password = pwd || queryPasswordRef.current;
    console.log('chat handleQuery', password);

    if (!password) {
      message.error('请输入密码');
      return;
    }

    const res = await fetch(`/api/cloud?password=${encodeURIComponent(password)}`, { method: 'GET' });
    const data = await res.json();

    console.log('chat handleQuery', data);

    if (data.state === 200) {
      setText(data.data.text);
      addToHistory(queryPasswordRef.current);

      message.success('查询成功');
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
  };

  const addToTextHistory = (text: string) => {
    if (!text) return;

    const history = JSON.parse(localStorage.getItem(TEXT_HISTORY_KEY) || '[]');
    const newItem = { text, timestamp: Date.now() };
    const newHistory = [newItem, ...history].slice(0, MAX_TEXT_HISTORY);
    localStorage.setItem(TEXT_HISTORY_KEY, JSON.stringify(newHistory));
    setTextHistory(newHistory);
  };

  const deleteFromTextHistory = (timestamp: number) => {
    const history = JSON.parse(localStorage.getItem(TEXT_HISTORY_KEY) || '[]');
    const newHistory = history.filter((item: { text: string; timestamp: number }) => item.timestamp !== timestamp);

    localStorage.setItem(TEXT_HISTORY_KEY, JSON.stringify(newHistory));
    setTextHistory(newHistory);
  };

  const loadHistory = () => {
    const textHistory = JSON.parse(localStorage.getItem(TEXT_HISTORY_KEY) || '[]');
    setTextHistory(textHistory);
  };

  const handleUseHistoryItem = (item: { text: string; timestamp: number }) => {
    setText(item.text);
    setIsHistoryModalOpen(false);
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success('内容已复制');
  };

  const handleClear = () => {
    setText('');
    setQueryPassword('');
    queryPasswordRef.current = '';
    message.success('内容已清空');
  };

  const handleJsonParse = () => {
    if (!text.trim()) {
      message.warning('请先输入内容');
      return;
    }

    try {
      // 默认情况下不保留转义字符，对字符串进行处理
      let textToParse = text;
      if (!showEscaped) {
        // 移除不必要的转义字符，但保持JSON结构完整
        textToParse = text.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      }

      const parsed = JSON.parse(textToParse);
      const formatted = JSON.stringify(parsed, null, 2);

      setJsonObject(parsed);
      setFormattedJson(formatted);
      setIsJsonModalOpen(true);
    } catch (error) {
      // 如果解析失败，尝试原始文本
      try {
        const parsed = JSON.parse(text);
        const formatted = JSON.stringify(parsed, null, 2);

        setJsonObject(parsed);
        setFormattedJson(formatted);
        setIsJsonModalOpen(true);
      } catch (secondError) {
        message.error('JSON格式错误，无法解析');
      }
    }
  };

  const handleEscapeToggle = (checked: boolean) => {
    setShowEscaped(checked);

    if (!text.trim()) return;

    try {
      let textToParse = text;
      if (!checked) {
        // 不保留转义字符
        textToParse = text.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      }

      const parsed = JSON.parse(textToParse);
      const formatted = JSON.stringify(parsed, null, 2);

      setJsonObject(parsed);
      setFormattedJson(formatted);
    } catch (error) {
      // 保持原有状态，不更新
    }
  };

  const handleCopyFormattedJson = () => {
    if (showEscaped) {
      // 如果显示转义字符，复制带转义的版本
      const escapedJson = JSON.stringify(formattedJson);
      navigator.clipboard.writeText(escapedJson);
    } else {
      navigator.clipboard.writeText(formattedJson);
    }
    message.success('JSON已复制');
  };

  useEffect(() => {
    loadHistory();
  }, []);

  return (
    <div className="h-screen w-full bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex flex-col pb-10 select-none">
      <div className="header fixed top-0 left-0 w-full z-10">
        <div className="max-w-screen-xl mx-auto px-4 h-14 m-3">
          <div className="flex items-center justify-between space-x-2 bg-white/90 p-2 rounded-[6px]">
            <Link href={'/'} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 transition-all duration-300 shadow-sm hover:shadow-md hover:bg-gray-200">
              <LeftOutlined className="text-xl text-gray-800" />
            </Link>
            <span className="text-lg font-medium">云传</span>
            <span></span>
          </div>
        </div>
      </div>

      <div className="content w-full pt-20 pb-8 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-screen-xl mx-auto px-4 space-y-6">
          <Card
            title="发送内容"
            extra={
              <div className="flex items-center space-x-2">
                <Input placeholder="查询密码" maxLength={4} onChange={handleQueryChange} value={queryPassword} className="h-8 w-[130px]" onPressEnter={() => handleQuery()} />
                <Button type="primary" onClick={() => handleQuery()}>
                  查询
                </Button>
              </div>
            }
            className="w-full"
            styles={{
              body: { padding: '12px' },
              header: { padding: '8px 12px', minHeight: '40px' }
            }}
          >
            <TextArea autoSize={{ minRows: 14, maxRows: 24 }} showCount className="w-full" allowClear onChange={handleChange} value={text} />
            <div className="flex flex-wrap gap-2 mt-4">
              <Button type="primary" onClick={handleSend}>
                发送
              </Button>
              <Button icon={<ClearOutlined />} onClick={handleClear}>
                清空
              </Button>
              <Button
                icon={<CopyOutlined />}
                onClick={() => {
                  handleCopyText(text);
                }}
                disabled={!text}
              >
                复制内容
              </Button>
              <Button icon={<FileTextOutlined />} onClick={handleJsonParse} disabled={!text}>
                JSON解析
              </Button>
              {textHistory.length > 0 && (
                <Button icon={<HistoryOutlined />} onClick={() => setIsHistoryModalOpen(true)}>
                  历史记录
                </Button>
              )}
            </div>
          </Card>

          {showContentInfo && password && (
            <Card
              title="内容信息"
              extra={<Button type="text" icon={<CloseOutlined />} onClick={() => setShowContentInfo(false)} className="hover:bg-gray-100" />}
              className="w-full"
              styles={{
                body: { padding: '12px' },
                header: { padding: '8px 12px', minHeight: '40px' }
              }}
            >
              <div className="space-y-2">
                <div className="flex items-center bg-gray-100 p-2 rounded-lg">
                  <div className="flex-1 flex items-center space-x-2">
                    <span className="text-gray-500 w-[50px]">密码：</span>
                    <span className="text-lg font-medium text-gray-800">{password}</span>
                    <Button type="text" icon={<CopyOutlined />} onClick={handleCopy} className="hover:bg-gray-100">
                      复制密码
                    </Button>
                  </div>
                </div>

                <div className="flex items-center bg-gray-100 p-2 rounded-lg">
                  <div className="flex-1 flex items-center space-x-2 flex-wrap">
                    <span className="text-gray-500 w-[50px]">链接：</span>
                    <span className="text-sm text-gray-600 truncate max-w-[200px]">{`${window.location.origin}/cloud?pwd=${password}`}</span>
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
        </div>
      </div>

      <Modal title="分享二维码" open={isQRModalOpen} onCancel={() => setIsQRModalOpen(false)} footer={null} centered>
        <div className="flex flex-col items-center space-y-4 py-4">
          <QRCode value={shareLink} size={200} />
          <p className="text-gray-500 text-sm">扫描二维码访问内容</p>
        </div>
      </Modal>

      <Modal title="历史数据" open={isHistoryModalOpen} onCancel={() => setIsHistoryModalOpen(false)} footer={null} width={700} centered>
        <div className="max-h-[70vh] overflow-y-auto py-2">
          {textHistory.length > 0 ? (
            <div className="space-y-4">
              {textHistory.map((item, index) => (
                <Card
                  key={item.timestamp}
                  size="small"
                  className="group border border-gray-100 hover:border-blue-200 transition-all"
                  extra={
                    <div className="flex space-x-2">
                      <Button size="small" type="primary" onClick={() => handleUseHistoryItem(item)}>
                        使用
                      </Button>
                      <Button size="small" danger icon={<DeleteOutlined />} onClick={() => deleteFromTextHistory(item.timestamp)} />
                      <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopyText(item.text)} />
                    </div>
                  }
                >
                  <div className="flex flex-col">
                    <div className="text-xs text-gray-500 mb-2">{new Date(item.timestamp).toLocaleString()}</div>
                    <div className="text-sm line-clamp-5 text-gray-700 whitespace-pre-wrap">{item.text}</div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">暂无历史数据</div>
          )}
        </div>
      </Modal>

      <Modal
        title="JSON格式化"
        open={isJsonModalOpen}
        onCancel={() => setIsJsonModalOpen(false)}
        footer={[
          <div key="footer" className="flex justify-between items-center w-full">
            <Space>
              <span className="text-sm text-gray-600">显示转义字符：</span>
              <Switch size="small" checked={showEscaped} onChange={handleEscapeToggle} />
            </Space>
            <Space>
              <Button key="copy" icon={<CopyOutlined />} onClick={handleCopyFormattedJson}>
                复制JSON
              </Button>
              <Button key="close" onClick={() => setIsJsonModalOpen(false)}>
                关闭
              </Button>
            </Space>
          </div>
        ]}
        width={900}
        centered
      >
        <div className="max-h-[70vh] overflow-y-auto">
          {jsonObject && (
            <div className="space-y-4">
              <div className="border border-gray-200 rounded-lg p-4 bg-white">
                <JsonView
                  value={jsonObject}
                  displayDataTypes={false}
                  enableClipboard={false}
                  collapsed={false}
                  shortenTextAfterLength={99999}
                  displayObjectSize={false}
                  style={{
                    fontSize: '13px',
                    fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace'
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

export default function Home() {
  return (
    <App>
      <CloudPage />
    </App>
  );
}
