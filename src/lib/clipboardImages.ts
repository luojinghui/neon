/** Read the paste event itself: no clipboard permission prompt or remote image fetch. */
export function clipboardImages(data: DataTransfer): File[] {
  const fromItems = Array.from(data.items || [])
    .filter(item => item.kind === 'file').map(item => item.getAsFile()).filter((file): file is File => Boolean(file));
  const files = (fromItems.length ? fromItems : Array.from(data.files || [])).filter(file => file.type.startsWith('image/') || (!file.type && /\.(png|jpe?g|gif|webp)$/i.test(file.name)));
  if (files.length) return files.map((file, index) => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    const type = file.type || ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' }[extension || '']!);
    const suffix = type.split('/')[1].replace('jpeg', 'jpg');
    return new File([file], /\.[a-z0-9]+$/i.test(file.name) ? file.name : `粘贴图片-${Date.now()}-${index + 1}.${suffix}`, { type, lastModified: file.lastModified });
  });

  // Some editors expose an embedded image only in HTML. Parse inertly; never insert HTML.
  const html = data.getData('text/html');
  if (!html || html.length > 28_000_000) return [];
  const document = new DOMParser().parseFromString(html, 'text/html');
  const sources = new Set(Array.from(document.querySelectorAll('img')).map(image => image.getAttribute('src') || ''));
  const images: File[] = [];
  for (const source of sources) {
    const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([\s\S]+)$/i.exec(source);
    if (!match) continue;
    try {
      const bytes = Uint8Array.from(atob(match[2].replace(/\s/g, '')), char => char.charCodeAt(0));
      images.push(new File([bytes], `粘贴图片-${Date.now()}-${images.length + 1}.${match[1].split('/')[1].replace('jpeg', 'jpg')}`, { type: match[1].toLowerCase() }));
    } catch { /* Invalid data URLs remain ordinary pasted text. */ }
  }
  return images;
}
