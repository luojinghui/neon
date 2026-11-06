'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui/icon';
import { Button, type ButtonVariant } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { Menu } from '@/components/ui/menu';
import { AppearancePanel } from '@/components/theme/appearance-panel';
import { Alert, AlertDialog } from '@/components/ui/alert';
import { Modal } from '@/components/ui/modal';
import { Popconfirm } from '@/components/ui/popconfirm';
import { useConfirm } from '@/components/ui/confirm';
import { Popover } from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { PlanetIllustration } from '@/components/ui/planet-illustration';
import { TopBar } from '@/components/topbar';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { FormShowcase } from './FormShowcase';
import { IconShowcase } from './IconShowcase';
import type { ThemeCatalog } from './theme-catalog';
import styles from './uikit.module.css';

const sections = [
  ['buttons', '操作按钮'], ['forms', '表单输入'], ['navigation', '导航切换'], ['menus', '菜单与外观'],
  ['display', '内容展示'], ['feedback', '状态反馈'], ['overlays', '浮层与弹窗'],
  ['icons', '图标'], ['typography', '文字'], ['colors', '主题色']
] as const;
const variants: { variant: ButtonVariant; label: string }[] = [
  { variant: 'outline', label: '常规操作' }, { variant: 'ghost', label: '辅助操作' }, { variant: 'primary', label: '主要操作' }
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section id={id} className={styles.section} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} className={styles.sectionTitle}>{title}</h2>{children}
  </section>;
}

function Example({ title, name, children }: { title: string; name: string; children: ReactNode }) {
  return <Card bodyClassName={styles.stack}>
    <div className={styles.exampleHeading}><h3>{title}</h3><code>{name}</code></div>{children}
  </Card>;
}

