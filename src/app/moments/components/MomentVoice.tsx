'use client';

import { AudioOutlined } from '@ant-design/icons';
import type { MomentVoice } from '../types';
import { formatVoiceDuration } from '../format';

export function MomentVoicePlayer({ voice }: { voice: MomentVoice }) {
  return (
    <div className="moment-voice-player">
      <span className="moment-voice-icon"><AudioOutlined /></span>
      <audio src={voice.url} controls preload="metadata" aria-label="心迹语音" />
      <span className="shrink-0 font-mono text-xs text-foreground-muted">{formatVoiceDuration(voice.durationMs)}</span>
    </div>
  );
}
