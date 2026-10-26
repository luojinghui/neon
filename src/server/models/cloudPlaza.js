const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  fileId: { type: String, required: true },
  fileName: { type: String, required: true },
  fileSize: { type: Number, required: true },
  mimeType: { type: String, required: true },
  relativePath: { type: String, default: '' },
  storagePath: { type: String, required: true }
}, { _id: false });

const schema = new mongoose.Schema({
  messageId: { type: String, required: true, unique: true },
  content: { type: String, default: '' },
  files: { type: [fileSchema], default: [] },
  createdAt: { type: Date, required: true },
  expireAt: { type: Date, required: true },
  deletedAt: { type: Date, default: null }
});

schema.index({ deletedAt: 1, createdAt: -1, messageId: -1 });
schema.index({ expireAt: 1 });
schema.index({ 'files.fileId': 1 });
// Keep expired records until their files have been reclaimed; a TTL index would orphan uploads.
const CloudPlazaMessage = mongoose.models.CloudPlazaMessage || mongoose.model('CloudPlazaMessage', schema);
module.exports = { CloudPlazaMessage };
