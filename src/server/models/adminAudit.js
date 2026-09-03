const mongoose = require('mongoose');

const adminAuditSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    username: { type: String, required: true, maxlength: 64 },
    action: { type: String, required: true, maxlength: 80 },
    targetType: { type: String, default: '', maxlength: 40 },
    targetId: { type: String, default: '', maxlength: 160 },
    success: { type: Boolean, required: true, default: true },
    ip: { type: String, default: '', maxlength: 128 },
    detail: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  {
    collection: 'admin_audit_logs',
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false
  }
);

adminAuditSchema.index({ createdAt: -1 });
adminAuditSchema.index({ adminId: 1, createdAt: -1 });

const AdminAudit = mongoose.models.AdminAudit || mongoose.model('AdminAudit', adminAuditSchema);

module.exports = { AdminAudit };
