const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ADMIN_SESSION_COOKIE,
  clearSessionCookie,
  createSessionCookie,
  createSessionId,
  getSessionIdFromCookieHeader,
  hashPassword,
  hashSessionId,
  verifyPassword
} = require('./auth');

test('admin passwords use a salted scrypt hash', async () => {
  const first = await hashPassword('ExamplePassword123!');
  const second = await hashPassword('ExamplePassword123!');
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('ExamplePassword123!', first), true);
  assert.equal(await verifyPassword('wrong-password', first), false);
  assert.equal(first.includes('ExamplePassword123!'), false);
});

test('admin session cookies are HttpOnly and carry only the opaque session id', () => {
  const sessionId = createSessionId();
  const cookie = createSessionCookie(sessionId);
  assert.match(cookie, new RegExp(`^${ADMIN_SESSION_COOKIE}=`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.equal(getSessionIdFromCookieHeader(`theme=dark; ${cookie}`), sessionId);
  assert.equal(hashSessionId(sessionId), hashSessionId(sessionId));
  assert.notEqual(hashSessionId(sessionId), sessionId);
  assert.match(clearSessionCookie(), /Max-Age=0/);
});
