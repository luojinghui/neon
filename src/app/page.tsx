'use client';

import '@/styles/index.css';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Footer } from '@/components/footer';
import { TopBar } from '@/components/topbar';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { PlanetIllustration } from '@/components/ui/planet-illustration';
import { ProfileShortcut } from './profile/components/ProfileShortcut';
import { useCurrentProfile } from './profile/useCurrentProfile';
import styles from './home.module.css';

type SpaceTone = 'primary' | 'info' | 'accent' | 'success' | 'warning';

interface OrbitNode {
  id: 'soul' | 'moments' | 'cloud' | 'island' | 'doodle';
  title: string;
  description: string;
  href: string;
  icon: IconName;
  tone: SpaceTone;
  tag: string;
  slotClass: string;
  leanX: number;
  leanY: number;
  /** Curved tether path from the center planet (500, 265) to this satellite in the 1000x600 SVG stage. */
  tetherPath: string;
  anchor: { x: number; y: number };
}

const ORBIT_NODES: OrbitNode[] = [
  {
    id: 'soul',
    title: '星球',
    description: '在此着陆，随意聊聊',
    href: '/soul',
    icon: 'globe',
    tone: 'primary',
    tag: '实时互动',
    slotClass: styles.slotTopLeft,
    leanX: -0.9,
    leanY: -0.7,
    tetherPath: 'M 500 265 Q 350 140 205 108',
    anchor: { x: 205, y: 108 }
  },
  {
    id: 'moments',
    title: '星河',
    description: '每一句话，都是一颗星',
    href: '/moments',
    icon: 'heart',
    tone: 'accent',
    tag: '图文星语',
    slotClass: styles.slotTopRight,
    leanX: 0.9,
    leanY: -0.7,
    tetherPath: 'M 500 265 Q 650 140 795 108',
    anchor: { x: 795, y: 108 }
  },
  {
    id: 'cloud',
    title: '云传',
    description: '文字与文件，轻松传递',
    href: '/cloud',
    icon: 'cloud',
    tone: 'info',
    tag: '跨端快传',
    slotClass: styles.slotMidLeft,
    leanX: -1,
    leanY: 0.25,
    tetherPath: 'M 500 265 Q 320 250 170 310',
    anchor: { x: 170, y: 310 }
  },
  {
    id: 'island',
    title: '浮岛',
    description: '自由拼贴，共同浮岛',
    href: '/island',
    icon: 'compass',
    tone: 'warning',
    tag: '共创画布',
    slotClass: styles.slotMidRight,
    leanX: 1,
    leanY: 0.25,
    tetherPath: 'M 500 265 Q 680 250 830 310',
    anchor: { x: 830, y: 310 }
  },
  {
    id: 'doodle',
    title: '画镜',
    description: '让表情变成漫画',
    href: '/doodle',
    icon: 'camera',
    tone: 'success',
    tag: '趣味创作',
    slotClass: styles.slotBottom,
    leanX: 0,
    leanY: 0.9,
    tetherPath: 'M 500 265 Q 535 395 500 515',
    anchor: { x: 500, y: 515 }
  }
];

const WHISPERS = [
  '嗨，欢迎着陆 ✨',
  '今天过得怎么样？',
  '去星球逛逛吧',
  '有想传的东西吗？',
  '留下一点星河吧',
  '轻轻戳我一下～'
];

interface Atmosphere {
  periodLabel: string;
  isNight: boolean;
  headline: string;
}

function getAtmosphere(hour: number, name: string): Atmosphere {
  let greeting = '晚上好';
  let periodLabel = '暮色时分';
  let isNight = true;

  if (hour < 5 || hour >= 23) {
    greeting = '夜深啦';
    periodLabel = '深夜电台';
    isNight = true;
  } else if (hour < 11) {
    greeting = '早上好';
    periodLabel = '清晨微光';
    isNight = false;
  } else if (hour < 14) {
    greeting = '中午好';
    periodLabel = '午间小憩';
    isNight = false;
  } else if (hour < 18) {
    greeting = '下午好';
    periodLabel = '午后时光';
    isNight = false;
  }

  return {
    periodLabel,
    isNight,
    headline: name ? `${greeting}，${name}` : `${greeting}，欢迎着陆 Soul 星球`
  };
}

