const express = require('express');
const http = require('http');
const next = require('next');
const { Server } = require('socket.io');
const chatController = require('./server/controller/chatController');
const { mountAdminController } = require('./server/controller/adminController');
const { authenticateCookieHeader } = require('./server/admin/auth');
const { doodleShareRepository } = require('./server/doodle/shareRepository');
const { doodleReviewRepository } = require('./server/doodle/reviewRepository');
const { momentRepository } = require('./server/moment/momentRepository');

const dev = process.env.NODE_ENV !== 'production';
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();
const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const io = new Server(server, {
  path: '/im',
  ...(allowedOrigins.length > 0 ? { cors: { origin: allowedOrigins } } : {})
});
const port = Number.parseInt(process.env.APP_PORT || '3000', 10);
const host = process.env.APP_HOST || '127.0.0.1';
const releaseId = process.env.NEON_RELEASE_ID || 'development';
const doodleCleanupTimer = setInterval(() => {
  Promise.resolve()
    .then(() => Promise.all([doodleShareRepository.cleanupExpired(), doodleReviewRepository.cleanupExpired()]))
    .catch((error) => {
      console.error('Doodle cleanup failed:', error.message);
    });
}, 60 * 60 * 1000);
doodleCleanupTimer.unref();

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('APP_PORT must be an integer between 1 and 65535');
}

server.on('error', (error) => {
  console.error('Server failed:', error);
  process.exit(1);
});

nextApp
  .prepare()
  .then(() => {
    const stopPollScheduler = chatController.startPollScheduler(io);
    server.once('close', stopPollScheduler);

    io.use(async (socket, nextSocket) => {
      try {
        socket.data.admin = await authenticateCookieHeader(socket.handshake.headers.cookie || '');
      } catch (error) {
        socket.data.admin = null;
        console.error('Socket admin session could not be verified:', error.message);
      }
      nextSocket();
    });

    // wss服务
    io.on('connection', (socket) => {
      chatController.onSocket(socket, io);
    });

    mountAdminController(app, io);

    app
      .get('/healthz', (_req, res) =>
        res.status(200).json({ status: 'ok', releaseId })
      )
      .use('/uploads/moments', express.static(momentRepository.uploadDirectory, { fallthrough: true, maxAge: '1h' }))
      .use(express.static('public'))
      .use(express.static('static'))
      .all('*', (req, res) => handle(req, res));

    server.listen(port, host, () => {
      console.log(`> Ready on http://${host}:${port}`);
    });
  })
  .catch((ex) => {
    console.error(ex.stack);
    process.exit(1);
  });
