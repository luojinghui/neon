const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const { MomentRepository, MAX_ATTACHMENT_BYTES } = require('../moment/momentRepository');
const { presentMoment } = require('../moment/presenter');
const { createMomentService } = require('./moments');

const OWNER_UUID = 'd9428888-122b-4a8b-8a4b-0d2b0f4f3552';

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-mcp-moments-'));
  const repository = new MomentRepository({ dataFile: path.join(directory, 'data.json'), uploadDirectory: path.join(directory, 'custom-uploads') });
  const profile = { uuid: OWNER_UUID, userId: 'mcpAuthor', name: 'MCP 发布人' };
  const profiles = { getByUuid: (uuid) => uuid === OWNER_UUID ? profile : null };
  const service = createMomentService({ momentRepository: repository, profileRepository: profiles, ownerUuid: OWNER_UUID, publicBaseUrl: 'https://neon.example' });
  t.after(async () => {
    await repository.writeQueue;
    await repository.cleanupQueue;
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { directory, repository, profiles, service };
}

function downloadRoute(repository) {
  const source = fs.readFileSync(path.join(__dirname, '../../app/api/moments/[momentId]/attachments/[attachmentId]/route.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  const exports = {};
  new Function('exports', 'require', outputText)(exports, (name) => {
    if (name === '@/server/moment/momentRepository') return { momentRepository: repository };
    if (name === '../../../_shared') return { momentErrorResponse: (error) => Response.json({ code: error.code }, { status: error.code === 'MOMENT_NOT_FOUND' ? 404 : 400 }) };
    return require(name);
  });
  return exports.GET;
}

function publicDetailRoute(repository) {
  const source = fs.readFileSync(path.join(__dirname, '../../app/api/moments/[momentId]/route.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  const exports = {};
  new Function('exports', 'require', outputText)(exports, (name) => {
    if (name === '@/server/moment/momentRepository') return { momentRepository: repository };
    if (name === '../_shared') return {
      getViewer: async () => ({ uuid: '', isAdmin: false }),
      publicMoment: presentMoment,
      momentErrorResponse: (error) => Response.json({ code: error.code }, { status: error.code === 'MOMENT_NOT_FOUND' ? 404 : 400 })
    };
    return require(name);
  });
  return exports.GET;
}

test('MCP publishes mixed media and downloadable ordinary files with a configured author', async (t) => {
  const { repository, service } = fixture(t);
  const result = await service.publishMoment({
    text: '带附件的心迹',
    ownerUuid: 'c56a4180-65aa-42ec-a945-5fd21dec0538',
    files: [
      { name: 'image.png', mimeType: 'image/png', buffer: Buffer.from('image') },
      { name: '../项目说明.pdf', mimeType: 'application/pdf', buffer: Buffer.from('document') },
      { name: 'snippet.html', mimeType: 'text/html', buffer: Buffer.from('<script>bad()</script>') }
    ]
  });
  assert.equal(result.media.length, 1);
  assert.equal(result.attachments.length, 2);
  assert.equal(result.author.userId, 'mcpAuthor');
  assert.equal(result.attachments[0].name, '项目说明.pdf');
  assert.equal(result.attachments[1].mimeType, 'text/html');
  assert.equal(result.attachments[0].url, `https://neon.example/api/moments/${result.id}/attachments/${result.attachments[0].id}`);
  assert.equal(result.viewUrl, `https://neon.example/moments?moment=${result.id}`);
  assert.equal('ownerUuid' in result, false);
  assert.equal(repository.getMoment(result.id).ownerUuid, OWNER_UUID);
  assert.equal(presentMoment(repository.getMoment(result.id)).attachments.length, 2);
});

test('attachment-only moments persist, download safely from custom directories, and are reclaimed on deletion', async (t) => {
  const { repository, service } = fixture(t);
  const result = await service.publishMoment({ files: [{ name: '报价\r\n单.html', mimeType: 'text/html', buffer: Buffer.from('<h1>attachment</h1>') }] });
  const reloaded = new MomentRepository({ dataFile: repository.dataFile, uploadDirectory: repository.uploadDirectory });
  assert.equal(reloaded.getMoment(result.id).attachments[0].name, '报价单.html');
  const file = reloaded.getFileAttachment(result.id, result.attachments[0].id);
  assert.match(file.filePath, /\.bin$/);
  assert.equal(path.dirname(file.filePath), repository.uploadDirectory);
  const GET = downloadRoute(reloaded);
  const response = await GET(new Request(result.attachments[0].url), { params: Promise.resolve({ momentId: result.id, attachmentId: result.attachments[0].id }) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/octet-stream');
  assert.match(response.headers.get('content-disposition'), /^attachment;.*UTF-8''/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(await response.text(), '<h1>attachment</h1>');
  await repository.deleteMoment(result.id, OWNER_UUID);
  assert.equal(fs.existsSync(file.filePath), false);
  const missing = await GET(new Request(result.attachments[0].url), { params: Promise.resolve({ momentId: result.id, attachmentId: result.attachments[0].id }) });
  assert.equal(missing.status, 404);
});

test('attachment lookups reject traversal and uploads reject empty, oversized, or too many files without leaving content', async (t) => {
  const { repository, service } = fixture(t);
  const file = { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('ok') };
  const result = await service.publishMoment({ files: [file] });
  assert.throws(() => repository.getFileAttachment(result.id, '../secret'), { code: 'MOMENT_MEDIA_INVALID' });
  assert.throws(() => repository.getFileAttachment('../secret', result.attachments[0].id), { code: 'MOMENT_ID_INVALID' });
  assert.throws(() => repository.getFileAttachment(result.id, 'xxxxxxxxxxxxxxxx'), { code: 'MOMENT_NOT_FOUND' });
  const before = fs.readdirSync(repository.uploadDirectory);
  await assert.rejects(() => service.publishMoment({ files: Array(10).fill(file) }), { code: 'MOMENT_MEDIA_INVALID' });
  await assert.rejects(() => service.publishMoment({ files: [file, { ...file, buffer: Buffer.alloc(0) }] }), { code: 'MOMENT_MEDIA_INVALID' });
  await assert.rejects(() => service.publishMoment({ files: [{ ...file, buffer: Buffer.alloc(MAX_ATTACHMENT_BYTES + 1) }] }), { code: 'MOMENT_MEDIA_TOO_LARGE' });
  assert.deepEqual(fs.readdirSync(repository.uploadDirectory), before);
  assert.equal(repository.listMoments().total, 1);
});

test('MCP refuses missing publisher configuration and old moment records remain readable', async (t) => {
  const { repository, profiles, directory } = fixture(t);
  const unconfigured = createMomentService({ momentRepository: repository, profileRepository: profiles, publicBaseUrl: 'https://neon.example' });
  await assert.rejects(() => unconfigured.publishMoment({ text: 'no author' }), { code: 'MCP_PROFILE_REQUIRED' });
  const created = await repository.createMoment({ ownerUuid: OWNER_UUID, text: 'legacy' });
  const data = JSON.parse(fs.readFileSync(repository.dataFile, 'utf8'));
  delete data.moments[0].attachments;
  fs.writeFileSync(repository.dataFile, JSON.stringify(data));
  const reloaded = new MomentRepository({ dataFile: path.join(directory, 'data.json'), uploadDirectory: repository.uploadDirectory });
  assert.deepEqual(reloaded.getMoment(created.id).attachments, []);
});

test('permalink detail reads an older moment directly and exposes public content without author credentials', async (t) => {
  const { repository, service } = fixture(t);
  const old = await service.publishMoment({ files: [{ name: 'readme.txt', mimeType: 'text/plain', buffer: Buffer.from('older attachment') }] });
  for (let i = 0; i < 13; i++) await service.publishMoment({ text: `newer ${i}` });
  const GET = publicDetailRoute(repository);
  const response = await GET(new Request(old.apiUrl), { params: Promise.resolve({ momentId: old.id }) });
  assert.equal(response.status, 200);
  const { item } = await response.json();
  assert.equal(item.id, old.id);
  assert.equal(item.attachments[0].name, 'readme.txt');
  assert.equal(item.isOwner, false);
  assert.equal(item.canDelete, false);
  assert.equal('ownerUuid' in item, false);
  assert.equal('likedBy' in item, false);
  const missing = await GET(new Request(old.apiUrl), { params: Promise.resolve({ momentId: 'xxxxxxxxxxxxxxxx' }) });
  assert.equal(missing.status, 404);
});
