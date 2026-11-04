'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { Button, buttonClassName, type ButtonVariant } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Popconfirm } from '@/components/ui/popconfirm';
import { useConfirm } from '@/components/ui/confirm';
import { Popover } from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';
import { TopBar } from '@/components/topbar';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Card } from '@/components/card';
import { Show } from '@/components/base/show';
import type { ThemeCatalog } from './theme-catalog';
import styles from './uikit.module.css';
import { FoundationShowcase } from './FoundationShowcase';
import { IconShowcase } from './IconShowcase';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

const variants: { variant: ButtonVariant; label: string }[] = [
  { variant: 'outline', label: '有边框' },
  { variant: 'ghost', label: '无边框' },
  { variant: 'primary', label: '主题色' }
];
const sections = [['overview', '概览'], ['skins', '皮肤'], ['typography', '字体'], ['radii', '圆角'], ['buttons', '按钮'], ['icons', '图标'], ['foundations', '基础组件'], ['overlays', '浮层'], ['dialogs', '弹窗'], ['shared', '通用组件'], ['colors', '颜色'], ['shadows', '阴影']] as const;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section id={id} className={styles.section} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} className={styles.sectionTitle}>{title}</h2>
    {children}
  </section>;
}

export default function UIKitShowcase({ catalog }: { catalog: ThemeCatalog }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(false);
  const [showContent, setShowContent] = useState(true);
  const [status, setStatus] = useState('');
  const [copied, setCopied] = useState('');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [scope, setScope] = useState('all');
  const [skin, setSkin] = useState(catalog.skins[0].name);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const loadingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirm = useConfirm();
  useEffect(() => () => {
    if (loadingTimer.current) clearTimeout(loadingTimer.current);
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);
  const showLoading = () => {
    setLoading(true);
    loadingTimer.current = setTimeout(() => { setLoading(false); setStatus('加载完成'); }, 1200);
  };
  const copyToken = async (name: string, plainVariable = false) => {
    try {
      await navigator.clipboard.writeText(plainVariable ? `var(${name})` : `hsl(var(${name}))`);
      setCopied(name);
      setStatus(`已复制 ${name}`);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(''), 1800);
    } catch { setStatus('复制失败，请手动复制'); }
  };
  const groups = [...new Set(catalog.colors.map(color => color.group))];
  const search = query.trim().toLowerCase();
  const visibleColors = catalog.colors.filter(color => (scope === 'all' || color.scope === scope) && (group === 'all' || color.group === group)
    && `${color.name} ${color.label} ${color.group}`.toLowerCase().includes(search));
  const skinLabel = catalog.skins.find(item => item.name === skin)?.label;

  return <div className={styles.page}>
    <TopBar middle="UIKit" backHref="/" right={<ThemeToggle />} />
    <div className={`${styles.layout} app-content-width`}>
      <aside className={styles.sidebar}>
        <nav aria-label="UIKit 目录">{sections.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>
      </aside>
      <main className={styles.main}>
        <header id="overview" className={styles.overview}><h1>组件与主题</h1></header>
        <div className="sr-only" role="status" aria-live="polite">{status}</div>

        <Section id="skins" title="皮肤">
          <div className={styles.skinToolbar} role="group" aria-label="预览皮肤">
            {catalog.skins.map(item => <Button key={item.name} aria-pressed={skin === item.name} onClick={() => setSkin(item.name)}>{item.label}</Button>)}
            <span className={styles.resultCount}>仅影响预览与颜色目录</span>
          </div>
          <div className={styles.skinGrid}>
            {(['light', 'dark'] as const).map(mode => <article key={mode} className={`${styles.skinPreview} ${mode}`} data-skin={skin} data-theme-preview={mode}>
              <div className={styles.cardHeading}><h3>{mode === 'light' ? '浅色' : '深色'} · {skinLabel}</h3><span className={styles.accentPreview}>强调色</span></div>
              <p className={styles.previewText}>文字示例</p>
              <div className={styles.previewActions}>
                <Button variant="primary" onClick={() => setStatus(`已点击${mode === 'light' ? '浅色' : '深色'}预览按钮`)}>主要操作</Button>
                <Button variant="primary" disabled>禁用</Button><Button variant="primary" loading>加载中</Button>
              </div>
              <label className={styles.previewField}><span>输入与焦点</span><Input aria-label={`${mode === 'light' ? '浅色' : '深色'}皮肤输入示例`} placeholder="按 Tab 查看焦点环" /></label>
              <div className={styles.chatPreview}><p className={styles.otherBubble}>对方消息</p><p className={styles.selfBubble}>我的消息</p></div>
              <div className={styles.previewActions}>
                <span className={styles.statusPreview}>操作成功</span>
                <Popover trigger="click" title={`${skinLabel} · 浮层`} content={<div className={styles.overlayDemo}><p>浮层跟随当前主题</p><Tooltip title="提示示例"><Button variant="primary">按钮</Button></Tooltip></div>}>
                  <Button aria-label={`打开${mode === 'light' ? '浅色' : '深色'}皮肤浮层`}>查看浮层</Button>
                </Popover>
              </div>
            </article>)}
          </div>
          <details className={styles.usage}><summary>用法</summary><pre className={styles.code}><code>{'<html class="dark" data-skin="blue">…</html>\n<section className="light" data-skin="violet">…</section>'}</code></pre></details>
        </Section>

        <Section id="typography" title="字体">
          <p className={styles.sectionNote}>正文、按钮和输入统一为 14px，长文 16px，提示 12px。移动端仅收紧标题阶梯，触屏热区与字号独立。</p>
          <div className={styles.typeList}>{catalog.typography.map(token => <article key={token.name} className={styles.typeRow}>
            <div className={styles.typeMeta}><h3>{token.label}</h3><p>{token.usage}</p><code>{token.name}</code><span>桌面 {token.size} · 移动 {token.mobileSize} · 行高 {token.lineHeight} · 字重 {token.weight}</span></div>
            <p className={styles.typeSample} style={{ fontSize: `var(${token.name})`, lineHeight: `var(--line-height-${token.role})`, fontWeight: Number(token.weight) || 400 }}>文字示例 Aa 123</p>
            <Button variant="ghost" size="sm" icon={copied === token.name ? <Icon name="check" /> : <Icon name="copy" />} aria-label={`复制 ${token.name} 变量`} title="复制" onClick={() => void copyToken(token.name, true)} />
          </article>)}</div>
        </Section>

        <Section id="radii" title="圆角">
          <div className={styles.radiusGrid}>{catalog.radii.map(token => <article key={token.name} className={styles.panel}>
            <div className={styles.cardHeading}><h3>{token.label}</h3><Button variant="ghost" size="sm" icon={copied === token.name ? <Icon name="check" /> : <Icon name="copy" />} aria-label={`复制 ${token.name} 变量`} title="复制" onClick={() => void copyToken(token.name, true)} /></div>
            <div className={styles.radiusPreview}><div className={styles.radiusSample} data-radius-preview={token.role} style={{ borderRadius: `var(${token.name})` }}>{token.role}</div></div>
            <p className={styles.radiusValue}>{token.value}</p><code className={styles.radiusName}>{token.name}</code>
            <p className={styles.radiusUsage}>{token.usage}</p>
            <details className={styles.usage}><summary>用法</summary><pre className={styles.code}><code>{`border-radius: var(${token.name});\n<div className="rounded-${token.role}">…</div>`}</code></pre></details>
          </article>)}</div>
        </Section>

        <Section id="buttons" title="按钮">
          <div className={styles.variantGrid}>
            {variants.map(({ variant, label }) => <article key={variant} className={styles.panel}>
              <div className={styles.cardHeading}><h3>{label}</h3><code>{variant}</code></div>
              <div className={styles.variantPreview}>
                <Button variant={variant} onClick={() => setStatus(`已点击${label}按钮`)}>按钮</Button>
                <Button variant={variant} icon={<Icon name="download" />} aria-label={`${label}下载示例`} title="下载" onClick={() => setStatus('已点击图标按钮')} />
                <Button variant={variant} disabled>禁用</Button><Button variant={variant} loading>加载中</Button>
              </div>
              <details className={styles.usage}><summary>用法</summary><pre className={styles.code}><code>{`<Button variant="${variant}">按钮</Button>`}</code></pre></details>
            </article>)}
          </div>
          <div className={styles.detailGrid}>
            <article className={styles.panel}><h3>尺寸</h3><div className={styles.buttonRow}><Button size="sm">sm · 32</Button><Button>md · 36</Button><Button size="lg">lg · 40</Button></div></article>
            <article className={styles.panel}><h3>图标与状态</h3>
              <div className={styles.buttonRow}><Button icon={<Icon name="thunderbolt" />} loading={loading} onClick={showLoading}>{loading ? '加载中' : '加载'}</Button>
                <Button variant="ghost" aria-pressed={selected} onClick={() => setSelected(!selected)} icon={selected ? <Icon name="check" /> : undefined}>{selected ? '已选中' : '选中'}</Button>
                <Button icon={<Icon name="copy" />} aria-label="纯图标按钮示例" title="复制" onClick={() => setStatus('已点击图标按钮')} />
              </div>
            </article>
            <article className={styles.panel}><div className={styles.cardHeading}><h3>整行</h3><code>block</code></div><div className={styles.buttonRow}><Button block variant="primary" onClick={() => setStatus('已点击整行按钮')}>继续</Button></div></article>
            <article className={styles.panel}><div className={styles.cardHeading}><h3>链接</h3><code>buttonClassName</code></div><div className={styles.buttonRow}><Link href="/cloud" className={buttonClassName()}>云传</Link><Link href="/cloud?tab=plaza" className={buttonClassName({ variant: 'ghost' })}>广场</Link></div></article>
          </div>
        </Section>

        <Section id="icons" title="图标与反馈"><IconShowcase skin={skin} /></Section>

        <Section id="foundations" title="Soul 基础组件"><FoundationShowcase skin={skin} /></Section>

        <Section id="overlays" title="浮层">
          <div className={styles.variantGrid}>
            <article className={styles.panel}><div className={styles.cardHeading}><h3>气泡卡片</h3><code>Popover</code></div><div className={styles.buttonRow}>
              <Popover trigger="click" open={popoverOpen} onOpenChange={setPopoverOpen} title="气泡卡片" content={<div className={styles.overlayDemo}><p>交互内容</p><Tooltip title="关闭气泡"><Button onClick={() => setPopoverOpen(false)}>完成</Button></Tooltip></div>}><Button aria-label="打开气泡卡片">打开</Button></Popover>
            </div></article>
            <article className={styles.panel}><div className={styles.cardHeading}><h3>文字提示</h3><code>Tooltip</code></div><div className={styles.buttonRow}>
              <Tooltip title="提示内容"><Button aria-label="悬停提示示例">悬停或聚焦</Button></Tooltip>
              <Tooltip title="点击提示" isMobile><Button aria-label="点击提示示例">点击</Button></Tooltip>
            </div></article>
            <article className={styles.panel}><h3>嵌套与禁用</h3><div className={styles.buttonRow}>
              <Popconfirm title="确认操作？" onConfirm={() => setStatus('已确认')}><Tooltip title="嵌套提示"><Button aria-label="嵌套气泡确认示例" onClick={event => event.stopPropagation()}>确认</Button></Tooltip></Popconfirm>
              <Tooltip title="禁用按钮提示"><Button disabled>禁用</Button></Tooltip>
            </div></article>
          </div>
        </Section>

        <Section id="dialogs" title="弹窗">
          <div className={styles.variantGrid}>
            <article className={styles.panel}><div className={styles.cardHeading}><h3>对话框</h3><code>Modal</code></div><div className={styles.buttonRow}><Button aria-label="打开对话框" onClick={() => setModalOpen(true)}>打开</Button></div></article>
            <article className={styles.panel}><div className={styles.cardHeading}><h3>气泡确认</h3><code>Popconfirm</code></div><div className={styles.buttonRow}><Popconfirm title="确认操作？" okText="确认" cancelText="取消" onConfirm={() => setStatus('已确认')}><Button aria-label="打开气泡确认">打开</Button></Popconfirm></div></article>
            <article className={styles.panel}><div className={styles.cardHeading}><h3>全局确认</h3><code>useConfirm</code></div><div className={styles.buttonRow}><Button aria-label="打开全局确认" onClick={() => confirm.confirm({ title: '确认操作？', content: '演示内容', okText: '确认', cancelText: '取消', onOk: () => setStatus('已确认') })}>打开</Button></div></article>
          </div>
        </Section>

        <Section id="shared" title="通用组件">
          <div className={styles.cardExamples}>
            <Card title="云传" description="primary" href="/cloud" icon={<Icon name="cloud" />} tone="primary" />
            <Card title="星球" description="info" href="/soul" icon={<Icon name="globe" />} tone="info" />
            <Card title="心迹" description="accent" href="/moments" icon={<Icon name="heart" />} tone="accent" />
            <Card title="漫游相机" description="success" href="/doodle" icon={<Icon name="camera" />} tone="success" />
          </div>
          <div className={styles.detailGrid}>
            <article className={styles.panel}><div className={styles.cardHeading}><h3>条件渲染</h3><code>Show</code></div>
              <div className={styles.buttonRow}><Button variant="ghost" aria-label="切换条件渲染" aria-pressed={showContent} onClick={() => setShowContent(!showContent)}>切换</Button></div>
              <div className={styles.helperPreview}><Show is={showContent} fallback={<p>备用内容</p>}><p>主要内容</p></Show></div>
            </article>
            <article className={styles.panel}><h3>页头与主题</h3><div className={styles.helperPreview}><code>TopBar / ThemeToggle</code><p>见本页顶部</p></div></article>
          </div>
        </Section>

        <Section id="colors" title="颜色">
          <p className={styles.sectionNote}>当前皮肤：{skinLabel}</p>
          <div className={styles.colorTools}>
            <Input className={styles.search} prefix={<Icon name="search" />} aria-label="搜索主题颜色" placeholder="搜索颜色或变量" value={query} onChange={event => setQuery(event.target.value)} />
            <Select aria-label="颜色分组" value={group} onChange={setGroup} options={[{ value: "all", label: "全部分组" }, ...groups.map(name => ({ value: name, label: name }))]} />
            <Select aria-label="颜色变化范围" value={scope} onChange={setScope} options={[{ value: "all", label: "全部范围" }, { value: "skin", label: "跟随皮肤" }, { value: "mode", label: "仅深浅模式" }]} />
            <span className={styles.resultCount}>{visibleColors.length} / {catalog.colors.length}</span>
          </div>
          {groups.filter(name => visibleColors.some(color => color.group === name)).map(name => <div key={name} className={styles.colorGroup}>
            <h3 className={styles.groupHeading}>{name}<span>{visibleColors.filter(color => color.group === name).length}</span></h3>
            <div className={styles.colorGrid}>{visibleColors.filter(color => color.group === name).map(color => <article key={color.name} className={styles.colorCard}>
              <div className={styles.colorCardHeading}><div><h4>{color.label}</h4><code>{color.name}</code></div><Button variant="ghost" size="sm" icon={copied === color.name ? <Icon name="check" /> : <Icon name="copy" />} aria-label={`复制 ${color.name} 变量`} title="复制" onClick={() => void copyToken(color.name)} /></div>
              <p className={styles.tokenScope}>{color.scope === 'skin' ? '跟随皮肤' : '仅深浅模式'}</p>
              <div className={styles.swatchPair}>{(['light', 'dark'] as const).map(mode => <div key={mode}><div className={styles.swatchBackdrop}><div className={styles.swatch} style={{ background: catalog.palettes[skin][color.name][mode] }} /></div><div className={styles.swatchLabel}>{mode === 'light' ? '浅色' : '深色'}</div><code className={styles.colorValue}>{catalog.palettes[skin][color.name][mode]}</code></div>)}</div>
              <details className={styles.tokenSource}><summary>定义</summary><code>浅色：{color.source.light}</code><code>深色：{color.source.dark}</code></details>
            </article>)}</div>
          </div>)}
          {!visibleColors.length && <div className={styles.empty}>无匹配颜色</div>}
        </Section>

        <Section id="shadows" title="阴影">
          <div className={styles.shadowGrid}>{catalog.shadows.map(shadow => <article key={shadow.name} className={styles.panel}>
            <div className={styles.cardHeading}><h3>{shadow.label}</h3><Button variant="ghost" size="sm" icon={copied === shadow.name ? <Icon name="check" /> : <Icon name="copy" />} aria-label={`复制 ${shadow.name} 变量`} title="复制" onClick={() => void copyToken(shadow.name, true)} /></div>
            <div className={styles.shadowPreview}><div style={{ boxShadow: `var(${shadow.name})` }}>Aa</div></div><code className={styles.shadowName}>{shadow.name}</code>
          </article>)}</div>
        </Section>
      </main>
    </div>
    <Modal title="对话框" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => { setModalOpen(false); setStatus('已确认'); }} okText="确认" cancelText="取消" centered><p className={styles.modalText}>演示内容</p></Modal>
  </div>;
}
