const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { RoomRepository } = require('./roomRepository');
const { MomentRepository } = require('../moment/momentRepository');
const { buildMomentShareDraft, shareRoomMessages } = require('./momentShare');

const owner = {
  id: 'guest-11111111-1111-4111-8111-111111111111',
  uuid: '11111111-1111-4111-8111-111111111111',
  userId: 'Host',
  publicKey: 'host-public',
  name: '小鱼'
};
const guest = {
  id: 'guest-22222222-2222-4222-8222-222222222222',
  uuid: '22222222-2222-4222-8222-222222222222',
  userId: 'Guest',
  publicKey: 'guest-public',
  name: '阿橘'
};

test('多条消息按列表顺序各占一行，不带人名、时间和文件信息', () => {
  const draft = buildMomentShareDraft([
    { id: 'b', timestamp: 20, senderName: '阿橘', type: 'text', content: '后说的' },
    { id: 'a', timestamp: 10, senderName: '小鱼', type: 'text', content: '先说的' },
    { id: 'c', timestamp: 30, senderName: '小鱼', type: 'file', content: '笔记.txt', attachment: { name: '笔记.txt', url: '/uploads/soul/x.bin', mimeType: 'text/plain' } }
  ]);
  assert.deepEqual(draft.blocks, [{ type: 'text', text: '先说的\n后说的' }]);
  assert.equal(JSON.stringify(draft).includes('小鱼'), false);
  assert.equal(JSON.stringify(draft).includes('阿橘'), false);
  assert.equal(JSON.stringify(draft).includes('笔记'), false);
  assert.equal(draft.inlineImages.length, 0);
});

test('图片穿插在文字之间，单独的图片不再写成文件名', () => {
  const draft = buildMomentShareDraft([
    { id: 'before', timestamp: 1, senderName: '小鱼', type: 'text', content: '看这张' },
    { id: 'img', timestamp: 2, senderName: '小鱼', type: 'image', content: '月亮.png', attachment: { url: '/uploads/soul/11111111-1111-4111-8111-111111111111.png', name: '月亮.png', mimeType: 'image/png' } },
    { id: 'after', timestamp: 3, senderName: '阿橘', type: 'text', content: '真亮' },
    { id: 'gif', timestamp: 4, senderName: '阿橘', type: 'gif', content: '猫猫', attachment: { url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f431/512.gif', name: '猫猫.gif', mimeType: 'image/gif' } }
  ]);
  assert.deepEqual(draft.blocks.map((block) => block.type === 'text' ? block.text : block.type), ['看这张', 'image', '真亮']);
  assert.equal(draft.blocks[1].inlineIndex, 0);
  assert.equal(draft.blocks[1].alt, '');
  assert.equal(draft.inlineImages.length, 1);
  assert.equal(draft.inlineImages[0].mimeType, 'image/png');
  assert.throws(() => buildMomentShareDraft([
    { id: 'gif', timestamp: 1, senderName: '阿橘', type: 'gif', content: '猫猫', attachment: { url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f431/512.gif', name: '猫猫.gif', mimeType: 'image/gif' } }
  ]), /没有可以分享的文字或图片/);
});

test('分享写入星河且不新增聊天消息，缺图时跳过', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-share-'));
  const uploadDirectory = path.join(directory, 'soul');
  fs.mkdirSync(uploadDirectory);
  const imageName = '11111111-1111-4111-8111-111111111111.png';
  fs.writeFileSync(path.join(uploadDirectory, imageName), Buffer.from('png-bytes'));
  const rooms = new RoomRepository({ dataFile: path.join(directory, 'chat.json'), uploadDirectory });
  const moments = new MomentRepository({ dataFile: path.join(directory, 'moments.json'), uploadDirectory: path.join(directory, 'moments') });
  const room = rooms.createRoom({ name: '夜谈', description: '', tags: [], isPrivate: false, passwordEnabled: false }, owner);
  const earlier = rooms.addMessage(room.id, owner, { type: 'text', content: '先说的' });
  const later = rooms.addMessage(room.id, guest, { type: 'text', content: '后说的' });
  const image = rooms.addMessage(room.id, owner, { type: 'image', content: '月亮.png', attachment: { url: `/uploads/soul/${imageName}`, name: '月亮.png', size: 9, mimeType: 'image/png' } });
  const missing = rooms.addMessage(room.id, owner, { type: 'image', content: '丢了.png', attachment: { url: '/uploads/soul/33333333-3333-4333-8333-333333333333.png', name: '丢了.png', size: 4, mimeType: 'image/png' } });
  const before = rooms.getHistory(room.id, { limit: 20, user: owner }).messages.length;

  const shared = await shareRoomMessages({
    roomRepository: rooms,
    momentRepository: moments,
    uploadDirectory,
    user: owner,
    roomId: room.id,
    messageIds: [missing.id, image.id, later.id, earlier.id]
  });

  assert.match(shared.path, /^\/moments\/[A-Za-z0-9_-]{16}$/);
  assert.equal(JSON.stringify(shared).includes(owner.uuid), false);
  const moment = moments.getMoment(shared.path.split('/').pop());
  assert.equal(moment.text, '先说的\n后说的');
  assert.equal(moment.blocks.filter((block) => block.type === 'image').length, 1);
  assert.equal(JSON.stringify(moment.blocks).includes('小鱼'), false);
  assert.equal(JSON.stringify(moment.blocks).includes('丢了'), false);
  assert.equal(rooms.getHistory(room.id, { limit: 20, user: owner }).messages.length, before);
});
