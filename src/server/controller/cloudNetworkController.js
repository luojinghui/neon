const express = require('express');
const { isIP } = require('node:net');

function normalizeIp(value) {
  if (typeof value !== 'string' || !isIP(value.trim())) return null;
  const address = value.trim();
  return /^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(address) ? address.slice(7) : address;
}

// A sub-app keeps this diagnostic's proxy policy separate from authentication.
function createCloudNetworkApp(env = process.env) {
  const app = express();
  const proxies = (env.CLOUD_TRUSTED_PROXIES || '').split(',').map(value => value.trim()).filter(Boolean);
  app.set('trust proxy', proxies.length ? proxies : false);
  app.get('/', (req, res) => {
    const header = name => String(req.get(name) || '').slice(0, 2048);
    const socketAddress = req.socket.remoteAddress || '';
    const socketIp = normalizeIp(socketAddress);
    const resolvedIp = normalizeIp(req.ip);
    const forwardedFor = header('x-forwarded-for');
    const proxyTrusted = Boolean(socketAddress && app.get('trust proxy fn')(socketAddress, 0));

    res.set('Cache-Control', 'private, no-store');
    res.json({
      requestIp: resolvedIp || socketIp,
      requestIpSource: proxyTrusted && req.ips.length > 0 && resolvedIp ? 'x-forwarded-for' : 'socket',
      socketIp,
      socketAddress,
      proxyTrusted,
      headers: {
        // These are reported values, not independently verified client addresses.
        xForwardedFor: forwardedFor,
        xRealIp: header('x-real-ip'),
        forwarded: header('forwarded')
      },
      observedAt: new Date().toISOString()
    });
  });
  return app;
}

module.exports = { createCloudNetworkApp };
