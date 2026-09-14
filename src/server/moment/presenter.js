const { profileRepository } = require('../user/profileRepository');

const FALLBACK_AUTHOR = {
  userId: 'unknown',
  name: '星球旅人',
  avatarUrl: '',
  publicKey: 'unknown',
  isSystem: false
};

function presentAuthor(ownerUuid) {
  const profile = profileRepository.getByUuid(ownerUuid);
  if (!profile) return { ...FALLBACK_AUTHOR };
  const publicProfile = profileRepository.toPublic(profile);
  return {
    userId: publicProfile.userId,
    name: publicProfile.name,
    avatarUrl: publicProfile.avatarUrl,
    publicKey: publicProfile.publicKey,
    isSystem: publicProfile.isSystem === true
  };
}

function presentComment(comment, viewer = {}) {
  const isOwner = Boolean(viewer.uuid && viewer.uuid === comment.ownerUuid);
  return {
    id: comment.id,
    text: comment.text,
    author: presentAuthor(comment.ownerUuid),
    replyTo: comment.replyToOwnerUuid ? presentAuthor(comment.replyToOwnerUuid) : null,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    isEdited: comment.updatedAt !== comment.createdAt,
    isOwner,
    canEdit: isOwner,
    canDelete: isOwner || viewer.isAdmin === true
  };
}

function presentMoment(moment, viewer = {}, options = {}) {
  const commentLimit = Math.max(0, Math.min(100, Number.parseInt(options.commentLimit, 10) || 0));
  const comments = commentLimit ? moment.comments.slice(-commentLimit) : moment.comments;
  const isOwner = Boolean(viewer.uuid && viewer.uuid === moment.ownerUuid);
  return {
    id: moment.id,
    text: moment.text,
    media: moment.media.map((item) => ({ ...item })),
    voice: moment.voice ? { ...moment.voice } : null,
    location: moment.location ? { ...moment.location } : null,
    author: presentAuthor(moment.ownerUuid),
    comments: comments.map((comment) => presentComment(comment, viewer)),
    commentCount: moment.comments.length,
    createdAt: moment.createdAt,
    updatedAt: moment.updatedAt,
    isOwner,
    canDelete: isOwner || viewer.isAdmin === true
  };
}

module.exports = { presentAuthor, presentComment, presentMoment };
