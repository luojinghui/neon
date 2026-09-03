const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const chatController = require('./chatController');
const { connectDB } = require('../models');
const { CloudMessage } = require('../models/cloud');
const { AdminUser } = require('../models/admin');
const { AdminAudit } = require('../models/adminAudit');
const { profileRepository } = require('../user/profileRepository');
const {
  ADMIN_SESSION_TTL_MS,
  authenticateCookieHeader,
  clearSessionCookie,
  createSessionCookie,
  createSessionId,
  getSessionIdFromCookieHeader,
  hashSessionId,
  normalizeUsername,
  toAdminPrincipal,
  verifyPassword
} = require('../admin/auth');

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const DUMMY_PASSWORD_HASH = `scrypt-v1$${'0'.repeat(32)}$${'0'.repeat(128)}`;
const loginFailures = new Map();

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return (forwarded || req.socket.remoteAddress || '').slice(0, 128);
}

function sameOriginMutation(req, res, next) {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return next();
  if (req.get('x-admin-request') !== '1') return res.status(403).json({ error: '管理请求校验失败', code: 'ADMIN_REQUEST_INVALID' });
  const origin = req.get('origin');
  if (origin) {
    try {
      if (new URL(origin).host !== req.get('host')) return res.status(403).json({ error: '管理请求来源无效', code: 'ADMIN_ORIGIN_INVALID' });
    } catch {
      return res.status(403).json({ error: '管理请求来源无效', code: 'ADMIN_ORIGIN_INVALID' });
    }
  }
  next();
}

async function requireAdmin(req, res, next) {
  const admin = await authenticateCookieHeader(req.headers.cookie || '');
  if (!admin) return res.status(401).json({ error: '管理员登录已失效', code: 'ADMIN_UNAUTHORIZED' });
  req.admin = admin;
  next();
}

function publicAdmin(admin) {
  return { id: admin.id, username: admin.username, displayName: admin.displayName, role: admin.role };
}

async function audit(req, action, targetType = '', targetId = '', detail = null, success = true, username = '') {
  try {
    await connectDB();
    await AdminAudit.create({
      adminId: req.admin?.id || null,
      username: username || req.admin?.username || 'unknown',
      action,
      targetType,
      targetId: String(targetId || '').slice(0, 160),
      success,
      ip: getClientIp(req),
      detail
    });
  } catch (error) {
    console.error('Admin audit could not be saved:', error.message);
  }
}

function disconnectAdminSockets(io, adminId, keepSessionHash = '') {
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.admin?.id !== String(adminId)) continue;
    if (keepSessionHash && socket.data.admin.sessionIdHash === keepSessionHash) continue;
    socket.disconnect(true);
  }
}

function registerLoginFailure(key) {
  const now = Date.now();
  const current = loginFailures.get(key);
  const record = !current || current.resetAt <= now ? { count: 0, resetAt: now + LOGIN_WINDOW_MS } : current;
  record.count += 1;
  loginFailures.set(key, record);
  return record;
}

function isLoginBlocked(key) {
  const current = loginFailures.get(key);
  if (!current || current.resetAt <= Date.now()) {
    loginFailures.delete(key);
    return false;
  }
  return current.count >= LOGIN_MAX_FAILURES;
}

function roomInput(body) {
  return {
    name: body?.name,
    description: body?.description,
    tags: body?.tags,
    isPrivate: body?.isPrivate === true,
    passwordEnabled: body?.passwordEnabled === true,
    password: body?.password
  };
}

function profileInput(body) {
  return {
    userId: body?.userId,
    name: body?.name,
    bio: body?.bio,
    avatarUrl: body?.avatarUrl,
    banner: body?.banner || { type: 'preset', value: 'sunrise' }
  };
}

function cloudRecord(document) {
  return {
    id: String(document._id),
    messageId: document.messageId,
    messageType: document.messageType,
    content: document.content || '',
    password: document.password,
    files: (document.files || []).map((file) => ({
      fileId: file.fileId,
      fileName: file.fileName,
      fileSize: file.fileSize,
      mimeType: file.mimeType,
      relativePath: file.relativePath,
      downloadUrl: `/api/cloud/file/${encodeURIComponent(file.fileId)}`
    })),
    createdAt: document.createdAt,
    expireAt: document.expireAt
  };
}

function adminRoomRecords() {
  return chatController.adminListRooms().map((room) => {
    const ownerUuid = /^guest-([0-9a-f-]{36})$/i.exec(room.ownerId || '')?.[1] || '';
    const owner = ownerUuid ? profileRepository.getByUuid(ownerUuid) : null;
    return {
      ...room,
      ownerName: owner?.name || (room.ownerId === 'planet-system' ? '星球系统' : '未知人员'),
      ownerUserId: owner?.userId || ''
    };
  });
}

function adminError(error) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  const message = error instanceof Error ? error.message : '管理操作失败';
  const isValidationError = ['ProfileRepositoryError', 'RoomRepositoryError'].includes(error?.name);
  const status = code === 'PROFILE_NOT_FOUND' || code === 'ROOM_NOT_FOUND' ? 404 : code === 'USER_ID_TAKEN' ? 409 : code || isValidationError ? 400 : 500;
  if (status === 500) console.error('Admin operation failed:', error);
  return { status, body: { error: message, code } };
}

