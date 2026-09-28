'use client';

import { CameraOutlined, CheckOutlined, CloseOutlined, EditOutlined, LoadingOutlined, PictureOutlined, PlusOutlined } from '@ant-design/icons';
import { Popover } from 'antd';
import Image from 'next/image';
import { useRef, useState } from 'react';
import { ImagePreview } from '@/components/image-viewer/ImagePreview';
import { ContactActions } from '@/app/social/ContactActions';
import { updateCurrentProfile, uploadProfileMedia } from '../client';
import { BANNER_PRESETS, getProfileAvatar, type ProfileUpdateInput, type PublicProfile } from '../types';
import { ProfileBannerView } from './ProfileBanner';

type EditableField = 'name' | 'userId' | 'bio';
type Props = {
  profile: PublicProfile;
  isOwner: boolean;
  onSaved: (profile: PublicProfile) => void;
  onCompose: () => void;
};

export function ProfileIdentity({ profile, isOwner, onSaved, onCompose }: Props) {
  const [editing, setEditing] = useState<EditableField | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [appearance, setAppearance] = useState<'avatar' | 'banner' | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);
  const canEdit = isOwner && !profile.isSystem;
  const controlsDisabled = busy || editing !== null;

  const persist = async (changes: Partial<ProfileUpdateInput>) => {
    const updated = await updateCurrentProfile({
      name: profile.name, userId: profile.userId, bio: profile.bio,
      avatarUrl: profile.avatarUrl, banner: profile.banner, ...changes
    });
    onSaved(updated);
    setEditing(null);
    setAppearance(null);
    setSaved(true);
  };

  const save = async (changes: Partial<ProfileUpdateInput>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setSaved(false);
    try { await persist(changes); }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : '保存失败，请重试'); }
    finally { setBusy(false); }
  };

  const upload = async (file: File | undefined, kind: 'avatar' | 'banner') => {
    if (!file || controlsDisabled) return;
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const url = await uploadProfileMedia(file, kind);
      await persist(kind === 'avatar' ? { avatarUrl: url } : { banner: { type: 'image', value: url } });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '上传失败，请重试');
    } finally {
      setBusy(false);
      if (avatarInput.current) avatarInput.current.value = '';
      if (bannerInput.current) bannerInput.current.value = '';
    }
  };

  const startEditing = (field: EditableField) => {
    setDraft(profile[field]);
    setEditing(field);
    setAppearance(null);
    setError('');
    setSaved(false);
  };

  const editButton = (field: EditableField, label: string) => canEdit && (
    <button type="button" className="profile-edit-trigger" aria-label={label} title={label} disabled={controlsDisabled} onClick={() => startEditing(field)}>
      <EditOutlined aria-hidden="true" />
    </button>
  );

  const fieldEditor = (field: EditableField, label: string) => (
    <form className={`profile-inline-editor is-${field}`} onSubmit={(event) => {
      event.preventDefault();
      const value = draft.trim();
      if (field === 'name' && !value) { setError('请输入个人名称'); return; }
      if (field === 'userId' && !/^[A-Za-z0-9]{3,20}$/.test(value)) { setError('专属 ID 需为 3–20 位数字或字母'); return; }
      void save({ [field]: value });
    }} onKeyDown={(event) => {
      if (event.key === 'Escape' && !busy) { event.preventDefault(); setEditing(null); setError(''); }
    }}>
      <label className="sr-only" htmlFor={`profile-edit-${field}`}>{label}</label>
      {field === 'bio' ? (
        <textarea id={`profile-edit-${field}`} autoFocus maxLength={160} rows={3} value={draft} disabled={busy} onChange={(event) => setDraft(event.target.value)} placeholder="介绍一下你自己，或者写下此刻想说的话" />
      ) : (
        <input id={`profile-edit-${field}`} autoFocus maxLength={field === 'name' ? 32 : 20} value={draft} disabled={busy} onChange={(event) => setDraft(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} />
      )}
      <div className="profile-inline-actions">
        <span>{field === 'bio' ? `${draft.length} / 160` : field === 'userId' ? '3–20 位字母或数字' : '让朋友更容易认出你'}</span>
        <button type="button" disabled={busy} onClick={() => { setEditing(null); setError(''); }}><CloseOutlined />取消</button>
        <button type="submit" disabled={busy} className="is-save">{busy ? <LoadingOutlined /> : <CheckOutlined />}保存</button>
      </div>
    </form>
  );

  return <>
    <div className="profile-cover">
      <ProfileBannerView banner={profile.banner} className="h-full" />
      {canEdit && <Popover
        trigger="click"
        placement="bottomRight"
        open={appearance === 'banner'}
        onOpenChange={(open) => setAppearance(open ? 'banner' : null)}
        content={<div className="profile-cover-options">
          <p>选一种心情，装点你的主页</p>
          <div className="profile-cover-presets">
            {BANNER_PRESETS.map((preset) => <button key={preset.id} type="button" disabled={busy} aria-label={`使用${preset.label}背景`} aria-pressed={profile.banner.type === 'preset' && profile.banner.value === preset.id} onClick={() => void save({ banner: { type: 'preset', value: preset.id } })}>
              <span className={`bg-gradient-to-br ${preset.className}`} />{preset.label}
            </button>)}
          </div>
          <button type="button" className="profile-media-option" disabled={busy} onClick={() => bannerInput.current?.click()}><PictureOutlined />上传自己的封面</button>
        </div>}
      >
        <button type="button" className="profile-cover-edit" disabled={controlsDisabled}><PictureOutlined />更换封面</button>
      </Popover>}
    </div>

    <div className="profile-identity">
      <div className="profile-identity-row">
        <div className="profile-avatar">
          <ImagePreview images={[{ id: 'avatar', url: getProfileAvatar(profile), name: `${profile.name}的头像` }]} imageId="avatar" className="relative h-full w-full rounded-full" title="头像">
            <Image src={getProfileAvatar(profile)} alt={`${profile.name}的头像`} fill sizes="120px" priority unoptimized className="profile-avatar-image" />
          </ImagePreview>
          {canEdit && <Popover
            trigger="click"
            placement="bottomLeft"
            open={appearance === 'avatar'}
            onOpenChange={(open) => setAppearance(open ? 'avatar' : null)}
            content={<div className="profile-avatar-options">
              <button type="button" disabled={busy} className="profile-media-option" onClick={() => avatarInput.current?.click()}><CameraOutlined />上传新头像</button>
              <button type="button" disabled={busy || !profile.avatarUrl} className="profile-media-option" onClick={() => void save({ avatarUrl: '' })}>恢复默认头像</button>
            </div>}
          >
            <button type="button" className="profile-avatar-edit" disabled={controlsDisabled} aria-label="更换头像" title="更换头像"><CameraOutlined /></button>
          </Popover>}
        </div>
        <div className="profile-name-block">
          {editing === 'name' ? fieldEditor('name', '个人名称') : <div className="profile-name-line">
            <h1>{profile.name}</h1>
            {profile.isSystem && <span className="profile-official">官方</span>}
            {editButton('name', '编辑昵称')}
          </div>}
          {editing === 'userId' ? fieldEditor('userId', '专属 ID') : <div className="profile-handle"><span>@{profile.userId}</span>{editButton('userId', '编辑专属 ID')}</div>}
        </div>
        <div className="profile-primary-action">
          {canEdit && <button type="button" className="profile-compose" onClick={onCompose}><PlusOutlined />写心迹</button>}
          {!isOwner && !profile.isSystem && <ContactActions key={profile.publicKey} contact={profile} />}
        </div>
      </div>

      <div className="profile-bio">
        {editing === 'bio' ? fieldEditor('bio', '个人简介') : <div className="profile-bio-display">
          <p className={profile.bio ? '' : 'is-empty'}>{profile.bio || (canEdit ? '留一句介绍，让相遇有个开始。' : '还没有留下个人介绍。')}</p>
          {editButton('bio', '编辑个人简介')}
        </div>}
      </div>
      {busy && <p className="profile-save-status" role="status"><LoadingOutlined />正在保存…</p>}
      {saved && !busy && <p className="profile-save-status" role="status"><CheckOutlined />已保存</p>}
      {error && <p className="profile-save-error" role="alert">{error}</p>}
    </div>
    {canEdit && <>
      <input ref={avatarInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(event) => void upload(event.target.files?.[0], 'avatar')} />
      <input ref={bannerInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(event) => void upload(event.target.files?.[0], 'banner')} />
    </>}
  </>;
}
