// src/lib/printWidget.ts
// "PDF" export without dependencies: print a copy of one widget; the browser's dialog offers Save as PDF.
export function printWidget(node: HTMLElement, title: string): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((el) => el.outerHTML).join('');
  doc.open();
  doc.write(`<!doctype html><html class="light"><head><title>${title.replace(/</g, '&lt;')}</title>${styles}
    <style>@page{margin:16mm} body{background:#fff;color:#111} [data-widget-toolbar]{display:none!important}</style>
    </head><body><h1 style="font:600 18px system-ui;margin:0 0 12px">${title.replace(/</g, '&lt;')}</h1>${node.outerHTML}</body></html>`);
  doc.close();
  const done = () => setTimeout(() => iframe.remove(), 500);
  iframe.contentWindow!.addEventListener('afterprint', done);
  setTimeout(() => { iframe.contentWindow!.focus(); iframe.contentWindow!.print(); }, 300);
}
