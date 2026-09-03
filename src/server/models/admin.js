const mongoose = require('mongoose');

const adminUserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 64
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 32,
      default: '超级管理员'
    },
    passwordHash: {
      type: String,
      required: true,
      select: false
    },
    role: {
      type: String,
      enum: ['super_admin'],
      required: true,
      default: 'super_admin'
    },
    enabled: {
      type: Boolean,
      required: true,
      default: true
    },
    sessionIdHash: {
      type: String,
      default: '',
      select: false
    },
    sessionExpiresAt: {
      type: Date,
      default: null,
      select: false
    },
    lastLoginAt: {
      type: Date,
      default: null
    },
    lastLoginIp: {
      type: String,
      default: '',
      maxlength: 128,
      select: false
    }
  },
  {
    collection: 'admin_users',
    timestamps: true,
    versionKey: false
  }
);

const AdminUser = mongoose.models.AdminUser || mongoose.model('AdminUser', adminUserSchema);

module.exports = { AdminUser };
