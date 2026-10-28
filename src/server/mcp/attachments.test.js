const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MAX_FILE_BYTES, MAX_TOTAL_BYTES, MAX_FILES, MAX_BASE64_LENGTH, decodeFiles } = require('./attachments');

const input = (data = '', extra = {}) => ({ name: '附件.txt', data, ...extra });

test('解码标准及无补位 Base64，保留中文文件名、空文件和重复文件名', () => {
  const files = decodeFiles([input('5L2g5aW9', { mimeType: 'TEXT/PLAIN' }), input('YQ=='), input('Yg'), input('')]);
  assert.deepEqual(files.map((file) => file.buffer.toString()), ['你好', 'a', 'b', '']);
  assert.equal(files[0].name, '附件.txt');
  assert.equal(files[0].mimeType, 'text/plain');
  assert.equal(files[1].mimeType, 'application/octet-stream');
  assert.deepEqual(decodeFiles(), []);
  assert.equal(decodeFiles([input('YWJj'), input('YWI=')])[1].buffer.toString(), 'ab');
});

test('拒绝非数组、超量附件和无效附件对象', () => {
  for (const files of [null, {}, 'x', Array.from({ length: MAX_FILES + 1 }, () => input())]) {
    assert.throws(() => decodeFiles(files), { code: 'MCP_FILES_INVALID' });
  }
  for (const file of [null, [], 'x', 0]) assert.throws(() => decodeFiles([file]), { code: 'MCP_FILE_INVALID' });
});

test('拒绝路径穿越、控制字符、空文件名及超长文件名', () => {
  for (const name of ['', ' ', '.', '..', '../x', 'x/y', 'x\\y', 'a..b', 'a\u0000b', 'a\nb', 'a\u007fb', 'x'.repeat(256), undefined, 123]) {
    assert.throws(() => decodeFiles([input('', { name })]), { code: 'MCP_FILE_NAME_INVALID' });
  }
  assert.equal(decodeFiles([input('', { name: 'x'.repeat(255) })])[0].name.length, 255);
});

test('MIME 类型可使用合法 token，拒绝参数、空格和不合法类型', () => {
  assert.equal(decodeFiles([input('', { mimeType: 'application/vnd.test+json' })])[0].mimeType, 'application/vnd.test+json');
  for (const mimeType of ['', 'image', '/png', 'image/', 'text/plain; charset=utf-8', ' image/png', 'image/p ng', 'a/b/c', null, 1, `a/${'x'.repeat(127)}`]) {
    assert.throws(() => decodeFiles([input('', { mimeType })]), { code: 'MCP_FILE_MIME_INVALID' });
  }
});

test('拒绝 data URL、坏字符、补位错误和非零未使用位', () => {
  for (const data of [undefined, null, 1, 'data:text/plain;base64,YQ==', 'YQ==\n', 'Y Q==', 'YQ-_', 'Y', '=', '====', 'YQ=', 'YQ===', 'YWJj=', 'YQ==YQ==', 'YR==', 'YR', 'YWJ=']) {
    assert.throws(() => decodeFiles([{ ...input(), data }]), { code: 'MCP_FILE_BASE64_INVALID' });
  }
});

test('按解码后的字节数执行单文件和总大小边界', () => {
  assert.equal(MAX_BASE64_LENGTH, Math.ceil(MAX_FILE_BYTES / 3) * 4);
  assert.equal(MAX_TOTAL_BYTES, MAX_FILE_BYTES * 2);
  const maximum = Buffer.alloc(MAX_FILE_BYTES, 97).toString('base64');
  const single = decodeFiles([input(maximum)]);
  assert.equal(single[0].buffer.length, MAX_FILE_BYTES);
  assert.throws(() => decodeFiles([input(Buffer.alloc(MAX_FILE_BYTES + 1).toString('base64'))]), { code: 'MCP_FILE_TOO_LARGE' });
  assert.throws(() => decodeFiles([input('A'.repeat(MAX_BASE64_LENGTH + 1))]), { code: 'MCP_FILE_TOO_LARGE' });
  assert.equal(decodeFiles([input(maximum), input(maximum)]).reduce((sum, file) => sum + file.buffer.length, 0), MAX_TOTAL_BYTES);
  assert.throws(() => decodeFiles([input(maximum), input(maximum), input('YQ==')]), { code: 'MCP_FILES_TOO_LARGE' });
});
