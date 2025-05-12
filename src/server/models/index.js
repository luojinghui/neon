/**
 * long description for the file
 *
 * @summary short description for the file
 * @author jinghui-Luo
 *
 * Created at     : 2021-04-07 16:48:07
 * Last modified  : 2025-05-12 21:17:13
 */

const mongoose = require('mongoose');
const { db } = require('../../../config');
const DB_HOST = db;

/**
 * 连接数据库
 */
const connectDB = () => {
  return new Promise((resolve, reject) => {
    mongoose.connect(DB_HOST, { authSource: 'admin' });

    // user是数据库名称
    mongoose.connection.on('connected', function () {
      console.log('MongoDB connected.');

      resolve(true);
    });

    mongoose.connection.on('error', function () {
      console.log('MongoDB failed.');

      reject(false);
    });

    mongoose.connection.on('disconnected', function (e) {
      console.log('MongoDB connected disconnected.', e);

      reject(false);
    });
  });
};

const disconnectDB = async () => {
  mongoose.connection.removeAllListeners();

  await mongoose.disconnect();
};

module.exports = {
  connectDB,
  disconnectDB
};
