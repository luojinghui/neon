'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Radio } from '@/components/ui/radio';
import { Select } from '@/components/ui/select';
import { Tabs } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Alert, AlertDialog } from '@/components/ui/alert';
import { Modal } from '@/components/ui/modal';
import { Popover } from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';
import { PlanetIllustration } from '@/components/ui/planet-illustration';
import styles from './foundations.module.css';

const interests = [{ label: '日落收藏', value: 'sunset' }, { label: '音乐漫游', value: 'music' }, { label: '星球旅行', value: 'planet' }];

function ModePreview({ mode, skin }: { mode: 'light' | 'dark'; skin: string }) {
  const [enabled, setEnabled] = useState(true);
  const [checked, setChecked] = useState(true);
  const [selected, setSelected] = useState('sunset');
  const [visibility, setVisibility] = useState('public');
  const [value, setValue] = useState<string | undefined>('music');
  const [modal, setModal] = useState(false);
  const [alert, setAlert] = useState(false);
  const [saved, setSaved] = useState(false);
  return <div className={`${styles.mode} ${mode}`} data-skin={skin} data-theme-preview={mode}>
    <header className={styles.heading}><div><p>Soul · 基础组件</p><h3>{mode === 'light' ? '日光漫游' : '月下轨道'}</h3></div><PlanetIllustration variant={mode === 'light' ? 'planet' : 'satellite'} /></header>
    <div className={styles.surfaceScale} aria-label={`${mode}中性表面层次`}><span>页面背景</span><span>卡片表面</span><span>输入区域</span></div>
    <Card title="让想法，轻轻着陆" description="细边焦点、柔和底色，留一点想象的空间。">
      <div className={styles.form}>
        <label className={styles.field}><span>星球昵称</span><Input aria-label={`${mode}星球昵称`} placeholder="给星球起个名字" allowClear focusDecoration={<PlanetIllustration size="sm" />} /></label>
        <label className={styles.field}><span>此刻的想法</span><Textarea aria-label={`${mode}此刻的想法`} placeholder="写下一个小小的宇宙…" rows={3} autoSize={{ minRows: 3, maxRows: 6 }} maxLength={160} showCount focusDecoration={<PlanetIllustration size="sm" variant="comet" />} /></label>
        <label className={styles.field}><span>旅行目的地</span><Select aria-label={`${mode}旅行目的地`} value={value} onChange={setValue} allowClear showSearch optionFilterProp="label" options={interests} placeholder="选择一个目的地" /></label>
        <label className={styles.field}><span>同行的兴趣</span><Select<string[], true> aria-label={`${mode}同行的兴趣`} mode="multiple" defaultValue={["sunset"]} allowClear optionFilterProp="label" options={interests} placeholder="搜索并选择兴趣" /></label>
        <div className={styles.row}><span>开启漫游</span><Switch aria-label={`${mode}开启漫游`} checked={enabled} onChange={setEnabled} /></div>
        <div className={styles.row}><Checkbox checked={checked} onChange={event => setChecked(event.target.checked)}>日落收藏</Checkbox><Checkbox indeterminate aria-label="部分选中">部分选中</Checkbox><Checkbox disabled>暂未解锁</Checkbox></div>
        <Radio.Group aria-label={`${mode}漫游偏好`} value={selected} onChange={event => setSelected(event.target.value)} options={interests} />
        <fieldset className="min-w-0"><legend className="mb-2 text-body font-medium">选项卡式单选</legend><Radio.Group appearance="card" indicator={false} aria-label={`${mode}星球可见范围`} value={visibility} onChange={event => setVisibility(event.target.value)} options={[
          { value: 'public', label: '公开', description: '在公共列表中展示', icon: <Icon name="globe" /> },
          { value: 'private', label: '私密', description: '仅授权成员可加入', icon: <Icon name="lock" /> },
          { value: 'later', label: '稍后开放', description: '禁用状态示例', disabled: true, icon: <Icon name="lock" /> }
        ]} /></fieldset>
        <div className={styles.row}><Switch disabled aria-label="禁用开关" /><Switch loading checked aria-label="加载中的开关" /><Input disabled aria-label="禁用输入" value="正在准备下一次出发" /></div>
        <label className={styles.field}><span>紧凑消息编辑 · 1–5 行</span><Textarea aria-label={`${mode}紧凑消息编辑`} placeholder="发一句轻轻的问候…" rows={1} autoSize={{ minRows: 1, maxRows: 5 }} /></label>
        <Button variant="primary" onClick={() => setSaved(!saved)}>{saved ? '已收藏这颗星球' : '收藏这颗星球'}</Button>
      </div>
    </Card>
    <Card title="玻璃轨道" description="试着横向滑动或使用方向键，三个尺寸的留白各不相同。">
      <div className={styles.tabSizes}>{(['sm', 'md', 'lg'] as const).map(size => <div key={size} className={styles.tabRow}><span>{size}</span><Tabs aria-label={`${mode}${size}轨道`} size={size} items={[{ key: 'today', label: '今日', children: <p className={styles.tabNote}>收藏今天的一点小快乐。</p> }, { key: 'orbit', label: '轨道', children: <p className={styles.tabNote}>沿着喜欢的方向，慢慢漫游。</p> }, { key: 'saved', label: '收藏', children: <p className={styles.tabNote}>喜欢的星光，都留在这里。</p> }, { key: 'later', label: '稍后', disabled: true }]} /></div>)}</div>
    </Card>
    <Card title="轻轻浮起" description="点击查看浮层圆角；默认跟随触发元素，可指定四档。">
      <div className={styles.actions}>
        <Popover radius="auto" trigger="click" title="沿着同一条弧线" content="触发器与浮层共用 md 圆角。"><Button>跟随圆角</Button></Popover>
        <Popover radius="lg" trigger="click" content={<div className={styles.popup}><PlanetIllustration size="sm" /><p>明确指定 lg · 16px</p></div>}><Button>大圆角</Button></Popover>
        <Tooltip radius="inherit" title="圆润的一颗小星球"><span tabIndex={0} className={styles.pill}>胶囊提示</span></Tooltip>
        <Tooltip radius="sm" title="与当前深浅主题保持一致"><Button variant="ghost">同色提示</Button></Tooltip>
      </div>
      <div className={styles.actions}><Button onClick={() => setModal(true)}>打开弹窗</Button><Button variant="ghost" onClick={() => setAlert(true)}>提醒弹窗</Button></div>
    </Card>
    <Alert type="info" showIcon message="给灵感留个位置" description="默认不允许拖选组件文字；输入内容和标记的正文可以选择。" />
    <Modal title="捕捉一颗小灵感" open={modal} onCancel={() => setModal(false)} onOk={() => setModal(false)} okText="存入星球" cancelText="再想想">
      <div className={styles.dialogBody}><PlanetIllustration variant="planet" /><p>桌面可拖动标题移动，手机上以底部面板展开。</p><Input aria-label="灵感名称" placeholder="输入灵感名称" focusDecoration={<PlanetIllustration size="sm" />} /><Popover trigger="click" content="浮层继承弹窗所在的局部主题。"><Button variant="ghost">查看嵌套浮层</Button></Popover></div>
    </Modal>
    <AlertDialog open={alert} title="准备好出发了吗？" onCancel={() => setAlert(false)} onOk={() => setAlert(false)} okText="出发" cancelText="稍后"><div className={styles.dialogBody}><PlanetIllustration size="sm" variant="comet" /><p>确认提醒在手机从底部滑入，与表单弹窗保持一致。</p></div></AlertDialog>
  </div>;
}

export function FoundationShowcase({ skin }: { skin: string }) {
  return <div className={styles.grid}><ModePreview mode="light" skin={skin} /><ModePreview mode="dark" skin={skin} /></div>;
}
