'use client';

import { Popover } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import styles from './chat-menus.module.css';

import { Popconfirm } from '@/components/ui/popconfirm';
import { useRef, useState, type ReactNode } from 'react';
import { soulChat } from '../../core';
import { useSoulStore } from '../../store';
import type { MessageType } from './types';
import type { ChatGame } from '../../core/types';
import { GameSetupModal } from './GameLauncher';

interface MessageActionsProps {
  messageId: string;
  messageType: MessageType;
  hasAttachment: boolean;
  isLocal: boolean;
  game?: ChatGame;
}

const quickReplies = [
  { emoji: '🥰', label: '喜欢你' },
  { emoji: '🥺', label: '可怜巴巴' },
  { emoji: '🤭', label: '偷偷笑' },
  { emoji: '🐱', label: '猫猫贴贴' },
  { emoji: '🫶', label: '比个心' },
  { emoji: '✨', label: '闪闪发光' }
];

export function MessageActions({ messageId, messageType, hasAttachment, isLocal, game }: MessageActionsProps) {
  const canDelete = useSoulStore((state) => state.room?.isOwner === true);
  const direct = useSoulStore((state) => state.room?.kind === 'direct');
  const connected = useSoulStore((state) => state.connectionState === 'connected');
  const isSending = useSoulStore((state) => state.isSending);
  const canAccess = useSoulStore((state) => state.accessState === 'granted');
  const [setup, setSetup] = useState<'rps' | 'draw' | null>(null);
  const [gamePending, setGamePending] = useState(false);
  const gamePendingRef = useRef(false);
  const [gameError, setGameError] = useState('');
  const gameDisabled = gamePending || !connected || !canAccess || isSending;
  const canFinishGame = isLocal && ((game?.kind === 'rps' && game.status === 'waiting') || (game?.kind === 'draw' && game.status === 'playing'));
  const [open, setOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [replyPending, setReplyPending] = useState(false);
  const [pendingEmoji, setPendingEmoji] = useState('');
  const [replyError, setReplyError] = useState('');
  const replyPendingRef = useRef(false);
  const canCopy = messageType === 'text';
  const canDownload = hasAttachment && ['image', 'gif', 'file'].includes(messageType);
  const canShare = canDownload && !direct;

  const close = () => {
    setDeleteConfirmOpen(false);
    setOpen(false);
  };

  const reply = async (emoji: string) => {
    if (replyPendingRef.current || !connected || !canAccess || isSending) return;
    replyPendingRef.current = true;
    setReplyPending(true);
    setPendingEmoji(emoji);
    setReplyError('');
    try {
      const sent = await soulChat.replyWithEmoji(messageId, emoji);
      if (sent) close();
      else setReplyError(useSoulStore.getState().chatError || '表情回复失败，请重试');
    } catch (error) {
      setReplyError(error instanceof Error ? error.message : '表情回复失败，请重试');
    } finally {
      replyPendingRef.current = false;
      setReplyPending(false);
      setPendingEmoji('');
    }
  };

  const runGame = async (finish = false) => {
    if (!game || gameDisabled || gamePendingRef.current) return;
    if (!finish && game.kind !== 'dice') { close(); setSetup(game.kind); return; }
    gamePendingRef.current = true;
    setGamePending(true);
    setGameError('');
    try {
      const sent = finish ? await soulChat.actOnGame({ messageId, action: 'finish' }) : await soulChat.createGame({ kind: 'dice' });
      if (sent) close(); else setGameError(useSoulStore.getState().chatError || '操作失败，请重试');
    } catch { setGameError('操作失败，请重试'); }
    finally { gamePendingRef.current = false; setGamePending(false); }
  };

  const actions: ReactNode[] = [];
  if (game) {
    actions.push(<Button key="resend" size="sm" variant="ghost" disabled={gameDisabled} className={styles.actionButton} onClick={() => void runGame()} icon={<Icon name={gamePending ? 'loading' : 'reload'} size={18} />}><span>重新发送</span></Button>);
    if (canFinishGame) actions.push(<Button key="finish" size="sm" variant="ghost" disabled={gameDisabled} className={styles.actionButton} onClick={() => void runGame(true)} icon={<Icon name="check" size={18} />}><span>{game.kind === 'draw' ? '揭晓答案' : '取消邀请'}</span></Button>);
  }
  if (canCopy) actions.push(<Button key="copy" size="sm" variant="ghost" className={styles.actionButton} icon={<Icon name="copy" size={18} />} onClick={() => { soulChat.copyMessage(messageId); close(); }}><span>复制</span></Button>);
  if (canDownload) actions.push(<Button key="download" size="sm" variant="ghost" className={styles.actionButton} icon={<Icon name="download" size={18} />} onClick={() => { soulChat.downloadMessage(messageId); close(); }}><span>下载</span></Button>);
  if (canShare) actions.push(<Button key="share" size="sm" variant="ghost" className={styles.actionButton} icon={<Icon name="share" size={18} />} onClick={() => { void soulChat.shareMessage(messageId); close(); }}><span>分享</span></Button>);
  if (isLocal) actions.push(<Button key="recall" size="sm" variant="ghost" disabled={!connected || !canAccess} className={styles.actionButton} icon={<Icon name="rollback" size={18} />} onClick={() => { void soulChat.recallMessage(messageId); close(); }}><span>撤回</span></Button>);
  if (canDelete && !isLocal) actions.push(
    <Popconfirm key="delete" open={deleteConfirmOpen} title="删除这条消息？" description="删除后，所有成员都会同步移除。" okText="删除" cancelText="取消" placement="top" fitViewport boundaryPadding={12}
      onOpenChange={setDeleteConfirmOpen} onConfirm={() => { void soulChat.deleteMessage(messageId); close(); }} onCancel={() => setDeleteConfirmOpen(false)}>
      <Button size="sm" variant="ghost" className={styles.actionButton} onClick={() => setDeleteConfirmOpen(true)} icon={<Icon name="delete" size={18} />}><span>删除</span></Button>
    </Popconfirm>
  );
  const actionRows = Array.from({ length: Math.ceil(actions.length / 5) }, (_, index) => actions.slice(index * 5, index * 5 + 5));

  const content = (
    <div className={styles.messageMenu} onClick={(event) => event.stopPropagation()}>
      {actions.length > 0 && <div className={styles.actionRows} role="group" aria-label="消息操作">{actionRows.map((row, index) => <div key={index} className={styles.actionRow}>{row}</div>)}</div>}
      {gameError && <p role="alert" className={styles.error}>{gameError}</p>}
      {!isLocal && <div className={actions.length ? styles.quickReplySection : undefined}>
        <div className={styles.quickReplies} role="group" aria-label="选择表情回复" aria-busy={replyPending}>
          {quickReplies.map(({ emoji, label }) => <Button key={emoji} iconOnly size="sm" variant="ghost" aria-label={`用${label}${emoji}回复此条消息`} aria-busy={replyPending && pendingEmoji === emoji || undefined} disabled={!connected || !canAccess || isSending || replyPending} onClick={() => void reply(emoji)} className={styles.replyButton}>{replyPending && pendingEmoji === emoji ? <Icon name="loading" size="lg" /> : emoji}</Button>)}
        </div>
        {replyError && <p role="alert" className={styles.error}>{replyError}</p>}
      </div>}
    </div>
  );

  return (
    <><Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) { setReplyError(''); setGameError(''); }
        if (!nextOpen) {
          setDeleteConfirmOpen(false);
        }
      }}
      content={content}
      trigger="click"
      placement="top"
      width="max-content"
      fitViewport
      boundaryPadding={12}
      radius="lg"
      arrow={false}
      bodyStyle={{ padding: 2 }}
    >
      <Button size="sm" variant="ghost" iconOnly
        type="button"
        onClick={(event) => event.stopPropagation()}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center"
        aria-label="更多操作"
        aria-expanded={open}
      >
        <Icon name="ellipsis" />
      </Button>
    </Popover>
    {setup && <GameSetupModal key={setup} kind={setup} onClose={() => setSetup(null)} />}
    </>
  );
}
