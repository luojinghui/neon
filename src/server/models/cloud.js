const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * 定义云传递数据模型
 * 数据类型如下：
 * 1. 消息ID
 * 2. 消息类型：支持文本、文件、图片
 * 3. 消息内容，长度较大
 * 4. 关联用户ID，可能为空
 * 5. 消息解析密码，最大4位数
 * 6. 消息过期时间，最长1天
 * 7. 消息创建时间
 */
const cloudSchema = new Schema({
  messageId: {
    type: String,
    required: true,
    unique: true
  },
  messageType: {
    type: String,
    enum: ['text', 'file', 'image'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  password: {
    type: String,
    maxlength: 4,
    required: true
  },
  expireAt: {
    type: Date,
    required: true,
    validate: {
      validator: function (v) {
        // 确保过期时间不超过1天
        const oneDay = 24 * 60 * 60 * 1000;
        return v - this.createdAt <= oneDay;
      },
      message: '过期时间不能超过1天'
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// 创建索引
// 创建TTL索引，当文档的expireAt时间到达时，MongoDB会自动删除该文档
// expireAfterSeconds: 0 表示一旦达到expireAt指定的时间，文档将被删除
cloudSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

// 为messageId字段创建索引以提高查询性能
// 由于messageId字段被频繁查询且已设置为unique，索引可以加速查询操作
cloudSchema.index({ messageId: 1 });

// 防止模型重复定义
const CloudMessage = mongoose.models.CloudMessage || mongoose.model('CloudMessage', cloudSchema);

module.exports = { CloudMessage };
