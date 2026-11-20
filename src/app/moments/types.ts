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

export type MomentAttachment = {
  id: string;
  type: 'file';
  mimeType: string;
  url: string;
  size: number;
  name: string;
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

export type MomentTextBlock = {
  type: 'text';
  text: string;
};

export type MomentImageBlock = {
  type: 'image';
  id: string;
  mimeType: string;
  url: string;
  size: number;
  name: string;
  alt?: string;
};

export type MomentBlock = MomentTextBlock | MomentImageBlock;

export type Moment = {
  id: string;
  text: string;
  blocks?: MomentBlock[];
  media: MomentMedia[];
  attachments: MomentAttachment[];
  voice: MomentVoice | null;
  location: MomentLocation | null;
  author: MomentAuthor;
  comments: MomentComment[];
  commentCount: number;
  likeCount: number;
  liked: boolean;
  createdAt: string;
  updatedAt: string;
  isEdited?: boolean;
  isOwner: boolean;
  canEdit?: boolean;
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

export type CreateMomentBlockInput =
  | { type: 'text'; text: string }
  | { type: 'image'; inlineIndex: number; alt?: string }
  | { type: 'image'; existingId: string; alt?: string };

export type CreateMomentInput = {
  text: string;
  blocks?: CreateMomentBlockInput[];
  inlineImages?: File[];
  media: File[];
  voice: File | null;
  voiceDurationMs: number;
  location: MomentLocation | null;
};

export type UpdateMomentInput = CreateMomentInput & {
  keepMediaIds: string[];
  removeVoice: boolean;
};
