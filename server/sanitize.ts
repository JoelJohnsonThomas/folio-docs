import sanitizeHtml from 'sanitize-html';

/**
 * Document content is stored as HTML. The editor's schema already drops
 * anything it doesn't understand on the client, but the server is the trust
 * boundary, so every write (saves and imports) is sanitized to the same
 * subset of tags the editor supports.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'h1', 'h2', 'h3',
    'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'code',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'hr', 'a',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    ol: ['start'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    // The editor offers three heading levels; fold deeper ones into h3.
    h4: 'h3',
    h5: 'h3',
    h6: 'h3',
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow' }),
  },
  // Content of disallowed tags (e.g. tables, spans) is kept as text,
  // except for script/style/etc. which are dropped entirely.
  disallowedTagsMode: 'discard',
};

export function sanitizeDocHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS).trim();
}
