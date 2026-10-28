'use client';

import { useState } from 'react';
import { BulbOutlined, CloseOutlined, LoadingOutlined, ReloadOutlined, SkinOutlined } from '@ant-design/icons';
import { AVATAR_TILES, BACKGROUND_TILES, STICKER_TILES, type EffectTile } from '@/modules/virtual-background/catalog';
import { DEFAULT_CALL_VIDEO, NONE_EFFECT, type CallVideoSettings, type EffectSelection } from '@/modules/virtual-background/settings';
import type { VideoEffectsStatus } from '@/modules/video-effects/types';
import './beauty-panel.css';

const categories = [
  { id: 'beauty', label: '美颜' },
  { id: 'background', label: '背景' },
  { id: 'sticker', label: '贴纸' },
  { id: 'avatar', label: '头像' }
] as const;

type Category = (typeof categories)[number]['id'];

function sameSelection(current: EffectSelection, tile: EffectTile, sticker3d = false): boolean {
  if (tile.selection.type === 'NONE') return current.type === 'NONE';
  if (tile.selection.type === 'FACE_STICKY') {
    const type = sticker3d ? 'FACE_STICKY_3D' : 'FACE_STICKY';
    return current.type === type && current.url === tile.selection.url;
  }
  return current.type === tile.selection.type && current.id === tile.selection.id;
}

export function CallEffectsPanel({ value, status, cameraEnabled, onChange, onClose }: { value: CallVideoSettings; status: VideoEffectsStatus; cameraEnabled: boolean; onChange: (value: Partial<CallVideoSettings>) => void; onClose: () => void }) {
  const [category, setCategory] = useState<Category>('beauty');
  const [prefer3d, setPrefer3d] = useState(value.sticker.type === 'FACE_STICKY_3D');
  const [beautyOn, setBeautyOn] = useState(value.brightness > 0 || value.whitening > 0);
  const sticker3d = value.sticker.type === 'NONE' ? prefer3d : value.sticker.type === 'FACE_STICKY_3D';
  const effectsOn = value.brightness > 0 || value.whitening > 0 || value.background.type !== 'NONE' || value.sticker.type !== 'NONE' || value.avatar.type !== 'NONE';
  const summary = !cameraEnabled ? '开启摄像头后生效' : status.phase === 'loading' ? '正在应用到我的画面' : status.phase === 'error' ? status.message : effectsOn ? '已同步到通话画面' : beautyOn && category === 'beauty' ? '拖动滑块调节增量和美白' : '未开启画面效果';
  const reset = () => {
    setBeautyOn(false);
    onChange({ ...DEFAULT_CALL_VIDEO, background: { ...NONE_EFFECT }, sticker: { ...NONE_EFFECT }, avatar: { ...NONE_EFFECT } });
  };
  return <aside className="soul-call-effects beauty-panel" aria-label="画面设置">
    <header className="beauty-panel-heading">
      <div><span className="beauty-panel-symbol"><SkinOutlined /></span><h3>画面设置</h3></div>
      <button type="button" className="beauty-panel-icon" aria-label="关闭画面设置" onClick={onClose}><CloseOutlined /></button>
    </header>
    <div className="beauty-panel-tabs" role="tablist" aria-label="画面效果分类">
      {categories.map((item) => <button type="button" key={item.id} role="tab" aria-selected={category === item.id} onClick={() => setCategory(item.id)}>{item.label}</button>)}
    </div>
    {category === 'beauty' && <div className="beauty-panel-page">
      <Toggle label="美颜" checked={beautyOn} onChange={(enabled) => {
        setBeautyOn(enabled);
        if (!enabled) onChange({ brightness: 0, whitening: 0 });
      }} />
      {beautyOn ? <div className="beauty-panel-sliders">
        {(['brightness', 'whitening'] as const).map(field => <label className="beauty-panel-slider" key={field}>
          <span className="beauty-panel-slider-label"><span>{field === 'whitening' ? <SkinOutlined /> : <BulbOutlined />}{field === 'whitening' ? '美白' : '增量'}</span><output>{value[field]}<small>%</small></output></span>
          <input type="range" min={0} max={100} step={1} value={value[field]} aria-label={field === 'whitening' ? '美白' : '增量'} onChange={event => onChange({ [field]: Number(event.target.value) })} />
        </label>)}
      </div> : <p className="beauty-panel-hint">开启后可调节增量和美白</p>}
    </div>}
    {category === 'background' && <TileGrid label="虚拟背景" tiles={BACKGROUND_TILES} current={value.background} onSelect={(selection) => onChange({ background: selection })} />}
    {category === 'sticker' && <div className="beauty-panel-page">
      <Toggle label="3D 贴纸" checked={sticker3d} onChange={(enabled) => {
        setPrefer3d(enabled);
        if (value.sticker.type === 'NONE') return;
        onChange({ sticker: { ...value.sticker, type: enabled ? 'FACE_STICKY_3D' : 'FACE_STICKY' } });
      }} />
      <TileGrid label={sticker3d ? '3D 贴纸' : '贴纸'} tiles={STICKER_TILES} current={value.sticker} sticker3d={sticker3d} shape="square" onSelect={(selection) => onChange({ sticker: sticker3d && selection.type === 'FACE_STICKY' ? { ...selection, type: 'FACE_STICKY_3D' } : selection, avatar: { ...NONE_EFFECT } })} />
    </div>}
    {category === 'avatar' && <TileGrid label="虚拟头像" tiles={AVATAR_TILES} current={value.avatar} shape="square" onSelect={(selection) => onChange({ avatar: selection, sticker: { ...NONE_EFFECT } })} />}
    <footer className="beauty-panel-footer">
      <div className="beauty-panel-status" role="status">
        {status.phase === 'loading' && cameraEnabled ? <LoadingOutlined /> : status.phase === 'error' ? null : summary !== status.message && <span className="beauty-panel-dot" />}
        <span>{summary}</span>
        {status.phase === 'error' && <button type="button" onClick={() => onChange(value)}>重试</button>}
      </div>
      <button type="button" className="beauty-panel-reset" onClick={reset}><ReloadOutlined /><span>重置</span></button>
    </footer>
  </aside>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <button type="button" role="switch" className="beauty-panel-switch" aria-checked={checked} onClick={() => onChange(!checked)}>
    <span className="beauty-panel-switch-track" aria-hidden="true" />
    <span>{label}</span>
  </button>;
}

function TileGrid({ label, tiles, current, sticker3d = false, shape = 'wide', onSelect }: { label: string; tiles: EffectTile[]; current: EffectSelection; sticker3d?: boolean; shape?: 'wide' | 'square'; onSelect: (selection: EffectSelection) => void }) {
  return <div className={`beauty-panel-tiles is-${shape}`} role="listbox" aria-label={label}>
    {tiles.map((tile) => {
      const selected = sameSelection(current, tile, sticker3d);
      const swatch = tile.selection.color;
      return <button type="button" role="option" aria-selected={selected} aria-label={tile.label} key={tile.id} onClick={() => onSelect(tile.selection)}>
        <span className="beauty-panel-tile" style={swatch ? { background: swatch } : undefined}>
          {tile.preview ? <img src={tile.preview} alt="" /> : swatch ? null : tile.label}
        </span>
        <span className="beauty-panel-tile-label">{tile.label}</span>
      </button>;
    })}
  </div>;
}
