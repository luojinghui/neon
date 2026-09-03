const { promisify } = require('util');
const { randomBytes, createHash, scrypt: scryptCallback, timingSafeEqual } = require('crypto');
const { connectDB } = require('../models');
const { AdminUser } = require('../models/admin');

const scrypt = promisify(scryptCallback);
const ADMIN_SESSION_COOKIE = 'neon_admin_session';
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const PASSWORD_SCHEME = 'scrypt-v1';

function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim().toLowerCase().slice(0, 64) : '';
}

async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new Error('管理员密码长度需为 8-128 位');
  }
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, 64);
  return `${PASSWORD_SCHEME}$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

async function verifyPassword(password, encodedHash) {
  const [scheme, saltHex, keyHex] = String(encodedHash || '').split('$');
  if (scheme !== PASSWORD_SCHEME || !/^[a-f0-9]{32}$/i.test(saltHex || '') || !/^[a-f0-9]{128}$/i.test(keyHex || '')) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scrypt(String(password || ''), Buffer.from(saltHex, 'hex'), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function hashSessionId(sessionId) {
  return createHash('sha256').update(String(sessionId || '')).digest('hex');
}

function parseCookies(cookieHeader) {
  const cookies = {};
  for (const pair of String(cookieHeader || '').split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    const name = pair.slice(0, separator).trim();
    if (!name) continue;
    const value = pair.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

function getSessionIdFromCookieHeader(cookieHeader) {
  return parseCookies(cookieHeader)[ADMIN_SESSION_COOKIE] || '';
}

function createSessionCookie(sessionId, maxAgeSeconds = ADMIN_SESSION_TTL_MS / 1000) {
  const parts = [
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

function clearSessionCookie() {
  return createSessionCookie('', 0);
}

function toAdminPrincipal(admin, sessionIdHash = '') {
  if (!admin) return null;
  return {
    id: String(admin._id),
    username: admin.username,
    displayName: admin.displayName,
    role: admin.role,
    ...(sessionIdHash ? { sessionIdHash } : {})
  };
}

async function authenticateSessionId(sessionId) {
  if (!sessionId || !/^[A-Za-z0-9_-]{40,100}$/.test(sessionId)) return null;
  await connectDB();
  const sessionIdHash = hashSessionId(sessionId);
  const admin = await AdminUser.findOne({
    sessionIdHash,
    sessionExpiresAt: { $gt: new Date() },
    enabled: true,
    role: 'super_admin'
  })
    .select('+sessionIdHash +sessionExpiresAt')
    .lean();
  return toAdminPrincipal(admin, sessionIdHash);
}

async function authenticateCookieHeader(cookieHeader) {
  const sessionId = getSessionIdFromCookieHeader(cookieHeader);
  return sessionId ? authenticateSessionId(sessionId) : null;
}

function createSessionId() {
  return randomBytes(32).toString('base64url');
}

module.exports = {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_MS,
  authenticateCookieHeader,
  authenticateSessionId,
  clearSessionCookie,
  createSessionCookie,
  createSessionId,
  getSessionIdFromCookieHeader,
  hashPassword,
  hashSessionId,
  normalizeUsername,
  toAdminPrincipal,
  verifyPassword
};
