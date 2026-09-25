'use client';

import { BACKGROUNDS, DEFAULT_PORTRAIT, FACE_EFFECTS, MOODS, STICKERS, STICKER_COLORS, type PortraitSettings } from './settings';

type Props = { value: PortraitSettings; title: string; busy: boolean; faceCount: number; segmented: boolean; available: boolean; hint: string; onChange: (value: PortraitSettings, title: string) => void; onSurprise: () => void };

export function PortraitControls({ value: draft, title, busy, faceCount, segmented, available, hint, onChange, onSurprise }: Props) {
  const patch = (next: Partial<PortraitSettings>) => onChange({ ...draft, ...next }, title);
  const slider = (label: string, field: 'whitening' | 'smoothing' | 'cartoon' | 'outline' | 'stickerScale' | 'stickerY' | 'stickerRotation' | 'faceEffectStrength', min = 0, max = 100, step = 1, disabled = false) => <label className="portrait-slider"><span>{label}<output>{field === 'stickerScale' ? `${Math.round(draft[field] * 100)}%` : field === 'stickerY' ? draft[field].toFixed(2) : draft[field]}</output></span><input type="range" aria-label={label} min={min} max={max} step={step} value={draft[field]} disabled={disabled || busy} onChange={event => patch({ [field]: Number(event.target.value) })} /></label>;
  return <div className="portrait-controls">
    <div className="portrait-heading"><div><h2>你的角色实验室</h2><p>调一调，变成今天想做的自己</p></div><button type="button" className="portrait-surprise" disabled={busy} onClick={onSurprise}>✦ 随机变身</button></div>
    <p className="portrait-hint" role="status">{hint}</p>
    <details open><summary>卡通贴贴 <span>跟着表情一起玩</span></summary>
      <div className="portrait-sticker-grid">{FACE_EFFECTS.map(effect => <button key={effect.id} type="button" aria-pressed={draft.faceEffect === effect.id} disabled={busy || (!faceCount && effect.id !== 'none')} onClick={() => patch({ faceEffect: effect.id })}><span aria-hidden="true" className="portrait-sticker-preview" style={effect.preview ? { backgroundImage: `url(${effect.preview})` } : undefined}>{effect.preview ? '' : effect.icon}</span>{effect.name}</button>)}</div>
      {slider('贴纸浓度', 'faceEffectStrength', 0, 100, 1, !faceCount || draft.faceEffect === 'none')}
    </details>
    <details open><summary>头顶挂件 <span>可爱搭子上线</span></summary>
      <div className="portrait-sticker-grid">{STICKERS.map(sticker => <button key={sticker.id} type="button" aria-pressed={draft.sticker === sticker.id} disabled={busy || (!faceCount && sticker.id !== 'none')} onClick={() => patch({ sticker: sticker.id })}><span aria-hidden="true" className="portrait-sticker-preview" style={sticker.preview ? { backgroundImage: `url(${sticker.preview})` } : undefined}>{sticker.preview ? '' : sticker.icon}</span>{sticker.name}</button>)}</div>
      {faceCount > 1 && <label className="portrait-field">为谁变身<select disabled={busy} value={draft.faceIndex} onChange={event => patch({ faceIndex: Number(event.target.value) })}>{Array.from({ length: faceCount }, (_, index) => <option key={index} value={index}>人物 {index + 1}</option>)}</select></label>}
      <div className="portrait-colors" role="group" aria-label="星光颜色">{STICKER_COLORS.map(color => <button key={color} type="button" aria-label={`星光颜色 ${color}`} aria-pressed={draft.stickerColor === color} style={{ background: color }} onClick={() => patch({ stickerColor: color })} disabled={busy || !faceCount} />)}<label title="自定义星光颜色"><input type="color" aria-label="自定义星光颜色" value={draft.stickerColor} disabled={busy || !faceCount} onChange={event => patch({ stickerColor: event.target.value })} /></label></div>
      {slider('配件大小', 'stickerScale', .6, 1.5, .05, !faceCount)}
      {slider('上下位置', 'stickerY', -.6, .6, .02, !faceCount)}
      {slider('俏皮角度', 'stickerRotation', -45, 45, 1, !faceCount)}
    </details>
    <details><summary>人像与氛围 <span>自然光感</span></summary>
      {slider('肤色提亮', 'whitening', 0, 100, 1, !segmented)}
      {slider('柔和肤感', 'smoothing', 0, 100, 1, !segmented)}
      {slider('漫画浓度', 'cartoon', 0, 100, 1, !available)}
      {slider('人物描边', 'outline', 0, 100, 1, !segmented)}
      <div className="portrait-chips" role="group" aria-label="人物背景">{BACKGROUNDS.map(item => <button type="button" key={item.id} disabled={busy || (!segmented && item.id !== 'original')} aria-pressed={draft.background === item.id} onClick={() => patch({ background: item.id })}>{item.name}</button>)}</div>
    </details>
    <details><summary>漫游卡片文案 <span>记录你的状态</span></summary>
      <label className="portrait-field">角色称号<input maxLength={24} value={title} disabled={busy} onChange={event => onChange(draft, event.target.value)} /></label>
      <div className="portrait-chips" role="group" aria-label="今日心情">{MOODS.map(mood => <button type="button" key={mood} aria-pressed={draft.mood === mood} onClick={() => patch({ mood })} disabled={busy}>{mood}</button>)}</div>
      <label className="portrait-field">今日宣言<textarea rows={2} maxLength={36} value={draft.caption} onChange={event => patch({ caption: event.target.value })} disabled={busy} /></label>
      <label className="portrait-field">专属签名<input maxLength={12} placeholder="留个名字吧" value={draft.signature} onChange={event => patch({ signature: event.target.value })} disabled={busy} /></label>
      <div className="portrait-chips" role="group" aria-label="卡片装饰">{([['spark', '闪闪星光'], ['hearts', '爱心泡泡'], ['orbit', '小小星轨'], ['none', '清爽留白']] as const).map(([id, name]) => <button key={id} type="button" aria-pressed={draft.decoration === id} onClick={() => patch({ decoration: id })} disabled={busy}>{name}</button>)}</div>
    </details>
    <div className="portrait-live-status"><span>✓ 修改实时生效</span><button type="button" disabled={busy} onClick={() => onChange({ ...DEFAULT_PORTRAIT }, title)}>重置设置</button></div>
  </div>;
}
