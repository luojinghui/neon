const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_FILES = 9;
const MAX_BASE64_LENGTH = Math.ceil(MAX_FILE_BYTES / 3) * 4;
const MIME_PATTERN = /^[a-z0-9!#$%&'*+.^_`|~-]+\/[a-z0-9!#$%&'*+.^_`|~-]+$/;

function attachmentError(message, code) {
  return Object.assign(new Error(message), { code });
}

function decodeFiles(files = []) {
  if (!Array.isArray(files) || files.length > MAX_FILES) {
    throw attachmentError(`每次最多提供 ${MAX_FILES} 个附件`, 'MCP_FILES_INVALID');
  }

  let totalBytes = 0;
  return files.map((file) => {
    if (!file || typeof file !== 'object' || Array.isArray(file)) {
      throw attachmentError('附件格式无效', 'MCP_FILE_INVALID');
    }
    const { name, data } = file;
    if (typeof name !== 'string' || !name.trim() || name.length > 255 || name === '.' || name.includes('..') || /[\\/\u0000-\u001f\u007f-\u009f]/.test(name)) {
      throw attachmentError('附件名称需为 1–255 个字符，不能包含路径、连续点号或控制字符', 'MCP_FILE_NAME_INVALID');
    }
    const mimeType = file.mimeType === undefined ? 'application/octet-stream' : file.mimeType;
    if (typeof mimeType !== 'string' || mimeType.length > 128 || !MIME_PATTERN.test(mimeType.toLowerCase())) {
      throw attachmentError('附件 MIME 类型无效，请使用 type/subtype 格式', 'MCP_FILE_MIME_INVALID');
    }
    if (typeof data !== 'string') {
      throw attachmentError('附件内容需为标准 Base64 字符串，不能包含 data URL、空格或换行', 'MCP_FILE_BASE64_INVALID');
    }
    if (data.length > MAX_BASE64_LENGTH) {
      throw attachmentError('单个附件不能超过 16 MiB', 'MCP_FILE_TOO_LARGE');
    }
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
      throw attachmentError('附件内容需为标准 Base64 字符串，不能包含 data URL、空格或换行', 'MCP_FILE_BASE64_INVALID');
    }

    const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
    const unpadded = padding ? data.slice(0, -padding) : data;
    if (unpadded.length % 4 === 1 || (padding && (data.length % 4 !== 0 || padding !== (4 - unpadded.length % 4) % 4))) {
      throw attachmentError('附件 Base64 长度或补位无效', 'MCP_FILE_BASE64_INVALID');
    }
    const byteLength = Math.floor(unpadded.length * 3 / 4);
    if (byteLength > MAX_FILE_BYTES) {
      throw attachmentError('单个附件不能超过 16 MiB', 'MCP_FILE_TOO_LARGE');
    }
    totalBytes += byteLength;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw attachmentError('附件总大小不能超过 32 MiB', 'MCP_FILES_TOO_LARGE');
    }

    const buffer = Buffer.from(data, 'base64');
    // 拒绝未使用位非零等非规范编码，避免 Buffer 宽松解码静默接受坏数据。
    if (buffer.toString('base64').replace(/=+$/, '') !== unpadded) {
      throw attachmentError('附件 Base64 编码不规范', 'MCP_FILE_BASE64_INVALID');
    }
    return { name, mimeType: mimeType.toLowerCase(), buffer };
  });
}

module.exports = { MAX_FILE_BYTES, MAX_TOTAL_BYTES, MAX_FILES, MAX_BASE64_LENGTH, decodeFiles };
