'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cueStyle } from './cues';
import { powerToSpeed } from './physics';
import { choose, createGame, createPractice, placeCue, playShot, playerName, type GameState } from './rules';
import { PoolScene, type AimMode, type ViewMode } from './scene';
import styles from './pool.module.css';

function groupLabel(group: GameState['groups'][number]) {
  if (group === 'solid') return '全色';
  if (group === 'stripe') return '花色';
  return '未定';
}

export function PoolTable({
  kind,
  cueId,
  view,
  aimMode,
  onView,
  onAimMode,
  onExit
}: {
  kind: 'eight' | 'practice';
  cueId: string;
  view: ViewMode;
  aimMode: AimMode;
  onView: (mode: ViewMode) => void;
  onAimMode: (mode: AimMode) => void;
  onExit: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<PoolScene | null>(null);
  const [game, setGame] = useState<GameState>(() => kind === 'practice' ? createPractice() : createGame());
  const [ready, setReady] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [power, setPower] = useState(0.72);
  const [pull, setPull] = useState<number | null>(null);
  const [spin, setSpin] = useState({ x: 0, y: 0 });
  const [elevation, setElevation] = useState(0);
  const [menu, setMenu] = useState(false);
  const latest = useRef({ game, power, spin, elevation });
  const shootRef = useRef<(powerValue: number) => void>(() => undefined);
  const rollingRef = useRef(false);
  latest.current = { game, power, spin, elevation };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const scene = new PoolScene(host, {
      onPlace: (x, z) => setGame(current => {
        const next = placeCue(current, x, z);
        if (next === current || !current.practice) return next;
        return { ...next, ballInHand: null, message: '自由练习。可以继续出杆。' };
      }),
      onPower: value => setPull(value),
      onShoot: value => shootRef.current(value),
      onReadout: () => undefined
    });
    sceneRef.current = scene;
    setReady(true);
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.sync(game, { power, spinX: spin.x, spinY: spin.y, elevation, mode: view, aimMode, cueId });
  }, [game, power, spin, elevation, view, aimMode, cueId, ready]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON')) return;
      const scene = sceneRef.current;
      if (!scene) return;
      const step = event.shiftKey ? 0.0016 : 0.007;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        scene.nudgeAim(step);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        scene.nudgeAim(-step);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setPower(value => Math.min(1, value + 0.04));
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        setPower(value => Math.max(0.05, value - 0.04));
      } else if (event.key === 'Escape') {
        setMenu(false);
      } else if (event.key === ' ') {
        event.preventDefault();
        shootRef.current(latest.current.power);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function shoot(powerValue: number) {
    const scene = sceneRef.current;
    const current = latest.current;
    if (!scene || rollingRef.current || current.game.phase !== 'aim') return;
    const cueBall = current.game.balls.find(ball => ball.id === 0);
    if (!cueBall || cueBall.pocketed) return;
    const result = playShot(current.game, {
      angle: scene.getAim(),
      speed: powerToSpeed(powerValue),
      offsetX: current.spin.x,
      offsetY: current.spin.y,
      elevation: current.elevation
    });
    if (!result.simulation) return;
    rollingRef.current = true;
    setRolling(true);
    setMenu(false);
    scene.play(result.simulation, powerValue, () => {
      rollingRef.current = false;
      setGame(result.state);
      setRolling(false);
    });
  }
  shootRef.current = shoot;

  function setTip(clientX: number, clientY: number, pad: HTMLDivElement) {
    const rect = pad.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    const length = Math.hypot(x, y) || 1;
    const scale = length > 1 ? 1 / length : 1;
    setSpin({ x: x * scale, y: y * scale });
  }

  function restart() {
    rollingRef.current = false;
    setRolling(false);
    setGame(kind === 'practice' ? createPractice() : createGame());
    sceneRef.current?.resetAim();
  }

  const cue = game.balls.find(ball => ball.id === 0);
  const canShoot = game.phase === 'aim' && !!cue && !cue.pocketed && !rolling;
  const detail = rolling
    ? ''
    : game.practice
      ? (game.ballInHand ? '摆母球' : '练习')
      : game.isBreak
        ? '开球'
        : game.ballInHand
          ? '自由球'
          : game.open
            ? playerName(game.current)
            : `${playerName(game.current)}·${groupLabel(game.groups[game.current])}`;

  return (
    <div className={styles.table}>
      <div ref={hostRef} className={styles.canvasHost} />
      <div className={styles.topBar}>
        {detail ? <p className={`${styles.status} text-caption`} role="status">{detail}</p> : <span />}
        <div className={styles.menuAnchor}>
          <Button variant="ghost" iconOnly aria-label="切换视角和打点" aria-expanded={menu} onClick={() => setMenu(open => !open)}>
            <span className={styles.ballFace} />
          </Button>
          {menu && (
            <div className={styles.menu} role="dialog" aria-label="视角和打点">
              <div className={styles.modes}>
                <Button size="sm" aria-pressed={view === 'table'} onClick={() => onView('table')}>全台</Button>
                <Button size="sm" aria-pressed={view === 'follow'} onClick={() => onView('follow')}>跟杆</Button>
                <Button size="sm" aria-pressed={view === 'top'} onClick={() => onView('top')}>俯视</Button>
              </div>
              <div className={styles.modes}>
                <Button size="sm" aria-pressed={aimMode === 'drag'} onClick={() => onAimMode('drag')}>拉杆</Button>
                <Button size="sm" aria-pressed={aimMode === 'point'} onClick={() => onAimMode('point')}>点落点</Button>
                <Button size="sm" aria-pressed={aimMode === 'fine'} onClick={() => onAimMode('fine')}>微调</Button>
              </div>
              <label className="text-caption text-foreground-secondary">
                抬杆 {Math.round(elevation * 180 / Math.PI)}°
                <input className={styles.slider} type="range" min={0} max={25} step={1} value={Math.round(elevation * 180 / Math.PI)} aria-label="抬杆角度" onChange={event => setElevation(Number(event.target.value) * Math.PI / 180)} />
              </label>
              <p className="text-caption text-foreground-muted">{cueStyle(cueId).name}</p>
              {game.practice && <Button size="sm" onClick={() => { setGame(current => ({ ...current, ballInHand: 'table' })); setMenu(false); }}>摆母球</Button>}
              <Button size="sm" variant="ghost" onClick={onExit}>回首页</Button>
            </div>
          )}
        </div>
      </div>
      <div className={styles.bottomBar}>
        <div
          className={styles.spin}
          role="application"
          aria-label="击点。上下是高低杆，左右是加塞。"
          onPointerDown={event => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setTip(event.clientX, event.clientY, event.currentTarget);
          }}
          onPointerMove={event => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) setTip(event.clientX, event.clientY, event.currentTarget);
          }}
        >
          <span className={styles.spinDot} style={{ left: `${(spin.x + 1) * 50}%`, top: `${(-spin.y + 1) * 50}%` }} />
        </div>
        {pull != null && (
          <div className={styles.powerTrack} aria-hidden="true">
            <span className={styles.powerFill} style={{ height: `${Math.round(pull * 100)}%` }} />
          </div>
        )}
        <Button variant="primary" size="sm" disabled={!canShoot} onClick={() => shoot(power)}>出杆</Button>
      </div>
      {game.phase === 'choice' && (
        <div className={styles.overlay}>
          <div className={styles.overlayCard}>
            <p className="text-body">{game.message}</p>
            {game.choice?.kind === 'break' && (
              <>
                <Button variant="primary" onClick={() => setGame(current => choose(current, 'take'))}>自由球打这一台</Button>
                <Button onClick={() => setGame(current => choose(current, 'self'))}>我来重新开球</Button>
                <Button onClick={() => setGame(current => choose(current, 'again'))}>让对方重开</Button>
              </>
            )}
            {game.choice?.kind === 'break-eight' && (
              <>
                <Button variant="primary" onClick={() => setGame(current => choose(current, 'as-is'))}>按母球位置打</Button>
                <Button onClick={() => setGame(current => choose(current, 'kitchen'))}>线后自由球</Button>
              </>
            )}
          </div>
        </div>
      )}
      {game.phase === 'over' && (
        <div className={styles.overlay}>
          <div className={styles.overlayCard}>
            <p className="text-title">{game.message}</p>
            <Button variant="primary" onClick={restart}>再来一局</Button>
            <Button onClick={onExit}>回首页</Button>
          </div>
        </div>
      )}
    </div>
  );
}
