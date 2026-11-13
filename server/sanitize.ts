import sanitizeHtml from 'sanitize-html';

/**
 * Documents are shared between users, so every piece of HTML we persist goes
 * through this allow-list. It matches what the editor can produce; anything
 * else (scripts, styles, images, event handlers) is stripped.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'h1', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 's',
    'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'hr',
  ],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    // Imported files may use deeper headings than the editor supports.
    h4: 'h3',
    h5: 'h3',
    h6: 'h3',
  },
};

export function sanitizeDocumentHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS);
}
