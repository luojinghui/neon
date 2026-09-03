'use client';

import '@/styles/index.css';
import './admin.css';
import {
  CloudOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  GlobalOutlined,
  LoadingOutlined,
  LockOutlined,
  LogoutOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  TeamOutlined
} from '@ant-design/icons';
import { Input, Modal, Popconfirm, Select, Switch, Table, Tag, Tooltip, type TableColumnsType } from 'antd';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { AdminApiError, adminRequest } from './client';
import type { AdminCloudItem, AdminIdentity, AdminProfileItem, AdminRoomItem } from './types';

type Notice = { type: 'error' | 'success'; text: string } | null;
type AdminTab = 'cloud' | 'rooms' | 'users';

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false });
}

function formatBytes(value = 0): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请重试';
}

function handleAuthError(error: unknown, onUnauthorized: () => void): void {
  if (error instanceof AdminApiError && error.status === 401) onUnauthorized();
}

function LoginScreen({ onLogin }: { onLogin: (admin: AdminIdentity) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await adminRequest<{ admin: AdminIdentity }>('/login', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password })
      });
      setPassword('');
      onLogin(result.admin);
    } catch (loginError) {
      setError(getErrorMessage(loginError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute -left-24 top-[-7rem] h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 right-[-5rem] h-80 w-80 rounded-full bg-accent/10 blur-3xl" />
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <section className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
        <div className="h-1.5 bg-gradient-to-r from-primary via-accent to-warning" />
        <div className="px-6 py-8 sm:px-9 sm:py-10">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-xl text-primary">
            <SafetyCertificateOutlined />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">管理控制台</h1>
          <p className="mt-2 text-sm leading-6 text-foreground-secondary">仅限授权管理员登录。登录后可访问用户隐私数据，请谨慎操作。</p>

          <form className="mt-7 grid gap-5" onSubmit={(event) => void submit(event)}>
            <label className="grid gap-1.5">
              <span className="text-sm font-medium text-foreground">管理员账号</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                autoFocus
                className="h-11 rounded-lg border border-border bg-input px-3 text-sm text-input-foreground outline-none transition focus:border-border-focus focus:bg-input-focus focus:ring-2 focus:ring-ring/15"
                placeholder="请输入管理员账号"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-medium text-foreground">密码</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                className="h-11 rounded-lg border border-border bg-input px-3 text-sm text-input-foreground outline-none transition focus:border-border-focus focus:bg-input-focus focus:ring-2 focus:ring-ring/15"
                placeholder="请输入密码"
              />
            </label>

            {error && <div className="rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger">{error}</div>}

            <button
              type="submit"
              disabled={submitting || !username.trim() || !password}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? <LoadingOutlined /> : <LockOutlined />}
              {submitting ? '登录中...' : '安全登录'}
            </button>
          </form>

          <div className="mt-7 border-t border-border pt-5 text-center">
            <Link href="/" className="text-sm text-foreground-muted transition-colors hover:text-primary">返回 Soul 首页</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function CloudDataTable({ refreshToken, onUnauthorized, setNotice }: DataTableProps) {
  const [items, setItems] = useState<AdminCloudItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState<AdminCloudItem | null>(null);
  const [editing, setEditing] = useState<AdminCloudItem | null>(null);
  const [draftContent, setDraftContent] = useState('');
  const [draftPassword, setDraftPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState({ fileCount: 0, fileBytes: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: '50' });
      if (search) query.set('search', search);
      const result = await adminRequest<{ items: AdminCloudItem[]; total: number; stats: { fileCount?: number; fileBytes?: number } }>(`/cloud?${query}`);
      setItems(result.items);
      setTotal(result.total);
      setStats({ fileCount: result.stats.fileCount || 0, fileBytes: result.stats.fileBytes || 0 });
    } catch (error) {
      handleAuthError(error, onUnauthorized);
      setNotice({ type: 'error', text: getErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized, page, search, setNotice]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const remove = async (item: AdminCloudItem) => {
    try {
      await adminRequest<void>(`/cloud/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      setNotice({ type: 'success', text: `云传数据 ${item.password} 已删除` });
      await load();
    } catch (error) {
      handleAuthError(error, onUnauthorized);
      setNotice({ type: 'error', text: getErrorMessage(error) });
    }
  };

  const openEdit = (item: AdminCloudItem) => {
    setEditing(item);
    setDraftContent(item.content);
    setDraftPassword(item.password);
  };

  const save = async () => {
    if (!editing || saving) return;
    setSaving(true);
    try {
      await adminRequest(`/cloud/${encodeURIComponent(editing.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ content: draftContent, password: draftPassword.trim() })
      });
      setEditing(null);
      setNotice({ type: 'success', text: '云传基本信息已更新' });
      await load();
    } catch (error) {
      handleAuthError(error, onUnauthorized);
      setNotice({ type: 'error', text: getErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  const columns: TableColumnsType<AdminCloudItem> = [
    { title: '提取码', dataIndex: 'password', width: 92, render: (value) => <span className="font-mono font-semibold text-primary">{value}</span> },
    { title: '类型', dataIndex: 'messageType', width: 90, render: (value) => <Tag>{value === 'mixed' ? '混合' : value === 'file' ? '文件' : '文本'}</Tag> },
    {
      title: '内容',
      dataIndex: 'content',
      ellipsis: true,
      render: (value: string, item) => <span className="text-foreground-secondary">{value || (item.files.length > 0 ? `${item.files.length} 个文件` : '—')}</span>
    },
    { title: '文件', width: 120, render: (_, item) => `${item.files.length} / ${formatBytes(item.files.reduce((sum, file) => sum + file.fileSize, 0))}` },
    { title: '创建时间', dataIndex: 'createdAt', width: 174, render: formatDate },
    { title: '过期时间', dataIndex: 'expireAt', width: 174, render: formatDate },
    {
      title: '操作',
      fixed: 'right',
      width: 156,
      render: (_, item) => (
        <div className="flex items-center gap-1">
          <Tooltip title="查看隐私数据"><button type="button" onClick={() => setViewing(item)} className="admin-icon-button"><EyeOutlined /></button></Tooltip>
          <Tooltip title="编辑"><button type="button" onClick={() => openEdit(item)} className="admin-icon-button"><EditOutlined /></button></Tooltip>
          <Popconfirm title="删除这条云传数据？" description="数据库记录及对应文件都会被删除。" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => void remove(item)}>
            <Tooltip title="删除"><button type="button" className="admin-icon-button hover:!text-danger"><DeleteOutlined /></button></Tooltip>
          </Popconfirm>
        </div>
      )
    }
  ];

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">有效云传数据</h2>
          <p className="mt-1 text-xs text-foreground-muted">共 {total} 条 · {stats.fileCount} 个文件 · {formatBytes(stats.fileBytes)}</p>
        </div>
        <form
          className="flex w-full gap-2 sm:w-auto"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setSearch(searchInput.trim());
          }}
        >
          <Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} allowClear placeholder="提取码、正文或文件名" className="min-w-0 sm:w-64" />
          <button className="admin-secondary-button" type="submit">查询</button>
        </form>
      </div>

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={items}
        scroll={{ x: 1120 }}
        pagination={{ current: page, pageSize: 50, total, showSizeChanger: false, onChange: setPage, showTotal: (count) => `共 ${count} 条` }}
      />

      <Modal title="云传隐私数据" open={Boolean(viewing)} onCancel={() => setViewing(null)} footer={null} centered width={720} destroyOnHidden>
        {viewing && (
          <div className="grid gap-5">
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-background-secondary p-4 text-sm sm:grid-cols-4">
              <div><div className="text-xs text-foreground-muted">提取码</div><div className="mt-1 font-mono font-semibold">{viewing.password}</div></div>
              <div><div className="text-xs text-foreground-muted">类型</div><div className="mt-1">{viewing.messageType}</div></div>
              <div className="col-span-2"><div className="text-xs text-foreground-muted">消息 ID</div><div className="mt-1 truncate font-mono text-xs">{viewing.messageId}</div></div>
            </div>
            <div>
              <div className="mb-2 text-sm font-medium text-foreground">文本内容</div>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-input p-3 text-sm leading-6 text-input-foreground">{viewing.content || '（无文本内容）'}</pre>
            </div>
            <div>
              <div className="mb-2 text-sm font-medium text-foreground">文件</div>
              {viewing.files.length === 0 ? <div className="text-sm text-foreground-muted">无文件</div> : (
                <div className="grid gap-2">
                  {viewing.files.map((file) => (
                    <a key={file.fileId} href={file.downloadUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5 text-sm hover:border-border-hover hover:bg-surface-hover">
                      <span className="min-w-0 truncate text-foreground">{file.relativePath || file.fileName}</span>
                      <span className="shrink-0 text-xs text-foreground-muted">{formatBytes(file.fileSize)}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal title="编辑云传信息" open={Boolean(editing)} onCancel={() => setEditing(null)} onOk={() => void save()} okText="保存" cancelText="取消" confirmLoading={saving} centered destroyOnHidden>
        <div className="grid gap-4">
          <label className="grid gap-1.5"><span className="text-sm font-medium">提取码</span><Input value={draftPassword} maxLength={4} onChange={(event) => setDraftPassword(event.target.value.replace(/[^A-Za-z0-9]/g, ''))} /></label>
          <label className="grid gap-1.5"><span className="text-sm font-medium">文本内容</span><Input.TextArea value={draftContent} rows={7} maxLength={200000} showCount onChange={(event) => setDraftContent(event.target.value)} /></label>
          <p className="text-xs text-foreground-muted">文件列表和原过期时间保持不变。</p>
        </div>
      </Modal>
    </section>
  );
}

type DataTableProps = {
  refreshToken: number;
  onUnauthorized: () => void;
  setNotice: (notice: Notice) => void;
};

type RoomDraft = {
  name: string;
  description: string;
  tags: string;
  isPrivate: boolean;
  passwordEnabled: boolean;
  password: string;
};

function RoomDataTable({ refreshToken, onUnauthorized, setNotice }: DataTableProps) {
  const [items, setItems] = useState<AdminRoomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminRoomItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<RoomDraft>({ name: '', description: '', tags: '', isPrivate: false, passwordEnabled: false, password: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminRequest<{ items: AdminRoomItem[] }>('/rooms');
      setItems(result.items);
    } catch (error) {
      handleAuthError(error, onUnauthorized);
      setNotice({ type: 'error', text: getErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized, setNotice]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const openEdit = (item: AdminRoomItem) => {
    setEditing(item);
    setDraft({ name: item.name, description: item.description, tags: item.tags.join(', '), isPrivate: item.isPrivate, passwordEnabled: item.hasPassword, password: '' });
  };

  const save = async () => {
    if (!editing || saving) return;
    setSaving(true);
    try {
      await adminRequest(`/rooms/${encodeURIComponent(editing.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...draft, tags: draft.tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean) })
      });
      setEditing(null);
      setNotice({ type: 'success', text: '星球信息已更新' });
      await load();
    } catch (error) {
      handleAuthError(error, onUnauthorized);
      setNotice({ type: 'error', text: getErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: AdminRoomItem) => {
    try {
      await adminRequest<void>(`/rooms/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      setNotice({ type: 'success', text: `星球“${item.name}”已删除` });
      await load();
    } catch (error) {
      handleAuthError(error, onUnauthorized);
      setNotice({ type: 'error', text: getErrorMessage(error) });
    }
  };

  const columns: TableColumnsType<AdminRoomItem> = [
    { title: '星球', dataIndex: 'name', width: 180, render: (value, item) => <div><div className="font-medium text-foreground">{value}</div><div className="mt-0.5 font-mono text-[11px] text-foreground-muted">#{item.code}</div></div> },
    { title: '类型', width: 110, render: (_, item) => <div className="flex flex-wrap gap-1">{item.isPrivate ? <Tag color="purple">私密</Tag> : <Tag color="green">公开</Tag>}{item.hasPassword && <Tag icon={<LockOutlined />}>密码</Tag>}</div> },
    { title: '拥有者', width: 190, ellipsis: true, render: (_, item) => <div><div className="truncate text-sm text-foreground-secondary">{item.ownerName}</div><div className="truncate font-mono text-[11px] text-foreground-muted">{item.ownerUserId ? `@${item.ownerUserId}` : item.ownerId}</div></div> },
    { title: '消息', dataIndex: 'messageCount', width: 88 },
    { title: '附件', width: 125, render: (_, item) => `${item.attachmentCount} / ${formatBytes(item.attachmentBytes)}` },
    { title: '在线', dataIndex: 'onlineCount', width: 74, render: (value) => <span className={value > 0 ? 'font-medium text-success' : 'text-foreground-muted'}>{value}</span> },
    { title: '最后活跃', dataIndex: 'lastMessageAt', width: 174, render: formatDate },
    {
      title: '操作',
      fixed: 'right',
      width: 156,
      render: (_, item) => (
        <div className="flex items-center gap-1">
          <Tooltip title="以超管身份进入"><Link href={`/soul/${encodeURIComponent(item.id)}`} target="_blank" className="admin-icon-button"><GlobalOutlined /></Link></Tooltip>
          <Tooltip title={item.isFixed ? '内置星球由代码维护' : '编辑'}><button type="button" disabled={item.isFixed} onClick={() => openEdit(item)} className="admin-icon-button disabled:opacity-35"><EditOutlined /></button></Tooltip>
          <Popconfirm disabled={item.isFixed} title="删除这个星球？" description="全部消息和附件都将永久删除。" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => void remove(item)}>
            <Tooltip title={item.isFixed ? '内置星球不可删除' : '删除'}><button type="button" disabled={item.isFixed} className="admin-icon-button hover:!text-danger disabled:opacity-35"><DeleteOutlined /></button></Tooltip>
          </Popconfirm>
        </div>
      )
    }
  ];

  const totals = useMemo(() => items.reduce((result, item) => ({ messages: result.messages + item.messageCount, bytes: result.bytes + item.attachmentBytes }), { messages: 0, bytes: 0 }), [items]);

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">全部聊天室</h2>
        <p className="mt-1 text-xs text-foreground-muted">公开及私密星球共 {items.length} 个 · {totals.messages} 条消息 · 附件 {formatBytes(totals.bytes)}</p>
      </div>
      <Table rowKey="id" loading={loading} columns={columns} dataSource={items} scroll={{ x: 1180 }} pagination={{ pageSize: 20, showSizeChanger: false, showTotal: (count) => `共 ${count} 个` }} />

      <Modal title="编辑星球信息" open={Boolean(editing)} onCancel={() => setEditing(null)} onOk={() => void save()} okText="保存" cancelText="取消" confirmLoading={saving} centered destroyOnHidden>
        <div className="grid gap-4">
          <label className="grid gap-1.5"><span className="text-sm font-medium">星球名称</span><Input value={draft.name} maxLength={32} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} /></label>
          <label className="grid gap-1.5"><span className="text-sm font-medium">描述</span><Input.TextArea value={draft.description} rows={3} maxLength={200} showCount onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} /></label>
          <label className="grid gap-1.5"><span className="text-sm font-medium">标签（逗号分隔）</span><Input value={draft.tags} onChange={(event) => setDraft((value) => ({ ...value, tags: event.target.value }))} /></label>
          <div className="flex items-center justify-between rounded-lg bg-background-secondary px-3 py-2.5"><span className="text-sm">私密星球</span><Switch checked={draft.isPrivate} onChange={(checked) => setDraft((value) => ({ ...value, isPrivate: checked }))} /></div>
          <div className="flex items-center justify-between rounded-lg bg-background-secondary px-3 py-2.5"><span className="text-sm">启用密码</span><Switch checked={draft.passwordEnabled} onChange={(checked) => setDraft((value) => ({ ...value, passwordEnabled: checked, password: checked ? value.password : '' }))} /></div>
          {draft.passwordEnabled && <label className="grid gap-1.5"><span className="text-sm font-medium">新密码</span><Input.Password value={draft.password} maxLength={4} placeholder="留空则保留原密码" onChange={(event) => setDraft((value) => ({ ...value, password: event.target.value.replace(/[^A-Za-z0-9]/g, '') }))} /></label>}
        </div>
      </Modal>
    </section>
  );
}

type ProfileDraft = {
  userId: string;
  name: string;
  bio: string;
  avatarUrl: string;
  bannerPreset: string;
};

const emptyProfileDraft: ProfileDraft = { userId: '', name: '', bio: '', avatarUrl: '', bannerPreset: 'sunrise' };

function UserDataTable({ refreshToken, onUnauthorized, setNotice }: DataTableProps) {
  const [items, setItems] = useState<AdminProfileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminProfileItem | 'new' | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>(emptyProfileDraft);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminRequest<{ items: AdminProfileItem[] }>('/users');
      setItems(result.items);
    } catch (error) {
      handleAuthError(error, onUnauthorized);
      setNotice({ type: 'error', text: getErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized, setNotice]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const openCreate = () => {
    setEditing('new');
    setDraft(emptyProfileDraft);
  };

  const openEdit = (profile: AdminProfileItem) => {
    setEditing(profile);
    setDraft({
      userId: profile.userId,
      name: profile.name,
      bio: profile.bio,
      avatarUrl: profile.avatarUrl,
      bannerPreset: profile.banner.type === 'preset' ? profile.banner.value : '__keep_image'
    });
  };

  const save = async () => {
    if (!editing || saving) return;
    setSaving(true);
    try {
      const banner = editing !== 'new' && draft.bannerPreset === '__keep_image' ? editing.banner : { type: 'preset', value: draft.bannerPreset };
      const body = JSON.stringify({ ...draft, banner });
      if (editing === 'new') await adminRequest('/users', { method: 'POST', body });
      else await adminRequest(`/users/${encodeURIComponent(editing.uuid)}`, { method: 'PATCH', body });
      setEditing(null);
      setNotice({ type: 'success', text: editing === 'new' ? '人员已创建' : '人员信息已更新' });
      await load();
    } catch (error) {
      handleAuthError(error, onUnauthorized);
      setNotice({ type: 'error', text: getErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (profile: AdminProfileItem) => {
    try {
      await adminRequest<void>(`/users/${encodeURIComponent(profile.uuid)}`, { method: 'DELETE' });
      setNotice({ type: 'success', text: `人员“${profile.name}”及关联数据已删除` });
      await load();
    } catch (error) {
      handleAuthError(error, onUnauthorized);
      setNotice({ type: 'error', text: getErrorMessage(error) });
    }
  };

  const columns: TableColumnsType<AdminProfileItem> = [
    { title: '人员', width: 180, render: (_, profile) => <div><div className="font-medium text-foreground">{profile.name} {profile.isSystem && <Tag className="ml-1">系统</Tag>}</div><div className="mt-0.5 font-mono text-xs text-foreground-muted">@{profile.userId}</div></div> },
    { title: 'UUID', dataIndex: 'uuid', width: 285, ellipsis: true, render: (value) => <span className="font-mono text-xs text-foreground-secondary">{value || '系统账户'}</span> },
    { title: '个人描述', dataIndex: 'bio', ellipsis: true, render: (value) => <span className="text-foreground-secondary">{value || '—'}</span> },
    { title: '创建时间', dataIndex: 'createdAt', width: 174, render: formatDate },
    { title: '更新时间', dataIndex: 'updatedAt', width: 174, render: formatDate },
    {
      title: '操作',
      fixed: 'right',
      width: 112,
      render: (_, profile) => (
        <div className="flex items-center gap-1">
          <Tooltip title={profile.isSystem ? '系统账户不可编辑' : '编辑'}><button type="button" disabled={profile.isSystem} onClick={() => openEdit(profile)} className="admin-icon-button disabled:opacity-35"><EditOutlined /></button></Tooltip>
          <Popconfirm disabled={profile.isSystem} title="删除这个人员？" description="其创建的星球、发送的消息和媒体文件也会被删除。" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => void remove(profile)}>
            <Tooltip title={profile.isSystem ? '系统账户不可删除' : '删除'}><button type="button" disabled={profile.isSystem} className="admin-icon-button hover:!text-danger disabled:opacity-35"><DeleteOutlined /></button></Tooltip>
          </Popconfirm>
        </div>
      )
    }
  ];

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold text-foreground">全部人员</h2><p className="mt-1 text-xs text-foreground-muted">共 {items.length} 个资料账户，包含系统账户</p></div>
        <button type="button" onClick={openCreate} className="admin-primary-button"><PlusOutlined /> 新增人员</button>
      </div>
      <Table rowKey={(profile) => profile.uuid || profile.userId} loading={loading} columns={columns} dataSource={items} scroll={{ x: 1120 }} pagination={{ pageSize: 20, showSizeChanger: false, showTotal: (count) => `共 ${count} 人` }} />

      <Modal title={editing === 'new' ? '新增人员' : '编辑人员信息'} open={Boolean(editing)} onCancel={() => setEditing(null)} onOk={() => void save()} okText="保存" cancelText="取消" confirmLoading={saving} centered destroyOnHidden>
        <div className="grid gap-4">
          <label className="grid gap-1.5"><span className="text-sm font-medium">个人名称</span><Input value={draft.name} maxLength={32} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} /></label>
          <label className="grid gap-1.5"><span className="text-sm font-medium">专属 ID</span><Input value={draft.userId} maxLength={20} prefix="@" onChange={(event) => setDraft((value) => ({ ...value, userId: event.target.value.replace(/[^A-Za-z0-9]/g, '') }))} /></label>
          <label className="grid gap-1.5"><span className="text-sm font-medium">个人描述</span><Input.TextArea value={draft.bio} rows={3} maxLength={160} showCount onChange={(event) => setDraft((value) => ({ ...value, bio: event.target.value }))} /></label>
          <label className="grid gap-1.5"><span className="text-sm font-medium">头像地址</span><Input value={draft.avatarUrl} placeholder="留空使用默认头像，或填写已有 /uploads/profile/... 地址" onChange={(event) => setDraft((value) => ({ ...value, avatarUrl: event.target.value }))} /></label>
          <label className="grid gap-1.5"><span className="text-sm font-medium">背景预设</span><Select value={draft.bannerPreset} onChange={(value) => setDraft((current) => ({ ...current, bannerPreset: value }))} options={[...(draft.bannerPreset === '__keep_image' ? [{ value: '__keep_image', label: '保留现有自定义背景' }] : []), ...([['sunrise', '日出'], ['coral', '珊瑚'], ['aurora', '极光'], ['lagoon', '海湾'], ['violet', '暮紫'], ['midnight', '夜航']] as const).map(([value, label]) => ({ value, label }))]} /></label>
        </div>
      </Modal>
    </section>
  );
}

function Dashboard({ admin, onLogout, onUnauthorized }: { admin: AdminIdentity; onLogout: () => Promise<void>; onUnauthorized: () => void }) {
  const [tab, setTab] = useState<AdminTab>('cloud');
  const [refreshToken, setRefreshToken] = useState(0);
  const [notice, setNotice] = useState<Notice>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const tabs: Array<{ key: AdminTab; label: string; icon: React.ReactNode }> = [
    { key: 'cloud', label: '云传数据', icon: <CloudOutlined /> },
    { key: 'rooms', label: '聊天室', icon: <GlobalOutlined /> },
    { key: 'users', label: '人员数据', icon: <TeamOutlined /> }
  ];

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const verify = () => {
      adminRequest('/session').catch((error) => handleAuthError(error, onUnauthorized));
    };
    const timer = window.setInterval(verify, 30_000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') verify();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [onUnauthorized]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-[1480px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"><SafetyCertificateOutlined /></div>
            <div className="min-w-0"><div className="truncate text-sm font-semibold text-foreground">Soul 管理控制台</div><div className="truncate text-[11px] text-foreground-muted">{admin.displayName} · {admin.username}</div></div>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip title="刷新当前数据"><button type="button" onClick={() => setRefreshToken((value) => value + 1)} className="admin-header-button"><ReloadOutlined /></button></Tooltip>
            <ThemeToggle />
            <button
              type="button"
              disabled={loggingOut}
              onClick={() => {
                setLoggingOut(true);
                void onLogout().finally(() => setLoggingOut(false));
              }}
              className="admin-header-button px-3"
            >
              {loggingOut ? <LoadingOutlined /> : <LogoutOutlined />}<span className="hidden sm:inline">退出</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1 shadow-sm">
          {tabs.map((item) => (
            <button key={item.key} type="button" onClick={() => setTab(item.key)} className={`inline-flex min-w-max items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === item.key ? 'bg-primary text-white shadow-sm' : 'text-foreground-secondary hover:bg-surface-hover hover:text-foreground'}`}>
              {item.icon}{item.label}
            </button>
          ))}
        </div>

        {notice && <div className={`mb-5 rounded-lg px-4 py-3 text-sm ${notice.type === 'error' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'}`}>{notice.text}</div>}

        <div className="overflow-hidden rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-5">
          {tab === 'cloud' && <CloudDataTable refreshToken={refreshToken} onUnauthorized={onUnauthorized} setNotice={setNotice} />}
          {tab === 'rooms' && <RoomDataTable refreshToken={refreshToken} onUnauthorized={onUnauthorized} setNotice={setNotice} />}
          {tab === 'users' && <UserDataTable refreshToken={refreshToken} onUnauthorized={onUnauthorized} setNotice={setNotice} />}
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    adminRequest<{ admin: AdminIdentity }>('/session')
      .then((result) => setAdmin(result.admin))
      .catch(() => setAdmin(null))
      .finally(() => setChecking(false));
  }, []);

  const logout = async () => {
    try {
      await adminRequest<void>('/session', { method: 'DELETE' });
    } finally {
      setAdmin(null);
    }
  };

  if (checking) {
    return <main className="flex min-h-screen items-center justify-center bg-background text-foreground-secondary"><div className="inline-flex items-center gap-2 text-sm"><LoadingOutlined className="text-primary" /> 正在验证管理员身份...</div></main>;
  }

  if (!admin) return <LoginScreen onLogin={setAdmin} />;
  return <Dashboard admin={admin} onLogout={logout} onUnauthorized={() => setAdmin(null)} />;
}