export default function UIKitShowcase({ catalog }: { catalog: Pick<ThemeCatalog, 'skins' | 'typography' | 'colors'> }) {
  const [skin, setSkin] = useState(catalog.skins[0].name);
  const [activeSection, setActiveSection] = useState<string>('buttons');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(false);
  const [status, setStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [noticeVisible, setNoticeVisible] = useState(true);
  const main = useRef<HTMLElement>(null);
  const loadingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirm = useConfirm();

  useEffect(() => () => { if (loadingTimer.current) clearTimeout(loadingTimer.current); }, []);
  useEffect(() => {
    const root = main.current;
    if (!root) return;
    const updateSection = () => {
      if (root.scrollHeight - root.scrollTop - root.clientHeight <= 2) {
        setActiveSection(sections[sections.length - 1][0]);
        return;
      }
      const top = root.getBoundingClientRect().top + 48;
      const current = [...root.querySelectorAll<HTMLElement>('section[id]')].filter(section => section.getBoundingClientRect().top <= top).at(-1);
      setActiveSection(current?.id ?? 'buttons');
    };
    root.addEventListener('scroll', updateSection, { passive: true });
    return () => root.removeEventListener('scroll', updateSection);
  }, []);

  const showLoading = () => {
    setLoading(true);
    loadingTimer.current = setTimeout(() => { setLoading(false); setStatus('加载完成'); }, 1200);
  };
  const save = async () => {
    setSaving(true);
    await new Promise(resolve => setTimeout(resolve, 800));
    setSaving(false); setModalOpen(false); setStatus('已保存');
  };

  return <div className={styles.page}>
    <TopBar middle="UIKit" backHref="/" right={<ThemeToggle />} />
    <div className={`${styles.layout} app-content-width`}>
      <aside className={styles.sidebar}>
        <p className={styles.navLabel}>组件分类</p>
        <nav aria-label="UIKit 组件目录">{sections.map(([id, label]) => <a key={id} href={`#${id}`} aria-current={activeSection === id ? 'location' : undefined} onClick={() => setActiveSection(id)}>{label}</a>)}</nav>
      </aside>
      <main ref={main} className={styles.main} data-skin={skin}>
        <header className={styles.overview}>
          <h1>组件库</h1>
          <div className={styles.skinToolbar} role="group" aria-label="主题色切换">
            <span className={styles.note}>主题色</span>
            {catalog.skins.map(item => <Button size="sm" key={item.name} aria-pressed={skin === item.name} onClick={() => setSkin(item.name)}>{item.label}</Button>)}
          </div>
        </header>
        <div className="sr-only" role="status" aria-live="polite">{status}</div>

        <Section id="buttons" title="操作按钮">
          <div className={styles.buttonGrid}>{variants.map(({ variant, label }) => <Example key={variant} title={label} name={`Button · ${variant}`}>
            <div className={styles.row}><Button variant={variant} onClick={() => setStatus(`已点击${label}`)}>按钮</Button><Button variant={variant} icon={<Icon name="download" />} aria-label={`${label}下载示例`} onClick={() => setStatus('已点击下载')} /></div>
            <div className={styles.row}><Button variant={variant} disabled>禁用</Button><Button variant={variant} loading>加载中</Button></div>
          </Example>)}</div>
          <div className={styles.exampleGrid}>
            <Example title="尺寸" name="sm / md / lg"><div className={styles.row}><Button size="sm">小按钮</Button><Button>中按钮</Button><Button size="lg">大按钮</Button></div></Example>
            <Example title="交互状态" name="loading / aria-pressed"><div className={styles.row}><Button loading={loading} icon={<Icon name="refresh" />} onClick={showLoading}>模拟加载</Button><Button variant="ghost" aria-pressed={selected} icon={<Icon name={selected ? 'check' : 'plus'} />} onClick={() => setSelected(!selected)}>{selected ? '已选中' : '选择'}</Button></div></Example>
          </div>
        </Section>

        <Section id="forms" title="表单输入"><FormShowcase /></Section>

        <Section id="navigation" title="导航切换">
          <Example title="选项卡" name="Tabs"><div className={styles.stack}>{(['sm', 'md', 'lg'] as const).map(size => <div key={size} className={styles.tabExample}>
            <span className={styles.note}>{size}</span><Tabs size={size} aria-label={`${size}选项卡示例`} items={[
              { key: 'all', label: '全部', children: <p className={styles.note}>这里展示全部内容。</p> },
              { key: 'saved', label: '已收藏', children: <p className={styles.note}>这里展示收藏内容。</p> },
              { key: 'recent', label: '最近', children: <p className={styles.note}>这里展示最近浏览的内容。</p> },
              { key: 'disabled', label: '禁用', disabled: true }
            ]} />
          </div>)}</div></Example>
          <div className={styles.fullWidth} style={{ marginTop: '1.25rem' }}><Example title="玻璃质感 · 拖拽选择" name="Tabs">
            <div className={styles.glassStage}>
              <Tabs block size="lg" aria-label="拖拽选择示例" items={[
                { key: 'public', label: '公共' }, { key: 'owned', label: '我的' }, { key: 'joined', label: '已加入' }, { key: 'recent', label: '最近' }
              ]} />
              <span className={styles.note}>PC 按住滑块拖动，App 触摸滑动；经过每个选项时有轻触反馈，松手确认，Esc 取消。</span>
            </div>
          </Example></div>
        </Section>

        <Section id="menus" title="菜单与外观">
          <div className={styles.exampleGrid}>
            <Example title="菜单" name="Menu"><Menu>
              <Menu.Section title="快捷操作">
                <Menu.Item icon={<Icon name="plus" />} label="创建星球" description="开辟一颗新的星球" onClick={() => setStatus('点击了创建星球')} />
                <Menu.Item icon={<Icon name="search" />} label="搜索星球" trailing={<Icon name="arrow-right" />} onClick={() => setStatus('点击了搜索星球')} />
              </Menu.Section>
              <Menu.Section title="账号">
                <Menu.Item icon={<Icon name="user" />} label="个人中心" href="/profile" />
                <Menu.Item tone="danger" icon={<Icon name="trash" />} label="清除缓存" onClick={() => setStatus('点击了清除缓存')} />
              </Menu.Section>
            </Menu></Example>
            <Example title="外观面板" name="AppearancePanel"><AppearancePanel /><span className={styles.note}>模式与主题色全站同步，选择会保存在本机。</span></Example>
          </div>
        </Section>

        <Section id="display" title="内容展示">
          <div className={styles.exampleGrid}>
            <Example title="卡片" name="Card"><Card interactive title="周末漫游" description="收集一些喜欢的日常。" extra={<Icon name="globe" />} footer={<Button size="sm" onClick={() => setStatus('已查看卡片内容')}>查看详情</Button>}><p className={styles.note}>支持标题、内容与底部操作；悬停或聚焦操作可预览交互反馈。</p></Card></Example>
            <Example title="插图" name="PlanetIllustration"><div className={styles.illustrations}>{(['planet', 'comet', 'satellite'] as const).map(variant => <div key={variant}><PlanetIllustration variant={variant} /><span className={styles.note}>{variant}</span></div>)}</div></Example>
          </div>
        </Section>

        <Section id="feedback" title="状态反馈">
          <Example title="行内提醒" name="Alert"><div className={styles.stack}>
            <Alert type="info" showIcon message="提示信息" description="这里展示补充说明。" />
            <Alert type="success" showIcon message="保存成功" />
            <Alert type="warning" showIcon message="还有未保存的内容" />
            <Alert type="error" showIcon message="加载失败，请重试" />
            {noticeVisible ? <Alert key="closable" showIcon message="这条提醒可以关闭" closable onClose={() => setNoticeVisible(false)} /> : <div><Button size="sm" onClick={() => setNoticeVisible(true)}>重新显示可关闭提醒</Button></div>}
          </div></Example>
        </Section>

        <Section id="overlays" title="浮层与弹窗">
          <div className={styles.exampleGrid}>
            <Example title="文字提示" name="Tooltip"><div className={styles.row}><Tooltip title="这里是提示内容"><Button>悬停或聚焦</Button></Tooltip><Tooltip title="禁用按钮的说明"><Button disabled>禁用提示</Button></Tooltip></div></Example>
            <Example title="气泡卡片" name="Popover"><div className={styles.row}><Popover trigger="click" open={popoverOpen} onOpenChange={setPopoverOpen} title="气泡卡片" content={<div className={styles.stack}><p>在浮层里放置内容与操作。</p><Tooltip title="关闭当前浮层"><Button onClick={() => setPopoverOpen(false)}>完成</Button></Tooltip></div>}><Button>打开气泡卡片</Button></Popover></div></Example>
            <Example title="气泡确认" name="Popconfirm"><div className={styles.row}><Popconfirm title="确认执行这个操作？" okText="确认" cancelText="取消" onConfirm={() => setStatus('已确认操作')}><Button>打开气泡确认</Button></Popconfirm></div></Example>
            <Example title="对话框" name="Modal"><div className={styles.row}><Button onClick={() => setModalOpen(true)}>打开对话框</Button></div></Example>
            <Example title="提醒弹窗" name="AlertDialog"><div className={styles.row}><Button onClick={() => setAlertOpen(true)}>打开提醒弹窗</Button></div></Example>
            <Example title="全局确认" name="useConfirm"><div className={styles.row}><Button onClick={() => confirm.confirm({ title: '确认操作？', content: '确认后会显示操作结果。', okText: '确认', cancelText: '取消', themeSource: main.current, onOk: () => setStatus('已确认全局操作') })}>打开全局确认</Button></div></Example>
          </div>
        </Section>

        <Section id="icons" title="图标"><IconShowcase /></Section>

        <Section id="typography" title="文字">
          <Card padding="none"><div className={styles.typeList}>{catalog.typography.map(token => <div key={token.role} className={styles.typeRow}>
            <span className={styles.note}>{token.label}<code>{token.role}</code></span>
            <p style={{ fontSize: `var(${token.name})`, lineHeight: `var(--line-height-${token.role})`, fontWeight: Number(token.weight) }}>文字示例 Aa</p>
          </div>)}</div></Card>
        </Section>

        <Section id="colors" title="主题色">
          <Card><ul className={styles.colorGrid} aria-label="主题颜色">{catalog.colors.map(color => <li key={color.name} className={styles.colorTile} title={color.name}>
            <span className={styles.colorSwatch} data-color-token={color.name} style={{ backgroundColor: `hsl(var(${color.name}))` }} aria-hidden="true" />
            <span className={styles.note}>{color.label}</span>
          </li>)}</ul></Card>
        </Section>

        <Modal title="编辑内容" open={modalOpen} confirmLoading={saving} onCancel={() => setModalOpen(false)} onOk={save} okText="保存" cancelText="取消">
          <div className={styles.stack}><label className={styles.field}><span>名称</span><Input placeholder="输入名称" allowClear focusDecoration={<PlanetIllustration size="sm" />} /></label><Popover trigger="click" content="浮层跟随当前组件的主题。"><Button variant="ghost">查看嵌套浮层</Button></Popover></div>
        </Modal>
        <AlertDialog title="确认继续？" open={alertOpen} onCancel={() => setAlertOpen(false)} onOk={() => { setAlertOpen(false); setStatus('已确认提醒'); }} okText="继续" cancelText="取消"><p>确认后将完成本次示例操作。</p></AlertDialog>
      </main>
    </div>
  </div>;
}
