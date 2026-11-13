import path from 'node:path';
import mammoth from 'mammoth';
import { marked } from 'marked';
import { HttpError } from './errors.js';
import { sanitizeDocumentHtml } from './sanitize.js';

export const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.markdown', '.docx'] as const;
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export function isSupported(filename: string): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(path.extname(filename).toLowerCase());
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Blank lines become paragraph breaks; single newlines become <br>. */
export function plainTextToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function titleFromFilename(filename: string): string {
  const base = path.basename(filename, path.extname(filename)).trim();
  return (base || 'Imported document').slice(0, 200);
}

/** Converts an uploaded file into sanitized editor HTML. */
export async function convertToHtml(filename: string, buffer: Buffer): Promise<string> {
  const ext = path.extname(filename).toLowerCase();
  let html: string;

  if (ext === '.docx') {
    try {
      const result = await mammoth.convertToHtml({ buffer });
      html = result.value;
    } catch {
      throw new HttpError(400, 'Could not read this .docx file. Is it a valid Word document?');
    }
  } else {
    const text = buffer.toString('utf8');
    if (text.includes('\u0000')) throw new HttpError(400, 'File does not look like text');
    html = ext === '.txt' ? plainTextToHtml(text) : await marked.parse(text);
  }

  const clean = sanitizeDocumentHtml(html);
  if (!clean.replace(/<[^>]*>/g, '').trim()) throw new HttpError(400, 'File has no readable content');
  return clean;
}
