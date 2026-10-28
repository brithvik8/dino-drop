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
  return FILE_CODE_REGEX.test(code);
}

// General validation accepting either text code or file code
export function isValidCode(code: string): boolean {
  return isValidSnippetCode(code) || isValidFileCode(code);
}

// Generates a file sharing code prefixed with literal '$' (e.g. $ABC123)
export function generateFileCode(length = 6): string {
  return '$' + generateCode(length);
}

export function normalizeCode(code: string): string {
  const trimmed = code.trim();
  if (trimmed.startsWith('$')) {
    return '$' + trimmed.slice(1).toUpperCase();
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
    // If user navigated to a file URL without $, normalize to $ABC123
    return '$' + decoded;
  }
  return decoded;
}
