function describePushFailure(error) {
  const statusCode = Number.isInteger(error?.statusCode) && error.statusCode >= 100 && error.statusCode <= 599 ? error.statusCode : undefined;
  let code = typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code) ? error.code : '';
  let reason;
  if (statusCode === 404 || statusCode === 410) reason = '浏览器订阅已失效，请用户重新开启通知';
  else if (statusCode === 401 || statusCode === 403) reason = '推送服务鉴权失败，请检查 VAPID 密钥与服务器时间';
  else if (statusCode === 400) reason = '推送请求无效，请检查 VAPID 配置或通知格式';
  else if (statusCode === 413) reason = '通知内容过长，请缩短后重试';
  else if (statusCode === 429) reason = '推送服务限流，请稍后重试';
  else if (statusCode >= 500) reason = '推送服务暂时不可用，请稍后重试';
  else if (statusCode) reason = '推送服务返回异常，请查看服务端日志';
  else if (code === 'SUBSCRIPTION_REVOKED') reason = '浏览器订阅已取消或更新，请刷新订阅列表';
  else if (['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ERR_SOCKET_TIMEOUT'].includes(code) || /\btime(?:d)?\s*out\b/i.test(error?.message || '')) {
    code ||= 'ETIMEDOUT';
    reason = '连接推送服务超时，请检查服务器出站网络';
  } else if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) reason = '无法解析推送服务地址，请检查服务器 DNS';
  else if (['ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE'].includes(code)) reason = '无法连接推送服务，请检查服务器出站网络';
  else if (/^(ERR_TLS_|CERT_|DEPTH_|SELF_SIGNED_|UNABLE_TO_)/.test(code)) reason = '推送服务 TLS 连接失败，请检查服务器证书与时间';
  else reason = '推送发送失败，请查看服务端日志';
  return { code: code || (statusCode ? `HTTP_${statusCode}` : 'UNKNOWN'), ...(statusCode ? { statusCode } : {}), reason };
}

function diagnosticText(value, secrets) {
  if (typeof value !== 'string' && !Buffer.isBuffer(value)) return '';
  let text = String(value);
  for (const secret of secrets) if (secret) text = text.split(secret).join('[redacted]');
  return text
    .replace(/https?:\/\/[^\s"'<>\\]+/gi, url => { try { return new URL(url).origin; } catch { return '[redacted-url]'; } })
    .replace(/\b(Bearer|WebPush)\s+[^\s"']+/gi, '$1 [redacted]')
    .replace(/[\x00-\x1f\x7f-\x9f]/g, ' ')
    .slice(0, 1024);
}

module.exports = { describePushFailure, diagnosticText };
