'use client';

import { useState } from 'react';
import { CUE_STYLES } from './cues';
import { PoolLobby } from './PoolLobby';
import { PoolTable } from './PoolTable';
import type { AimMode, ViewMode } from './scene';

const VIEWS: ViewMode[] = ['table', 'follow', 'top'];
const AIM_MODES: AimMode[] = ['drag', 'point', 'fine'];

function stored<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const value = localStorage.getItem(key) || '';
    return allowed.includes(value as T) ? value as T : fallback;
  } catch {
    return fallback;
  }
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 浏览器不允许写入时，这一局仍然使用当前选择。
  }
}

export function PoolGame() {
  const [screen, setScreen] = useState<'lobby' | 'table'>('lobby');
  const [kind, setKind] = useState<'eight' | 'practice'>('eight');
  const [cueId, setCueId] = useState(() => stored('neon:pool-cue', CUE_STYLES[0].id, CUE_STYLES.map(item => item.id)));
  const [view, setView] = useState<ViewMode>(() => stored('neon:pool-view', 'table', VIEWS));
  const [aimMode, setAimMode] = useState<AimMode>(() => stored('neon:pool-aim', 'drag', AIM_MODES));

  if (screen === 'table') {
    return (
      <PoolTable
        kind={kind}
        cueId={cueId}
        view={view}
        aimMode={aimMode}
        onView={mode => { setView(mode); remember('neon:pool-view', mode); }}
        onAimMode={mode => {
          setAimMode(mode);
          remember('neon:pool-aim', mode);
          if (mode === 'fine') {
            setView('follow');
            remember('neon:pool-view', 'follow');
          }
        }}
        onExit={() => setScreen('lobby')}
      />
    );
  }

  return (
    <PoolLobby
      cueId={cueId}
      onCue={id => { setCueId(id); remember('neon:pool-cue', id); }}
      onStart={next => { setKind(next); setScreen('table'); }}
    />
  );
}