function mountAdminController(app, io) {
  const router = express.Router();
  router.use(express.json({ limit: '1mb' }));
  router.use(sameOriginMutation);

  router.post(
    '/login',
    asyncRoute(async (req, res) => {
      const username = normalizeUsername(req.body?.username);
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const failureKey = `${getClientIp(req)}:${username}`;
      if (isLoginBlocked(failureKey)) return res.status(429).json({ error: '登录失败次数过多，请 15 分钟后再试', code: 'ADMIN_LOGIN_RATE_LIMITED' });

      await connectDB();
      const admin = username
        ? await AdminUser.findOne({ username }).select('+passwordHash +sessionIdHash +sessionExpiresAt')
        : null;
      const hashToVerify = admin?.passwordHash || DUMMY_PASSWORD_HASH;
      const hashMatches = await verifyPassword(password, hashToVerify);
      const passwordMatches = admin?.enabled === true && hashMatches;
      if (!passwordMatches) {
        registerLoginFailure(failureKey);
        await audit(req, 'admin.login', 'admin', username, null, false, username || 'unknown');
        return res.status(401).json({ error: '管理员账号或密码错误', code: 'ADMIN_LOGIN_FAILED' });
      }

      loginFailures.delete(failureKey);
      const sessionId = createSessionId();
      const sessionIdHash = hashSessionId(sessionId);
      admin.sessionIdHash = sessionIdHash;
      admin.sessionExpiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_MS);
      admin.lastLoginAt = new Date();
      admin.lastLoginIp = getClientIp(req);
      await admin.save();
      const principal = toAdminPrincipal(admin, sessionIdHash);
      disconnectAdminSockets(io, admin.id, sessionIdHash);
      res.setHeader('Set-Cookie', createSessionCookie(sessionId));
      req.admin = principal;
      await audit(req, 'admin.login', 'admin', admin.id);
      return res.json({ admin: publicAdmin(principal) });
    })
  );

  router.get(
    '/session',
    asyncRoute(async (req, res) => {
      const admin = await authenticateCookieHeader(req.headers.cookie || '');
      if (!admin) return res.status(401).json({ error: '尚未登录', code: 'ADMIN_UNAUTHORIZED' });
      return res.json({ admin: publicAdmin(admin) });
    })
  );

  router.delete(
    '/session',
    asyncRoute(async (req, res) => {
      const sessionId = getSessionIdFromCookieHeader(req.headers.cookie || '');
      const admin = await authenticateCookieHeader(req.headers.cookie || '');
      if (admin) {
        await AdminUser.updateOne({ _id: admin.id, sessionIdHash: hashSessionId(sessionId) }, { $set: { sessionIdHash: '', sessionExpiresAt: null } });
        req.admin = admin;
        disconnectAdminSockets(io, admin.id);
        await audit(req, 'admin.logout', 'admin', admin.id);
      }
      res.setHeader('Set-Cookie', clearSessionCookie());
      return res.status(204).end();
    })
  );

  router.use(asyncRoute(requireAdmin));

  router.get(
    '/cloud',
    asyncRoute(async (req, res) => {
      await connectDB();
      const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
      const pageSize = Math.max(1, Math.min(100, Number.parseInt(req.query.pageSize, 10) || 50));
      const search = String(req.query.search || '').trim().slice(0, 100);
      const filter = { expireAt: { $gt: new Date() } };
      if (search) {
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.$or = [
          { password: { $regex: escaped, $options: 'i' } },
          { messageId: { $regex: escaped, $options: 'i' } },
          { content: { $regex: escaped, $options: 'i' } },
          { 'files.fileName': { $regex: escaped, $options: 'i' } }
        ];
      }
      const [documents, total, aggregate] = await Promise.all([
        CloudMessage.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
        CloudMessage.countDocuments(filter),
        CloudMessage.aggregate([
          { $match: { expireAt: { $gt: new Date() } } },
          { $unwind: { path: '$files', preserveNullAndEmptyArrays: true } },
          { $group: { _id: 'all', fileCount: { $sum: { $cond: [{ $ifNull: ['$files.fileId', false] }, 1, 0] } }, fileBytes: { $sum: { $ifNull: ['$files.fileSize', 0] } } } }
        ])
      ]);
      return res.json({ items: documents.map(cloudRecord), total, page, pageSize, stats: aggregate[0] || { fileCount: 0, fileBytes: 0 } });
    })
  );

  router.patch(
    '/cloud/:id',
    asyncRoute(async (req, res) => {
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: '云传数据不存在', code: 'CLOUD_NOT_FOUND' });
      await connectDB();
      const document = await CloudMessage.findById(req.params.id);
      if (!document || document.expireAt <= new Date()) return res.status(404).json({ error: '云传数据不存在或已过期', code: 'CLOUD_NOT_FOUND' });
      if (typeof req.body?.content === 'string') document.content = req.body.content.slice(0, 200000);
      if (typeof req.body?.password === 'string' && req.body.password !== document.password) {
        if (!/^[A-Za-z0-9]{2,4}$/.test(req.body.password)) return res.status(400).json({ error: '提取码需为 2-4 位数字或字母', code: 'CLOUD_PASSWORD_INVALID' });
        const duplicate = await CloudMessage.exists({ _id: { $ne: document._id }, password: req.body.password });
        if (duplicate) return res.status(409).json({ error: '提取码已被使用', code: 'CLOUD_PASSWORD_TAKEN' });
        document.password = req.body.password;
      }
      if (!document.content.trim() && document.files.length === 0) return res.status(400).json({ error: '云传内容不能为空', code: 'CLOUD_CONTENT_EMPTY' });
      document.messageType = document.content.trim() && document.files.length > 0 ? 'mixed' : document.files.length > 0 ? 'file' : 'text';
      await document.save();
      await audit(req, 'cloud.update', 'cloud', document.messageId);
      return res.json({ item: cloudRecord(document.toObject()) });
    })
  );

  router.delete(
    '/cloud/:id',
    asyncRoute(async (req, res) => {
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: '云传数据不存在', code: 'CLOUD_NOT_FOUND' });
      await connectDB();
      const document = await CloudMessage.findByIdAndDelete(req.params.id).lean();
      if (!document) return res.status(404).json({ error: '云传数据不存在', code: 'CLOUD_NOT_FOUND' });
      const uploadDirectory = path.join(process.cwd(), 'upload');
      await Promise.all(
        (document.files || []).map((file) => {
          const storageName = path.basename(file.storagePath || '');
          return storageName && storageName === file.storagePath ? fs.unlink(path.join(uploadDirectory, storageName)).catch(() => undefined) : Promise.resolve();
        })
      );
      await audit(req, 'cloud.delete', 'cloud', document.messageId, { fileCount: document.files?.length || 0 });
      return res.status(204).end();
    })
  );

  router.get('/rooms', (_req, res) => res.json({ items: adminRoomRecords() }));

  router.patch(
    '/rooms/:roomId',
    asyncRoute(async (req, res) => {
      try {
        const item = chatController.adminUpdateRoom(req.params.roomId, roomInput(req.body), io);
        await audit(req, 'room.update', 'room', req.params.roomId);
        return res.json({ item });
      } catch (error) {
        const response = adminError(error);
        return res.status(response.status).json(response.body);
      }
    })
  );

  router.delete(
    '/rooms/:roomId',
    asyncRoute(async (req, res) => {
      try {
        const room = chatController.adminDeleteRoom(req.params.roomId, io);
        await audit(req, 'room.delete', 'room', room.id, { name: room.name });
        return res.status(204).end();
      } catch (error) {
        const response = adminError(error);
        return res.status(response.status).json(response.body);
      }
    })
  );

  router.get('/users', (_req, res) => res.json({ items: profileRepository.listProfiles().map((profile) => profileRepository.toAdmin(profile)) }));

  router.post(
    '/users',
    asyncRoute(async (req, res) => {
      try {
        const profile = profileRepository.createProfile(profileInput(req.body));
        await profileRepository.writeQueue;
        await audit(req, 'user.create', 'user', profile.uuid, { userId: profile.userId });
        return res.status(201).json({ item: profileRepository.toAdmin(profile) });
      } catch (error) {
        const response = adminError(error);
        return res.status(response.status).json(response.body);
      }
    })
  );

  router.patch(
    '/users/:uuid',
    asyncRoute(async (req, res) => {
      try {
        const profile = profileRepository.updateProfile(req.params.uuid, profileInput(req.body));
        await profileRepository.writeQueue;
        await audit(req, 'user.update', 'user', profile.uuid, { userId: profile.userId });
        return res.json({ item: profileRepository.toAdmin(profile) });
      } catch (error) {
        const response = adminError(error);
        return res.status(response.status).json(response.body);
      }
    })
  );

  router.delete(
    '/users/:uuid',
    asyncRoute(async (req, res) => {
      try {
        const profile = profileRepository.getByUuid(req.params.uuid);
        if (!profile) return res.status(404).json({ error: '个人资料不存在', code: 'PROFILE_NOT_FOUND' });
        const related = chatController.adminDeleteUserData(profile, io);
        profileRepository.deleteProfile(profile.uuid);
        await Promise.all([profileRepository.writeQueue, profileRepository.cleanupQueue]);
        await audit(req, 'user.delete', 'user', profile.uuid, {
          userId: profile.userId,
          deletedRoomCount: related.deletedRooms.length,
          deletedMessageCount: related.deletedMessages.length
        });
        return res.status(204).end();
      } catch (error) {
        const response = adminError(error);
        return res.status(response.status).json(response.body);
      }
    })
  );

  router.use((error, _req, res, _next) => {
    console.error('Admin API failed:', error);
    res.status(500).json({ error: '管理服务暂时不可用', code: 'ADMIN_INTERNAL_ERROR' });
  });

  app.use('/api/admin', router);
}

module.exports = { mountAdminController };
