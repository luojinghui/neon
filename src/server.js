const express = require('express');
const http = require('http');
const next = require('next');
const { Server } = require('socket.io');
const chatController = require('./server/controller/chatController');

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
    // wss服务
    io.on('connection', (socket) => {
      chatController.onSocket(socket, io);
    });

    app
      .get('/healthz', (_req, res) => res.status(200).json({ status: 'ok' }))
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
