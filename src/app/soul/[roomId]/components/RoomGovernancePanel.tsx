'use client';

import { Button } from '@/components/ui/button';
import { Popconfirm } from '@/components/ui/popconfirm';
import { Tag } from '@/components/ui/display';
import { Textarea } from '@/components/ui/textarea';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { ensureCurrentProfile } from '../../../profile/client';
import { soulChat } from '../../core';
import type { ChatRoom, RoomMember } from '../../core/types';
import { useSoulStore } from '../../store';

const ROLE_LABEL = { owner: '创建者', admin: '管理员', member: '' } as const;

function NoticeEditor({ title, hint, value, maxLength, canEdit, onSave }: { title: string; hint: string; value: string; maxLength: number; canEdit: boolean; onSave: (text: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (!editing) setDraft(value); }, [editing, value]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave(draft);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-lg bg-surface-inset px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-foreground-muted">{title}</h3>
        {canEdit && !editing && <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(true)} className="px-2 py-1 text-xs">{value ? '编辑' : '添加'}</Button>}
      </div>
      {editing ? (
        <div className="mt-1.5">
          <Textarea rows={4} maxLength={maxLength} showCount value={draft} placeholder={hint} aria-label={title} disabled={saving} onChange={(event) => setDraft(event.target.value)} />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" type="button" disabled={saving} onClick={() => { setEditing(false); setError(''); }}>取消</Button>
            <Button size="sm" variant="primary" type="button" disabled={saving || draft.trim() === value} onClick={() => void save()}>{saving ? '保存中...' : '保存'}</Button>
          </div>
          {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
        </div>
      ) : (
        <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-foreground-secondary">{value || `暂无${title}`}</p>
      )}
    </section>
  );
}

function MemberRow({ member, canKick, busy, onKick }: { member: RoomMember; canKick: boolean; busy: boolean; onKick: () => void }) {
  return (
    <div className="flex items-center gap-3 py-2">
      {member.avatarUrl ? (
        <Image src={member.avatarUrl} alt="" width={32} height={32} unoptimized className="h-8 w-8 rounded-full object-cover" />
      ) : (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">{member.name.slice(0, 1)}</div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">{member.name}</span>
          {member.role !== 'member' && <Tag color={member.role === 'owner' ? 'gold' : 'blue'}>{ROLE_LABEL[member.role]}</Tag>}
        </div>
        <div className="truncate text-xs text-foreground-muted">@{member.userId} · {member.online ? '在线' : '离线'}</div>
      </div>
      {canKick && (
        <Popconfirm title={`移出 ${member.name}？`} description="对方将被立即移出星球。" okText="移出" cancelText="取消" onConfirm={onKick}>
          <Button size="sm" variant="ghost" type="button" disabled={busy} className="px-2 py-1 text-xs text-danger">移出</Button>
        </Popconfirm>
      )}
    </div>
  );
}

export function RoomNoticeSection({ room }: { room: ChatRoom }) {
  const canManage = room.isOwner === true;
  return (
    <div className="mt-5 grid gap-3">
      <NoticeEditor title="公告" hint="向所有成员发布公告（最多 500 字）" value={room.announcement?.text || ''} maxLength={500} canEdit={canManage} onSave={(text) => soulChat.updateRoomAnnouncement(text)} />
      <NoticeEditor title="群规" hint="写下这个星球的规则（最多 2000 字）" value={room.rules?.text || ''} maxLength={2000} canEdit={canManage} onSave={(text) => soulChat.updateRoomRules(text)} />
    </div>
  );
}

export function RoomMembersSection({ room, open }: { room: ChatRoom; open: boolean }) {
  const membersVersion = useSoulStore((s) => s.membersVersion);
  const [members, setMembers] = useState<RoomMember[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [selfId, setSelfId] = useState('');
  const canManage = room.isOwner === true;

  useEffect(() => {
    if (!open) return;
    void ensureCurrentProfile().then((profile) => setSelfId(profile.userId)).catch(() => undefined);
  }, [open]);

  const load = useCallback(async () => {
    try {
      setMembers(await soulChat.listRoomMembers());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '成员列表加载失败');
    }
  }, []);

  useEffect(() => { if (open) void load(); }, [load, open, membersVersion]);

  const kick = async (member: RoomMember) => {
    setBusyId(member.userId);
    setError('');
    try {
      setMembers(await soulChat.kickRoomMember(member.userId));
    } catch (e) {
      setError(e instanceof Error ? e.message : '移出失败');
    } finally {
      setBusyId('');
    }
  };

  return (
    <section>
      <p className="text-xs text-foreground-muted">{members ? `${members.length} 位成员` : '加载中...'}{!room.isPrivate && ' · 公开星球仅显示在线成员'}</p>
      <div className="mt-1 divide-y divide-border">
        {members === null ? null : members.length === 0 ? <div className="py-6 text-center text-sm text-foreground-muted">暂无成员</div> : members.map((member) => (
          <MemberRow key={member.userId} member={member} busy={busyId === member.userId} canKick={canManage && member.role !== 'owner' && member.role !== 'admin' && member.userId !== selfId} onKick={() => void kick(member)} />
        ))}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
    </section>
  );
}
