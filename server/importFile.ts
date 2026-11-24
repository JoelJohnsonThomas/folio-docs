import { extname } from 'node:path';
import mammoth from 'mammoth';
import { marked } from 'marked';
import { HttpError } from './http.ts';
import { sanitizeDocHtml } from './sanitize.ts';

export const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.markdown', '.docx'] as const;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export interface ImportedContent {
  title: string;
  html: string;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Blank lines separate paragraphs; single newlines become line breaks. */
export function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function titleFromFilename(filename: string) {
  const base = filename.slice(0, filename.length - extname(filename).length).trim();
  return (base || 'Imported document').slice(0, 200);
}

/**
 * Converts an uploaded file into editor-compatible, sanitized HTML.
 * Throws 415 for unsupported types and 422 for files we can't parse.
 */
export async function convertUpload(filename: string, buffer: Buffer): Promise<ImportedContent> {
  const ext = extname(filename).toLowerCase();
  if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new HttpError(
      415,
      'unsupported_file_type',
      `Unsupported file type "${ext || 'none'}". Supported: ${SUPPORTED_EXTENSIONS.join(', ')}.`,
    );
  }

  let html: string;
  if (ext === '.docx') {
    try {
      const result = await mammoth.convertToHtml({ buffer });
      html = result.value;
    } catch {
      throw new HttpError(422, 'unreadable_file', 'Could not read this .docx file. Is it a valid Word document?');
    }
  } else {
    const text = buffer.toString('utf8');
    if (text.includes('\u0000')) {
      throw new HttpError(422, 'unreadable_file', 'This file does not look like plain text.');
    }
    html = ext === '.txt' ? textToHtml(text) : await marked.parse(text, { gfm: true, breaks: false });
  }

  const clean = sanitizeDocHtml(html);
  return { title: titleFromFilename(filename), html: clean || '<p></p>' };
}
