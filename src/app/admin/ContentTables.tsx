'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Input, Modal, Popconfirm, Table, Tag, type TableColumnsType } from 'antd';
import { ImagePreview } from '@/components/image-viewer/ImagePreview';
import { MomentMediaView } from '../moments/components/MomentMedia';
import { MomentVoicePlayer } from '../moments/components/MomentVoice';
import type { Moment } from '../moments/types';
import type { Conversation } from '../social/client';
import type { HistoryPage, ServerChatMessage } from '../soul/core/types';
import { AdminApiError, adminRequest } from './client';

type Props = { refreshToken: number; onUnauthorized: () => void };
const date = (value: string | number) => new Date(value).toLocaleString('zh-CN', { hour12: false });
const actionClass = 'rounded-lg px-2 py-1 text-sm text-primary hover:bg-primary-soft disabled:opacity-50';

function useAdminData<T>(path: string, refreshToken: number, onUnauthorized: () => void) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const version = useRef(0);
  const unauthorized = useRef(onUnauthorized);
  unauthorized.current = onUnauthorized;
  const report = useCallback((error: unknown) => {
    if (error instanceof AdminApiError && error.status === 401) unauthorized.current();
    setError(error instanceof Error ? error.message : '加载失败，请重试');
  }, []);
  const load = useCallback(async () => {
    const current = ++version.current;
    setLoading(true); setError('');
    try { const result = await adminRequest<T>(path); if (version.current === current) setData(result); }
    catch (error) { if (version.current === current) report(error); }
    finally { if (version.current === current) setLoading(false); }
  }, [path, report]);
  useEffect(() => { setData(null); void load(); return () => { version.current += 1; }; }, [load, refreshToken]);
  return { data, loading, error, load, report };
}

function LoadError({ error, retry }: { error: string; retry: () => void }) {
  return error ? <Alert className="mb-4" type="error" showIcon message={error} action={<button type="button" className={actionClass} onClick={retry}>重试</button>} /> : null;
}

