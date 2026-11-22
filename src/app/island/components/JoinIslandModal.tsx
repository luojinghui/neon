'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { message } from '@/components/ui/message';
import {
  IslandApiError,
  joinIslandByInvite,
  parseInviteLink,
  previewIslandInvite
} from '../core/client';
import type { IslandInvitePreview, IslandSummary } from '../core/types';

interface JoinIslandModalProps {
  open: boolean;
  initialToken?: string;
  onClose: () => void;
  onJoined: (island: IslandSummary) => void;
}

export function JoinIslandModal({ open, initialToken = '', onClose, onJoined }: JoinIslandModalProps) {
  const router = useRouter();
  const [rawInput, setRawInput] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [preview, setPreview] = useState<IslandInvitePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const requestSeq = useRef(0);

  const loadPreview = async (token: string) => {
    const clean = token.trim();
    const seq = ++requestSeq.current;
    if (!clean) {
      setPreview(null);
      setPreviewError('');
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    setPreviewError('');
    try {
      const result = await previewIslandInvite(clean);
      if (seq !== requestSeq.current) return;
      setPreview(result);
    } catch (error) {
      if (seq !== requestSeq.current) return;
      setPreview(null);
      setPreviewError(error instanceof Error ? error.message : '链接无效');
    } finally {
      if (seq === requestSeq.current) setPreviewLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setSubmitError('');
    setPreviewError('');
    if (initialToken) {
      setRawInput(initialToken);
      setInviteToken(initialToken);
      void loadPreview(initialToken);
    } else {
      setRawInput('');
      setInviteToken('');
      setPreview(null);
    }
  }, [open, initialToken]);

  const handleRawChange = (value: string) => {
    setRawInput(value);
    setSubmitError('');
    const nextToken = parseInviteLink(value);
    if (nextToken !== inviteToken) {
      setInviteToken(nextToken);
      if (nextToken) {
        void loadPreview(nextToken);
      } else {
        requestSeq.current += 1;
        setPreview(null);
        setPreviewError('');
      }
    }
  };

  const handleDirectEnter = () => {
    if (!preview?.islandId) return;
    onClose();
    router.push(`/island/${encodeURIComponent(preview.islandId)}`);
  };

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (submitting) return;
    const token = inviteToken.trim();
    if (!token) {
      setSubmitError('请粘贴邀请链接');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const result = await joinIslandByInvite(token);
      message.success(`已进入「${result.island.name}」`);
      onJoined(result.island);
    } catch (error) {
      if (error instanceof IslandApiError) {
        setSubmitError(error.message);
      } else {
        setSubmitError(error instanceof Error ? error.message : '登岛失败');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const canEnterDirectly = Boolean(preview && (preview.isOwner || preview.alreadyJoined) && preview.islandId);

  return (
    <Modal open={open} title="登岛" onCancel={onClose} footer={null} centered width={400} destroyOnHidden>
      <form className="grid gap-3.5" onSubmit={(event) => void handleSubmit(event)}>
        {!initialToken && (
          <Input
            aria-label="邀请链接"
            value={rawInput}
            onChange={(event) => handleRawChange(event.target.value)}
            placeholder="粘贴邀请链接"
            prefix={<Icon name="link" size="sm" />}
            allowClear
          />
        )}

        {previewLoading && (
          <div className="flex items-center gap-2 text-caption text-foreground-secondary">
            <Icon name="loading" size="sm" />
            识别中…
          </div>
        )}

        {previewError && <Alert type="error" showIcon message={previewError} />}

        {preview && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-inset px-3.5 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-body font-semibold text-foreground">{preview.islandName}</div>
              <div className="text-caption text-foreground-muted">{preview.owner.name}</div>
            </div>
            {preview.expired && (
              <span className="shrink-0 rounded-sm bg-danger-soft px-2 py-0.5 text-caption text-danger">
                已过期
              </span>
            )}
          </div>
        )}

        {submitError && <Alert type="error" showIcon message={submitError} />}

        <div className="mt-1 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          {canEnterDirectly ? (
            <Button variant="primary" onClick={handleDirectEnter}>
              进入
            </Button>
          ) : (
            <Button
              variant="primary"
              type="submit"
              loading={submitting}
              disabled={!inviteToken || Boolean(preview?.expired)}
            >
              进入
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
