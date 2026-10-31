const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const webpush = require('web-push');
const { runFileExclusive, writeFileAtomic } = require('../storage/filePersistence');

class PushError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function isSending(message) {
  const deadline = Math.max(10 * 60 * 1000, Math.ceil(message.total / 5) * 15000 + 60000);
  return message.status === 'sending' && Date.now() - Date.parse(message.createdAt) < deadline;
}

function notificationInput(input) {
  const title = typeof input?.title === 'string' ? input.title.trim() : '';
  const body = typeof input?.body === 'string' ? input.body.trim() : '';
  const url = typeof input?.url === 'string' ? input.url.trim() : '';
  if (!title || title.length > 80 || !body || body.length > 500) throw new PushError('请填写标题（最多 80 字）和正文（最多 500 字）');
  if (!url.startsWith('/') || url.startsWith('//') || /[\\\s\x00-\x1f]/.test(url) || url.length > 1000) throw new PushError('跳转页面须为以 / 开头的站内地址');
  const parsed = new URL(url, 'https://neon.invalid');
  if (parsed.origin !== 'https://neon.invalid') throw new PushError('跳转页面须为站内地址');
  if (Buffer.byteLength(JSON.stringify({ title, body, url: parsed.href })) > 3500) throw new PushError('通知内容过长，请缩短正文或跳转地址');
  const audience = input?.audience;
  const uuids = Array.isArray(input?.uuids) ? [...new Set(input.uuids)] : [];
  if (!['all', 'users'].includes(audience) || (audience === 'users' && (!uuids.length || uuids.length > 500 || uuids.some(uuid => typeof uuid !== 'string' || !/^[a-f0-9-]{36}$/i.test(uuid))))) {
    throw new PushError('请选择推送用户');
  }
  return { title, body, url: parsed.pathname + parsed.search + parsed.hash, audience, uuids: audience === 'users' ? uuids : [] };
}

function normalizeSubscription(input) {
  if (typeof input?.endpoint !== 'string' || input.endpoint.length > 4096) throw new PushError('推送订阅无效');
  let endpoint;
  try { endpoint = new URL(input.endpoint); } catch { throw new PushError('推送订阅无效'); }
  // Subscriptions are client input. Only connect to browser vendors' push services.
  const host = endpoint.hostname;
  const allowed = ['fcm.googleapis.com', 'fcm-push.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(host)
    || host.endsWith('.push.services.mozilla.com') || host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com');
  if (endpoint.protocol !== 'https:' || (endpoint.port && endpoint.port !== '443') || endpoint.username || endpoint.password || endpoint.hash || !allowed) throw new PushError('不支持此浏览器的推送服务');
  const { p256dh, auth } = input?.keys || {};
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || !/^[\w-]+={0,2}$/.test(p256dh) || !/^[\w-]+={0,2}$/.test(auth)
    || Buffer.from(p256dh, 'base64url').length !== 65 || Buffer.from(p256dh, 'base64url')[0] !== 4 || Buffer.from(auth, 'base64url').length !== 16) throw new PushError('推送订阅密钥无效');
  const expirationTime = input.expirationTime == null ? null : input.expirationTime;
  if (expirationTime !== null && (typeof expirationTime !== 'number' || !Number.isFinite(expirationTime) || expirationTime <= Date.now())) throw new PushError('推送订阅已过期');
  return { endpoint: endpoint.href, expirationTime, keys: { p256dh, auth } };
}

class PushRepository {
  constructor(options = {}) {
    this.dataFile = options.dataFile || process.env.WEB_PUSH_DATA_FILE || path.join(path.dirname(process.env.USER_PROFILE_DATA_FILE || path.join(process.cwd(), '.data', 'user-profiles.json')), 'web-push.json');
    this.env = options.env || process.env;
    this.transport = options.transport || webpush;
  }

  async read() {
    try {
      const state = JSON.parse(await fs.readFile(this.dataFile, 'utf8'));
      if (!Array.isArray(state.subscriptions) || !Array.isArray(state.messages)) throw new Error('Invalid push store');
      return state;
    } catch (error) {
      if (error.code === 'ENOENT') return { vapid: null, subscriptions: [], messages: [] };
      throw error;
    }
  }

  mutate(task) {
    return runFileExclusive(this.dataFile, async () => {
      const state = await this.read();
      const result = await task(state);
      await writeFileAtomic(this.dataFile, JSON.stringify(state, null, 2));
      return result;
    });
  }

  async configuration() {
    const subject = this.env.WEB_PUSH_SUBJECT || this.env.MCP_PUBLIC_BASE_URL || 'https://luojh.com';
    if (!/^(https:\/\/|mailto:)/.test(subject)) throw new PushError('推送服务联系地址配置无效', 503);
    let vapid;
    const publicKey = this.env.WEB_PUSH_VAPID_PUBLIC_KEY;
    const privateKey = this.env.WEB_PUSH_VAPID_PRIVATE_KEY;
    if (publicKey || privateKey) {
      if (!publicKey || !privateKey) throw new PushError('推送公钥和私钥必须成对配置', 503);
      vapid = { publicKey, privateKey };
    } else {
      vapid = (await this.read()).vapid;
      if (!vapid) vapid = await this.mutate(state => state.vapid ||= this.transport.generateVAPIDKeys());
    }
    // Fail before asking the browser for permission if the configuration is invalid.
    webpush.getVapidHeaders('https://fcm.googleapis.com', subject, vapid.publicKey, vapid.privateKey, 'aes128gcm');
    return { subject, ...vapid };
  }

