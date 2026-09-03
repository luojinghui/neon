export type BannerPreset = 'sunrise' | 'coral' | 'aurora' | 'lagoon' | 'violet' | 'midnight';

export type ProfileBanner =
  | { type: 'preset'; value: BannerPreset }
  | { type: 'image'; value: string };

export interface PublicProfile {
  publicKey: string;
  userId: string;
  name: string;
  bio: string;
  avatarUrl: string;
  banner: ProfileBanner;
  createdAt: string;
  updatedAt: string;
  isSystem: boolean;
}

export interface CurrentProfile extends PublicProfile {
  uuid: string;
}

export interface ProfileUpdateInput {
  userId: string;
  name: string;
  bio: string;
  avatarUrl: string;
  banner: ProfileBanner;
}

export const BANNER_PRESETS: Array<{ id: BannerPreset; label: string; className: string }> = [
  { id: 'sunrise', label: '日出', className: 'from-orange-300 via-rose-300 to-amber-200 dark:from-orange-900 dark:via-rose-900 dark:to-amber-800' },
  { id: 'coral', label: '珊瑚', className: 'from-rose-400 via-orange-300 to-yellow-200 dark:from-rose-900 dark:via-orange-900 dark:to-yellow-800' },
  { id: 'aurora', label: '极光', className: 'from-emerald-300 via-teal-300 to-sky-300 dark:from-emerald-900 dark:via-teal-900 dark:to-sky-900' },
  { id: 'lagoon', label: '海湾', className: 'from-sky-300 via-cyan-300 to-indigo-300 dark:from-sky-900 dark:via-cyan-900 dark:to-indigo-900' },
  { id: 'violet', label: '暮紫', className: 'from-violet-400 via-fuchsia-300 to-rose-300 dark:from-violet-950 dark:via-fuchsia-950 dark:to-rose-950' },
  { id: 'midnight', label: '夜航', className: 'from-slate-900 via-indigo-950 to-orange-900 dark:from-black dark:via-indigo-950 dark:to-orange-950' }
];

export function getBannerPreset(id: string) {
  return BANNER_PRESETS.find((preset) => preset.id === id) || BANNER_PRESETS[0];
}

export function getProfileAvatar(profile: Pick<PublicProfile, 'avatarUrl' | 'publicKey' | 'userId'>): string {
  if (profile.avatarUrl) return profile.avatarUrl;
  return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(profile.publicKey || profile.userId)}`;
}
