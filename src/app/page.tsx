'use client';

import '@/styles/index.css';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type PointerEvent } from 'react';
import { Footer } from '@/components/footer';
import { TopBar } from '@/components/topbar';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Button } from '@/components/ui/button';
import { buttonClassName } from '@/components/ui/button-styles';
import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { PlanetIllustration } from '@/components/ui/planet-illustration';
import { buildTether, type OrbitTether } from './home/orbit';
import { useHomeCues } from './home/useHomeCues';
import { ProfileShortcut } from './profile/components/ProfileShortcut';
import { useCurrentProfile } from './profile/useCurrentProfile';
import { getAtmosphere, type Atmosphere } from '@/lib/atmosphere';
import styles from './home.module.css';

type SpaceTone = 'primary' | 'info' | 'accent' | 'success' | 'warning';
type NodeWeight = 'lead' | 'regular' | 'quiet';

interface OrbitNode {
  id: 'soul' | 'moments' | 'cloud' | 'island' | 'doodle';
  title: string;
  description: string;
  href: string;
  icon: IconName;
  tone: SpaceTone;
  tag: string;
  weight: NodeWeight;
  slotClass: string;
  leanX: number;
  leanY: number;
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
    weight: 'lead',
    slotClass: styles.slotTopLeft,
    leanX: -0.9,
    leanY: -0.7
  },
  {
    id: 'moments',
    title: '星河',
    description: '每一句话，都是一颗星',
    href: '/moments',
    icon: 'heart',
    tone: 'accent',
    tag: '图文星语',
    weight: 'regular',
    slotClass: styles.slotTopRight,
    leanX: 0.9,
    leanY: -0.7
  },
  {
    id: 'cloud',
    title: '云传',
    description: '文字与文件，轻松传递',
    href: '/cloud',
    icon: 'cloud',
    tone: 'info',
    tag: '跨端快传',
    weight: 'regular',
    slotClass: styles.slotMidLeft,
    leanX: -1,
    leanY: 0.25
  },
  {
    id: 'island',
    title: '浮岛',
    description: '自由拼贴，共同浮岛',
    href: '/island',
    icon: 'compass',
    tone: 'warning',
    tag: '共创画布',
    weight: 'quiet',
    slotClass: styles.slotMidRight,
    leanX: 1,
    leanY: 0.25
  },
  {
    id: 'doodle',
    title: '画镜',
    description: '让表情变成漫画',
    href: '/doodle',
    icon: 'camera',
    tone: 'success',
    tag: '趣味创作',
    weight: 'quiet',
    slotClass: styles.slotBottom,
    leanX: 0,
    leanY: 0.9
  }
];

const WHISPERS: Array<{ text: string; href?: string }> = [
  { text: '嗨，欢迎着陆 ✨' },
  { text: '今天过得怎么样？' },
  { text: '去星球逛逛吧', href: '/soul' },
  { text: '有想传的东西吗？', href: '/cloud' },
  { text: '留下一点星河吧', href: '/moments' },
  { text: '轻轻戳我一下～' }
];

