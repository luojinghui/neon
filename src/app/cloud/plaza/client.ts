import type { FileItem } from '../store';
import type { PlazaPage, PlazaDetail } from './types';

export class PlazaClientError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function result<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new PlazaClientError(body.error || '操作失败，请重试', response.status);
  return body;
}

export const loadPlaza = (cursor?: string) => fetch(`/api/cloud/plaza${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { cache: 'no-store' }).then(result<PlazaPage>);
export const getPlazaMessage = (messageId: string) => fetch(`/api/cloud/plaza/${encodeURIComponent(messageId)}`, { cache: 'no-store' }).then(result<PlazaDetail>);

export async function deletePlazaMessage(messageId: string) {
  const response = await fetch(`/api/cloud/plaza/${encodeURIComponent(messageId)}`, { method: 'DELETE', cache: 'no-store' });
  if (!response.ok) await result(response);
}

export function sendPlaza(text: string, files: FileItem[], onProgress: (percent: number) => void): Promise<PlazaDetail> {
  if (!files.length) return fetch('/api/cloud/plaza', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }).then(result<PlazaDetail>);
  const form = new FormData();
  form.append('text', text);
  files.forEach(item => { form.append('files', item.file); form.append('relativePaths', item.relativePath || item.name); });
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/cloud/plaza');
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status < 200 || xhr.status >= 300) reject(new PlazaClientError(data.error || '发送失败，请重试', xhr.status));
        else resolve(data);
      } catch { reject(new Error('发送失败，请重试')); }
    };
    xhr.onerror = () => reject(new Error('网络连接失败，请重试'));
    xhr.onabort = () => reject(new Error('发送已取消'));
    xhr.send(form);
  });
}
