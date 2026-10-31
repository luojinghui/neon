'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Input, Modal, Radio, Select, Table, Tag, Tooltip, type TableColumnsType } from 'antd';
import { BellOutlined, LoadingOutlined } from '@ant-design/icons';
import { AdminApiError, adminRequest } from './client';
import type { PushMessage, PushRecipient } from './types';

const pageOptions = [
  { value: '/cloud', label: '云传' },
  { value: '/moments', label: '心迹' },
  { value: '/soul', label: '星球' },
  { value: '/cloud/plaza', label: '云传广场' },
  { value: '/doodle', label: '漫游相机' }
];
const date = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false });
const statusLabels = { sending: '发送中', sent: '已提交', partial: '部分失败', failed: '全部失败', interrupted: '中断，结果未知' };

export function PushManagement({ refreshToken, onUnauthorized }: { refreshToken: number; onUnauthorized: () => void }) {
  const [recipients, setRecipients] = useState<PushRecipient[]>([]);
  const [messages, setMessages] = useState<PushMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PushMessage | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('/cloud');
  const [audience, setAudience] = useState<'all' | 'users'>('users');
  const [uuids, setUuids] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const available = recipients.filter(item => item.subscriptionCount > 0);
  const selected = available.filter(item => audience === 'all' || uuids.includes(item.uuid));
  const browserCount = selected.reduce((sum, item) => sum + item.subscriptionCount, 0);

  const fail = useCallback((cause: unknown) => {
    if (cause instanceof AdminApiError && cause.status === 401) onUnauthorized();
    setError(cause instanceof Error ? cause.message : '加载失败，请稍后重试');
  }, [onUnauthorized]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminRequest<{ recipients: PushRecipient[]; messages: PushMessage[] }>('/push');
      setRecipients(data.recipients);
      setMessages(data.messages);
      setError('');
    } catch (cause) { fail(cause); }
    finally { setLoading(false); }
  }, [fail]);

  useEffect(() => { void load(); }, [load, refreshToken]);

  const send = async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError('');
    setResult(null);
    try {
      const response = await adminRequest<{ item: PushMessage }>('/push/messages', {
        method: 'POST', body: JSON.stringify({ title, body, url, audience, uuids })
      });
      setResult(response.item);
      setPreview(false);
      await load();
    } catch (cause) { setPreview(false); fail(cause); }
    finally { sendingRef.current = false; setSending(false); }
  };

  const messageColumns: TableColumnsType<PushMessage> = [
    { title: '通知', width: 280, render: (_, item) => <div><p className="font-medium">{item.title}</p><p className="mt-1 whitespace-pre-wrap break-words text-xs text-foreground-secondary">{item.body}</p><a className="mt-1 block break-all text-xs text-primary" href={item.url} target="_blank" rel="noreferrer">{item.url}</a></div> },
    { title: '接收对象', width: 130, render: (_, item) => item.audience === 'all' ? '全部订阅用户' : `${item.uuids.length} 位指定用户` },
    { title: '状态', width: 110, render: (_, item) => <Tag color={item.status === 'sent' ? 'success' : item.status === 'sending' ? 'processing' : 'warning'}>{statusLabels[item.status]}</Tag> },
    { title: '浏览器推送结果', width: 190, render: (_, item) => <div className="text-xs leading-6"><p>服务已接收 {item.accepted} / {item.total}</p><p className="text-foreground-muted">失败 {item.failed} · 失效订阅 {item.expired}</p></div> },
    { title: '发送人', dataIndex: 'adminName', width: 120 },
    { title: '发送时间', dataIndex: 'createdAt', width: 180, render: date }
  ];
  const recipientColumns: TableColumnsType<PushRecipient> = [
    { title: '用户', render: (_, item) => <div>{item.name}<p className="font-mono text-xs text-foreground-muted">@{item.userId}</p></div> },
    { title: '有效浏览器', dataIndex: 'subscriptionCount', width: 130, render: value => <Tag color={value ? 'green' : undefined}>{value} 个</Tag> },
    { title: '最近订阅时间', width: 180, render: (_, item) => item.devices.length ? date(item.devices.reduce((latest, device) => device.updatedAt > latest ? device.updatedAt : latest, '')) : '尚未订阅' },
    { title: '操作', width: 100, render: (_, item) => <button type="button" disabled={!item.subscriptionCount || sending} onClick={() => { setAudience('users'); setUuids([item.uuid]); }} className="text-primary disabled:opacity-40">选择推送</button> }
  ];

  return <section className="grid gap-7">
    <div>
      <h2 className="text-lg font-semibold">消息推送</h2>
      <p className="mt-1 text-xs leading-5 text-foreground-muted">向已授权的浏览器发送通知，并指定点击后打开的站内页面。{available.length} 位用户已订阅，共 {available.reduce((sum, item) => sum + item.subscriptionCount, 0)} 个浏览器。</p>
    </div>
    {error && <Alert type="error" showIcon message={error} />}
    {result && <Alert type={result.failed ? 'warning' : 'success'} showIcon message={`推送服务已接收 ${result.accepted} / ${result.total} 条，失败 ${result.failed} 条`} description="实际展示取决于浏览器、设备在线状态与系统通知设置，提交成功不代表用户已阅读。" />}
    <form className="grid max-w-2xl gap-4" onSubmit={event => { event.preventDefault(); setPreview(true); }}>
      <label className="grid gap-2 text-sm"><span>推送对象</span><Radio.Group disabled={sending} value={audience} onChange={event => setAudience(event.target.value)} options={[{ value: 'users', label: '指定用户' }, { value: 'all', label: '全部已订阅用户' }]} /></label>
      {audience === 'users' && <Select aria-label="选择接收用户" mode="multiple" disabled={sending} value={uuids} onChange={setUuids} placeholder="选择已订阅用户" optionFilterProp="label" options={available.map(item => ({ value: item.uuid, label: `${item.name} (@${item.userId}) · ${item.subscriptionCount} 个浏览器` }))} />}
      <label className="grid gap-2 text-sm"><span>通知标题</span><Input required disabled={sending} value={title} maxLength={80} showCount placeholder="输入通知标题" onChange={event => setTitle(event.target.value)} /></label>
      <label className="grid gap-2 text-sm"><span>通知正文</span><Input.TextArea required disabled={sending} value={body} maxLength={500} rows={3} showCount placeholder="输入通知内容" onChange={event => setBody(event.target.value)} /></label>
      <div className="grid gap-2 text-sm"><label htmlFor="push-target-url">点击后打开页面</label><Select aria-label="选择推送页面" disabled={sending} placeholder="常用页面" value={pageOptions.some(item => item.value === url) ? url : undefined} onChange={setUrl} options={pageOptions} /><Input id="push-target-url" required disabled={sending} value={url} maxLength={1000} onChange={event => setUrl(event.target.value)} placeholder="/soul/星球ID 或其他站内路径" /><p className="text-xs text-foreground-muted">可填写具体星球、心迹或云传的站内地址，支持查询参数。</p></div>
      <div><button type="submit" disabled={sending || loading || !browserCount || !title.trim() || !body.trim() || !url.startsWith('/') || url.startsWith('//')} className="admin-primary-button disabled:opacity-40">{sending ? <LoadingOutlined /> : <BellOutlined />} 预览并发送</button><span className="ml-3 text-xs text-foreground-muted">将发送至 {selected.length} 位用户的 {browserCount} 个浏览器</span></div>
    </form>
    <div><h3 className="mb-3 text-sm font-semibold">用户订阅</h3><Table rowKey="uuid" loading={loading} columns={recipientColumns} dataSource={recipients} scroll={{ x: 680 }} pagination={{ pageSize: 10, showSizeChanger: false }} expandable={{ expandedRowRender: item => <div className="grid gap-2">{item.devices.length ? item.devices.map(device => <div key={device.id} className="text-xs"><Tag color={device.active ? 'green' : undefined}>{device.active ? '有效' : '待重新订阅'}</Tag><Tooltip title={device.userAgent}><span className="break-all font-mono">{device.userAgent || '未记录浏览器信息'}</span></Tooltip></div>) : <span className="text-xs text-foreground-muted">用户需在云传、心迹或星球页面开启消息通知。</span>}</div> }} /></div>
    <div><h3 className="mb-3 text-sm font-semibold">最近发送记录</h3><Table rowKey="id" loading={loading} columns={messageColumns} dataSource={messages} scroll={{ x: 1020 }} pagination={{ pageSize: 10, showSizeChanger: false }} /></div>
    <Modal title="预览推送通知" open={preview} onCancel={() => { if (!sending) setPreview(false); }} onOk={() => void send()} okText={`发送至 ${browserCount} 个浏览器`} cancelText="返回编辑" confirmLoading={sending} closable={!sending} maskClosable={!sending} keyboard={!sending} cancelButtonProps={{ disabled: sending }} centered>
      <div className="my-4 rounded-xl border border-border bg-background-secondary p-4"><p className="mb-2 text-xs text-foreground-muted">Soul星球</p><p className="font-semibold">{title}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm">{body}</p></div>
      <p className="break-all text-xs text-foreground-muted">打开页面：{url}</p><p className="mt-2 text-xs text-foreground-muted">接收对象：{audience === 'all' ? '全部已订阅用户' : selected.map(item => item.name).join('、')}</p>
    </Modal>
  </section>;
}
