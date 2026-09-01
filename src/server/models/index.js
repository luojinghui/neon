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

let connectionPromise = null;

/**
 * 连接数据库
 */
const connectDB = async () => {
  if (mongoose.connection.readyState === 1) return mongoose.connection;

  const dbHost = process.env.MONGODB_URI;
  if (!dbHost) throw new Error('MONGODB_URI is not configured');

  if (!connectionPromise) {
    connectionPromise = mongoose
      .connect(dbHost, { authSource: 'admin' })
      .then(() => {
        console.log('MongoDB connected.');
        return mongoose.connection;
      })
      .catch((error) => {
        connectionPromise = null;
        console.error('MongoDB connection failed.');
        throw error;
      });
  }

  return connectionPromise;
};

const disconnectDB = async () => {
  mongoose.connection.removeAllListeners();

  await mongoose.disconnect();
  connectionPromise = null;
};

module.exports = {
  connectDB,
  disconnectDB
};
