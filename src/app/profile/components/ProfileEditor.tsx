'use client';

import { CameraOutlined, DeleteOutlined, LoadingOutlined, PictureOutlined } from '@ant-design/icons';
import { Modal } from 'antd';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { updateCurrentProfile, uploadProfileMedia } from '../client';
import { BANNER_PRESETS, getProfileAvatar, type ProfileUpdateInput, type PublicProfile } from '../types';
import { ProfileBannerView } from './ProfileBanner';

type ProfileEditorProps = {
  open: boolean;
  profile: PublicProfile;
  uuid: string;
  onClose: () => void;
  onSaved: (profile: PublicProfile) => void;
};

export function ProfileEditor({ open, profile, uuid, onClose, onSaved }: ProfileEditorProps) {
  const [draft, setDraft] = useState<ProfileUpdateInput>({ ...profile });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'avatar' | 'banner' | ''>('');
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraft({ userId: profile.userId, name: profile.name, bio: profile.bio, avatarUrl: profile.avatarUrl, banner: profile.banner });
    setError('');
    setSaving(false);
    setUploading('');
  }, [open, profile]);

  const upload = async (file: File | undefined, kind: 'avatar' | 'banner') => {
    if (!file || uploading) return;
    setUploading(kind);
    setError('');
    try {
      const url = await uploadProfileMedia(file, kind);
      setDraft((current) => (kind === 'avatar' ? { ...current, avatarUrl: url } : { ...current, banner: { type: 'image', value: url } }));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '上传失败，请重试');
    } finally {
      setUploading('');
      if (kind === 'avatar' && avatarInputRef.current) avatarInputRef.current.value = '';
      if (kind === 'banner' && bannerInputRef.current) bannerInputRef.current.value = '';
    }
  };

  const save = async () => {
    if (saving || uploading) return;
    const userId = draft.userId.trim();
    const name = draft.name.trim();
    if (!/^[A-Za-z0-9]{3,20}$/.test(userId)) {
      setError('userId 需为 3-20 位数字或字母');
      return;
    }
    if (!name) {
      setError('请输入个人名称');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const updated = await updateCurrentProfile({ ...draft, userId, name, bio: draft.bio.trim() });
      onSaved(updated);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const compactUuid = uuid ? `${uuid.slice(0, 8)} ···· ${uuid.slice(-8)}` : '读取中…';

  return (
    <Modal open={open} onCancel={onClose} footer={null} centered destroyOnHidden width={680} title={null} styles={{ body: { padding: 0 } }}>
      <div className="overflow-hidden rounded-xl bg-surface">
        <div className="relative">
          <ProfileBannerView banner={draft.banner} className="h-36 sm:h-44" />
          <button
            type="button"
            onClick={() => bannerInputRef.current?.click()}
            disabled={Boolean(uploading)}
            className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-lg border border-white/30 bg-black/35 px-3 py-2 text-xs font-medium text-white backdrop-blur-md transition-colors hover:bg-black/50 disabled:opacity-60"
          >
            {uploading === 'banner' ? <LoadingOutlined /> : <PictureOutlined />}
            上传背景
          </button>
          <input ref={bannerInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(event) => void upload(event.target.files?.[0], 'banner')} />
        </div>

        <div className="px-5 pb-5 sm:px-7 sm:pb-7">
          <div className="relative -mt-10 mb-5 h-20 w-20">
            <Image
              src={getProfileAvatar({ avatarUrl: draft.avatarUrl, publicKey: profile.publicKey, userId: draft.userId || profile.userId })}
              alt="头像预览"
              fill
              sizes="80px"
              unoptimized
              className="rounded-full border-4 border-surface bg-surface-active object-cover shadow-md"
            />
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={Boolean(uploading)}
              className="absolute -bottom-1 -right-1 inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-primary text-white shadow-sm transition-transform hover:scale-105 disabled:opacity-60"
              aria-label="上传头像"
            >
              {uploading === 'avatar' ? <LoadingOutlined /> : <CameraOutlined />}
            </button>
            <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(event) => void upload(event.target.files?.[0], 'avatar')} />
          </div>

          <div className="grid gap-5">
            <label className="grid gap-1.5">
              <span className="text-sm font-medium text-foreground">个人名称</span>
              <input
                value={draft.name}
                maxLength={32}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                className="h-10 rounded-lg border border-border bg-input px-3 text-sm text-input-foreground outline-none transition focus:border-border-focus focus:bg-input-focus focus:ring-2 focus:ring-ring/15"
                placeholder="你想被怎样称呼"
              />
            </label>

            <label className="grid gap-1.5">
              <span className="flex items-center justify-between gap-3 text-sm font-medium text-foreground">
                <span>userId</span>
                <span className="text-xs font-normal text-foreground-muted">3-20 位，仅数字或字母</span>
              </span>
              <div className="flex h-10 items-center rounded-lg border border-border bg-input px-3 transition focus-within:border-border-focus focus-within:bg-input-focus focus-within:ring-2 focus-within:ring-ring/15">
                <span className="mr-0.5 text-sm text-foreground-muted">@</span>
                <input
                  value={draft.userId}
                  maxLength={20}
                  onChange={(event) => setDraft((current) => ({ ...current, userId: event.target.value.replace(/[^A-Za-z0-9]/g, '') }))}
                  className="min-w-0 flex-1 bg-transparent text-sm text-input-foreground outline-none"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
            </label>

            <label className="grid gap-1.5">
              <span className="flex items-center justify-between gap-3 text-sm font-medium text-foreground">
                <span>个人描述</span>
                <span className="text-xs font-normal text-foreground-muted">{draft.bio.length}/160</span>
              </span>
              <textarea
                value={draft.bio}
                maxLength={160}
                rows={3}
                onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))}
                className="resize-none rounded-lg border border-border bg-input px-3 py-2.5 text-sm leading-relaxed text-input-foreground outline-none transition focus:border-border-focus focus:bg-input-focus focus:ring-2 focus:ring-ring/15"
                placeholder="介绍一下你自己，或者写下此刻想说的话"
              />
            </label>

            <div>
              <div className="mb-2 text-sm font-medium text-foreground">背景色彩</div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {BANNER_PRESETS.map((preset) => {
                  const selected = draft.banner.type === 'preset' && draft.banner.value === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setDraft((current) => ({ ...current, banner: { type: 'preset', value: preset.id } }))}
                      className={`group rounded-lg border p-1 transition ${selected ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-border-hover'}`}
                      aria-label={`使用${preset.label}背景`}
                    >
                      <span className={`block h-9 rounded-md bg-gradient-to-br ${preset.className}`} />
                      <span className="mt-1 block text-[11px] text-foreground-secondary">{preset.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background-secondary px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-xs font-medium text-foreground">浏览器 UUID</div>
                <div className="mt-0.5 truncate font-mono text-xs text-foreground-muted">{compactUuid}</div>
              </div>
              <span className="shrink-0 rounded-full bg-success-soft px-2 py-1 text-[11px] font-medium text-success">永久绑定</span>
            </div>
          </div>

          {error && <div className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
            <button
              type="button"
              onClick={() => setDraft((current) => ({ ...current, avatarUrl: '' }))}
              disabled={!draft.avatarUrl || Boolean(uploading)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-foreground-secondary transition-colors hover:bg-surface-active hover:text-danger disabled:pointer-events-none disabled:opacity-40"
            >
              <DeleteOutlined /> 恢复默认头像
            </button>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-active">
                取消
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || Boolean(uploading)}
                className="inline-flex min-w-24 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-55"
              >
                {saving && <LoadingOutlined />}
                {saving ? '保存中' : '保存资料'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
