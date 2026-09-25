'use client';

import { CloseOutlined, ReloadOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { FACE_EFFECTS, STICKERS, STICKER_COLORS } from '@/app/doodle/portrait/settings';
import { CALL_BACKGROUNDS, DEFAULT_VIDEO_EFFECTS, FLAT_STICKERS, type VideoEffectsSettings, type VideoEffectsStatus } from '@/modules/video-effects/types';

const tabs = ['美颜', '2D 贴纸', '3D 变身', '饰品', '背景'] as const;
export function CallEffectsPanel({ value, status, cameraEnabled, onChange, onClose }: { value: VideoEffectsSettings; status: VideoEffectsStatus; cameraEnabled: boolean; onChange: (value: Partial<VideoEffectsSettings>) => void; onClose: () => void }) {
  const [tab, setTab] = useState<typeof tabs[number]>('美颜');
  const tracked = value.sticker2d !== 'none' || value.faceEffect !== 'none' || value.accessory !== 'none';
  return <aside className="soul-call-effects" aria-label="画面设置">
    <div className="soul-call-effects-heading"><h3>我的画面</h3><button type="button" aria-label="关闭画面设置" onClick={onClose}><CloseOutlined /></button></div>
    <div className="soul-call-effect-tabs" role="tablist" aria-label="效果类型">{tabs.map(name => <button key={name} type="button" role="tab" aria-selected={tab === name} onClick={() => setTab(name)}>{name}</button>)}</div>
    <div className="soul-call-effects-body" role="tabpanel" aria-label={tab}>
      {tab === '美颜' && <div className="soul-call-beauty">
        <div className="soul-call-beauty-presets">{([{ name: '原貌', whitening: 0, smoothing: 0 }, { name: '自然', whitening: 25, smoothing: 20 }, { name: '清透', whitening: 45, smoothing: 35 }] as const).map(preset => <button type="button" key={preset.name} aria-pressed={value.whitening === preset.whitening && value.smoothing === preset.smoothing} onClick={() => onChange({ whitening: preset.whitening, smoothing: preset.smoothing })}>{preset.name}</button>)}</div>
        {(['whitening', 'smoothing'] as const).map(field => <label className="soul-call-effect-slider" key={field}><span>{field === 'whitening' ? '美白' : '柔肤'}<output>{value[field]}</output></span><input type="range" min={0} max={100} value={value[field]} aria-label={field === 'whitening' ? '美白' : '柔肤'} onChange={event => onChange({ [field]: Number(event.target.value) })} /></label>)}
      </div>}
      {tab === '2D 贴纸' && <div className="soul-call-effect-grid">{FLAT_STICKERS.map(item => <button key={item.id} type="button" aria-label={`贴纸：${item.name}`} aria-pressed={value.sticker2d === item.id} onClick={() => onChange({ sticker2d: item.id })}><span className="soul-call-effect-preview" style={item.id === 'none' ? undefined : { backgroundImage: `url(/call-effects/${item.id}.svg)` }}>{item.id === 'none' ? '○' : ''}</span><span>{item.name}</span></button>)}</div>}
      {tab === '3D 变身' && <div className="soul-call-effect-grid">{FACE_EFFECTS.map(item => <button key={item.id} type="button" aria-label={`变身：${item.name}`} aria-pressed={value.faceEffect === item.id} onClick={() => onChange({ faceEffect: item.id })}><span className="soul-call-effect-preview">{item.icon}</span><span>{item.name}</span></button>)}</div>}
      {tab === '饰品' && <>
        <div className="soul-call-effect-grid">{STICKERS.map(item => <button key={item.id} type="button" aria-label={`饰品：${item.name}`} aria-pressed={value.accessory === item.id} onClick={() => onChange({ accessory: item.id })}><span className="soul-call-effect-preview">{item.icon}</span><span>{item.name}</span></button>)}</div>
        <div className="soul-call-effect-colors" role="group" aria-label="饰品颜色">{STICKER_COLORS.map(color => <button key={color} type="button" style={{ background: color }} aria-label={`饰品颜色 ${color}`} aria-pressed={value.color === color} onClick={() => onChange({ color })} />)}</div>
      </>}
      {tab === '背景' && <div className="soul-call-effect-grid">{CALL_BACKGROUNDS.map(item => <button key={item.id} type="button" aria-label={`背景：${item.name}`} aria-pressed={value.background === item.id} onClick={() => onChange({ background: item.id })}><span className="soul-call-effect-preview is-background" style={{ backgroundColor: item.color, ...(['sunroom', 'hills', 'grid'].includes(item.id) ? { backgroundImage: `url(/call-effects/${item.id}.svg)` } : {}) }}>{item.id === 'original' ? '○' : item.id === 'cosmos' ? '✦' : ''}</span><span>{item.name}</span></button>)}</div>}
    </div>
    <div className="soul-call-effect-status" role="status">
      {!cameraEnabled ? <span>开启视频后生效</span> : status.phase === 'loading' ? <><span>{status.message}<span>{status.progress}%</span></span><progress aria-label="画面资源加载进度" max={100} value={status.progress} /></> : status.phase === 'error' ? <span className="is-error">{status.message}<button type="button" onClick={() => onChange(value)}>重试</button></span> : tracked && status.faceDetected === false ? <span>面对镜头，贴纸会跟着你</span> : <span>仅调整我的画面</span>}
    </div>
    <button type="button" className="soul-call-effect-reset" onClick={() => onChange({ ...DEFAULT_VIDEO_EFFECTS })}><ReloadOutlined /> 恢复原貌</button>
  </aside>;
}