export default function Home() {
  const profile = useCurrentProfile();
  const name = profile?.name?.trim() || '';
  const [atmosphere, setAtmosphere] = useState<Atmosphere>(() => ({
    periodLabel: '此刻',
    isNight: false,
    headline: name ? `你好，${name}` : '欢迎着陆 Soul 星球'
  }));
  const [focused, setFocused] = useState<OrbitNode | null>(null);
  const [whisperIdx, setWhisperIdx] = useState(0);
  const [whisperVisible, setWhisperVisible] = useState(false);
  const [pokeCount, setPokeCount] = useState(0);
  const leaveTimer = useRef<number | null>(null);
  const whisperTimer = useRef<number | null>(null);

  useEffect(() => {
    const update = () => setAtmosphere(getAtmosphere(new Date().getHours(), name));
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') update();
    };
    update();
    const timer = window.setInterval(update, 60_000);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [name]);

  useEffect(() => () => {
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    if (whisperTimer.current) window.clearTimeout(whisperTimer.current);
  }, []);

  const enterNode = (node: OrbitNode) => {
    if (leaveTimer.current) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    setFocused(node);
  };

  const leaveNode = (id: OrbitNode['id']) => {
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => {
      setFocused((prev) => (prev?.id === id ? null : prev));
      leaveTimer.current = null;
    }, 90);
  };

  const poke = () => {
    setWhisperIdx((i) => (i + 1) % WHISPERS.length);
    setPokeCount((c) => c + 1);
    setWhisperVisible(true);
    try { navigator.vibrate?.(8); } catch {}
    if (whisperTimer.current) window.clearTimeout(whisperTimer.current);
    whisperTimer.current = window.setTimeout(() => setWhisperVisible(false), 2600);
  };

  const trackSpot = (event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`);
  };

  const stageStyle = {
    '--lean-x': focused ? String(focused.leanX) : '0',
    '--lean-y': focused ? String(focused.leanY) : '0',
    '--active-tone': focused ? `var(--${focused.tone})` : 'var(--primary)',
    '--active-soft': focused ? `var(--${focused.tone}-soft)` : 'var(--primary-soft)'
  } as CSSProperties;

  const centerKey = focused?.id ?? 'idle';

  return (
    <div className="app-screen app-scroll-main flex w-full flex-col overflow-x-hidden overflow-y-auto bg-background text-foreground">
      <TopBar
        middle=""
        leading={<h1 className="whitespace-nowrap text-body-lg font-semibold tracking-tight">Soul 星球</h1>}
        right={
          <div className="flex items-center gap-2">
            <ProfileShortcut returnTo="/" />
            <ThemeToggle />
          </div>
        }
      />

      <main className={`app-content-width flex-1 pb-8 pt-20 sm:pt-24 ${styles.main}`}>
        <section
          className={styles.stage}
          style={stageStyle}
          data-has-focus={focused ? '' : undefined}
          aria-label="探索 Soul 星球"
        >
          {/* 背景椭圆星轨、巡航微星与动态引力弧 */}
          <div className={styles.backdrop} aria-hidden="true">
            <span className={styles.glow} />

            <svg className={styles.orbitSvg} viewBox="0 0 1000 600" fill="none" preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="orbit-fade-a" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="hsl(var(--active-tone))" stopOpacity="0.06" />
                  <stop offset="45%" stopColor="hsl(var(--active-tone))" stopOpacity="0.34" />
                  <stop offset="100%" stopColor="hsl(var(--active-tone))" stopOpacity="0.08" />
                </linearGradient>
                <linearGradient id="orbit-fade-b" x1="100%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="hsl(var(--border-hover))" stopOpacity="0.1" />
                  <stop offset="50%" stopColor="hsl(var(--active-tone))" stopOpacity="0.26" />
                  <stop offset="100%" stopColor="hsl(var(--border-hover))" stopOpacity="0.08" />
                </linearGradient>
                <path
                  id="orbit-path-main"
                  d="M 110 300 A 390 198 0 1 0 890 300 A 390 198 0 1 0 110 300"
                />
                <path
                  id="orbit-path-cross"
                  d="M 185 300 A 315 150 0 1 0 815 300 A 315 150 0 1 0 185 300"
                />
              </defs>

              <g className={styles.orbitGroupMain} transform="rotate(-11 500 300)">
                <use href="#orbit-path-main" stroke="url(#orbit-fade-a)" strokeWidth="1.25" />
                <circle r="3.5" fill="hsl(var(--active-tone))" className={styles.orbiter}>
                  <animateMotion dur="26s" repeatCount="indefinite">
                    <mpath href="#orbit-path-main" />
                  </animateMotion>
                </circle>
                <circle r="2.2" fill="hsl(var(--active-tone))" opacity="0.55" className={styles.orbiter}>
                  <animateMotion dur="26s" begin="-13s" repeatCount="indefinite">
                    <mpath href="#orbit-path-main" />
                  </animateMotion>
                </circle>
              </g>

              <g className={styles.orbitGroupCross} transform="rotate(15 500 300)">
                <use
                  href="#orbit-path-cross"
                  stroke="url(#orbit-fade-b)"
                  strokeWidth="1.15"
                  strokeDasharray="5 8"
                  strokeLinecap="round"
                />
                <circle r="2.8" fill="hsl(var(--accent))" opacity="0.7" className={styles.orbiter}>
                  <animateMotion dur="34s" repeatCount="indefinite">
                    <mpath href="#orbit-path-cross" />
                  </animateMotion>
                </circle>
              </g>

              <g className={styles.orbitGroupInner} transform="rotate(-24 500 285)">
                <ellipse
                  cx="500"
                  cy="285"
                  rx="196"
                  ry="98"
                  stroke="hsl(var(--active-tone) / 0.24)"
                  strokeWidth="1.2"
                  strokeDasharray="240 160 110 200"
                  strokeLinecap="round"
                />
              </g>

              {ORBIT_NODES.map((node) => {
                const isSelected = focused?.id === node.id;
                return (
                  <g key={node.id}>
                    <path
                      d={node.tetherPath}
                      pathLength={100}
                      className={styles.tether}
                      data-active={isSelected || undefined}
                      stroke={`hsl(var(--${node.tone}) / 0.5)`}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                    <circle
                      cx={node.anchor.x}
                      cy={node.anchor.y}
                      r={isSelected ? 4.5 : 2.5}
                      className={styles.anchorDot}
                      fill={`hsl(var(--${node.tone}))`}
                      opacity={isSelected ? 0.9 : 0.25}
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          {/* 中心主星 */}
          <div className={styles.center}>
            <div className={styles.planetBox}>
              <Button
                variant="ghost"
                data-ui-surface=""
                type="button"
                className={styles.planetButton}
                onClick={poke}
                aria-label="和星球打个招呼"
              >
                <span key={pokeCount} className={pokeCount > 0 ? styles.planetPop : undefined}>
                  <PlanetIllustration size="lg" />
                </span>
              </Button>
              <span
                className={styles.centerBubble}
                data-show={(whisperVisible && !focused) || undefined}
                role="status"
                aria-live="polite"
              >
                {whisperVisible && !focused ? WHISPERS[whisperIdx] : ''}
              </span>
            </div>

            <div className={styles.centerTextSlot} aria-live="polite">
              <div key={centerKey} className={styles.centerText}>
                <span className={styles.coordTag}>
                  <Icon name={focused ? focused.icon : (atmosphere.isNight ? 'moon' : 'sun')} size="sm" />
                  <span>{focused ? focused.tag : atmosphere.periodLabel}</span>
                </span>
                <h2 className={styles.centerTitle}>
                  {focused ? focused.title : atmosphere.headline}
                </h2>
                <p className={styles.centerDesc}>
                  {focused ? focused.description : '挑一颗星，轻轻着陆'}
                </p>
              </div>
            </div>
          </div>

          {/* 环绕卫星站点 */}
          <nav aria-label="探索 Soul 星球" className={styles.satellites}>
            {ORBIT_NODES.map((node) => {
              const isSelected = focused?.id === node.id;
              const nodeStyle = {
                '--node-color': `var(--${node.tone})`,
                '--node-soft': `var(--${node.tone}-soft)`
              } as CSSProperties;

              return (
                <div
                  key={node.id}
                  className={`${styles.slot} ${node.slotClass}`}
                  style={nodeStyle}
                  data-focused={isSelected || undefined}
                >
                  <Card
                    href={node.href}
                    padding="none"
                    bodyWrap={false}
                    className={styles.satellite}
                    data-focused={isSelected || undefined}
                    onPointerMove={trackSpot}
                    onMouseEnter={() => enterNode(node)}
                    onMouseLeave={() => leaveNode(node.id)}
                    onFocus={() => enterNode(node)}
                    onBlur={() => leaveNode(node.id)}
                  >
                    <span className={styles.nodeIcon} aria-hidden="true">
                      <Icon name={node.icon} />
                    </span>
                    <div className={styles.nodeBody}>
                      <div className={styles.nodeTitle}>{node.title}</div>
                      <p className={styles.nodeDesc}>{node.description}</p>
                    </div>
                    <Icon name="arrow-right" size="sm" className={styles.nodeArrow} />
                  </Card>
                </div>
              );
            })}
          </nav>
        </section>
      </main>

      <Footer />
    </div>
  );
}