  async subscribe(uuid, input, userAgent) {
    const subscription = normalizeSubscription(input);
    const config = await this.configuration();
    return this.mutate(state => {
      const now = new Date().toISOString();
      const existing = state.subscriptions.find(item => item.subscription.endpoint === subscription.endpoint);
      if (existing && existing.uuid !== uuid && (existing.subscription.keys.auth !== subscription.keys.auth || existing.subscription.keys.p256dh !== subscription.keys.p256dh)) throw new PushError('订阅已属于其他用户', 409);
      if (!existing && state.subscriptions.filter(item => item.uuid === uuid).length >= 10) throw new PushError('每位用户最多订阅 10 个浏览器');
      const unchanged = existing?.uuid === uuid && existing.publicKey === config.publicKey && existing.subscription.keys.auth === subscription.keys.auth && existing.subscription.keys.p256dh === subscription.keys.p256dh;
      const record = { id: createHash('sha256').update(subscription.endpoint).digest('hex').slice(0, 24), revision: (unchanged && existing.revision) || randomUUID(), uuid, subscription, userAgent: String(userAgent || '').slice(0, 2048), publicKey: config.publicKey, createdAt: existing?.createdAt || now, updatedAt: now };
      state.subscriptions = state.subscriptions.filter(item => item.subscription.endpoint !== subscription.endpoint);
      state.subscriptions.push(record);
      return { id: record.id };
    });
  }

  async unsubscribe(uuid, endpoint) {
    if (typeof endpoint !== 'string' || endpoint.length > 4096) throw new PushError('订阅地址无效');
    return this.mutate(state => { state.subscriptions = state.subscriptions.filter(item => item.uuid !== uuid || item.subscription.endpoint !== endpoint); });
  }

  async deleteUser(uuid) {
    return this.mutate(state => { state.subscriptions = state.subscriptions.filter(item => item.uuid !== uuid); });
  }

  async dashboard(profiles) {
    const state = await this.read();
    const { publicKey } = await this.configuration();
    const recipients = profiles.filter(profile => !profile.isSystem).map(profile => {
      const subscriptions = state.subscriptions.filter(item => item.uuid === profile.uuid);
      const active = subscriptions.filter(item => item.publicKey === publicKey && (!item.subscription.expirationTime || item.subscription.expirationTime > Date.now()));
      return { uuid: profile.uuid, userId: profile.userId, name: profile.name, subscriptionCount: active.length, devices: subscriptions.map(item => ({ id: item.id, userAgent: item.userAgent, updatedAt: item.updatedAt, active: active.includes(item) })) };
    });
    return { recipients, messages: state.messages.slice(0, 100).map(item => item.status === 'sending' && !isSending(item) ? { ...item, status: 'interrupted' } : item) };
  }

  async send(input, profiles, adminName) {
    const draft = notificationInput(input);
    const validUuids = new Set(profiles.filter(profile => !profile.isSystem).map(profile => profile.uuid));
    if (draft.uuids.some(uuid => !validUuids.has(uuid))) throw new PushError('部分用户已不存在，请刷新后重试');
    const config = await this.configuration();
    const { message, targets } = await this.mutate(state => {
      if (state.messages.some(isSending)) throw new PushError('上一批通知仍在发送，请稍后再试', 409);
      state.messages = state.messages.map(item => item.status === 'sending' ? { ...item, status: 'interrupted' } : item);
      const targets = state.subscriptions.filter(item => validUuids.has(item.uuid) && item.publicKey === config.publicKey && (!item.subscription.expirationTime || item.subscription.expirationTime > Date.now()) && (draft.audience === 'all' || draft.uuids.includes(item.uuid)));
      if (!targets.length) throw new PushError('所选用户没有有效的浏览器订阅');
      const message = { id: randomUUID(), ...draft, adminName, createdAt: new Date().toISOString(), completedAt: '', status: 'sending', total: targets.length, accepted: 0, failed: 0, expired: 0 };
      state.messages.unshift(message);
      state.messages = state.messages.slice(0, 100);
      return { message, targets };
    });
    const expired = new Set();
    let index = 0;
    const payload = JSON.stringify({ id: message.id, title: message.title, body: message.body, url: message.url });
    await Promise.all(Array.from({ length: Math.min(5, targets.length) }, async () => {
      while (index < targets.length) {
        const target = targets[index++];
        try {
          // Recheck deletion/revocation while a batch is in progress.
          if (!(await this.read()).subscriptions.some(item => item.id === target.id && item.uuid === target.uuid && item.revision === target.revision)) { message.failed++; continue; }
          await this.transport.sendNotification(target.subscription, payload, { TTL: 86400, timeout: 10000, vapidDetails: config });
          message.accepted++;
        } catch (error) {
          message.failed++;
          if ([404, 410].includes(error.statusCode)) { message.expired++; expired.add(`${target.id}:${target.revision}`); }
        }
      }
    }));
    message.status = message.accepted === message.total ? 'sent' : message.accepted ? 'partial' : 'failed';
    message.completedAt = new Date().toISOString();
    await this.mutate(state => {
      state.subscriptions = state.subscriptions.filter(item => !expired.has(`${item.id}:${item.revision}`));
      state.messages = state.messages.map(item => item.id === message.id ? message : item);
    });
    return message;
  }
}

const pushRepository = new PushRepository();
module.exports = { PushRepository, PushError, pushRepository, notificationInput, normalizeSubscription };
