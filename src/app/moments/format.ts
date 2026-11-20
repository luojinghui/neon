export function formatMomentTime(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';
  const difference = Date.now() - timestamp;
  if (difference < 60_000) return '刚刚';
  if (difference < 60 * 60_000) return `${Math.floor(difference / 60_000)} 分钟前`;
  if (difference < 24 * 60 * 60_000) return `${Math.floor(difference / (60 * 60_000))} 小时前`;
  const date = new Date(timestamp);
  const now = new Date();
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

export function formatVoiceDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function splitMomentParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g, '')
    .split(/\n(?:[ \t]*\n)+/)
    .filter((block) => block.trim().length > 0);
}
