const express = require('express');
const { pushRepository } = require('./repository');
const { profileRepository } = require('../user/profileRepository');

const route = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
function pushErrors(error, _req, res, _next) {
  const status = error.status || 503;
  if (status >= 500) console.error('Push operation failed:', error.message);
  res.status(status).json({ error: status >= 500 ? '推送服务暂时不可用，请稍后重试' : error.message });
}

function createPushRouter({ repository = pushRepository, profiles = profileRepository } = {}) {
  const router = express.Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.get('/config', route(async (_req, res) => {
    const { publicKey } = await repository.configuration();
    res.json({ publicKey });
  }));
  router.use(express.json({ limit: '16kb' }));
  router.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin) {
      try { if (new URL(origin).host !== req.get('host')) return res.status(403).json({ error: '请求来源无效' }); }
      catch { return res.status(403).json({ error: '请求来源无效' }); }
    }
    const profile = profiles.getByUuid(req.get('x-neon-user-uuid') || '');
    if (!profile || profile.isSystem) return res.status(401).json({ error: '请刷新页面后重试' });
    req.pushProfile = profile;
    next();
  });
  router.post('/subscriptions', route(async (req, res) => {
    const item = await repository.subscribe(req.pushProfile.uuid, req.body?.subscription, req.get('user-agent'));
    res.status(201).json(item);
  }));
  router.delete('/subscriptions', route(async (req, res) => {
    await repository.unsubscribe(req.pushProfile.uuid, req.body?.endpoint);
    res.status(204).end();
  }));
  router.use(pushErrors);
  return router;
}

// Mount only behind the existing administrator session and same-origin checks.
function createAdminPushRouter({ repository = pushRepository, profiles = profileRepository, audit = async () => {} } = {}) {
  const router = express.Router();
  router.get('/', route(async (_req, res) => res.json(await repository.dashboard(profiles.listProfiles()))));
  router.post('/messages', route(async (req, res) => {
    const item = await repository.send(req.body, profiles.listProfiles(), req.admin.username);
    await audit(req, 'push.send', 'push', item.id, { audience: item.audience, total: item.total, accepted: item.accepted, failed: item.failed }, item.accepted > 0);
    res.status(201).json({ item });
  }));
  router.use(pushErrors);
  return router;
}

module.exports = { createPushRouter, createAdminPushRouter };
