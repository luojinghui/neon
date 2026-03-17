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

  static async sendWithFiles(text: string, files: File[], relativePaths: string[]) {
    const formData = new FormData();
    formData.append('text', text);
    files.forEach((file, i) => {
      formData.append('files', file);
      formData.append('relativePaths', relativePaths[i] || file.name);
    });

    const res = await fetch('/api/cloud', {
      method: 'POST',
      body: formData
    });
    return await res.json();
  }

  static async queryMessage(password: string) {
    const res = await fetch(`/api/cloud?password=${encodeURIComponent(password)}`, { method: 'GET' });
    return await res.json();
  }

  static getFileDownloadUrl(fileId: string) {
    return `/api/cloud/file/${fileId}`;
  }
}
