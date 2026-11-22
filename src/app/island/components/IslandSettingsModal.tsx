'use client';

import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { message } from '@/components/ui/message';
import { Modal } from '@/components/ui/modal';
import { Popconfirm } from '@/components/ui/popconfirm';
import { buildInviteLink, updateIslandSettings } from '../core/client';
import type { IslandMember, IslandSummary } from '../core/types';

interface IslandSettingsModalProps {
  open: boolean;
  island: IslandSummary | null;
  onClose: () => void;
  onUpdated: (island: IslandSummary) => void;
}

export function IslandSettingsModal({ open, island, onClose, onUpdated }: IslandSettingsModalProps) {
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [refreshingInvite, setRefreshingInvite] = useState(false);
  const [removingKey, setRemovingKey] = useState('');
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    if (!open || !island) return;
    setNameDraft(island.name);
    setErrorText('');
  }, [open, island]);

  if (!island) return null;

  const members: IslandMember[] = (island.members || []).filter(
    (member) => member.publicKey !== island.owner.publicKey
  );
  const nameChanged = Boolean(nameDraft.trim()) && nameDraft.trim() !== island.name;

  const handleSaveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === island.name) return;
    setSavingName(true);
    setErrorText('');
    try {
      const result = await updateIslandSettings(island.id, { name: trimmed });
      onUpdated(result.island);
      message.success('已保存');
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSavingName(false);
    }
  };

  const handleRegenerateInvite = async () => {
    setRefreshingInvite(true);
    setErrorText('');
    try {
      const result = await updateIslandSettings(island.id, { regenerateInvite: true });
      onUpdated(result.island);
      message.success('已重置链接');
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '重置失败');
    } finally {
      setRefreshingInvite(false);
    }
  };

  const handleRemoveMember = async (member: IslandMember) => {
    setRemovingKey(member.publicKey);
    setErrorText('');
    try {
      const result = await updateIslandSettings(island.id, { removeMemberPublicKey: member.publicKey });
      onUpdated(result.island);
      message.success('已移除');
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '移除失败');
    } finally {
      setRemovingKey('');
    }
  };

  const handleCopyLink = async () => {
    if (!island.inviteToken) return;
    try {
      await navigator.clipboard.writeText(buildInviteLink(island.inviteToken));
      message.success('已复制邀请链接');
    } catch {
      message.error('复制失败');
    }
  };

  const inviteLink = island.inviteToken ? buildInviteLink(island.inviteToken) : '';

  return (
    <Modal open={open} title="浮岛设置" onCancel={onClose} footer={null} centered width={440} destroyOnHidden>
      <div className="flex flex-col gap-5">
        {errorText && <Alert type="error" showIcon message={errorText} />}

        {/* 浮岛名称 */}
        <section>
          <label htmlFor="island-name-input" className="mb-2 block text-body font-medium text-foreground">
            名称
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="island-name-input"
              size="md"
              className="min-w-0 flex-1"
              value={nameDraft}
              maxLength={32}
              onChange={(event) => setNameDraft(event.target.value)}
              onPressEnter={() => void handleSaveName()}
              placeholder="输入浮岛名称"
            />
            <Button
              variant="primary"
              size="md"
              loading={savingName}
              disabled={!nameChanged}
              onClick={() => void handleSaveName()}
            >
              保存
            </Button>
          </div>
        </section>

        {/* 邀请链接 */}
        <section>
          <div className="mb-2 text-body font-medium text-foreground">邀请链接</div>
          <div className="flex flex-col gap-2.5 rounded-lg bg-surface-inset p-3">
            {inviteLink && (
              <div
                data-selectable=""
                className="truncate rounded-md bg-surface px-3 py-2 text-caption text-foreground-secondary"
                title={inviteLink}
              >
                {inviteLink}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="md"
                className="flex-1"
                loading={refreshingInvite}
                icon={<Icon name="refresh" />}
                onClick={() => void handleRegenerateInvite()}
              >
                重置
              </Button>
              <Button
                variant="primary"
                size="md"
                className="flex-1"
                disabled={!inviteLink}
                icon={<Icon name="link" />}
                onClick={() => void handleCopyLink()}
              >
                复制
              </Button>
            </div>
          </div>
        </section>

        {/* 成员列表 */}
        <section>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-body font-medium text-foreground">成员</span>
            <span className="text-caption text-foreground-muted">{members.length} 人</span>
          </div>

          <div className="rounded-lg bg-surface-inset">
            {members.length === 0 ? (
              <div className="py-6 text-center text-caption text-foreground-muted">暂无成员</div>
            ) : (
              <ul className="m-0 flex max-h-52 list-none flex-col divide-y divide-border overflow-y-auto px-3 py-1">
                {members.map((member) => (
                  <li key={member.publicKey} className="flex items-center justify-between gap-3 py-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-caption font-medium text-primary">
                        {(member.name || '友').slice(0, 1)}
                      </span>
                      <span className="truncate text-body text-foreground">{member.name}</span>
                    </div>
                    <Popconfirm
                      title={`移出「${member.name}」？`}
                      okText="移除"
                      cancelText="取消"
                      onConfirm={() => void handleRemoveMember(member)}
                    >
                      <Button variant="ghost" size="md" loading={removingKey === member.publicKey}>
                        移除
                      </Button>
                    </Popconfirm>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </Modal>
  );
}
