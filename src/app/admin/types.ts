export type AdminIdentity = {
  id: string;
  username: string;
  displayName: string;
  role: 'super_admin';
};

export type AdminCloudFile = {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  relativePath: string;
  downloadUrl: string;
};

export type AdminCloudItem = {
  id: string;
  messageId: string;
  messageType: 'text' | 'file' | 'mixed';
  content: string;
  password: string;
  files: AdminCloudFile[];
  createdAt: string;
  expireAt: string;
};

export type AdminRoomItem = {
  id: string;
  code: string;
  name: string;
  description: string;
  tags: string[];
  ownerId: string;
  ownerName: string;
  ownerUserId: string;
  onlineCount: number;
  messageCount: number;
  attachmentCount: number;
  attachmentBytes: number;
  pendingRequestCount: number;
  authorizedMemberCount: number;
  isPrivate: boolean;
  hasPassword: boolean;
  isFixed: boolean;
  createdAt: string;
  lastMessageAt?: string | null;
  updatedAt?: string | null;
};

export type AdminRoomAccessItem = {
  id: string;
  roomId: string;
  roomName: string;
  roomCode: string;
  requesterId: string;
  requesterUserId: string;
  requesterName: string;
  requesterAvatarUrl: string;
  status: 'pending' | 'approved' | 'rejected' | 'revoked';
  source: 'request' | 'invite';
  attemptCount: number;
  requestedAt: string;
  updatedAt: string;
};

export type AdminProfileItem = {
  uuid: string;
  publicKey: string;
  userId: string;
  name: string;
  bio: string;
  avatarUrl: string;
  banner: { type: 'preset' | 'image'; value: string };
  createdAt: string;
  updatedAt: string;
  isSystem: boolean;
};

export type AdminDoodleItem = {
  id: string;
  title: string;
  style: string;
  template: string;
  shareId: string;
  originalUrl: string;
  processedUrl: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'deleted';
  reviewedAt: string;
  reviewedBy: string;
  ownerUuid: string;
  ownerUserId: string;
  ownerName: string;
};
