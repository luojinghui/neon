'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import '@/styles/index.css';
import { ProfileShortcut } from '@/app/profile/components/ProfileShortcut';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { TopBar } from '@/components/topbar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Tooltip } from '@/components/ui/tooltip';
import { getIslandCacheUuid, getIslandSky } from './core/client';
import { readCachedSky, writeCachedSky } from './core/islandCache';
import type { IslandSkyResponse, IslandSummary } from './core/types';
import { FloatingIslandNode } from './components/FloatingIslandNode';
import { IslandSettingsModal } from './components/IslandSettingsModal';
import { JoinIslandModal } from './components/JoinIslandModal';
import { SkyOceanScene } from './components/SkyOceanScene';
import styles from './island-sky.module.css';

const ORBIT_POSITIONS: Array<{ left: string; top: string }> = [
  { left: '18%', top: '30%' },
  { left: '82%', top: '30%' },
  { left: '16%', top: '66%' },
  { left: '84%', top: '66%' },
  { left: '34%', top: '18%' },
  { left: '66%', top: '18%' }
];

function IslandSkyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteParam = searchParams.get('invite') || '';

  const [sky, setSky] = useState<IslandSkyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinInitialToken, setJoinInitialToken] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadSky = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const data = await getIslandSky();
      setSky(data);
      writeCachedSky(getIslandCacheUuid(), data);
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = readCachedSky(getIslandCacheUuid());
    if (cached) {
      setSky(cached);
      setLoading(false);
      void loadSky(true);
    } else {
      void loadSky(false);
    }
  }, [loadSky]);

  useEffect(() => {
    if (inviteParam) {
      setJoinInitialToken(inviteParam);
      setJoinOpen(true);
    }
  }, [inviteParam]);

  const handleCloseJoin = () => {
    setJoinOpen(false);
    setJoinInitialToken('');
    if (inviteParam) router.replace('/island');
  };

  const handleJoined = (island: IslandSummary) => {
    setJoinOpen(false);
    setJoinInitialToken('');
    if (inviteParam) router.replace('/island');
    void loadSky(true);
    router.push(`/island/${encodeURIComponent(island.id)}`);
  };

  const orbitIslands = sky?.joinedIslands.slice(0, ORBIT_POSITIONS.length) || [];
  const overflowIslands = sky?.joinedIslands.slice(ORBIT_POSITIONS.length) || [];
  const orbitRoutes = orbitIslands.map((island, idx) => ({
    x: Number.parseFloat(ORBIT_POSITIONS[idx].left),
    y: Number.parseFloat(ORBIT_POSITIONS[idx].top),
    active: island.onlineCount > 0
  }));

  return (
    <div className={styles.page}>
      <SkyOceanScene routes={orbitRoutes} />

      <TopBar
        middle="浮岛"
        backHref="/"
        backLabel="首页"
        right={
          <div className="flex items-center gap-2">
            {sky?.ownIsland && (
              <Tooltip title="浮岛设置" placement="bottom">
                <Button
                  variant="outline"
                  iconOnly
                  aria-label="浮岛设置"
                  onClick={() => setSettingsOpen(true)}
                >
                  <Icon name="setting" />
                </Button>
              </Tooltip>
            )}
            <ProfileShortcut returnTo="/island" />
            <ThemeToggle />
          </div>
        }
      />

      <main className={styles.main}>
        <section className={styles.stage} aria-label="浮岛">
          {loading && !sky ? (
            <div className={styles.stateCard} role="status">
              <Icon name="loading" size="lg" tone="primary" />
              <div className="text-body text-foreground-secondary">加载中…</div>
            </div>
          ) : error && !sky ? (
            <div className={styles.stateCard} role="alert">
              <p className="m-0 text-body text-foreground-secondary">{error}</p>
              <Button variant="primary" size="sm" onClick={() => void loadSky(false)}>
                重试
              </Button>
            </div>
          ) : sky ? (
            <>
              <div className={styles.orbitCanvas}>
                <div className={styles.centerSlot}>
                  <FloatingIslandNode island={sky.ownIsland} variant="own" />
                </div>

                {orbitIslands.length > 0 && (
                  <div className={styles.mobileFriendGrid}>
                    {orbitIslands.map((island, idx) => (
                      <div
                        key={island.id}
                        className={styles.orbitSlot}
                        style={{
                          left: ORBIT_POSITIONS[idx].left,
                          top: ORBIT_POSITIONS[idx].top
                        }}
                      >
                        <FloatingIslandNode island={island} variant="friend" index={idx + 1} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {overflowIslands.length > 0 && (
                <div className={styles.overflowStrip}>
                  {overflowIslands.map((island, idx) => (
                    <FloatingIslandNode
                      key={island.id}
                      island={island}
                      variant="friend"
                      index={idx + ORBIT_POSITIONS.length + 1}
                    />
                  ))}
                </div>
              )}
            </>
          ) : null}
        </section>
      </main>

      <JoinIslandModal
        open={joinOpen}
        initialToken={joinInitialToken}
        onClose={handleCloseJoin}
        onJoined={handleJoined}
      />

      <IslandSettingsModal
        open={settingsOpen}
        island={sky?.ownIsland || null}
        onClose={() => setSettingsOpen(false)}
        onUpdated={(updated) => {
          setSky((current) => {
            if (!current) return current;
            const next = { ...current, ownIsland: updated };
            writeCachedSky(getIslandCacheUuid(), next);
            return next;
          });
        }}
      />
    </div>
  );
}

export default function IslandPage() {
  return (
    <Suspense
      fallback={
        <div className="app-screen flex items-center justify-center bg-background text-foreground-secondary">
          <Icon name="loading" tone="primary" />
        </div>
      }
    >
      <IslandSkyContent />
    </Suspense>
  );
}
