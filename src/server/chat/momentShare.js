const fs = require('node:fs');
const path = require('node:path');
const { RoomRepositoryError } = require('./roomRepository');

const MAX_MESSAGES = 20;
const MAX_IMAGES = 9;
const IMAGE_MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
const LOCAL_IMAGE = /^\/uploads\/soul\/([a-f0-9-]{8,80}\.(png|jpg|webp|gif))$/;

function ownerUuid(user) {
  const match = /^guest-([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(user?.id || '');
  if (!match) throw new RoomRepositoryError('个人资料无效，请刷新后再分享', 'PROFILE_INVALID');
  return match[1].toLowerCase();
}

function normalizeIds(messageIds) {
  if (!Array.isArray(messageIds) || messageIds.some((id) => typeof id !== 'string')) {
    throw new RoomRepositoryError('先选择要分享的消息', 'SHARE_EMPTY');
  }
  const ids = [...new Set(messageIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) throw new RoomRepositoryError('先选择要分享的消息', 'SHARE_EMPTY');
  if (ids.length > MAX_MESSAGES || ids.some((id) => id.length > 100)) {
    throw new RoomRepositoryError('一次最多分享 20 条消息', 'SHARE_TOO_MANY');
  }
  return ids;
}

function localImage(message) {
  if (message?.type !== 'image' && message?.type !== 'gif') return null;
  const url = String(message.attachment?.url || '');
  const match = LOCAL_IMAGE.exec(url);
  if (!match) return null;
  const extension = match[1].split('.').pop();
  return {
    url,
    name: String(message.attachment?.name || '图片'),
    mimeType: IMAGE_MIME[extension] || 'image/png'
  };
}

function messageText(message) {
  if (message?.type !== 'text' && message?.type !== 'markdown') return '';
  return String(message.content || '').replace(/\r\n?/g, '\n').trim();
}

function appendLine(blocks, line) {
  const previous = blocks[blocks.length - 1];
  if (previous?.type === 'text') previous.text = `${previous.text}\n${line}`;
  else blocks.push({ type: 'text', text: line });
}

/** 按列表从上到下书写。一条消息占一行，图片穿插在对应位置，不带人名和时间。 */
function buildMomentShareDraft(messages) {
  const sorted = [...messages].sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0) || String(a.id).localeCompare(String(b.id)));
  if (sorted.length === 0) throw new RoomRepositoryError('先选择要分享的消息', 'SHARE_EMPTY');
  if (sorted.length > MAX_MESSAGES) throw new RoomRepositoryError('一次最多分享 20 条消息', 'SHARE_TOO_MANY');

  const blocks = [];
  const inlineImages = [];
  for (const message of sorted) {
    const image = localImage(message);
    if (image && inlineImages.length < MAX_IMAGES) {
      blocks.push({ type: 'image', inlineIndex: inlineImages.length, alt: '' });
      inlineImages.push(image);
      continue;
    }
    const line = messageText(message);
    if (line) appendLine(blocks, line);
  }
  if (blocks.length === 0) throw new RoomRepositoryError('这些消息里没有可以分享的文字或图片', 'SHARE_EMPTY');
  return { blocks, inlineImages };
}

async function readSoulImage(uploadDirectory, source) {
  const match = LOCAL_IMAGE.exec(source?.url || '');
  if (!match) return null;
  const root = path.resolve(uploadDirectory);
  const filePath = path.resolve(root, match[1]);
  if (filePath !== path.join(root, match[1])) return null;
  try {
    const buffer = await fs.promises.readFile(filePath);
    if (!buffer.length) return null;
    const extension = match[1].split('.').pop();
    return { buffer, mimeType: IMAGE_MIME[extension], name: source.name || match[1] };
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function materializeImages(draft, uploadDirectory) {
  const inlineImages = [];
  const blocks = [];
  for (const block of draft.blocks) {
    if (block.type !== 'image') {
      blocks.push({ type: 'text', text: block.text });
      continue;
    }
    const source = draft.inlineImages[block.inlineIndex];
    const file = await readSoulImage(uploadDirectory, source);
    if (!file) continue;
    blocks.push({ type: 'image', inlineIndex: inlineImages.length, alt: block.alt || '' });
    inlineImages.push(file);
  }
  return { blocks, inlineImages };
}

async function shareRoomMessages({ roomRepository, momentRepository, uploadDirectory, user, roomId, messageIds }) {
  const room = roomRepository.getRoom(roomId);
  if (!room || !roomRepository.canViewRoom(room, user)) {
    throw new RoomRepositoryError('无法分享这个星球的消息', 'ROOM_FORBIDDEN');
  }
  const messages = normalizeIds(messageIds).map((id) => {
    const message = roomRepository.getStoredMessage(room.id, id);
    if (!message) throw new RoomRepositoryError('有消息已经不在了，重新选一下吧', 'SHARE_MESSAGE_MISSING');
    return message;
  });
  const draft = buildMomentShareDraft(messages);
  const prepared = await materializeImages(draft, uploadDirectory || roomRepository.uploadDirectory);
  if (prepared.blocks.length === 0) throw new RoomRepositoryError('这些消息里没有可以分享的文字或图片', 'SHARE_EMPTY');
  const moment = await momentRepository.createMoment(
    { ownerUuid: ownerUuid(user), blocks: prepared.blocks },
    { inlineImages: prepared.inlineImages }
  );
  return { momentId: moment.id, path: `/moments/${moment.id}` };
}

module.exports = { buildMomentShareDraft, shareRoomMessages };
