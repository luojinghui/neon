'use client';

import { Input } from '@/components/ui/input';
import { PlanetIllustration } from '@/components/ui/planet-illustration';
import { Textarea } from '@/components/ui/textarea';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { Radio } from '@/components/ui/radio';
import { Modal } from '@/components/ui/modal';
import { useEffect, useId, useState } from 'react';
import { soulChat, type ChatRoom, type CreateRoomInput } from '../core';
import styles from './CreateRoomModal.module.css';

type Props = {
  open: boolean;
  room?: ChatRoom | null;
  onClose: () => void;
  onSaved: (room: ChatRoom) => void;
};

export function CreateRoomModal({ open, room, onClose, onSaved }: Props) {
  const isEditing = Boolean(room);
  const formId = useId();
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [password, setPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(room?.name || '');
    setTags(room?.tags.join('、') || '');
    setDescription(room?.description || '');
    setIsPrivate(room?.isPrivate || false);
    setPasswordEnabled(room?.hasPassword || false);
    setPassword('');
    setError('');
  }, [open, room]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) return;
    setError('');
    setIsSaving(true);
    const input: CreateRoomInput = {
      name,
      description,
      tags: tags
        .split(/[,，、\s]+/)
        .map((tag) => tag.trim())
        .filter(Boolean),
      isPrivate,
      passwordEnabled,
      password
    };
    try {
      const savedRoom = room ? await soulChat.updateRoom({ ...input, roomId: room.id }) : await soulChat.createRoom(input);
      onClose();
      onSaved(savedRoom);
    } catch (error) {
      setError(error instanceof Error ? error.message : `${isEditing ? '保存' : '创建'}失败，请重试`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal title={isEditing ? '编辑星球' : '创建星球'} open={open} onCancel={onClose} footer={
      <div className="flex justify-end gap-2">
        <Button variant="ghost" type="button" onClick={onClose} disabled={isSaving}>
          取消
        </Button>
        <Button variant="primary"
          type="submit"
          form={formId}
          loading={isSaving}
          disabled={isSaving || !name.trim() || (!isPrivate && passwordEnabled && (password ? !/^[A-Za-z0-9]{2,4}$/.test(password) : !room?.hasPassword))}
        >
          {isSaving ? '保存中...' : isEditing ? '保存修改' : '创建星球'}
        </Button>
      </div>
    } centered destroyOnHidden width={480}>
      <form id={formId} className="space-y-4 pt-2" onSubmit={handleSubmit} autoComplete="off">
        <div>
          <div id="room-name-label" className="mb-1.5 block text-body font-medium text-foreground">
            星球名
          </div>
          <Input
            id="room-name"
            aria-labelledby="room-name-label"
            autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
            focusDecoration={<PlanetIllustration size="sm" />}
            value={name}
            maxLength={32}
            disabled={isSaving}
            onChange={(event) => setName(event.target.value)}
            placeholder="给这个星球起个名字"
            className="w-full"
          />
        </div>

        <div>
          <div id="room-tags-label" className="mb-1.5 block text-body font-medium text-foreground">
            标签 <span className="font-normal text-foreground-muted">· 可选</span>
          </div>
          <Input
            id="room-tags"
            aria-labelledby="room-tags-label"
            autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
            focusDecoration={<PlanetIllustration size="sm" variant="comet" />}
            value={tags}
            maxLength={80}
            disabled={isSaving}
            onChange={(event) => setTags(event.target.value)}
            placeholder="日常、音乐、治愈，最多 5 个"
            className="w-full"
          />
        </div>

        <div>
          <div id="room-description-label" className="mb-1.5 block text-body font-medium text-foreground">
            描述 <span className="font-normal text-foreground-muted">· 可选</span>
          </div>
          <Textarea
            id="room-description"
            aria-labelledby="room-description-label"
            autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
            focusDecoration={<PlanetIllustration size="sm" variant="satellite" />}
            value={description}
            maxLength={200}
            rows={3}
            disabled={isSaving}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="介绍一下想在这里聊些什么"
            className="w-full"
          />
        </div>

        <fieldset className={styles.access} disabled={isSaving}>
          <legend className={styles.accessLegend}>可见范围</legend>
          <div className={styles.accessBody}>
            <Radio.Group appearance="card" indicator={false} aria-label="星球可见范围" value={isPrivate ? 'private' : 'public'} disabled={isSaving} onChange={event => {
              const nextPrivate = event.target.value === 'private';
              setIsPrivate(nextPrivate);
              if (nextPrivate) { setPasswordEnabled(false); setPassword(''); }
            }} options={[
              { value: 'public', label: '公开', description: '在公共列表中展示', icon: <Icon name="globe" /> },
              { value: 'private', label: '私密', description: '仅授权成员可加入', icon: <Icon name="lock" /> }
            ]} />

            {!isPrivate && <div className={styles.entrySettings}>
              <>
                <div className={styles.passwordHeading}>
                  <div className={styles.passwordCopy}>
                    <p className={styles.settingTitle}>进入密码 <span className={styles.optional}>可选</span></p>
                  </div>
                  <Switch id="room-password-enabled" checked={passwordEnabled} disabled={isSaving}
                    aria-label="开启进入密码" aria-controls="room-password-panel"
                    onChange={setPasswordEnabled} className={styles.passwordSwitch} />
                </div>
                <div id="room-password-panel" className={styles.passwordField} hidden={!passwordEnabled}>
                  <label htmlFor="room-password" className="sr-only">星球密码</label>
                  <Input.Password id="room-password" aria-label="星球密码"
                    value={password} minLength={2} maxLength={4} autoComplete="new-password" disabled={!passwordEnabled || isSaving}
                    onChange={event => setPassword(event.target.value.replace(/[^A-Za-z0-9]/g, ''))}
                    placeholder={isEditing && room?.hasPassword ? '留空表示保留原密码' : '设置 2–4 位数字或字母'} />
                </div>
              </>
            </div>}
          </div>
        </fieldset>

        {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-caption text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
