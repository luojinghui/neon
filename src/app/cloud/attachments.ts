import type { FileItem } from './store';

export function createFileItem(file: File, relativePath = file.webkitRelativePath || file.name): FileItem {
  const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { id, file, name: file.name, size: file.size, type: file.type || 'application/octet-stream', relativePath };
}

async function traverseEntry(entry: FileSystemEntry, basePath = ''): Promise<FileItem[]> {
  if (entry.isFile) {
    return new Promise((resolve, reject) => (entry as FileSystemFileEntry).file(file => resolve([createFileItem(file, basePath ? `${basePath}/${file.name}` : file.name)]), reject));
  }
  if (!entry.isDirectory) return [];
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const directory = basePath ? `${basePath}/${entry.name}` : entry.name;
  const result: FileItem[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) return result;
    const children = await Promise.all(batch.map(child => traverseEntry(child, directory)));
    result.push(...children.flat());
  }
}

export async function droppedFiles(data: DataTransfer): Promise<FileItem[]> {
  // Snapshot all entries before yielding: browsers clear DataTransfer after the event.
  const entries: FileSystemEntry[] = [];
  const files: File[] = [];
  for (const item of Array.from(data.items || [])) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
    else { const file = item.getAsFile(); if (file) files.push(file); }
  }
  if (!entries.length && !files.length) files.push(...Array.from(data.files));
  const nested = await Promise.all(entries.map(entry => traverseEntry(entry)));
  return [...nested.flat(), ...files.map(file => createFileItem(file))];
}
