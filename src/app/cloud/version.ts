/**
 * 云传版本号配置
 * 格式：YYYY.MM.PATCH
 * 每次更新功能时递增版本号，会自动触发版本更新弹窗
 *
 * Created at     : 2026-03-17 19:55:00
 * Last modified  : 2026-03-17 19:55:00
 */

export const CLOUD_VERSION = '2026.03.17';

export const VERSION_UPDATES = [
  { icon: '📁', title: '文件拖拽上传', desc: '支持直接将文件拖拽到上传区域' },
  { icon: '📂', title: '多文件选择', desc: '支持一次性选择并上传多个文件' },
  { icon: '⚡', title: '性能优化', desc: '上传速度和稳定性大幅提升' }
];
