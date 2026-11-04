'use client';

import { Input } from '@/components/ui/input';

import { Button } from '@/components/ui/button';
import {
  CheckOutlined,
  CloseOutlined,
  CopyOutlined,
  GlobalOutlined,
  LoadingOutlined,
  LockOutlined,
  ReloadOutlined,
  ShareAltOutlined,
  UserDeleteOutlined
} from '@ant-design/icons';
import { Tag } from 'antd';
import { Modal } from '@/components/ui/modal';
import { Popconfirm } from '@/components/ui/popconfirm';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { soulChat } from '../../core';
import type { ChatRoom, RoomAccessManagement, RoomAccessRecord } from '../../core/types';

type Props = {
  room: ChatRoom | null;
  open: boolean;
  onClose: () => void;
};

type ShareState = 'idle' | 'shared' | 'copied' | 'error';

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知';
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false });
}

function Applicant({ record, actions }: { record: RoomAccessRecord; actions?: React.ReactNode }) {
  const status =
    record.status === 'pending' ? <Tag color="gold">待处理</Tag>
      : record.status === 'rejected' ? <Tag color="red">{record.attemptCount >= 5 ? '已达上限' : '已拒绝'}</Tag>
        : record.status === 'revoked' ? <Tag>已撤权</Tag>
          : record.source === 'invite' ? <Tag color="blue">邀请加入</Tag>
            : <Tag color="green">已同意</Tag>;
  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      {record.requesterAvatarUrl ? (
        <Image src={record.requesterAvatarUrl} alt="" width={36} height={36} className="h-9 w-9 rounded-full object-cover" />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">{record.requesterName.slice(0, 1)}</div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5"><span className="truncate text-sm font-medium text-foreground">{record.requesterName}</span>{status}</div>
        <div className="mt-0.5 truncate text-xs text-foreground-muted">@{record.requesterUserId} · 申请 {record.attemptCount} 次 · {formatDateTime(record.updatedAt)}</div>
      </div>
      {actions && <div className="flex shrink-0 gap-1.5">{actions}</div>}
    </div>
  );
}

export function RoomInfoModal({ room, open, onClose }: Props) {
  const [shareState, setShareState] = useState<ShareState>('idle');
  const [idCopied, setIdCopied] = useState(false);
  const [management, setManagement] = useState<RoomAccessManagement | null>(null);
  const [managementLoading, setManagementLoading] = useState(false);
  const [managementError, setManagementError] = useState('');
  const [actingId, setActingId] = useState('');
  const [passwordEditing, setPasswordEditing] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordNotice, setPasswordNotice] = useState('');

  const loadManagement = useCallback(async () => {
    if (!room?.isPrivate || !room.isCreator) return;
    setManagementLoading(true);
    setManagementError('');
    try {
      setManagement(await soulChat.getRoomAccessManagement());
    } catch (error) {
      setManagementError(error instanceof Error ? error.message : '访问数据加载失败');
    } finally {
      setManagementLoading(false);
    }
  }, [room?.isCreator, room?.isPrivate]);

  useEffect(() => {
    if (!open) return;
    setShareState('idle');
    setIdCopied(false);
    setManagement(null);
    setManagementError('');
    void loadManagement();
  }, [loadManagement, open, room?.id, room?.pendingRequestCount]);

  useEffect(() => {
    setPasswordEditing(false);
    setPassword('');
    setPasswordError('');
    setPasswordNotice('');
  }, [open, room?.id]);

  const savePassword = async (enabled: boolean) => {
    if (!room?.isCreator || room.isPrivate || passwordSaving) return;
    if (enabled && !/^[A-Za-z0-9]{2,4}$/.test(password)) {
      setPasswordError('请输入 2-4 位数字或字母');
      return;
    }
    setPasswordSaving(true);
    setPasswordError('');
    setPasswordNotice('');
    try {
      await soulChat.updateRoom({
        roomId: room.id,
        name: room.name,
        description: room.description,
        tags: room.tags,
        isPrivate: room.isPrivate,
        passwordEnabled: enabled,
        password: enabled ? password : ''
      });
      setPasswordEditing(false);
      setPassword('');
      setPasswordNotice(enabled ? '密码已保存，其他用户下次进入时需验证新密码。' : '密码已撤销，其他用户可直接进入。');
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : '密码设置失败，请重试');
    } finally {
      setPasswordSaving(false);
    }
  };

  const buildShareUrl = () => {
    if (!room) return '';
    const url = new URL(`/soul/${encodeURIComponent(room.id)}`, window.location.origin);
    if (room.isPrivate && room.isCreator && management?.inviteToken) url.searchParams.set('invite', management.inviteToken);
    return url.href;
  };

  const handleShare = async () => {
    if (!room) return;
    if (room.isPrivate && room.isCreator && !management?.inviteToken) {
      setShareState('error');
      return;
    }
    const url = buildShareUrl();
    try {
      if (navigator.share) {
        await navigator.share({ title: room.name, text: room.description || `邀请你加入星球“${room.name}”`, url });
        setShareState('shared');
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShareState('copied');
      } else {
        setShareState('error');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setShareState('error');
    }
  };

  const copyRoomId = async () => {
    if (!room || !navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(room.code);
    setIdCopied(true);
  };

  const rotateInvite = async () => {
    setManagementError('');
    try {
      const inviteToken = await soulChat.rotateRoomInvite();
      setManagement((current) => current ? { ...current, inviteToken } : current);
      setShareState('idle');
    } catch (error) {
      setManagementError(error instanceof Error ? error.message : '重新生成邀请链接失败');
    }
  };

  const decide = async (record: RoomAccessRecord, decision: 'approved' | 'rejected') => {
    setActingId(record.id);
    setManagementError('');
    try {
      setManagement(await soulChat.decideRoomAccess(record.requesterId, decision));
    } catch (error) {
      setManagementError(error instanceof Error ? error.message : '申请处理失败');
    } finally {
      setActingId('');
    }
  };

  const revoke = async (record: RoomAccessRecord) => {
    setActingId(record.id);
    setManagementError('');
    try {
      setManagement(await soulChat.revokeRoomAccess(record.requesterId));
    } catch (error) {
      setManagementError(error instanceof Error ? error.message : '撤销授权失败');
    } finally {
      setActingId('');
    }
  };

  return (
    <Modal title="星球信息" open={open && Boolean(room)} onCancel={onClose} footer={null} centered destroyOnHidden width={680}>
      {room && (
        <div className="max-h-[75vh] overflow-y-auto pr-1 pt-1">
          <div className="flex items-start gap-3 border-b border-border pb-4 pt-1">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">{room.isPrivate ? <LockOutlined /> : <GlobalOutlined />}</div>
            <div className="min-w-0 flex-1"><h2 className="truncate text-lg font-semibold text-foreground">{room.name}</h2><div className="mt-1 font-mono text-xs font-medium tracking-wider text-primary">ID · {room.code}</div></div>
            <Button size="sm" variant="outline" type="button" onClick={() => void copyRoomId()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"><CopyOutlined />{idCopied ? '已复制' : '复制 ID'}</Button>
          </div>

          <section className="mt-5"><h3 className="text-xs font-medium text-foreground-muted">简介</h3><p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-foreground-secondary">{room.description || '暂无简介'}</p></section>
          {room.tags.length > 0 && <section className="mt-4"><h3 className="text-xs font-medium text-foreground-muted">标签</h3><div className="mt-2 flex flex-wrap gap-1.5">{room.tags.map((tag) => <span key={tag} className="rounded-sm bg-surface-inset px-2 py-1 text-xs font-medium text-foreground-secondary">{tag}</span>)}</div></section>}

          <dl className="mt-5 rounded-lg bg-surface-inset px-4 py-2 text-sm">
            <div className="flex items-center justify-between gap-4 py-2"><dt className="text-foreground-muted">可见范围</dt><dd className="font-medium text-foreground">{room.isPrivate ? '私密星球' : '公开星球'}</dd></div>
            {!room.isPrivate && <div className="flex items-center justify-between gap-4 py-2"><dt className="text-foreground-muted">进入密码</dt><dd className="font-medium text-foreground">{room.hasPassword ? '已设置' : '未设置'}</dd></div>}
            <div className="flex items-center justify-between gap-4 py-2"><dt className="text-foreground-muted">创建人</dt><dd className="font-medium text-foreground">{room.owner.name}{room.owner.userId ? ` @${room.owner.userId}` : ''}</dd></div>
            <div className="flex items-center justify-between gap-4 py-2"><dt className="text-foreground-muted">创建时间</dt><dd className="font-medium text-foreground">{formatCreatedAt(room.createdAt)}</dd></div>
          </dl>

          {!room.isPrivate && room.isCreator && (
            <section className="mt-6 border-t border-border pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">管理进入密码</h3>
                  <p className="mt-1 text-xs text-foreground-muted">创建者和超管无需密码；修改密码后，其他用户需重新验证。</p>
                </div>
                {!passwordEditing && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost"
                      type="button"
                      disabled={passwordSaving}
                      onClick={() => { setPasswordEditing(true); setPassword(''); setPasswordError(''); setPasswordNotice(''); }}
                      className="px-3 py-1.5 text-xs font-medium"
                    >
                      {room.hasPassword ? '修改密码' : '设置密码'}
                    </Button>
                    {room.hasPassword && (
                      <Popconfirm title="撤销进入密码？" description="撤销后，其他用户可直接进入该公开星球。" okText="撤销密码" cancelText="取消" okButtonProps={{ loading: passwordSaving }} onConfirm={() => savePassword(false)}>
                        <Button size="sm" variant="ghost" type="button" disabled={passwordSaving} className="px-3 py-1.5 text-xs font-medium">撤销密码</Button>
                      </Popconfirm>
                    )}
                  </div>
                )}
              </div>
              {passwordEditing && (
                <form className="mt-4" onSubmit={(event) => { event.preventDefault(); void savePassword(true); }}>
                  <label htmlFor="room-info-password" className="mb-1.5 block text-sm font-medium text-foreground">{room.hasPassword ? '新密码' : '进入密码'}</label>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      id="room-info-password"
                      type="password"
                      value={password}
                      minLength={2}
                      maxLength={4}
                      required
                      autoComplete="new-password"
                      disabled={passwordSaving}
                      onChange={(event) => setPassword(event.target.value.replace(/[^A-Za-z0-9]/g, ''))}
                      placeholder="输入 2-4 位数字或字母"
                      className="min-w-0 flex-1"
                    />
                    <Button variant="primary" type="submit" disabled={passwordSaving || !/^[A-Za-z0-9]{2,4}$/.test(password)} className="px-4 py-2 text-sm font-medium">{passwordSaving ? '保存中...' : '保存密码'}</Button>
                    <Button variant="ghost" type="button" disabled={passwordSaving} onClick={() => { setPasswordEditing(false); setPassword(''); setPasswordError(''); }} className="px-3 py-2 text-sm font-medium">取消</Button>
                  </div>
                </form>
              )}
              {passwordError && <p role="alert" className="mt-3 text-xs text-danger">{passwordError}</p>}
              {passwordNotice && <p role="status" className="mt-3 text-xs text-success">{passwordNotice}</p>}
            </section>
          )}

          {room.isPrivate && room.isCreator && (
            <section className="mt-6 border-t border-border pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><h3 className="text-sm font-semibold text-foreground">访问申请与成员</h3><p className="mt-0.5 text-xs text-foreground-muted">待处理 {management?.pendingCount ?? room.pendingRequestCount} 人 · 已授权 {management?.members.length ?? 0} 人</p></div>
                <Button size="sm" variant="outline" type="button" disabled={managementLoading} onClick={() => void loadManagement()} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs"><ReloadOutlined className={managementLoading ? 'animate-spin' : ''} />刷新</Button>
              </div>
              {managementLoading && !management ? <div className="py-8 text-center text-sm text-foreground-muted"><LoadingOutlined className="mr-2" />加载中...</div> : (
                <>
                  <div className="mt-4"><div className="mb-2 text-xs font-medium text-foreground-muted">申请记录</div><div className="grid gap-2">
                    {management?.applications.length ? management.applications.map((record) => <Applicant key={record.id} record={record} actions={record.status === 'pending' ? <><Button size="sm" aria-label="同意" variant="ghost" iconOnly type="button" disabled={actingId === record.id} onClick={() => void decide(record, 'approved')} className="inline-flex h-8 w-8 items-center justify-center" title="同意"><CheckOutlined /></Button><Button size="sm" aria-label="拒绝" variant="ghost" iconOnly type="button" disabled={actingId === record.id} onClick={() => void decide(record, 'rejected')} className="inline-flex h-8 w-8 items-center justify-center" title="拒绝"><CloseOutlined /></Button></> : undefined} />) : <div className="rounded-md bg-surface-inset px-3 py-5 text-center text-sm text-foreground-muted">暂无申请记录</div>}
                  </div></div>
                  <div className="mt-4"><div className="mb-2 text-xs font-medium text-foreground-muted">已授权成员</div><div className="grid gap-2">
                    {management?.members.length ? management.members.map((record) => <Applicant key={record.id} record={record} actions={<Popconfirm title="删除该成员的访问权限？" description="如果对方正在聊天室，将被立即移出。" okText="删除授权" cancelText="取消" onConfirm={() => void revoke(record)}><Button size="sm" aria-label="删除授权" variant="ghost" iconOnly type="button" disabled={actingId === record.id} className="inline-flex h-8 w-8 items-center justify-center" title="删除授权"><UserDeleteOutlined /></Button></Popconfirm>} />) : <div className="rounded-md bg-surface-inset px-3 py-5 text-center text-sm text-foreground-muted">暂无已授权成员</div>}
                  </div></div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-inset px-3 py-2.5"><div><div className="text-sm font-medium text-foreground">免审邀请链接</div><div className="mt-0.5 text-xs text-foreground-muted">重新生成后，原链接立即失效。</div></div><Popconfirm title="重新生成邀请链接？" description="原链接将立即失效，已授权成员不受影响。" okText="重新生成" cancelText="取消" onConfirm={() => void rotateInvite()}><Button size="sm" variant="outline" type="button" className="px-3 py-1.5 text-xs font-medium">重新生成</Button></Popconfirm></div>
                </>
              )}
              {managementError && <p className="mt-3 text-xs text-danger">{managementError}</p>}
            </section>
          )}

          {shareState === 'error' && <p className="mt-3 text-xs text-danger">分享失败，请稍后重试。</p>}
          <div className="mt-5 flex justify-end gap-2 pt-3">
            <Button variant="ghost" type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium">关闭</Button>
            <Button variant="primary" type="button" disabled={room.isPrivate && room.isCreator && !management?.inviteToken} onClick={() => void handleShare()} className="inline-flex min-w-28 items-center justify-center gap-2 px-4 py-2 text-sm font-medium"><ShareAltOutlined />{shareState === 'shared' ? '已分享' : shareState === 'copied' ? '链接已复制' : room.isPrivate && room.isCreator ? '分享免审链接' : '分享星球'}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