export default function Home() {
  const profile = useCurrentProfile();
  const name = profile?.name?.trim() || '';
  const [atmosphere, setAtmosphere] = useState<Atmosphere>(() => ({
    period: 'dusk',
    periodLabel: '此刻',
    isNight: false,
    headline: name ? `你好，${name}` : '欢迎着陆 Soul 星球',
    placeholder: '想说点什么…'
  }));
  const cues = useHomeCues(profile);
  const [focused, setFocused] = useState<OrbitNode | null>(null);
  const [whisperIdx, setWhisperIdx] = useState(0);
  const [whisperVisible, setWhisperVisible] = useState(false);
  const [pokeCount, setPokeCount] = useState(0);
  const [tether, setTether] = useState<OrbitTether | null>(null);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const stageRef = useRef<HTMLElement>(null);
  const planetRef = useRef<HTMLButtonElement>(null);
  const slotRefs = useRef(new Map<OrbitNode['id'], HTMLElement>());
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
    if (whisperTimer.current) window.clearTimeout(whisperTimer.current);
  }, []);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    const measure = () => {
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      setStageSize((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
      const planetEl = planetRef.current;
      const slot = focused ? slotRefs.current.get(focused.id) : null;
      if (!planetEl || !slot) {
        setTether(null);
        return;
      }
      const origin = stage.getBoundingClientRect();
      const planetBox = planetEl.getBoundingClientRect();
      const cardBox = slot.getBoundingClientRect();
      setTether(buildTether(
        {
          x: planetBox.left - origin.left + planetBox.width / 2,
          y: planetBox.top - origin.top + planetBox.height / 2
        },
        {
          x: cardBox.left - origin.left,
          y: cardBox.top - origin.top,
          w: cardBox.width,
          h: cardBox.height
        }
      ));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    if (planetRef.current) observer.observe(planetRef.current);
    for (const slot of slotRefs.current.values()) observer.observe(slot);
    return () => observer.disconnect();
  }, [focused]);

  const enterNode = (node: OrbitNode) => setFocused(node);

  const blurNode = (event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && stageRef.current?.contains(next)) return;
    setFocused(null);
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
  const whisper = WHISPERS[whisperIdx];
  const whisperShown = whisperVisible && !focused;
  const cue = focused ? cues[focused.id] : null;

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
          ref={stageRef}
          className={styles.stage}
          style={stageStyle}
          data-has-focus={focused ? '' : undefined}
          aria-label="探索 Soul 星球"
          onMouseLeave={() => setFocused(null)}
        >
          {/* 背景椭圆星轨、巡航微星与动态引力弧 */}
          <div className={styles.backdrop} aria-hidden="true">
            <span className={styles.glow} />

            <svg className={styles.orbitSvg} viewBox="0 0 1000 600" fill="none" preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="orbit-fade-a" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="hsl(var(--active-tone))" stopOpacity="0.09" />
                  <stop offset="45%" stopColor="hsl(var(--active-tone))" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="hsl(var(--active-tone))" stopOpacity="0.12" />
                </linearGradient>
                <linearGradient id="orbit-fade-b" x1="100%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="hsl(var(--border-hover))" stopOpacity="0.16" />
                  <stop offset="50%" stopColor="hsl(var(--active-tone))" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="hsl(var(--border-hover))" stopOpacity="0.12" />
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
                  stroke="hsl(var(--active-tone) / 0.36)"
                  strokeWidth="1.2"
                  strokeDasharray="240 160 110 200"
                  strokeLinecap="round"
                />
              </g>

            </svg>

            <svg
              className={styles.tetherSvg}
              viewBox={`0 0 ${Math.max(stageSize.w, 1)} ${Math.max(stageSize.h, 1)}`}
              aria-hidden="true"
            >
              {focused && tether ? (
                <g key={focused.id} style={{ '--tether-tone': `var(--${focused.tone})` } as CSSProperties}>
                  <path d={tether.d} pathLength={100} className={styles.tether} data-active="" fill="none" strokeWidth="1.75" strokeLinecap="round" />
                  <circle cx={tether.anchor.x} cy={tether.anchor.y} r="3.5" className={styles.anchorDot} />
                </g>
              ) : null}
            </svg>
          </div>

          {/* 中心主星 */}
          <div className={styles.center}>
            <div className={styles.planetBox}>
              <Button
                ref={planetRef}
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
              {whisper.href ? (
                <Link
                  href={whisper.href}
                  className={styles.centerBubble}
                  data-show={whisperShown || undefined}
                  tabIndex={whisperShown ? undefined : -1}
                  aria-hidden={whisperShown ? undefined : true}
                >
                  {whisperShown ? whisper.text : ''}
                </Link>
              ) : (
                <span className={styles.centerBubble} data-show={whisperShown || undefined} role="status" aria-live="polite">
                  {whisperShown ? whisper.text : ''}
                </span>
              )}
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
                {focused && cue ? (
                  <>
                    {cue.detail ? <p className={styles.centerDesc}>{cue.detail}</p> : null}
                    <Link href={cue.href} className={buttonClassName({ variant: 'ghost', size: 'sm', className: styles.centerAction })}>
                      {cue.action}
                    </Link>
                  </>
                ) : (
                  <p className={styles.centerDesc}>挑一颗星，轻轻着陆</p>
                )}
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
                  ref={(element) => {
                    if (element) slotRefs.current.set(node.id, element);
                    else slotRefs.current.delete(node.id);
                  }}
                  className={`${styles.slot} ${node.slotClass}`}
                  style={nodeStyle}
                  data-focused={isSelected || undefined}
                  data-weight={node.weight}
                >
                  <Card
                    href={node.href}
                    padding="none"
                    bodyWrap={false}
                    className={styles.satellite}
                    data-focused={isSelected || undefined}
                    onPointerMove={trackSpot}
                    onMouseEnter={() => enterNode(node)}
                    onFocus={() => enterNode(node)}
                    onBlur={blurNode}
                  >
                    <span className={styles.nodeIcon} aria-hidden="true">
                      <Icon name={node.icon} />
                    </span>
                    <div className={styles.nodeBody}>
                      <div className={styles.nodeTitleRow}>
                        <div className={styles.nodeTitle}>{node.title}</div>
                        <span className={styles.nodeTag}>{node.tag}</span>
                      </div>
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
