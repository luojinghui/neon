'use client';

import { BulbOutlined, CheckOutlined, CloseOutlined, LoadingOutlined, ReloadOutlined, SkinOutlined } from '@ant-design/icons';
import { DEFAULT_VIDEO_EFFECTS, type VideoEffectsSettings, type VideoEffectsStatus } from '@/modules/video-effects/types';
import './beauty-panel.css';

const presets = [
  { name: '原貌', whitening: 0, smoothing: 0 },
  { name: '自然', whitening: 25, smoothing: 30 },
  { name: '清透', whitening: 45, smoothing: 50 }
] as const;

export function CallEffectsPanel({ value, status, cameraEnabled, onChange, onClose }: { value: VideoEffectsSettings; status: VideoEffectsStatus; cameraEnabled: boolean; onChange: (value: Partial<VideoEffectsSettings>) => void; onClose: () => void }) {
  return <aside className="soul-call-effects beauty-panel" aria-label="画面设置">
    <header className="beauty-panel-heading">
      <div><span className="beauty-panel-symbol"><SkinOutlined /></span><h3>美颜设置</h3></div>
      <button type="button" className="beauty-panel-icon" aria-label="关闭画面设置" onClick={onClose}><CloseOutlined /></button>
    </header>
    <div className="beauty-panel-presets" role="group" aria-label="美颜预设">
      {presets.map(preset => {
        const selected = value.whitening === preset.whitening && value.smoothing === preset.smoothing;
        return <button type="button" key={preset.name} aria-pressed={selected} onClick={() => onChange({ whitening: preset.whitening, smoothing: preset.smoothing })}>
          <span>{preset.name}</span>{selected && <CheckOutlined />}
        </button>;
      })}
    </div>
    <div className="beauty-panel-sliders">
      {(['smoothing', 'whitening'] as const).map(field => <label className="beauty-panel-slider" key={field}>
        <span className="beauty-panel-slider-label"><span>{field === 'whitening' ? <BulbOutlined /> : <SkinOutlined />}{field === 'whitening' ? '美白' : '柔肤'}</span><output>{value[field]}<small>%</small></output></span>
        <input type="range" min={0} max={100} step={1} value={value[field]} aria-label={field === 'whitening' ? '美白' : '柔肤'} onChange={event => onChange({ [field]: Number(event.target.value) })} />
      </label>)}
    </div>
    <footer className="beauty-panel-footer">
      <div className="beauty-panel-status" role="status">
        {!cameraEnabled ? '开启摄像头后生效' : status.phase === 'loading' ? <><LoadingOutlined />正在开启</> : status.phase === 'error' ? <><span>{status.message}</span><button type="button" onClick={() => onChange(value)}>重试</button></> : <><span className="beauty-panel-dot" />{value.whitening || value.smoothing ? '已应用到我的画面' : '保持自然原貌'}</>}
      </div>
      <button type="button" className="beauty-panel-reset" aria-label="恢复原貌" onClick={() => onChange({ ...DEFAULT_VIDEO_EFFECTS })}><ReloadOutlined /><span>重置</span></button>
    </footer>
  </aside>;
}
