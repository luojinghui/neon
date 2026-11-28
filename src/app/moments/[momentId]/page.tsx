'use client';

import { Button, buttonClassName } from '@/components/ui/button';
import { Dropdown, type DropdownItem } from '@/components/ui/dropdown';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm';
import { TopBar } from '@/components/topbar';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { LoadingOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProfileShortcut } from '@/app/profile/components/ProfileShortcut';
import { createProfileHref } from '@/app/profile/navigation';
import { createMomentHref, getMomentBackLabel, sanitizeMomentReturnTo } from '../navigation';
import { deleteMoment, getMoment } from '../client';
import { formatMomentTime, splitMomentParagraphs, splitTrailingImages } from '../format';
import type { Moment } from '../types';
import { MomentActions } from '../components/MomentActions';
import { MomentAttachments } from '../components/MomentAttachments';
import { MomentAvatar } from '../components/MomentAvatar';
import { MomentBody } from '../components/MomentBody';
import { MomentComments } from '../components/MomentComments';
import { MomentComposer } from '../components/MomentComposer';
import { MomentMediaView } from '../components/MomentMedia';
import { MomentVoicePlayer } from '../components/MomentVoice';
import '../moments.css';
import '../moments-journal.css';
import '../components/moment-gallery.css';

const MOMENT_ID = /^[A-Za-z0-9_-]{16}$/;