function DirectHistory({ conversation, onUnauthorized, refreshToken }: Props & { conversation: Conversation }) {
  const { data, error, loading, load, report } = useAdminData<HistoryPage>(`/directs/${encodeURIComponent(conversation.id)}/messages`, refreshToken, onUnauthorized);
  const [history, setHistory] = useState<HistoryPage | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { setHistory(data); }, [data]);
  const more = async () => {
    if (!history?.hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await adminRequest<HistoryPage>(`/directs/${encodeURIComponent(conversation.id)}/messages?before=${history.before}`);
      if (alive.current) setHistory((current) => ({ ...page, messages: [...page.messages, ...(current?.messages || [])] }));
    } catch (error) { if (alive.current) report(error); }
    finally { if (alive.current) setLoadingMore(false); }
  };
  const renderMessage = (message: ServerChatMessage) => <article key={message.id} className="rounded-xl border border-border p-3">
    <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-foreground-muted"><span>{message.senderName} · @{message.senderId}</span><time>{date(message.timestamp)}</time></div>
    {message.replyTo && <blockquote className="mb-2 border-l-2 border-border pl-3 text-xs text-foreground-muted">回复 {message.replyTo.senderName}：{message.replyTo.content}</blockquote>}
    <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
    {message.attachment && (['image', 'gif'].includes(message.type) ? <ImagePreview images={[{ id: message.id, url: message.attachment.url, name: message.attachment.name }]} imageId={message.id} className="mt-2 block max-w-xs">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={message.attachment.url} alt={message.attachment.name} className="max-h-64 rounded-lg object-contain" />
    </ImagePreview> : <a href={message.attachment.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-primary">查看附件：{message.attachment.name}</a>)}
  </article>;
  return <div>
    <p className="mb-4 text-xs text-foreground-muted">只读查看 · {conversation.participants.map((person) => `${person.name} (@${person.userId})`).join(' ↔ ')}</p>
    <LoadError error={error} retry={() => void load()} />
    {loading && <p role="status">正在加载私信…</p>}
    <div className="max-h-[65vh] space-y-3 overflow-y-auto" aria-label="私信历史内容">
      {history?.hasMore && <button type="button" className={actionClass} disabled={loadingMore} onClick={() => void more()}>{loadingMore ? '加载中…' : '加载更早消息'}</button>}
      {history?.messages.map(renderMessage)}
      {!loading && history?.messages.length === 0 && <p className="py-6 text-center text-foreground-muted">双方还没有发送消息</p>}
    </div>
  </div>;
}

export function DirectDataTable(props: Props) {
  const { data, error, loading, load } = useAdminData<{ items: Conversation[] }>('/directs', props.refreshToken, props.onUnauthorized);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Conversation | null>(null);
  const columns: TableColumnsType<Conversation> = [
    { title: '私信双方', render: (_, item) => item.participants.map((person) => <div key={person.publicKey}>{person.name} <span className="text-xs text-foreground-muted">@{person.userId}</span></div>) },
    { title: '最近消息', render: (_, item) => <span className="line-clamp-2 max-w-sm break-words">{item.lastMessage?.content || '暂无消息'}</span> },
    { title: '消息数', dataIndex: 'messageCount', width: 90 },
    { title: '最近活动', width: 180, render: (_, item) => date(item.lastMessageAt || item.createdAt) },
    { title: '操作', width: 110, render: (_, item) => <button type="button" className={actionClass} onClick={() => setSelected(item)}>查看内容</button> }
  ];
  const query = search.trim().toLowerCase();
  const items = (data?.items || []).filter((item) => `${item.participants.map((person) => `${person.name} ${person.userId}`).join(' ')} ${item.lastMessage?.content || ''}`.toLowerCase().includes(query));
  return <section>
    <h2 className="mb-2 text-lg font-semibold">全部私信</h2><p className="mb-4 text-xs text-foreground-muted">共 {data?.items.length || 0} 个会话，可查看所有用户的私信历史与附件。</p>
    <Input.Search className="mb-4 max-w-md" placeholder="搜索双方昵称、ID 或最近消息" aria-label="搜索全部私信" value={search} onChange={(event) => setSearch(event.target.value)} />
    <LoadError error={error} retry={() => void load()} />
    <Table rowKey="id" loading={loading} columns={columns} dataSource={items} scroll={{ x: 850 }} pagination={{ pageSize: 20, showSizeChanger: false }} />
    <Modal title="私信内容" open={Boolean(selected)} onCancel={() => setSelected(null)} footer={null} width={800} destroyOnHidden>{selected && <DirectHistory key={`${selected.id}:${props.refreshToken}`} conversation={selected} {...props} />}</Modal>
  </section>;
}

export function MomentDataTable(props: Props) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Moment | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, error, loading, load, report } = useAdminData<{ items: Moment[]; total: number }>(`/moments?page=${page}&pageSize=20&search=${encodeURIComponent(search)}`, props.refreshToken, props.onUnauthorized);
  const remove = async (moment: Moment, commentId?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await adminRequest(`/moments/${moment.id}${commentId ? `/comments/${commentId}` : ''}`, { method: 'DELETE' });
      if (commentId) {
        const result = await adminRequest<{ item: Moment }>(`/moments/${moment.id}`);
        setSelected(result.item);
      } else {
        setSelected(null);
        if (data?.items.length === 1 && page > 1) setPage(page - 1);
      }
      await load();
    } catch (error) { report(error); }
    finally { setBusy(false); }
  };
  const columns: TableColumnsType<Moment> = [
    { title: '作者', width: 180, render: (_, item) => <div>{item.author.name}<p className="text-xs text-foreground-muted">@{item.author.userId}</p></div> },
    { title: '心迹内容', render: (_, item) => <div><p className="line-clamp-2 max-w-md whitespace-pre-wrap break-words">{item.text || '媒体心迹'}</p><span className="text-xs text-foreground-muted">{item.media.length} 个影像{item.voice ? ' · 含语音' : ''}{item.location ? ` · ${item.location.label || '含位置'}` : ''}</span></div> },
    { title: '互动', width: 120, render: (_, item) => `${item.likeCount} 赞 / ${item.commentCount} 评论` },
    { title: '发布时间', width: 180, render: (_, item) => date(item.createdAt) },
    { title: '操作', width: 150, render: (_, item) => <div className="flex gap-1"><button type="button" className={actionClass} onClick={() => setSelected(item)}>查看管理</button><Popconfirm title="删除这条心迹及全部媒体和评论？" okText="删除" cancelText="取消" onConfirm={() => remove(item)}><button disabled={busy} className="px-2 text-danger">删除</button></Popconfirm></div> }
  ];
  return <section>
    <h2 className="mb-2 text-lg font-semibold">全部心迹</h2><p className="mb-4 text-xs text-foreground-muted">查看所有用户的文字、影像、语音、位置和评论，可删除心迹或单条评论。</p>
    <Input.Search className="mb-4 max-w-md" placeholder="搜索心迹文字或 ID" aria-label="搜索全部心迹" onSearch={(value) => { setSearch(value); setPage(1); }} allowClear />
    <LoadError error={error} retry={() => void load()} />
    <Table rowKey="id" loading={loading} columns={columns} dataSource={data?.items || []} scroll={{ x: 900 }} pagination={{ current: page, pageSize: 20, total: data?.total || 0, onChange: setPage, showSizeChanger: false }} />
    <Modal title="心迹管理" open={Boolean(selected)} onCancel={() => { if (!busy) setSelected(null); }} footer={null} width={800} destroyOnHidden>
      {selected && <div className="max-h-[70vh] space-y-4 overflow-y-auto">
        <div>{selected.author.name} · @{selected.author.userId}<p className="text-xs text-foreground-muted">{date(selected.createdAt)} · {selected.likeCount} 赞</p></div>
        <p className="whitespace-pre-wrap break-words">{selected.text}</p>
        <MomentMediaView media={selected.media} />{selected.voice && <MomentVoicePlayer voice={selected.voice} />}
        {selected.location && <p className="text-xs text-foreground-muted">位置：{selected.location.label}（{selected.location.latitude}, {selected.location.longitude}）</p>}
        <h3 className="font-medium">全部评论（{selected.commentCount}）</h3>
        {selected.comments.map((comment) => <div key={comment.id} className="rounded-lg border border-border p-3"><div className="flex items-center justify-between gap-2 text-xs text-foreground-muted"><span>{comment.author.name}{comment.replyTo ? ` 回复 ${comment.replyTo.name}` : ''} · {date(comment.createdAt)}</span><Popconfirm title="删除这条评论？" okText="删除" cancelText="取消" onConfirm={() => remove(selected, comment.id)}><button type="button" disabled={busy} className="shrink-0 text-danger">删除评论</button></Popconfirm></div><p className="mt-2 whitespace-pre-wrap break-words text-sm">{comment.text}</p></div>)}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>}
    </Modal>
  </section>;
}

