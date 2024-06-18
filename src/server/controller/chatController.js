/**
 * IM Chat Socket Controller
 *
 * @summary Deal IM Message
 * @author JingHui Luo <luojinghui424@gmail.com>
 *
 * Created at     : 2024-06-18 21:01:53
 * Last modified  : 2024-06-18 21:07:05
 */

let ioInstance = null;

const onSocket = (socket, io) => {
  ioInstance = io;
  console.log('im chat socket connected');

  socket.on('message', (msg) => {
    const type = msg.type;

    switch (type) {
      case 'init': {
        console.log('socket init success');

        socket.emit('message', { type: 'init', msg: 'success', data: 'ok' });
      }
      default: {
        console.log('server msg: ', msg);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('disconnected socket', socket.info);
  });
};

module.exports = { onSocket };
