const { randomUUID, randomBytes } = require('node:crypto');
const express = require('express');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const MAX_FILE = 20 * 1024 * 1024;
const MAX_TOTAL = 100 * 1024 * 1024;
const FILE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', log: 'text/plain', txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown', html: 'text/html', htm: 'text/html' };
const invalid = (message) => { throw new Error(message); };
const idValid = value => typeof value === 'string' && /^[\w-]{8,80}$/.test(value);
const finite = (value, low, high) => typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;

function fileInfo(file) {
  if (!file || typeof file.name !== 'string' || file.name.length > 180 || !Number.isInteger(file.size) || file.size < 1 || file.size > MAX_FILE) invalid('请选择不超过 20 MB 的文件');
  const name = file.name.replace(/[\x00-\x1f\\/]/g, '_');
  const extension = name.split('.').pop().toLowerCase();
  const mime = FILE_TYPES[extension];
  if (!mime) invalid('支持图片、PDF、PPT、PPTX、LOG、Markdown 和 HTML 文件');
  if (mime.startsWith('text/') && file.size > 2 * 1024 * 1024) invalid('文本文件最大支持 2 MB');
  return { name, size: file.size, extension, mime };
}

function validateFile(buffer, file) {
  if (buffer.length !== file.size) invalid('文件大小与上传信息不一致');
  const prefix = buffer.subarray(0, 16);
  const signatures = {
    pdf: () => prefix.toString('ascii').startsWith('%PDF-'),
    png: () => prefix.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    jpg: () => prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255,
    jpeg: () => prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255,
    gif: () => /^GIF8[79]a/.test(prefix.toString('ascii')),
    webp: () => prefix.toString('ascii', 0, 4) === 'RIFF' && prefix.toString('ascii', 8, 12) === 'WEBP',
    ppt: () => prefix.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex')),
    pptx: () => prefix[0] === 80 && prefix[1] === 75 && prefix[2] === 3 && prefix[3] === 4
  };
  if (signatures[file.extension] && !signatures[file.extension]()) invalid('文件内容与扩展名不匹配');
  if (file.mime.startsWith('text/') && buffer.includes(0)) invalid('请使用 UTF-8 编码的文本文件');
}

function findOffice(env) {
  // Explicit path lets deployments use an isolated conversion wrapper.
  return env.CALL_SHARE_OFFICE_PATH || ['/usr/bin/libreoffice', '/usr/bin/soffice', 'C:/Program Files/LibreOffice/program/soffice.com'].find(existsSync) || '';
}

async function convertPowerPoint(buffer, extension, office, run = promisify(execFile)) {
  if (!office) invalid('服务器尚未启用 PPT 转换，请先导出为 PDF 后共享');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'neon-presentation-'));
  try {
    const profile = path.join(directory, 'profile');
    await fs.mkdir(path.join(profile, 'user'), { recursive: true });
    await fs.writeFile(path.join(profile, 'user', 'registrymodifications.xcu'), '<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item></oor:items>');
    const input = path.join(directory, `slides.${extension}`);
    await fs.writeFile(input, buffer);
    await run(office, [`-env:UserInstallation=${pathToFileURL(profile).href}`, '--headless', '--nologo', '--nodefault', '--norestore', '--convert-to', 'pdf:impress_pdf_Export', '--outdir', directory, input], { timeout: 60000, maxBuffer: 1024 * 1024, windowsHide: true });
    const output = path.join(directory, 'slides.pdf');
    if ((await fs.stat(output)).size > MAX_FILE) invalid('转换后的 PDF 超过 20 MB，请压缩后重试');
    const pdf = await fs.readFile(output);
    if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) invalid('PPT 转换失败，请导出 PDF 后重试');
    return pdf;
  } finally {
    // Only the absolute directory returned by mkdtemp is removed.
    if (path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith('neon-presentation-')) await fs.rm(directory, { recursive: true, force: true });
  }
}

class CallSharing {
  constructor(calls, env = process.env) {
    this.calls = calls;
    this.office = findOffice(env);
    this.bytes = 0;
    this.converting = false;
  }

  token() { return randomBytes(32).toString('hex'); }
  snapshot(call) { return { roomId: call.roomId, callId: call.id, revision: call.shareRevision || 0, presentation: call.presentation || null }; }
  capabilities() { return { powerPoint: Boolean(this.office), maxFileSize: MAX_FILE }; }
  emit(io, call, action) {
    call.shareRevision = (call.shareRevision || 0) + 1;
    const state = action ? { roomId: call.roomId, callId: call.id, revision: call.shareRevision, shareId: call.presentation.id, action } : this.snapshot(call);
    for (const peerId of call.members.keys()) io.to(peerId).emit('call:sharing', state);
    return this.snapshot(call);
  }
  clearResource(call) {
    if (call.resource) this.bytes -= call.resource.buffer.length;
    call.resource = null;
  }
  dispose(call) { this.clearResource(call); call.presentation = null; }
  leave(io, call, peerId) {
    if (call.presentation?.ownerId !== peerId) return;
    if (call.presentation.kind === 'whiteboard' && call.members.size) call.presentation.ownerId = call.members.keys().next().value;
    else this.dispose(call);
    this.emit(io, call);
  }
  current(socket, payload) {
    const call = this.calls.member(socket, payload);
    if (!call.presentation || call.presentation.id !== payload.shareId) invalid('共享已结束，请重新打开');
    return call;
  }
  owner(socket, call) { if (call.presentation.ownerId !== socket.id) invalid('只有共享者可以操作演示'); }

