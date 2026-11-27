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

test('多条消息按时间从上到下排，不跟勾选顺序走', () => {
  const draft = buildMomentShareDraft('来自星球「夜谈」', [
    { id: 'b', timestamp: 20, senderName: '阿橘', type: 'text', content: '后说的' },
    { id: 'a', timestamp: 10, senderName: '小鱼', type: 'text', content: '先说的' },
    { id: 'c', timestamp: 30, senderName: '小鱼', type: 'file', content: '笔记.txt', attachment: { name: '笔记.txt', url: '/uploads/soul/x.bin', mimeType: 'text/plain' } }
  ]);
  const texts = draft.blocks.filter((block) => block.type === 'text').map((block) => block.text);
  assert.deepEqual(texts, [
    '来自星球「夜谈」',
    '小鱼\n先说的',
    '阿橘\n后说的',
    '小鱼\n[文件] 笔记.txt'
  ]);
  assert.equal(draft.inlineImages.length, 0);
});

test('本地图片按出现位置插入，远程表情退回文字', () => {
  const draft = buildMomentShareDraft('来自星球「夜谈」', [
    { id: 'img', timestamp: 1, senderName: '小鱼', type: 'image', content: '月亮.png', attachment: { url: '/uploads/soul/11111111-1111-4111-8111-111111111111.png', name: '月亮.png', mimeType: 'image/png' } },
    { id: 'gif', timestamp: 2, senderName: '阿橘', type: 'gif', content: '猫猫', attachment: { url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f431/512.gif', name: '猫猫.gif', mimeType: 'image/gif' } }
  ]);
  assert.equal(draft.blocks[1].text, '小鱼');
  assert.equal(draft.blocks[2].type, 'image');
  assert.equal(draft.blocks[2].inlineIndex, 0);
  assert.equal(draft.blocks[3].text, '阿橘\n[表情] 猫猫');
  assert.equal(draft.inlineImages[0].mimeType, 'image/png');
});

test('分享写入星河且不新增聊天消息，缺图时改成文字', async () => {
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
  assert.match(moment.text, /来自星球「夜谈」\n\n小鱼\n先说的\n\n阿橘\n后说的/);
  assert.equal(moment.blocks.filter((block) => block.type === 'image').length, 1);
  assert.match(moment.text, /\[图片\] 丢了\.png/);
  assert.equal(rooms.getHistory(room.id, { limit: 20, user: owner }).messages.length, before);
});