type Share = { id: string; title: string; ownerName: string; ownerUserId: string; state: 'active' | 'expired' | 'deleted'; shareUrl: string; createdAt: string; expiresAt: string };
export function DoodleShareTable(props: Props) {
  const { data, error, loading, load } = useAdminData<{ items: Share[] }>('/doodle-shares', props.refreshToken, props.onUnauthorized);
  const columns: TableColumnsType<Share> = [
    { title: '作品', dataIndex: 'title' },
    { title: '创建者', render: (_, item) => <span>{item.ownerName} · @{item.ownerUserId}</span> },
    { title: '分享链接', render: (_, item) => <a href={item.shareUrl} target="_blank" rel="noreferrer" className="break-all text-primary">{item.shareUrl}</a> },
    { title: '状态', render: (_, item) => <Tag color={item.state === 'active' ? 'success' : 'default'}>{item.state === 'active' ? '有效' : item.state === 'expired' ? '已过期' : '已删除'}</Tag> },
    { title: '有效期至', render: (_, item) => date(item.expiresAt) }
  ];
  return <section><h2 className="mb-2 text-lg font-semibold">漫游相机分享链接</h2><p className="mb-4 text-xs text-foreground-muted">显示已生成的分享链接，包括未关联审核记录的历史分享。</p><LoadError error={error} retry={() => void load()} /><Table rowKey="id" loading={loading} columns={columns} dataSource={data?.items || []} scroll={{ x: 900 }} pagination={{ pageSize: 20, showSizeChanger: false }} /></section>;
}
