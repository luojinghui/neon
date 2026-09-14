import type { ReplyTo } from '../../core/types';

function getReplySummary(replyTo: ReplyTo): string {
  switch (replyTo.type) {
    case 'image':
      return '[图片]';
    case 'gif':
      return '[动态表情]';
    case 'file':
      return '[文件]';
    case 'game':
      return replyTo.content || '[星球小游戏]';
    case 'video':
      return '[视频]';
    case 'audio':
      return '[语音]';
    case 'music':
      return '[音乐]';
    default:
      return replyTo.content || '[消息]';
  }
}

export function MessageReply({ replyTo }: { replyTo: ReplyTo }) {
  return (
    <blockquote className="mb-1.5 max-w-full rounded-r-lg border-l-2 border-border-hover bg-background-secondary px-2.5 py-1.5 text-left text-xs leading-relaxed text-foreground-secondary">
      <div className="truncate font-medium text-foreground-muted">回复 {replyTo.senderName}</div>
      <div className="line-clamp-2 break-words">{getReplySummary(replyTo)}</div>
    </blockquote>
  );
}
