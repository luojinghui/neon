import type { CSSProperties } from 'react';
import { getBannerPreset, type ProfileBanner } from '../types';

export function ProfileBannerView({ banner, className = '' }: { banner: ProfileBanner; className?: string }) {
  const preset = banner.type === 'preset' ? getBannerPreset(banner.value) : null;
  const style: CSSProperties | undefined = banner.type === 'image' ? { backgroundImage: `url("${banner.value}")` } : undefined;

  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br bg-cover bg-center ${preset?.className || 'from-orange-300 via-rose-300 to-amber-200'} ${className}`}
      style={style}
    >
      <div className="absolute inset-0 bg-[linear-gradient(115deg,transparent_10%,rgba(255,255,255,.18)_45%,transparent_70%)]" />
      <div className="absolute -right-12 -top-16 h-52 w-52 rounded-full border border-white/20 bg-white/10 blur-[1px]" />
      <div className="absolute -bottom-24 left-[12%] h-48 w-48 rounded-full border border-white/15 bg-white/10" />
      {banner.type === 'image' && <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/5 to-transparent" />}
    </div>
  );
}
