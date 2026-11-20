const dns = require('node:dns');
const net = require('node:net');
const path = require('node:path');
const { MIME_TYPES, MomentRepositoryError } = require('./momentRepository');

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_URL_LENGTH = 2048;

function isPrivateIpv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local & cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24
  if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast & reserved
  return false;
}

function isPrivateIp(address) {
  const ip = String(address || '').trim().toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  const version = net.isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version !== 6) return true;
  if (ip === '::' || ip === '::1') return true;
  // IPv4-mapped IPv6 addresses: ::ffff:a.b.c.d or ::ffff:xxxx:xxxx
  const mappedV4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mappedV4) return isPrivateIpv4(mappedV4[1]);
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
  if (mappedHex) {
    const hi = Number.parseInt(mappedHex[1], 16);
    const lo = Number.parseInt(mappedHex[2], 16);
    return isPrivateIpv4(`${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`);
  }
  const firstSegment = ip.split(':')[0];
  const firstWord = firstSegment ? Number.parseInt(firstSegment, 16) : 0;
  if ((firstWord & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
  if ((firstWord & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((firstWord & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (firstWord === 0x0064 && ip.startsWith('64:ff9b:')) return true; // NAT64
  return false;
}

function sniffImageMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return '';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) && buffer[5] === 0x61
  ) {
    return 'image/gif';
  }
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return 'image/webp';
  }
  return '';
}

function isDisallowedHostname(hostname) {
  const host = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  return false;
}

async function assertPublicUrl(rawUrl, lookup = dns.promises.lookup) {
  const value = String(rawUrl || '').trim();
  if (!value || value.length > MAX_URL_LENGTH) {
    throw new MomentRepositoryError('图片地址无效', 'MOMENT_IMAGE_URL_INVALID');
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new MomentRepositoryError('图片地址无效', 'MOMENT_IMAGE_URL_INVALID');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new MomentRepositoryError('仅支持 HTTP/HTTPS 图片地址', 'MOMENT_IMAGE_URL_INVALID');
  }
  if (parsed.username || parsed.password) {
    throw new MomentRepositoryError('不支持包含认证信息的图片地址', 'MOMENT_IMAGE_URL_INVALID');
  }
  const bareHost = parsed.hostname.replace(/^\[|\]$/g, '');
  if (isDisallowedHostname(bareHost)) {
    throw new MomentRepositoryError('不允许拉取内网或本地地址', 'MOMENT_IMAGE_URL_BLOCKED');
  }
  if (net.isIP(bareHost)) {
    if (isPrivateIp(bareHost)) {
      throw new MomentRepositoryError('不允许拉取内网或本地地址', 'MOMENT_IMAGE_URL_BLOCKED');
    }
    return parsed;
  }
  let records;
  try {
    records = await lookup(bareHost, { all: true, verbatim: true });
  } catch {
    throw new MomentRepositoryError('无法解析图片服务器地址', 'MOMENT_IMAGE_FETCH_FAILED');
  }
  if (!Array.isArray(records) || records.length === 0) {
    throw new MomentRepositoryError('无法解析图片服务器地址', 'MOMENT_IMAGE_FETCH_FAILED');
  }
  for (const record of records) {
    if (isPrivateIp(record.address)) {
      throw new MomentRepositoryError('不允许拉取内网或本地地址', 'MOMENT_IMAGE_URL_BLOCKED');
    }
  }
  return parsed;
}

function deriveImageFilename(url, extension) {
  const base = path.posix.basename(url.pathname || '').replace(/[^A-Za-z0-9._-]/g, '').replace(/^\.+/, '');
  const stem = base.replace(/\.[A-Za-z0-9]+$/, '').slice(0, 48);
  return `${stem || 'pasted-image'}.${extension}`;
}

async function readStreamWithLimit(response, maxBytes) {
  const declaredLength = Number.parseInt(response.headers.get('content-length') || '', 10);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new MomentRepositoryError('图片超过大小限制', 'MOMENT_MEDIA_TOO_LARGE');
  }
  if (!response.body || typeof response.body.getReader !== 'function') {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new MomentRepositoryError('图片超过大小限制', 'MOMENT_MEDIA_TOO_LARGE');
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new MomentRepositoryError('图片超过大小限制', 'MOMENT_MEDIA_TOO_LARGE');
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

async function fetchRemoteImage(rawUrl, options = {}) {
  const lookup = options.lookup || dns.promises.lookup;
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs || FETCH_TIMEOUT_MS;
  const maxBytes = 20 * 1024 * 1024;
  let currentUrl = await assertPublicUrl(rawUrl, lookup);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let response;
    try {
      response = await fetchImpl(currentUrl.toString(), {
        method: 'GET',
        redirect: 'manual',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          Accept: 'image/webp,image/png,image/jpeg,image/gif,*/*;q=0.5',
          'User-Agent': 'Mozilla/5.0 (compatible; NeonMomentsFetcher/1.0)'
        }
      });
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw new MomentRepositoryError('图片拉取超时，请重试或手动替换', 'MOMENT_IMAGE_FETCH_FAILED');
      }
      throw new MomentRepositoryError('图片拉取失败，可能受来源站点限制', 'MOMENT_IMAGE_FETCH_FAILED');
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || hop === MAX_REDIRECTS) {
        throw new MomentRepositoryError('图片跳转次数过多或地址无效', 'MOMENT_IMAGE_FETCH_FAILED');
      }
      const nextUrl = new URL(location, currentUrl).toString();
      currentUrl = await assertPublicUrl(nextUrl, lookup);
      continue;
    }

    if (!response.ok) {
      throw new MomentRepositoryError('原图受访问权限或防盗链限制，请手动替换', 'MOMENT_IMAGE_FETCH_FAILED');
    }

    const buffer = await readStreamWithLimit(response, maxBytes);
    const mimeType = sniffImageMime(buffer);
    const config = MIME_TYPES.get(mimeType);
    if (!config || config.kind !== 'image') {
      throw new MomentRepositoryError('来源内容不是受支持的图片格式（支持 JPG/PNG/WebP/GIF）', 'MOMENT_MEDIA_INVALID');
    }
    if (buffer.length > config.maxBytes) {
      throw new MomentRepositoryError('图片超过大小限制', 'MOMENT_MEDIA_TOO_LARGE');
    }
    return {
      buffer,
      mimeType,
      name: deriveImageFilename(currentUrl, config.extension)
    };
  }

  throw new MomentRepositoryError('图片拉取失败', 'MOMENT_IMAGE_FETCH_FAILED');
}

module.exports = {
  assertPublicUrl,
  fetchRemoteImage,
  isPrivateIp,
  sniffImageMime
};
