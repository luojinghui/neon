const test = require('node:test');
const assert = require('node:assert/strict');
const { describePushFailure, diagnosticText } = require('./diagnostics');

test('distinguishes actionable provider, timeout, network and unknown failures', () => {
  const cases = [
    [{ statusCode: 403 }, 'HTTP_403', /鉴权/],
    [{ statusCode: 400 }, 'HTTP_400', /请求无效/],
    [{ statusCode: 410 }, 'HTTP_410', /订阅已失效/],
    [{ statusCode: 413 }, 'HTTP_413', /内容过长/],
    [{ statusCode: 429 }, 'HTTP_429', /限流/],
    [{ statusCode: 503 }, 'HTTP_503', /暂时不可用/],
    [new Error('Socket timeout'), 'ETIMEDOUT', /超时/],
    [{ code: 'ETIMEDOUT' }, 'ETIMEDOUT', /超时/],
    [{ code: 'ENOTFOUND' }, 'ENOTFOUND', /DNS/],
    [{ code: 'ECONNRESET' }, 'ECONNRESET', /出站网络/],
    [{ code: 'CERT_HAS_EXPIRED' }, 'CERT_HAS_EXPIRED', /TLS/],
    [{ code: 'SUBSCRIPTION_REVOKED' }, 'SUBSCRIPTION_REVOKED', /取消或更新/],
    [null, 'UNKNOWN', /查看服务端日志/]
  ];
  for (const [error, code, reason] of cases) {
    const failure = describePushFailure(error);
    assert.equal(failure.code, code);
    assert.match(failure.reason, reason);
  }
});

test('diagnostics redact secrets and URL paths before limiting single-line log text', () => {
  const raw = Buffer.from('InvalidSignature\r\nprivate-key auth-key Bearer credential https://push.example/path/token?secret=another-token ' + 'x'.repeat(2000));
  const text = diagnosticText(raw, ['private-key', 'auth-key']);
  assert.match(text, /InvalidSignature/);
  assert.match(text, /https:\/\/push\.example/);
  for (const secret of ['private-key', 'auth-key', 'credential', '/path/token', 'another-token']) assert.equal(text.includes(secret), false);
  assert.doesNotMatch(text, /[\r\n]/);
  assert.equal(text.length, 1024);
});
