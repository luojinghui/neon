export interface CloudFileInfo {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  relativePath: string;
}

export class CloudAPI {
  static async sendMessage(text: string) {
    const res = await fetch('/api/cloud', {
      method: 'POST',
      body: JSON.stringify({ text })
    });
    return await res.json();
  }

  static async sendWithFiles(text: string, files: File[], relativePaths: string[], onProgress?: (percent: number) => void) {
    const formData = new FormData();
    formData.append('text', text);
    files.forEach((file, i) => {
      formData.append('files', file);
      formData.append('relativePaths', relativePaths[i] || file.name);
    });

    return new Promise<any>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/cloud');

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress?.(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error('Invalid response'));
        }
      };

      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send(formData);
    });
  }

  static async queryMessage(password: string) {
    const res = await fetch(`/api/cloud?password=${encodeURIComponent(password)}`, { method: 'GET' });
    return await res.json();
  }

  static getFileDownloadUrl(fileId: string) {
    return `/api/cloud/file/${fileId}`;
  }
}
