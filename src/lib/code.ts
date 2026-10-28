// Characters used to generate sharing codes. Ambiguous characters
// (O/0, I/1, etc.) are excluded for readability when shared verbally.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';

export function generateCode(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

// Text snippet codes: exactly 6 uppercase alphanumeric characters (e.g. ABC123)
export const TEXT_CODE_REGEX = /^[A-Z0-9]{6}$/;

// File sharing codes: starts with literal '$', followed by 6 to 12 alphanumeric characters (e.g. $ABC123)
export const FILE_CODE_REGEX = /^\$[A-Z0-9]{6,12}$/;

export function isValidSnippetCode(code: string): boolean {
  return TEXT_CODE_REGEX.test(code);
}

export function isValidFileCode(code: string): boolean {
  const canonical = getCanonicalFileCode(code);
  return FILE_CODE_REGEX.test(canonical);
}

// General validation accepting either text code or file code
export function isValidCode(code: string): boolean {
  return isValidSnippetCode(code) || isValidFileCode(code);
}

// Generates a file sharing code prefixed with literal '$' (e.g. $ABC123)
export function generateFileCode(length = 6): string {
  return '$' + generateCode(length);
}

// Extracts the bare alphanumeric sharing code without $ or # prefix (e.g. "$ABC123" -> "ABC123")
export function getCleanCode(code: string): string {
  return code.trim().replace(/^[#$]+/, '').toUpperCase();
}

// Canonical database format starting with '$' (e.g. "$ABC123")
export function getCanonicalFileCode(code: string): string {
  const clean = getCleanCode(code);
  return clean ? '$' + clean : '';
}

// File upload/result page URL format: https://dinodrop.vercel.app/f/#CODE
export function getFileUploadResultUrl(code: string, origin = ''): string {
  const clean = getCleanCode(code);
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/f/#${clean}`;
}

// File-sharing link copied when clicking "Copy Link": https://dinodrop.vercel.app/f/$CODE
export function getFileSharingUrl(code: string, origin = ''): string {
  const clean = getCleanCode(code);
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/f/$${clean}`;
}

// Robustly extracts canonical file code ($ABC123) from route params (/f/:code) or URL hash (/f/#CODE)
export function extractFileCode(routeParam?: string, hash?: string): string {
  let raw = '';
  if (routeParam) {
    raw = decodeURIComponent(routeParam).trim();
  } else if (hash) {
    raw = decodeURIComponent(hash).replace(/^#/, '').trim();
  } else if (typeof window !== 'undefined' && window.location.hash) {
    raw = decodeURIComponent(window.location.hash).replace(/^#/, '').trim();
  }

  if (!raw) return '';
  return getCanonicalFileCode(raw);
}

export function normalizeCode(code: string): string {
  const trimmed = code.trim();
  if (trimmed.startsWith('$') || trimmed.startsWith('#')) {
    return trimmed.slice(0, 1) + trimmed.slice(1).toUpperCase();
  }
  return trimmed.toUpperCase();
}

// Safely encodes a file code for URLs (e.g. $ABC123 -> %24ABC123)
export function encodeFileRoute(code: string): string {
  return encodeURIComponent(normalizeCode(code));
}

// Safely decodes a file code from URL parameter
export function decodeFileRoute(param: string | undefined): string {
  if (!param) return '';
  const decoded = decodeURIComponent(param).trim().toUpperCase();
  if (!decoded.startsWith('$') && TEXT_CODE_REGEX.test(decoded)) {
    return '$' + decoded;
  }
  return decoded;
}

