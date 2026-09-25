'use client';

import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import type { Presentation } from '@/modules/webrtc/sharing';
import type { CallSession } from '@/modules/webrtc/session';

/** Static, self-contained previews: no scripts, forms, remote requests or navigation. */
export function staticMarkup(source: string): string {
  const clean = DOMPurify.sanitize(source, {
    ALLOWED_TAGS: ['p', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'code', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 's', 'del', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'hr', 'br', 'a', 'img'],
    ALLOWED_ATTR: ['colspan', 'rowspan', 'alt', 'src'], ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false
  });
  const document = new DOMParser().parseFromString(clean, 'text/html');
  document.querySelectorAll('img').forEach(image => { if (!/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z\d+/=\s]+$/i.test(image.getAttribute('src') || '')) image.remove(); });
  return document.body.innerHTML;
}

function PDFPage({ document, page }: { document: PDFDocumentProxy; page: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    let rendering: RenderTask | undefined;
    setError('');
    void document.getPage(Math.min(page, document.numPages)).then(async pdfPage => {
      if (cancelled || !canvas.current) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const scale = Math.min(2, 2400 / Math.max(base.width, base.height));
      const viewport = pdfPage.getViewport({ scale });
      canvas.current.width = Math.ceil(viewport.width); canvas.current.height = Math.ceil(viewport.height);
      rendering = pdfPage.render({ canvas: canvas.current, viewport });
      await rendering.promise;
    }).catch(error => { if (!cancelled && error.name !== 'RenderingCancelledException') setError('这一页无法显示，请尝试其他页面或重新导出 PDF'); });
    return () => { cancelled = true; rendering?.cancel(); };
  }, [document, page]);
  return error ? <p role="status">{error}</p> : <canvas ref={canvas} aria-label={`共享文档第 ${page} 页`} className="call-share-pdf" />;
}

export function SharedResource({ presentation, session, owner }: { presentation: Presentation; session: CallSession; owner: boolean }) {
  const scroller = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [resource, setResource] = useState<{ url?: string; text?: string; html?: string; pdf?: PDFDocumentProxy } | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const mime = presentation.file!.mime;
  const id = presentation.id;
  const ready = presentation.ready;
  useEffect(() => {
    if (!ready) return;
    const abort = new AbortController();
    let objectUrl = '';
    let loading: ReturnType<typeof import('pdfjs-dist').getDocument> | undefined;
    setResource(null); setError('');
    void session.resource(id, abort.signal).then(async blob => {
      if (abort.signal.aborted) return;
      if (mime.startsWith('image/')) { objectUrl = URL.createObjectURL(blob); setResource({ url: objectUrl }); }
      else if (mime === 'application/pdf') {
        const pdfjs = await import('pdfjs-dist');
        if (abort.signal.aborted) return;
        pdfjs.GlobalWorkerOptions.workerSrc = '/call-preview-assets/pdf.worker.mjs';
        const data = await blob.arrayBuffer();
        if (abort.signal.aborted) return;
        loading = pdfjs.getDocument({ data, cMapUrl: '/call-preview-assets/cmaps/', cMapPacked: true, standardFontDataUrl: '/call-preview-assets/standard_fonts/', wasmUrl: '/call-preview-assets/wasm/', enableXfa: false, maxImageSize: 16000000 });
        loading.onPassword = () => { setError('暂不支持加密 PDF，请解密后重新共享'); void loading?.destroy(); };
        const pdf = await loading.promise;
        if (!abort.signal.aborted) setResource({ pdf });
      } else {
        const text = await blob.text();
        if (abort.signal.aborted) return;
        setResource(mime === 'text/markdown' ? { html: staticMarkup(await marked.parse(text, { async: true })) } : mime === 'text/html' ? { html: staticMarkup(text) } : { text });
      }
    }).catch(error => { if (!abort.signal.aborted) setError(current => current || error.message || '预览失败，请重试'); });
    return () => { abort.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); void loading?.destroy(); clearTimeout(scrollTimer.current); };
  }, [id, ready, mime, session, retry]);
  useLayoutEffect(() => {
    // A new page starts at the top for the presenter as well as the followers.
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [presentation.page, id]);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const apply = () => { if (!owner) element.scrollTop = presentation.scroll * Math.max(0, element.scrollHeight - element.clientHeight); };
    apply();
    const resize = new ResizeObserver(apply);
    resize.observe(element);
    if (element.firstElementChild) resize.observe(element.firstElementChild);
    return () => resize.disconnect();
  }, [presentation.scroll, presentation.page, owner, resource]);
  if (!ready) return <div className="call-share-loading" role="status">共享者正在准备文件…</div>;
  if (error) return <div className="call-share-loading" role="status"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>重试预览</button></div>;
  if (!resource) return <div className="call-share-loading" role="status">正在加载共享文件…</div>;
  return <div className="call-resource">
    <div className="call-share-tools">
      {resource.pdf && <><button type="button" aria-label="共享文档上一页" disabled={!owner || presentation.page <= 1} onClick={() => void session.navigateShare(presentation.page - 1, 0)}>上一页</button><span aria-live="polite">{presentation.page} / {resource.pdf.numPages}</span><button type="button" aria-label="共享文档下一页" disabled={!owner || presentation.page >= resource.pdf.numPages} onClick={() => void session.navigateShare(presentation.page + 1, 0)}>下一页</button></>}
      <span>{owner ? '你的翻页和滚动会同步给大家' : '正在跟随共享者'}</span>
    </div>
    <div ref={scroller} className={`call-resource-scroll ${owner ? 'is-presenter' : 'is-viewer'}`} aria-label="共享文件内容" onScroll={event => {
      if (!owner) return;
      const element = event.currentTarget;
      clearTimeout(scrollTimer.current);
      scrollTimer.current = setTimeout(() => { void session.navigateShare(presentation.page, element.scrollTop / Math.max(1, element.scrollHeight - element.clientHeight)); }, 120);
    }}>
      {resource.pdf && <PDFPage key={presentation.page} document={resource.pdf} page={presentation.page} />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {resource.url && <img src={resource.url} alt={presentation.file!.name} className="call-share-image" />}
      {resource.text !== undefined && <pre className="call-share-log">{resource.text}</pre>}
      {resource.html !== undefined && <article className="call-share-markup" dangerouslySetInnerHTML={{ __html: resource.html }} />}
    </div>
    {mime === 'text/html' && <p className="call-share-caption">静态预览 · 脚本与外部资源不会加载</p>}
  </div>;
}
