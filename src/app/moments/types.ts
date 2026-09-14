export type MomentAuthor = {
  userId: string;
  name: string;
  avatarUrl: string;
  publicKey: string;
  isSystem: boolean;
};

export type MomentMedia = {
  id: string;
  type: 'image' | 'video';
  mimeType: string;
  url: string;
  size: number;
  name: string;
};

export type MomentVoice = {
  id: string;
  type: 'audio';
  mimeType: string;
  url: string;
  size: number;
  name: string;
  durationMs: number;
};

export type MomentLocation = {
  latitude: number;
  longitude: number;
  label: string;
};

export type MomentComment = {
  id: string;
  text: string;
  author: MomentAuthor;
  replyTo: MomentAuthor | null;
  createdAt: string;
  updatedAt: string;
  isEdited: boolean;
  isOwner: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export type Moment = {
  id: string;
  text: string;
  media: MomentMedia[];
  voice: MomentVoice | null;
  location: MomentLocation | null;
  author: MomentAuthor;
  comments: MomentComment[];
  commentCount: number;
  createdAt: string;
  updatedAt: string;
  isOwner: boolean;
  canDelete: boolean;
};

export type MomentListResponse = {
  items: Moment[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  isAdmin: boolean;
};

export type CreateMomentInput = {
  text: string;
  media: File[];
  voice: File | null;
  voiceDurationMs: number;
  location: MomentLocation | null;
};
