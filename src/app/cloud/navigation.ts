export const CLOUD_PATH = '/cloud';
export const PLAZA_PATH = '/cloud?tab=plaza';

export const plazaSharePath = (messageId: string) => `${PLAZA_PATH}&id=${encodeURIComponent(messageId)}`;
export const isPlazaMessageId = (value: string) => /^(?:[A-Za-z0-9_-]{8}|[a-f0-9]{32})$/.test(value);
