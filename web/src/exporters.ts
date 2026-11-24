import TurndownService from 'turndown';

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function safeFilename(title: string) {
  return title.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'document';
}

const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced', emDelimiter: '_' });
// Tighter list items than turndown's default ("-   item").
turndown.addRule('listItem', {
  filter: 'li',
  replacement(content, node) {
    const parent = node.parentNode as HTMLElement;
    let prefix = '- ';
    if (parent.nodeName === 'OL') {
      const start = Number(parent.getAttribute('start') ?? 1);
      prefix = `${start + Array.prototype.indexOf.call(parent.children, node)}. `;
    }
    const body = content.replace(/^\n+/, '').replace(/\n+$/, '\n').replace(/\n/gm, `\n${' '.repeat(prefix.length)}`);
    return prefix + body.trimEnd() + (node.nextSibling ? '\n' : '');
  },
});
// Markdown has no underline; keep the text, drop the styling.
turndown.addRule('underline', { filter: ['u'], replacement: (content) => content });

export function exportMarkdown(title: string, html: string) {
  download(`${safeFilename(title)}.md`, `${turndown.turndown(html)}\n`, 'text/markdown;charset=utf-8');
}

export function exportHtml(title: string, html: string) {
  const escaped = title.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const page = `<!doctype html>\n<html><head><meta charset="utf-8"><title>${escaped}</title>
<style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;line-height:1.6;padding:0 16px}</style>
</head><body>\n${html}\n</body></html>\n`;
  download(`${safeFilename(title)}.html`, page, 'text/html;charset=utf-8');
}
