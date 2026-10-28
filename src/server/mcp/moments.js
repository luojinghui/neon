const { momentRepository: defaultMomentRepository, MIME_TYPES } = require('../moment/momentRepository');
const { profileRepository: defaultProfileRepository } = require('../user/profileRepository');

function createMomentService(options = {}) {
  const repository = options.momentRepository || defaultMomentRepository;
  const profiles = options.profileRepository || defaultProfileRepository;
  const ownerUuid = String(options.ownerUuid || '').trim().toLowerCase();
  const baseUrl = new URL(options.publicBaseUrl || 'http://localhost:3000');
  if (!['http:', 'https:'].includes(baseUrl.protocol)) throw new Error('publicBaseUrl 必须为 HTTP 或 HTTPS 地址');
  const absolute = (url) => new URL(url, baseUrl).href;

  return {
    async publishMoment(input = {}) {
      // 身份由服务端配置锁定，调用方不能通过工具参数冒用其他用户。
      const profile = ownerUuid ? profiles.getByUuid(ownerUuid) : null;
      if (!profile) throw Object.assign(new Error('请先在网站创建个人资料，并配置 MCP_OWNER_UUID 后再发布心迹'), { code: 'MCP_PROFILE_REQUIRED' });
      const media = [];
      const files = [];
      for (const file of input.files || []) {
        const mimeType = String(file.mimeType || '').split(';')[0].trim().toLowerCase();
        const kind = MIME_TYPES.get(mimeType)?.kind;
        if (kind === 'image' || kind === 'video') media.push({ ...file, mimeType });
        else files.push(file);
      }
      const moment = await repository.createMoment({ ownerUuid, text: input.text }, { media, files });
      return {
        id: moment.id,
        text: moment.text,
        media: moment.media.map((file) => ({ ...file, url: absolute(file.url) })),
        attachments: moment.attachments.map((file) => ({ ...file, url: absolute(file.url) })),
        author: { userId: profile.userId, name: profile.name },
        createdAt: moment.createdAt,
        viewUrl: absolute(`/moments?moment=${moment.id}`),
        apiUrl: absolute(`/api/moments/${moment.id}`)
      };
    }
  };
}

module.exports = { createMomentService };
