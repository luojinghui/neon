export type DoodleThemeId =
  | 'sun-pop'
  | 'berry-zap'
  | 'blue-hour'
  | 'mint-party'
  | 'lemon-soda'
  | 'grape-dream'
  | 'peach-fizz'
  | 'night-neon';

export type DoodleTemplateId =
  | 'comic-cover'
  | 'instant-film'
  | 'hero-poster'
  | 'sticker-book'
  | 'magazine-pop'
  | 'split-zine'
  | 'orbit-badge'
  | 'arcade-ticket';

export type DoodleShareState = 'active' | 'expired' | 'deleted';

export interface DoodleShare {
  id: string;
  title: string;
  style: DoodleThemeId;
  template: DoodleTemplateId;
  imageUrl: string;
  createdAt: string;
  expiresAt: string;
  state: DoodleShareState;
  isOwner?: boolean;
}

export interface DoodleTheme {
  id: DoodleThemeId;
  name: string;
  primary: string;
  secondary: string;
  ink: string;
  accent: string;
}

export interface DoodleTemplate {
  id: DoodleTemplateId;
  name: string;
  description: string;
}
