import type { Candidate, SafeCandidate } from './types';
export function httpUrl(value: unknown): URL | undefined {
  if (typeof value !== 'string' || value.length > 4096) return;
  try { const url = new URL(value); if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return url; } catch { /* invalid URL */ }
}
export function redactText(value: string, limit = 180): string {
  return value.replace(/[\w.+%-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/(?:apikey[_-]|bearer\s+)[\w._-]+/gi, '[secret]')
    .replace(/\b[a-zA-Z0-9_-]{24,}\b/g, '[identifier]')
    .replace(/\b\d{7,}\b/g, '[number]').replace(/[\r\n\t]+/g, ' ').slice(0, limit);
}
export function sanitizedUrl(value: string): string {
  const url = httpUrl(value);
  if (!url) return '';
  const path = url.pathname.split('/').map(part => {
    let decoded = part;
    try { decoded = decodeURIComponent(part); } catch { /* keep encoded */ }
    return /@|\d{7}|[a-f0-9]{16}|[a-zA-Z0-9_-]{24}/i.test(decoded) ? '[redacted]' : redactText(decoded, 80);
  }).join('/');
  // No query names or values, credentials, or fragment leave the device.
  return `${url.origin}${path}`;
}
export function sanitizeCandidate(c: Candidate): SafeCandidate {
  return { id: c.id, site: c.site, url: sanitizedUrl(c.url), type: c.type,
    ...(c.tag ? { tag: c.tag.slice(0, 20) } : {}),
    ...(c.marker ? { marker: redactText(c.marker) } : {}),
    ...(c.label ? { label: redactText(c.label) } : {}),
  };
}
