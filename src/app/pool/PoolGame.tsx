'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button, buttonClassName } from '@/components/ui/button';
import { powerToSpeed } from './physics';
import { choose, createGame, placeCue, playShot, playerName, type GameState } from './rules';
import { PoolScene, type ShotReadout } from './scene';
import styles from './pool.module.css';

type CameraMode = 'table' | 'follow' | 'top';

function groupLabel(group: GameState['groups'][number]) {
  if (group === 'solid') return '全色';
  if (group === 'stripe') return '花色';
  return '未定';
}

function formatAngle(value: number | null) {
  return value == null || Number.isNaN(value) ? '—' : `${Math.round(value)}°`;
}

export function PoolGame() {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<PoolScene | null>(null);
  const [game, setGame] = useState<GameState>(() => createGame());
  const [ready, setReady] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [power, setPower] = useState(0.8);
  const [spin, setSpin] = useState({ x: 0, y: 0 });
  const [elevation, setElevation] = useState(0);
  const [mode, setMode] = useState<CameraMode>('table');
  const [readout, setReadout] = useState<ShotReadout>({ cutAngle: null, separation: null });
  const latest = useRef({ game, power, spin, elevation });
  const shootRef = useRef<(powerValue: number) => void>(() => undefined);
  const rollingRef = useRef(false);
  latest.current = { game, power, spin, elevation };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const scene = new PoolScene(host, {
      onPlace: (x, z) => setGame(current => placeCue(current, x, z)),
      onPower: value => setPower(value),
      onShoot: value => shootRef.current(value),
      onReadout: next => setReadout(current => {
        const sameCut = Math.round(current.cutAngle ?? -1) === Math.round(next.cutAngle ?? -1);
        const sameSeparation = Math.round(current.separation ?? -1) === Math.round(next.separation ?? -1);
        return sameCut && sameSeparation ? current : next;
      })
    });
    sceneRef.current = scene;
    setReady(true);
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.sync(game, { power, spinX: spin.x, spinY: spin.y, elevation, mode });
  }, [game, power, spin, elevation, mode, ready]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
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

  const cue = game.balls.find(ball => ball.id === 0);
  const canShoot = game.phase === 'aim' && !!cue && !cue.pocketed && !rolling;
  const shooter = playerName(game.current);

  return (
    <div className={styles.stage}>
      <div className={styles.viewport}>
        <div ref={hostRef} className={styles.canvasHost} />
        <div className={styles.banner}>
          <div className={styles.bannerCard}>
            <p className="text-body" role="status">{rolling ? '球还在走。' : game.message}</p>
            <p className="text-caption text-foreground-secondary">
              轮到{shooter}
              {game.open ? ' · 球局开放' : ` · ${playerName(0)}${groupLabel(game.groups[0])} / ${playerName(1)}${groupLabel(game.groups[1])}`}
              {game.ballInHand ? (cue?.pocketed ? ' · 点击台面摆母球' : ' · 可点击台面重摆母球') : ''}
            </p>
          </div>
        </div>
      </div>
      <aside className={styles.panel}>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-title">中式八球</h1>
          <Link href="/" className={buttonClassName({ variant: 'ghost', size: 'sm' })}>返回</Link>
        </div>
        <div className={styles.actions}>
          <Button variant="primary" disabled={!canShoot} onClick={() => shoot(power)}>出杆</Button>
          <Button onClick={() => { setGame(createGame()); setRolling(false); sceneRef.current?.resetAim(); }}>再来一局</Button>
        </div>
        <div className={styles.angles}>
          <div className={styles.angle}>
            <div className="text-caption text-foreground-muted">切角</div>
            <div className="text-title">{formatAngle(readout.cutAngle)}</div>
          </div>
          <div className={styles.angle}>
            <div className="text-caption text-foreground-muted">分离角</div>
            <div className="text-title">{formatAngle(readout.separation)}</div>
          </div>
        </div>
        <p className="text-caption text-foreground-secondary">定杆接近 90°。高杆更小，低杆更大。目标球紧贴其他球时不显示分离角，白线和黄线仍是真实路径。</p>
        <div>
          <div className="text-caption text-foreground-secondary mb-2">击点 · 上高杆，下低杆，左右加塞</div>
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
          <Button className="mt-2" size="sm" variant="ghost" onClick={() => setSpin({ x: 0, y: 0 })}>击点回中</Button>
        </div>
        <label className="flex flex-col gap-1 text-caption text-foreground-secondary">
          力度 {Math.round(power * 100)}
          <input className={styles.slider} type="range" min={0.05} max={1} step={0.01} value={power} aria-label="力度" onChange={event => setPower(Number(event.target.value))} />
        </label>
        <label className="flex flex-col gap-1 text-caption text-foreground-secondary">
          抬杆 {Math.round(elevation * 180 / Math.PI)}°
          <input className={styles.slider} type="range" min={0} max={25} step={1} value={Math.round(elevation * 180 / Math.PI)} aria-label="抬杆角度" onChange={event => setElevation(Number(event.target.value) * Math.PI / 180)} />
        </label>
        <div className={styles.modes}>
          <Button size="sm" aria-pressed={mode === 'table'} onClick={() => setMode('table')}>球台</Button>
          <Button size="sm" aria-pressed={mode === 'follow'} onClick={() => setMode('follow')}>跟杆</Button>
          <Button size="sm" aria-pressed={mode === 'top'} onClick={() => setMode('top')}>俯视</Button>
        </div>
        {game.phase === 'choice' && game.choice?.kind === 'break' && (
          <div className={styles.actions}>
            <Button variant="primary" onClick={() => setGame(current => choose(current, 'take'))}>自由球打这一台</Button>
            <Button onClick={() => setGame(current => choose(current, 'self'))}>我来重新开球</Button>
            <Button onClick={() => setGame(current => choose(current, 'again'))}>让对方重开</Button>
          </div>
        )}
        {game.phase === 'choice' && game.choice?.kind === 'break-eight' && (
          <div className={styles.actions}>
            <Button variant="primary" onClick={() => setGame(current => choose(current, 'as-is'))}>按母球位置打</Button>
            <Button onClick={() => setGame(current => choose(current, 'kitchen'))}>线后自由球</Button>
          </div>
        )}
        <p className="text-caption text-foreground-muted">移动鼠标瞄准，从母球往后拖再松开就是出杆。左右方向键微调，空格出杆。同一台设备轮流打，甲方先开球。</p>
      </aside>
    </div>
  );
}