function useMomentShare(momentId: string) {
  const [phase, setPhase] = useState<'idle' | 'copied' | 'manual'>('idle');
  const [url, setUrl] = useState('');

  useEffect(() => {
    setPhase('idle');
    setUrl('');
  }, [momentId]);

  useEffect(() => {
    if (phase !== 'copied') return;
    const timer = window.setTimeout(() => setPhase('idle'), 2200);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const share = async () => {
    const next = `${window.location.origin}/moments/${momentId}`;
    setUrl(next);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard');
      await navigator.clipboard.writeText(next);
      setPhase('copied');
    } catch {
      setPhase('manual');
    }
  };

  return { phase, url, share };
}

function focusCommentComposer() {
  const input = document.getElementById('moment-detail-comment-input');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  input?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  input?.focus({ preventScroll: true });
}

function MomentDetail({ momentId }: { momentId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const modal = useConfirm();
  const shareLink = useMomentShare(momentId);
  const returnTo = sanitizeMomentReturnTo(searchParams.get('from'));
  const backLabel = getMomentBackLabel(returnTo);
  const detailHref = createMomentHref(momentId, { returnTo });
  const [moment, setMoment] = useState<Moment | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const valid = MOMENT_ID.test(momentId);

  useEffect(() => {
    if (!valid) return;
    const controller = new AbortController();
    setMoment(null);
    setError('');
    getMoment(momentId, controller.signal).then(setMoment).catch((loadError) => {
      if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : '星语加载失败');
    });
    return () => controller.abort();
  }, [momentId, valid]);

  const remove = () => {
    if (!moment || deleting) return;
    modal.confirm({
      title: '删除整条星语？',
      content: '正文、媒体、语音和全部评论都会被永久删除。',
      okText: '删除星语',
      cancelText: '取消',
      async onOk() {
        setDeleting(true);
        try {
          await deleteMoment(moment);
          router.replace(returnTo);
        } catch (deleteError) {
          setDeleting(false);
          throw deleteError instanceof Error ? deleteError : new Error('删除失败，请重试');
        }
      }
    });
  };

  const canEdit = moment ? (moment.canEdit ?? moment.canDelete) : false;
  const menuItems: DropdownItem[] = [];
  if (moment && canEdit) menuItems.push({ key: 'edit', icon: <Icon name="edit" size="sm" />, label: '编辑', disabled: deleting, onClick: () => setEditing(true) });
  if (moment?.canDelete) menuItems.push({ key: 'delete', danger: true, icon: deleting ? <LoadingOutlined /> : <Icon name="trash" size="sm" />, label: '删除', disabled: deleting, onClick: remove });
  const { interleavedBlocks, trailingImages } = splitTrailingImages(moment?.blocks);
  const displayMedia = moment ? (trailingImages.length > 0 ? [...trailingImages, ...moment.media] : moment.media) : [];
  const hasBody = Boolean(moment && (interleavedBlocks.length > 0 || (moment.text && splitMomentParagraphs(moment.text).length > 0)));

  return (
    <div className="moments-screen app-screen flex w-full flex-col overflow-hidden bg-background">
      <TopBar
        middle="星语"
        backHref={returnTo}
        backLabel={backLabel}
        right={<div className="flex items-center gap-2"><ProfileShortcut returnTo={detailHref} /><ThemeToggle /></div>}
      />
      <main className="moment-scroll-area app-scroll-main min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <article className="app-content-width moment-journal-content moment-detail moment-viewer">
          {!valid && <p className="moment-inline-error" role="alert">星语地址无效</p>}
          {valid && !moment && !error && <p className="text-body text-foreground-muted" role="status">正在读取星语…</p>}
          {error && <div className="moment-empty-state" role="alert"><span>{error}</span><Link href={returnTo} className={buttonClassName({ variant: 'ghost' })}>返回{backLabel}</Link></div>}
          {moment && (
            <>
              <header className="moment-viewer-author">
                <MomentAvatar author={moment.author} size={40} returnTo={detailHref} />
                <div className="min-w-0">
                  <Link href={createProfileHref(moment.author.userId, { returnTo: detailHref })} className="moment-card-author block truncate font-semibold text-foreground hover:text-primary">{moment.author.name}</Link>
                  <div className="moment-card-byline">
                    <time dateTime={moment.createdAt}>{formatMomentTime(moment.createdAt)}</time>
                    {moment.isEdited ? ' · 已编辑' : null}
                  </div>
                </div>
              </header>
              {hasBody && <div className="moment-viewer-text"><MomentBody text={moment.text} blocks={interleavedBlocks} immersive /></div>}
              {displayMedia.length > 0 && <MomentMediaView media={displayMedia} immersive />}
              <MomentAttachments attachments={moment.attachments} />
              {moment.voice && <div className="moment-viewer-voice"><MomentVoicePlayer voice={moment.voice} /></div>}
              {moment.location && <p className="moment-detail-location"><Icon name="environment" size="sm" />{moment.location.label}</p>}
              <MomentActions
                appearance="journal"
                moment={moment}
                onChange={(patch) => setMoment((current) => current ? { ...current, ...patch } : current)}
                onComment={focusCommentComposer}
                share={{ copied: shareLink.phase === 'copied', onShare: () => void shareLink.share() }}
                extra={menuItems.length > 0 ? (
                  <Dropdown items={menuItems} trigger={['click']} placement="bottomRight">
                    <Button variant="ghost" size="sm" iconOnly type="button" aria-label="管理这条星语" disabled={deleting}><Icon name="more" /></Button>
                  </Dropdown>
                ) : null}
              />
              <p className={shareLink.phase === 'manual' ? 'moment-detail-share-note' : 'sr-only'} role="status">{shareLink.phase === 'copied' ? '链接已复制' : shareLink.phase === 'manual' ? '无法写入剪贴板，请手动复制' : ''}</p>
              {shareLink.phase === 'manual' && (
                <Input className="moment-detail-link" readOnly value={shareLink.url} aria-label="星语分享链接" onFocus={(event) => event.currentTarget.select()} />
              )}
              <MomentComments variant="page" momentId={moment.id} initialComments={moment.comments} initialCount={moment.commentCount} onCountChange={(commentCount) => setMoment((current) => current ? { ...current, commentCount } : current)} />
            </>
          )}
        </article>
      </main>
      {moment && canEdit && (
        <MomentComposer appearance="journal" open={editing} moment={moment} onClose={() => setEditing(false)} onPublished={(updated) => { setMoment(updated); setEditing(false); }} />
      )}
    </div>
  );
}

export default function MomentDetailPage() {
  const params = useParams<{ momentId: string }>();
  return <MomentDetail momentId={params.momentId || ''} />;
}