  bind(socket, io) {
    const listen = (event, action) => socket.on(event, (payload, ack) => {
      try {
        const now = Date.now();
        if (!socket.data.shareRate || now - socket.data.shareRate.at > 1000) socket.data.shareRate = { at: now, count: 0 };
        if (++socket.data.shareRate.count > 50) invalid('共享操作过于频繁，请稍后重试');
        const data = action(payload);
        if (typeof ack === 'function') ack({ ok: true, data });
      } catch (error) { if (typeof ack === 'function') ack({ ok: false, error: error.message, code: 'SHARE_INVALID' }); }
    });
    listen('share:state', payload => this.snapshot(this.calls.member(socket, payload)));
    listen('share:start', payload => {
      const call = this.calls.member(socket, payload);
      if (!['screen', 'whiteboard', 'resource'].includes(payload.kind)) invalid('共享类型无效');
      if (call.presentation) invalid('请先结束当前共享');
      const file = payload.kind === 'resource' ? fileInfo(payload.file) : undefined;
      if (file && ['ppt', 'pptx'].includes(file.extension) && !this.office) invalid('服务器尚未启用 PPT 转换，请先导出为 PDF 后共享');
      call.presentation = { id: randomUUID(), kind: payload.kind, ownerId: socket.id, ...(file ? { file, ready: false } : {}), page: 1, scroll: 0, epoch: 0, items: [] };
      return this.emit(io, call);
    });
    listen('share:stop', payload => {
      const call = this.current(socket, payload); this.owner(socket, call);
      this.dispose(call);
      return this.emit(io, call);
    });
    listen('share:navigate', payload => {
      const call = this.current(socket, payload); this.owner(socket, call);
      if (call.presentation.kind !== 'resource' || !call.presentation.ready) invalid('文件尚未准备好');
      if (!Number.isInteger(payload.page) || !finite(payload.page, 1, 10000) || !finite(payload.scroll, 0, 1)) invalid('无效的演示位置');
      Object.assign(call.presentation, { page: payload.page, scroll: payload.scroll });
      return this.emit(io, call);
    });
    listen('share:board', payload => {
      const call = this.current(socket, payload);
      const board = call.presentation;
      if (board.kind !== 'whiteboard' || payload.epoch !== board.epoch) invalid('画板已更新，请重试');
      let action;
      if (payload.action === 'clear') { board.items = []; board.epoch++; action = { type: 'clear', epoch: board.epoch }; }
      else if (payload.action === 'undo') {
        const item = [...board.items].reverse().find(item => item.authorId === socket.id);
        if (!item) return null;
        board.items = board.items.filter(entry => entry.id !== item.id); action = { type: 'remove', id: item.id };
      } else if (payload.action === 'put') {
        const value = payload.item;
        if (!value || !idValid(value.id) || !/^#[\da-f]{6}$/i.test(value.color || '')) invalid('无效的画笔');
        const index = board.items.findIndex(item => item.id === value.id);
        if (index >= 0 && board.items[index].authorId !== socket.id) invalid('不能修改其他人的笔迹');
        if (index < 0 && board.items.length >= 400) invalid('画板已满，请撤销或清空后继续');
        let item = { id: value.id, authorId: socket.id, color: value.color, kind: value.kind };
        if (value.kind === 'stroke') {
          if (!finite(value.width, 1, 16) || !Array.isArray(value.points) || value.points.length < 1 || value.points.length > 512 || value.points.some(p => !Array.isArray(p) || p.length !== 2 || !finite(p[0], 0, 1000) || !finite(p[1], 0, 600))) invalid('无效的笔迹');
          const points = board.items.reduce((sum, item) => sum + (item.id !== value.id ? item.points?.length || 0 : 0), 0);
          if (points + value.points.length > 24000) invalid('画板已满，请撤销或清空后继续');
          item = { ...item, width: value.width, points: value.points };
        } else if (value.kind === 'text') {
          if (typeof value.text !== 'string' || !value.text.trim() || value.text.length > 200 || !finite(value.x, 0, 1000) || !finite(value.y, 0, 600) || !finite(value.fontSize, 12, 96)) invalid('白板文字无效');
          item = { ...item, text: value.text.trim(), x: value.x, y: value.y, fontSize: value.fontSize };
        } else invalid('无效的白板内容');
        if (index < 0) board.items.push(item); else board.items[index] = item;
        action = { type: 'put', item };
      } else invalid('无效的画板操作');
      this.emit(io, call, action);
      return null;
    });
  }

  mount(app, io) {
    const authorize = (req, res, next) => {
      try {
        const token = req.get('authorization')?.replace(/^Bearer /, '');
        if (!token || !/^[a-f0-9]{64}$/.test(token)) invalid('请重新加入通话');
        const call = [...this.calls.calls.values()].find(entry => entry.id === req.params.callId);
        const peerId = call && [...call.members].find(([, member]) => member.shareToken === token)?.[0];
        const socket = peerId && io.sockets.sockets.get(peerId);
        if (!socket) invalid('通话已结束');
        this.calls.member(socket, { roomId: call.roomId, callId: call.id });
        if (call.presentation?.id !== req.params.shareId) invalid('共享已结束');
        req.share = { call, socket, presentation: call.presentation };
        res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
        next();
      } catch (error) { res.status(403).json({ error: error.message }); }
    };
    const url = '/api/call-share/:callId/:shareId';
    app.get(url, authorize, (req, res) => {
      const { call } = req.share;
      if (!call.resource) return res.status(404).json({ error: '文件尚未准备好' });
      res.type(call.resource.mime).send(call.resource.buffer);
    });
    app.post(url, authorize, (req, res, next) => {
      const { call, socket, presentation } = req.share;
      try {
        this.owner(socket, call);
        if (presentation.kind !== 'resource' || presentation.ready || call.uploading) invalid('文件正在传输或已就绪');
        if (this.bytes + presentation.file.size > MAX_TOTAL) invalid('共享服务繁忙，请稍后再试');
        call.uploading = presentation.id;
        // Reserve memory before accepting a body so concurrent uploads respect the quota.
        this.bytes += presentation.file.size;
        let released = false;
        const release = () => { if (!released) { released = true; this.bytes -= presentation.file.size; if (call.uploading === presentation.id) call.uploading = null; } };
        res.once('close', release);
        req.releaseUpload = release;
        next();
      } catch (error) { res.status(409).json({ error: error.message }); }
    }, express.raw({ type: 'application/octet-stream', limit: MAX_FILE }), async (req, res) => {
      const { call, socket, presentation } = req.share;
      try {
        // Check authorization again after upload/conversion; a departed member cannot publish.
        const check = () => { this.calls.member(socket, { roomId: call.roomId, callId: call.id }); if (call.presentation !== presentation || req.aborted || res.destroyed) invalid('共享已结束'); };
        check();
        if (!Buffer.isBuffer(req.body)) invalid('文件数据无效');
        validateFile(req.body, presentation.file);
        let buffer = req.body, mime = presentation.file.mime;
        if (['ppt', 'pptx'].includes(presentation.file.extension)) {
          if (this.converting) invalid('另一个 PPT 正在转换，请稍后重试');
          this.converting = true;
          try { buffer = await convertPowerPoint(buffer, presentation.file.extension, this.office); mime = 'application/pdf'; }
          finally { this.converting = false; }
        }
        check();
        req.releaseUpload();
        if (this.bytes + buffer.length > MAX_TOTAL) invalid('共享服务繁忙，请稍后再试');
        call.resource = { buffer, mime }; this.bytes += buffer.length;
        presentation.ready = true; presentation.file.mime = mime;
        this.emit(io, call);
        res.json({ ok: true });
      } catch (error) {
        req.releaseUpload();
        if (call.presentation === presentation) { this.dispose(call); this.emit(io, call); }
        res.status(400).json({ error: error.message.startsWith('Command failed') || error.code ? '文件转换失败，请导出 PDF 后重试' : error.message });
      }
    });
    app.use('/api/call-share', (error, req, res, next) => {
      if (!error) return next();
      req.releaseUpload?.();
      if (req.share && req.share.call.presentation === req.share.presentation) { this.dispose(req.share.call); this.emit(io, req.share.call); }
      res.status(400).json({ error: '文件上传失败，最大支持 20 MB，请重试' });
    });
    const pdfRoot = path.dirname(require.resolve('pdfjs-dist/package.json'));
    app.get('/call-preview-assets/pdf.worker.mjs', (_req, res) => res.sendFile(path.join(pdfRoot, 'build/pdf.worker.min.mjs')));
    for (const folder of ['cmaps', 'standard_fonts', 'wasm']) app.use(`/call-preview-assets/${folder}`, express.static(path.join(pdfRoot, folder), { maxAge: '1d', fallthrough: false }));
  }
}

module.exports = { CallSharing, fileInfo, validateFile, convertPowerPoint, MAX_FILE };
