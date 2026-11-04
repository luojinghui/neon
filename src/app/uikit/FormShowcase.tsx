'use client';

import { useId, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Radio } from '@/components/ui/radio';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import styles from './uikit.module.css';

const interests = [
  { value: 'music', label: '音乐' },
  { value: 'sunset', label: '日落' },
  { value: 'reading', label: '阅读' }
];

export function FormShowcase() {
  const id = useId();
  const [searchResult, setSearchResult] = useState('按 Enter 或点击搜索图标');
  const [destination, setDestination] = useState<string | undefined>('music');
  const [topics, setTopics] = useState(['music']);
  const [enabled, setEnabled] = useState(true);
  const [preference, setPreference] = useState('music');
  const [visibility, setVisibility] = useState('public');

  return <div className={styles.exampleGrid}>
    <Card bodyClassName={styles.example}>
      <div className={styles.exampleHeading}><h3>输入框</h3><code>Input</code></div>
      <label className={styles.field}><span>星球名称</span><Input prefix={<Icon name="globe" />} placeholder="输入名称" allowClear /></label>
      <label className={styles.field}><span>禁用</span><Input disabled value="暂不可编辑" /></label>
      <label className={styles.field}><span>校验错误</span><Input status="error" aria-describedby={`${id}-error`} defaultValue="名称过长" /></label>
      <p id={`${id}-error`} className={styles.note}>请使用 2–12 个字符。</p>
    </Card>

    <Card bodyClassName={styles.example}>
      <div className={styles.exampleHeading}><h3>多行输入</h3><code>Textarea</code></div>
      <label className={styles.field}><span>星球介绍</span><Textarea placeholder="写下一点介绍…" rows={3} autoSize={{ minRows: 3, maxRows: 6 }} maxLength={160} showCount allowClear /></label>
      <label className={styles.field}><span>紧凑编辑</span><Textarea placeholder="输入时自动增高" rows={1} autoSize={{ minRows: 1, maxRows: 4 }} /></label>
    </Card>

    <Card bodyClassName={styles.example}>
      <div className={styles.exampleHeading}><h3>密码与搜索</h3><code>Input</code></div>
      <label className={styles.field}><span>密码</span><Input.Password placeholder="输入密码" autoComplete="new-password" /></label>
      <label className={styles.field}><span>搜索</span><Input.Search placeholder="搜索星球" allowClear onSearch={value => setSearchResult(value.trim() ? `正在查找：${value.trim()}` : '已清空搜索')} /></label>
      <p className={styles.note} role="status" aria-live="polite">{searchResult}</p>
    </Card>

    <Card bodyClassName={styles.example}>
      <div className={styles.exampleHeading}><h3>选择器</h3><code>Select</code></div>
      <div className={styles.field}><span>单选与搜索</span><Select aria-label="单选兴趣" options={interests} value={destination} onChange={setDestination} showSearch optionFilterProp="label" allowClear placeholder="选择兴趣" /></div>
      <div className={styles.field}><span>多选</span><Select<string[], true> aria-label="多选兴趣" mode="multiple" options={interests} defaultValue={['music']} optionFilterProp="label" allowClear placeholder="选择多个兴趣" /></div>
      <div className={styles.field}><span>禁用与加载</span><Select aria-label="禁用选择器" disabled options={interests} defaultValue="sunset" /><Select aria-label="加载中的选择器" loading placeholder="正在加载" /></div>
    </Card>

    <Card bodyClassName={styles.example}>
      <div className={styles.exampleHeading}><h3>复选框</h3><code>Checkbox</code></div>
      <div className={styles.row}>
        <Checkbox checked={topics.length === interests.length} indeterminate={topics.length > 0 && topics.length < interests.length} onChange={event => setTopics(event.target.checked ? interests.map(item => item.value) : [])}>全选兴趣</Checkbox>
        <Checkbox disabled>禁用</Checkbox><Checkbox disabled checked>已选禁用</Checkbox>
      </div>
      <Checkbox.Group aria-label="兴趣复选组" value={topics} onChange={setTopics} options={interests} />
    </Card>

    <Card bodyClassName={styles.example}>
      <div className={styles.exampleHeading}><h3>开关</h3><code>Switch</code></div>
      <div className={styles.row}><Switch aria-label="开启通知" checked={enabled} onChange={setEnabled} /><span>{enabled ? '通知已开启' : '通知已关闭'}</span></div>
      <div className={styles.row}><Switch aria-label="禁用开关" disabled /><Switch aria-label="已开启的禁用开关" disabled checked /><span className={styles.note}>禁用</span></div>
      <div className={styles.row}><Switch aria-label="加载中的开关" loading checked /><span className={styles.note}>加载中</span></div>
    </Card>

    <Card className={styles.fullWidth} bodyClassName={styles.example}>
      <div className={styles.exampleHeading}><h3>单选框</h3><code>Radio</code></div>
      <Radio.Group aria-label="单选兴趣" value={preference} onChange={event => setPreference(event.target.value)} options={[...interests, { value: 'later', label: '暂不可选', disabled: true }]} />
      <fieldset className={styles.stack}>
        <legend className={styles.note}>卡片式选项</legend>
        <Radio.Group appearance="card" indicator={false} aria-label="星球可见范围" value={visibility} onChange={event => setVisibility(event.target.value)} options={[
          { value: 'public', label: '公开', description: '所有人可发现并加入', icon: <Icon name="globe" /> },
          { value: 'private', label: '私密', description: '仅受邀成员可加入', icon: <Icon name="lock" /> }
        ]} />
      </fieldset>
    </Card>
  </div>;
}
