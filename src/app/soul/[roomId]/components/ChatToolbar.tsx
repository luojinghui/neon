'use client';

import { SmileOutlined, PaperClipOutlined, AudioOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { soulChat } from '../../core';

const TOOLS = [
  { key: 'emoji', icon: SmileOutlined, label: '表情' },
  { key: 'file', icon: PaperClipOutlined, label: '文件' },
  { key: 'voice', icon: AudioOutlined, label: '语音通话' },
  { key: 'video', icon: VideoCameraOutlined, label: '视频通话' },
] as const;

export function ChatToolbar() {
  const handleClick = () => {
    soulChat.showToolbarPlaceholder();
  };

  return (
    <div className="flex items-center gap-1 mt-2">
      {TOOLS.map((tool) => (
        <button
          key={tool.key}
          type="button"
          onClick={handleClick}
          className="w-8 h-8 flex items-center justify-center rounded-lg
                     text-foreground-muted hover:text-foreground hover:bg-surface-active
                     transition-colors"
          aria-label={tool.label}
        >
          <tool.icon className="text-base" />
        </button>
      ))}
    </div>
  );
}
