const http = require('http');
const { Server } = require('socket.io');
const express = require('express');
const next = require('next');
// const chatController = require('./server/controller/chatController');

const dev = process.env.NODE_ENV !== 'production';
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: true, path: '/im' });

nextApp
  .prepare()
  .then(() => {
    // wss服务
    io.on('connection', (socket) => {
      // chatController.onSocket(socket, io);
    });

    app
      .use(express.static('public'))
      .use(express.static('static'))
      .all('*', (req, res) => handle(req, res));

    server.listen(3000, (err) => {
      console.log('========listen 3000');

      if (err) {
        console.error('start server err: ', err);
        throw err;
      }

      console.log('> Ready on http://localhost:3000');
    });
  })
  .catch((ex) => {
    console.error(ex.stack);
    process.exit(1);
  });
